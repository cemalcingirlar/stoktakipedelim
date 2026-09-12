"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logYaz } from "@/lib/log";
import { kodNormalize } from "@/lib/metin";
import { prisma } from "@/lib/prisma";
import {
  HAREKET_TIP,
  LOG_ISLEM,
  STOK_DURUM,
  TRANSFER_DURUM,
  TRANSFER_KALEM_DURUM,
} from "@/lib/sabitler";
import { YetkiHatasi, magazaIslemiZorunlu, oturumZorunlu } from "@/lib/yetki";

// ------------------------------------------------------------ Cihaz okutma

export type OkutmaSonucu =
  | {
      durum: "BULUNDU";
      cihaz: {
        id: number;
        marka: string;
        model: string;
        seriNo: string | null;
        barkod: string | null;
        kategori: string;
        magazaAdi: string;
        alisFiyatiKurus: number;
      };
    }
  | { durum: "HATA"; mesaj: string };

/**
 * Sevkiyata eklenecek cihazı seri no / barkod ile bulur.
 * Cihaz kaynak mağazada ve stokta değilse neden eklenemediğini açıkça söyler.
 */
export async function sevkiyatCihaziOkut(
  kod: string,
  kaynakMagazaId: number,
): Promise<OkutmaSonucu> {
  try {
    const oturum = await oturumZorunlu();
    magazaIslemiZorunlu(oturum, kaynakMagazaId);

    const aranan = kodNormalize(kod);
    if (aranan.length < 3) return { durum: "HATA", mesaj: "Geçerli bir seri no veya barkod girin." };

    const cihaz = await prisma.stokKalemi.findFirst({
      where: { OR: [{ seriNo: aranan }, { barkod: aranan }] },
      include: { magaza: { select: { ad: true } }, kategori: { select: { ad: true } } },
    });

    if (!cihaz) return { durum: "HATA", mesaj: `${aranan} sistemde kayıtlı değil.` };

    if (cihaz.durum === STOK_DURUM.SATILDI) {
      return { durum: "HATA", mesaj: `${aranan} satılmış, sevk edilemez.` };
    }
    if (cihaz.durum === STOK_DURUM.TRANSFERDE) {
      return { durum: "HATA", mesaj: `${aranan} zaten başka bir sevkiyatta.` };
    }
    if (cihaz.durum !== STOK_DURUM.STOKTA) {
      return { durum: "HATA", mesaj: `${aranan} stokta değil (${cihaz.durum}).` };
    }
    if (cihaz.magazaId !== kaynakMagazaId) {
      return { durum: "HATA", mesaj: `${aranan} ${cihaz.magaza.ad} deposunda, bu mağazada değil.` };
    }

    return {
      durum: "BULUNDU",
      cihaz: {
        id: cihaz.id,
        marka: cihaz.marka,
        model: cihaz.model,
        seriNo: cihaz.seriNo,
        barkod: cihaz.barkod,
        kategori: cihaz.kategori.ad,
        magazaAdi: cihaz.magaza.ad,
        alisFiyatiKurus: cihaz.alisFiyatiKurus,
      },
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { durum: "HATA", mesaj: hata.message };
    console.error("Cihaz okutulamadı:", hata);
    return { durum: "HATA", mesaj: "Cihaz aranamadı. Tekrar deneyin." };
  }
}

// -------------------------------------------------------- Sevkiyat gönderme

const gonderimSemasi = z.object({
  kaynakMagazaId: z.number().int().positive("Kaynak mağaza seçin."),
  hedefMagazaId: z.number().int().positive("Hedef mağaza seçin."),
  not: z.string().trim().max(500).nullable(),
  cihazIdleri: z.array(z.number().int().positive()).min(1, "En az bir cihaz okutun."),
});

export type SevkiyatDurumu = { hata?: string };

/** Gün bazlı sıra numarası: SVK-20260912-001 */
async function transferNoUret(tx: typeof prisma, tarih: Date): Promise<string> {
  const gunBas = new Date(tarih);
  gunBas.setHours(0, 0, 0, 0);
  const gunBit = new Date(gunBas);
  gunBit.setDate(gunBit.getDate() + 1);

  const bugunkuAdet = await tx.transfer.count({
    where: { gonderimTarihi: { gte: gunBas, lt: gunBit } },
  });

  const yil = gunBas.getFullYear();
  const ay = String(gunBas.getMonth() + 1).padStart(2, "0");
  const gun = String(gunBas.getDate()).padStart(2, "0");
  return `SVK-${yil}${ay}${gun}-${String(bugunkuAdet + 1).padStart(3, "0")}`;
}

export async function sevkiyatGonder(
  _onceki: SevkiyatDurumu,
  form: FormData,
): Promise<SevkiyatDurumu> {
  let yeniId: number;

  try {
    const oturum = await oturumZorunlu();

    let cozulen: unknown;
    try {
      cozulen = JSON.parse(String(form.get("veri") ?? ""));
    } catch {
      return { hata: "Form verisi okunamadı. Sayfayı yenileyip tekrar deneyin." };
    }

    const sonuc = gonderimSemasi.safeParse(cozulen);
    if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

    const veri = sonuc.data;
    magazaIslemiZorunlu(oturum, veri.kaynakMagazaId);

    if (veri.kaynakMagazaId === veri.hedefMagazaId) {
      return { hata: "Hedef mağaza kaynak mağaza ile aynı olamaz." };
    }

    const hedef = await prisma.magaza.findUnique({
      where: { id: veri.hedefMagazaId },
      select: { ad: true, aktif: true, _count: { select: { kullanicilar: true } } },
    });
    if (!hedef || !hedef.aktif) return { hata: "Hedef mağaza bulunamadı veya pasif." };
    if (hedef._count.kullanicilar === 0) {
      return {
        hata: `${hedef.ad} mağazasında kullanıcı yok; sevkiyatı kabul edecek kimse olmaz.`,
      };
    }

    const benzersizIdler = [...new Set(veri.cihazIdleri)];

    const transfer = await prisma.$transaction(async (tx) => {
      // Cihazların hâlâ kaynak mağazada ve stokta olduğunu kilit altında doğrula.
      const cihazlar = await tx.stokKalemi.findMany({
        where: { id: { in: benzersizIdler } },
        select: { id: true, seriNo: true, durum: true, magazaId: true },
      });

      if (cihazlar.length !== benzersizIdler.length) {
        throw new Error("Okutulan cihazlardan biri bulunamadı.");
      }
      const uygunsuz = cihazlar.find(
        (c) => c.durum !== STOK_DURUM.STOKTA || c.magazaId !== veri.kaynakMagazaId,
      );
      if (uygunsuz) {
        throw new Error(
          `${uygunsuz.seriNo ?? uygunsuz.id} artık bu mağazada stokta değil. Listeyi yenileyin.`,
        );
      }

      const olusan = await tx.transfer.create({
        data: {
          transferNo: await transferNoUret(tx as unknown as typeof prisma, new Date()),
          kaynakMagazaId: veri.kaynakMagazaId,
          hedefMagazaId: veri.hedefMagazaId,
          durum: TRANSFER_DURUM.BEKLIYOR,
          gonderenId: oturum.kullaniciId,
          not: veri.not,
        },
      });

      for (const cihazId of benzersizIdler) {
        await tx.transferKalemi.create({
          data: {
            transferId: olusan.id,
            stokKalemiId: cihazId,
            durum: TRANSFER_KALEM_DURUM.BEKLIYOR,
          },
        });
        await tx.stokKalemi.update({
          where: { id: cihazId },
          data: { durum: STOK_DURUM.TRANSFERDE, cikisTarihi: new Date() },
        });
        await tx.stokHareketi.create({
          data: {
            stokKalemiId: cihazId,
            tip: HAREKET_TIP.TRANSFER_GONDERIM,
            kaynakMagazaId: veri.kaynakMagazaId,
            hedefMagazaId: veri.hedefMagazaId,
            kullaniciId: oturum.kullaniciId,
            transferId: olusan.id,
            aciklama: `${olusan.transferNo} ile ${hedef.ad} mağazasına gönderildi`,
          },
        });
      }

      return olusan;
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.TRANSFER_GONDER,
      hedefTip: "Transfer",
      hedefId: transfer.id,
      detay: `${transfer.transferNo} · ${benzersizIdler.length} cihaz · hedef ${hedef.ad}`,
    });

    revalidatePath("/sevkiyat");
    revalidatePath("/cihazlar");
    revalidatePath("/panel");
    yeniId = transfer.id;
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    if (hata instanceof Error && hata.message) return { hata: hata.message };
    console.error("Sevkiyat gönderilemedi:", hata);
    return { hata: "Sevkiyat gönderilemedi. Lütfen tekrar deneyin." };
  }

  redirect(`/sevkiyat/${yeniId}`);
}

// ---------------------------------------------------------- Sevkiyat kabulü

export type KabulOkutmaSonucu =
  | { durum: "KABUL"; mesaj: string; kalemId: number }
  | { durum: "ZATEN_OKUTULDU"; mesaj: string }
  | { durum: "HATA"; mesaj: string };

/**
 * Kabul ekranında okutulan cihazı sevkiyat kalemiyle eşleştirir ve kabul işaretler.
 * İşaret hemen kaydedilir; kabul eden kişi partiler hâlinde okutabilir.
 */
export async function kabulCihaziOkut(
  transferId: number,
  kod: string,
): Promise<KabulOkutmaSonucu> {
  try {
    const oturum = await oturumZorunlu();

    const transfer = await prisma.transfer.findUnique({
      where: { id: transferId },
      select: { id: true, durum: true, hedefMagazaId: true, transferNo: true },
    });
    if (!transfer) return { durum: "HATA", mesaj: "Sevkiyat bulunamadı." };

    // Kabul yalnızca hedef mağazanın kullanıcısında (yönetici hariç).
    magazaIslemiZorunlu(oturum, transfer.hedefMagazaId);

    if (transfer.durum === TRANSFER_DURUM.RED || transfer.durum === TRANSFER_DURUM.IPTAL) {
      return { durum: "HATA", mesaj: "Bu sevkiyat kapatılmış." };
    }
    if (transfer.durum === TRANSFER_DURUM.KABUL) {
      return { durum: "HATA", mesaj: "Bu sevkiyat tamamen kabul edilmiş." };
    }

    const aranan = kodNormalize(kod);
    if (aranan.length < 3) return { durum: "HATA", mesaj: "Geçerli bir seri no veya barkod girin." };

    const kalem = await prisma.transferKalemi.findFirst({
      where: {
        transferId,
        stokKalemi: { OR: [{ seriNo: aranan }, { barkod: aranan }] },
      },
      include: { stokKalemi: { select: { marka: true, model: true, seriNo: true } } },
    });

    if (!kalem) {
      return { durum: "HATA", mesaj: `${aranan} bu sevkiyatta yok. Yanlış paket olabilir.` };
    }
    if (kalem.durum === TRANSFER_KALEM_DURUM.KABUL) {
      return {
        durum: "ZATEN_OKUTULDU",
        mesaj: `${kalem.stokKalemi.marka} ${kalem.stokKalemi.model} zaten okutuldu.`,
      };
    }
    if (kalem.durum === TRANSFER_KALEM_DURUM.RED) {
      return { durum: "HATA", mesaj: `${aranan} daha önce reddedilmiş.` };
    }

    await prisma.transferKalemi.update({
      where: { id: kalem.id },
      data: { durum: TRANSFER_KALEM_DURUM.KABUL, kabulTarihi: new Date() },
    });

    revalidatePath(`/sevkiyat/${transferId}`);
    return {
      durum: "KABUL",
      kalemId: kalem.id,
      mesaj: `${kalem.stokKalemi.marka} ${kalem.stokKalemi.model} kabul edildi.`,
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { durum: "HATA", mesaj: hata.message };
    console.error("Kabul okutması başarısız:", hata);
    return { durum: "HATA", mesaj: "Cihaz okutulamadı. Tekrar deneyin." };
  }
}

export type KabulDurumu = { hata?: string; basari?: string };

/**
 * Okutulan cihazları hedef depoya geçirir.
 * Okutulmayanlar sevkiyatta bekler; sevkiyat "Kısmi Kabul" olur.
 */
export async function kabuluTamamla(_onceki: KabulDurumu, form: FormData): Promise<KabulDurumu> {
  try {
    const oturum = await oturumZorunlu();
    const transferId = Number(form.get("transferId"));
    if (!Number.isInteger(transferId) || transferId <= 0) return { hata: "Sevkiyat bulunamadı." };

    const transfer = await prisma.transfer.findUnique({
      where: { id: transferId },
      include: { kalemler: true, hedefMagaza: { select: { ad: true } } },
    });
    if (!transfer) return { hata: "Sevkiyat bulunamadı." };
    magazaIslemiZorunlu(oturum, transfer.hedefMagazaId);

    if (transfer.durum !== TRANSFER_DURUM.BEKLIYOR && transfer.durum !== TRANSFER_DURUM.KISMI_KABUL) {
      return { hata: "Bu sevkiyat üzerinde işlem yapılamaz." };
    }

    const kabulEdilen = transfer.kalemler.filter((k) => k.durum === TRANSFER_KALEM_DURUM.KABUL);
    const bekleyen = transfer.kalemler.filter((k) => k.durum === TRANSFER_KALEM_DURUM.BEKLIYOR);

    if (kabulEdilen.length === 0) {
      return { hata: "Hiç cihaz okutulmadı. Önce cihazları okutun." };
    }

    await prisma.$transaction(async (tx) => {
      // Hedef depoya yalnız fiilen okutulanlar geçer.
      for (const kalem of kabulEdilen) {
        const guncel = await tx.stokKalemi.findUnique({
          where: { id: kalem.stokKalemiId },
          select: { durum: true },
        });
        // Zaten taşınmışsa (çift tıklama) tekrar hareket yazma.
        if (!guncel || guncel.durum !== STOK_DURUM.TRANSFERDE) continue;

        await tx.stokKalemi.update({
          where: { id: kalem.stokKalemiId },
          data: {
            magazaId: transfer.hedefMagazaId,
            durum: STOK_DURUM.STOKTA,
            cikisTarihi: null,
          },
        });
        await tx.stokHareketi.create({
          data: {
            stokKalemiId: kalem.stokKalemiId,
            tip: HAREKET_TIP.TRANSFER_KABUL,
            kaynakMagazaId: transfer.kaynakMagazaId,
            hedefMagazaId: transfer.hedefMagazaId,
            kullaniciId: oturum.kullaniciId,
            transferId: transfer.id,
            aciklama: `${transfer.transferNo} kabul edildi`,
          },
        });
      }

      await tx.transfer.update({
        where: { id: transfer.id },
        data: {
          durum: bekleyen.length === 0 ? TRANSFER_DURUM.KABUL : TRANSFER_DURUM.KISMI_KABUL,
          kabulEdenId: oturum.kullaniciId,
          kabulTarihi: new Date(),
        },
      });
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.TRANSFER_KABUL,
      hedefTip: "Transfer",
      hedefId: transfer.id,
      detay: `${transfer.transferNo} · ${kabulEdilen.length} kabul, ${bekleyen.length} eksik`,
    });

    revalidatePath(`/sevkiyat/${transferId}`);
    revalidatePath("/sevkiyat");
    revalidatePath("/cihazlar");
    revalidatePath("/panel");

    return {
      basari:
        bekleyen.length === 0
          ? `${kabulEdilen.length} cihaz ${transfer.hedefMagaza.ad} deposuna alındı.`
          : `${kabulEdilen.length} cihaz alındı. ${bekleyen.length} cihaz okutulmadı, sevkiyatta bekliyor.`,
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Kabul tamamlanamadı:", hata);
    return { hata: "Kabul tamamlanamadı. Lütfen tekrar deneyin." };
  }
}

/**
 * Okutulmayan (veya tüm) cihazları kaynak mağazaya geri gönderir.
 * Yanlış ya da eksik sevkiyatın stokta asılı kalmasını önler.
 */
export async function sevkiyatiReddet(_onceki: KabulDurumu, form: FormData): Promise<KabulDurumu> {
  try {
    const oturum = await oturumZorunlu();
    const transferId = Number(form.get("transferId"));
    const neden = String(form.get("redNedeni") ?? "").trim();
    if (!Number.isInteger(transferId) || transferId <= 0) return { hata: "Sevkiyat bulunamadı." };
    if (neden.length < 3) return { hata: "Red nedenini yazın." };

    const transfer = await prisma.transfer.findUnique({
      where: { id: transferId },
      include: { kalemler: true, kaynakMagaza: { select: { ad: true } } },
    });
    if (!transfer) return { hata: "Sevkiyat bulunamadı." };
    magazaIslemiZorunlu(oturum, transfer.hedefMagazaId);

    if (transfer.durum !== TRANSFER_DURUM.BEKLIYOR && transfer.durum !== TRANSFER_DURUM.KISMI_KABUL) {
      return { hata: "Bu sevkiyat üzerinde işlem yapılamaz." };
    }

    const bekleyen = transfer.kalemler.filter((k) => k.durum === TRANSFER_KALEM_DURUM.BEKLIYOR);
    if (bekleyen.length === 0) return { hata: "Reddedilecek cihaz kalmadı." };

    const kabulVarMi = transfer.kalemler.some((k) => k.durum === TRANSFER_KALEM_DURUM.KABUL);

    await prisma.$transaction(async (tx) => {
      for (const kalem of bekleyen) {
        await tx.transferKalemi.update({
          where: { id: kalem.id },
          data: { durum: TRANSFER_KALEM_DURUM.RED, not: neden },
        });
        await tx.stokKalemi.update({
          where: { id: kalem.stokKalemiId },
          data: {
            magazaId: transfer.kaynakMagazaId,
            durum: STOK_DURUM.STOKTA,
            cikisTarihi: null,
          },
        });
        await tx.stokHareketi.create({
          data: {
            stokKalemiId: kalem.stokKalemiId,
            tip: HAREKET_TIP.TRANSFER_RED,
            kaynakMagazaId: transfer.hedefMagazaId,
            hedefMagazaId: transfer.kaynakMagazaId,
            kullaniciId: oturum.kullaniciId,
            transferId: transfer.id,
            aciklama: `${transfer.transferNo} reddedildi: ${neden}`,
          },
        });
      }

      await tx.transfer.update({
        where: { id: transfer.id },
        data: {
          durum: kabulVarMi ? TRANSFER_DURUM.KISMI_KABUL : TRANSFER_DURUM.RED,
          redNedeni: neden,
          kabulEdenId: oturum.kullaniciId,
          kabulTarihi: new Date(),
        },
      });
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.TRANSFER_RED,
      hedefTip: "Transfer",
      hedefId: transfer.id,
      detay: `${transfer.transferNo} · ${bekleyen.length} cihaz reddedildi: ${neden}`,
    });

    revalidatePath(`/sevkiyat/${transferId}`);
    revalidatePath("/sevkiyat");
    revalidatePath("/cihazlar");
    revalidatePath("/panel");

    return {
      basari: `${bekleyen.length} cihaz ${transfer.kaynakMagaza.ad} deposuna geri gönderildi.`,
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Sevkiyat reddedilemedi:", hata);
    return { hata: "Sevkiyat reddedilemedi. Lütfen tekrar deneyin." };
  }
}

/** Gönderen mağaza, henüz hiç cihaz kabul edilmemiş sevkiyatı geri çeker. */
export async function sevkiyatiIptalEt(_onceki: KabulDurumu, form: FormData): Promise<KabulDurumu> {
  try {
    const oturum = await oturumZorunlu();
    const transferId = Number(form.get("transferId"));
    if (!Number.isInteger(transferId) || transferId <= 0) return { hata: "Sevkiyat bulunamadı." };

    const transfer = await prisma.transfer.findUnique({
      where: { id: transferId },
      include: { kalemler: true },
    });
    if (!transfer) return { hata: "Sevkiyat bulunamadı." };
    magazaIslemiZorunlu(oturum, transfer.kaynakMagazaId);

    if (transfer.durum !== TRANSFER_DURUM.BEKLIYOR) {
      return { hata: "Yalnızca henüz işlem görmemiş sevkiyat geri çekilebilir." };
    }
    if (transfer.kalemler.some((k) => k.durum !== TRANSFER_KALEM_DURUM.BEKLIYOR)) {
      return { hata: "Hedef mağaza cihaz okutmaya başlamış; geri çekilemez." };
    }

    await prisma.$transaction(async (tx) => {
      for (const kalem of transfer.kalemler) {
        await tx.stokKalemi.update({
          where: { id: kalem.stokKalemiId },
          data: { durum: STOK_DURUM.STOKTA, cikisTarihi: null },
        });
        await tx.stokHareketi.create({
          data: {
            stokKalemiId: kalem.stokKalemiId,
            tip: HAREKET_TIP.TRANSFER_RED,
            kaynakMagazaId: transfer.kaynakMagazaId,
            hedefMagazaId: transfer.kaynakMagazaId,
            kullaniciId: oturum.kullaniciId,
            transferId: transfer.id,
            aciklama: `${transfer.transferNo} gönderen tarafından geri çekildi`,
          },
        });
      }
      await tx.transfer.update({
        where: { id: transfer.id },
        data: { durum: TRANSFER_DURUM.IPTAL },
      });
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.TRANSFER_RED,
      hedefTip: "Transfer",
      hedefId: transfer.id,
      detay: `${transfer.transferNo} geri çekildi`,
    });

    revalidatePath(`/sevkiyat/${transferId}`);
    revalidatePath("/sevkiyat");
    revalidatePath("/cihazlar");
    revalidatePath("/panel");
    return { basari: "Sevkiyat geri çekildi, cihazlar mağazanıza döndü." };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Sevkiyat iptal edilemedi:", hata);
    return { hata: "Sevkiyat iptal edilemedi. Lütfen tekrar deneyin." };
  }
}
