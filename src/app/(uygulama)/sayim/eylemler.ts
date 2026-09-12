"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logYaz } from "@/lib/log";
import { kodNormalize } from "@/lib/metin";
import { prisma } from "@/lib/prisma";
import { LOG_ISLEM, SAYIM_DURUM, SAYIM_SONUC, STOK_DURUM } from "@/lib/sabitler";
import { YetkiHatasi, magazaIslemiZorunlu, oturumZorunlu } from "@/lib/yetki";

export type SayimDurumu = { hata?: string; basari?: string };

// ------------------------------------------------------------ Sayım başlatma

/**
 * Seçilen mağaza için sayım açar ve o andaki stoğu fotoğraflar.
 * Yalnız o mağazadaki STOKTA cihazlar sayım listesine girer; başka mağazanın
 * stoğu bu sayımı hiç etkilemez.
 */
export async function sayimBaslat(_onceki: SayimDurumu, form: FormData): Promise<SayimDurumu> {
  let yeniId: number;

  try {
    const oturum = await oturumZorunlu();
    const magazaId = Number(form.get("magazaId"));
    if (!Number.isInteger(magazaId) || magazaId <= 0) return { hata: "Mağaza seçin." };
    magazaIslemiZorunlu(oturum, magazaId);

    const magaza = await prisma.magaza.findUnique({
      where: { id: magazaId },
      select: { ad: true, aktif: true },
    });
    if (!magaza || !magaza.aktif) return { hata: "Mağaza bulunamadı veya pasif." };

    const acikSayim = await prisma.sayim.findFirst({
      where: { magazaId, durum: SAYIM_DURUM.DEVAM },
      select: { id: true },
    });
    if (acikSayim) {
      return { hata: `${magaza.ad} için devam eden bir sayım zaten var.` };
    }

    const sayim = await prisma.$transaction(async (tx) => {
      const stoktakiler = await tx.stokKalemi.findMany({
        where: { magazaId, durum: STOK_DURUM.STOKTA },
        select: { id: true },
      });

      const olusan = await tx.sayim.create({
        data: {
          magazaId,
          durum: SAYIM_DURUM.DEVAM,
          baslatanId: oturum.kullaniciId,
          beklenenAdet: stoktakiler.length,
        },
      });

      if (stoktakiler.length > 0) {
        await tx.sayimKalemi.createMany({
          data: stoktakiler.map((s) => ({
            sayimId: olusan.id,
            stokKalemiId: s.id,
            beklenen: true,
            sayildi: false,
          })),
        });
      }

      return olusan;
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.SAYIM_BASLAT,
      hedefTip: "Sayim",
      hedefId: sayim.id,
      detay: `${magaza.ad} · ${sayim.beklenenAdet} cihaz beklenen`,
    });

    revalidatePath("/sayim");
    yeniId = sayim.id;
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Sayım başlatılamadı:", hata);
    return { hata: "Sayım başlatılamadı. Lütfen tekrar deneyin." };
  }

  redirect(`/sayim/${yeniId}`);
}

// ------------------------------------------------------------- Okutma

export type SayimOkutmaSonucu = {
  sonuc: "BULUNDU" | "ZATEN_SAYILDI" | "BASKA_MAGAZADA" | "SATILMIS" | "KAYITSIZ" | "HATA";
  mesaj: string;
};

/**
 * Sayım sırasında okutulan kodu değerlendirir.
 * Sayım listesinde olan cihaz "sayıldı" işaretlenir; olmayanlar fazla olarak kaydedilir.
 */
export async function sayimOkut(sayimId: number, kod: string): Promise<SayimOkutmaSonucu> {
  try {
    const oturum = await oturumZorunlu();

    const sayim = await prisma.sayim.findUnique({
      where: { id: sayimId },
      include: { magaza: { select: { ad: true } } },
    });
    if (!sayim) return { sonuc: "HATA", mesaj: "Sayım bulunamadı." };
    magazaIslemiZorunlu(oturum, sayim.magazaId);

    if (sayim.durum !== SAYIM_DURUM.DEVAM) {
      return { sonuc: "HATA", mesaj: "Bu sayım kapatılmış." };
    }

    const aranan = kodNormalize(kod);
    if (aranan.length < 3) return { sonuc: "HATA", mesaj: "Geçerli bir seri no veya barkod girin." };

    // 1) Sayım listesinde mi?
    const listedeki = await prisma.sayimKalemi.findFirst({
      where: {
        sayimId,
        stokKalemi: { OR: [{ seriNo: aranan }, { barkod: aranan }] },
      },
      include: { stokKalemi: { select: { marka: true, model: true } } },
    });

    if (listedeki) {
      const ad = `${listedeki.stokKalemi?.marka ?? ""} ${listedeki.stokKalemi?.model ?? ""}`.trim();

      if (listedeki.sayildi) {
        return {
          sonuc: "ZATEN_SAYILDI",
          mesaj: `${ad} daha önce okutuldu, tekrar sayılmadı.`,
        };
      }

      await prisma.sayimKalemi.update({
        where: { id: listedeki.id },
        data: {
          sayildi: true,
          sonuc: SAYIM_SONUC.BULUNDU,
          okutulanKod: aranan,
          okutmaTarihi: new Date(),
          okutanId: oturum.kullaniciId,
        },
      });

      revalidatePath(`/sayim/${sayimId}`);
      return { sonuc: "BULUNDU", mesaj: `${ad} — stokta bulundu.` };
    }

    // 2) Sistemde kayıtlı ama bu mağazanın sayım listesinde değil.
    const cihaz = await prisma.stokKalemi.findFirst({
      where: { OR: [{ seriNo: aranan }, { barkod: aranan }] },
      include: { magaza: { select: { ad: true } } },
    });

    if (cihaz) {
      const zatenKayitli = await prisma.sayimKalemi.findUnique({
        where: { sayimId_stokKalemiId: { sayimId, stokKalemiId: cihaz.id } },
        select: { id: true },
      });
      if (zatenKayitli) {
        return { sonuc: "ZATEN_SAYILDI", mesaj: `${aranan} bu sayımda zaten fazla olarak işaretli.` };
      }

      const satilmis = cihaz.durum === STOK_DURUM.SATILDI;
      await prisma.sayimKalemi.create({
        data: {
          sayimId,
          stokKalemiId: cihaz.id,
          beklenen: false,
          sayildi: true,
          sonuc: satilmis ? SAYIM_SONUC.SATILMIS : SAYIM_SONUC.BASKA_MAGAZADA,
          okutulanKod: aranan,
          okutmaTarihi: new Date(),
          okutanId: oturum.kullaniciId,
          not: satilmis ? "Satılmış görünüyor" : `Kayıtlı depo: ${cihaz.magaza.ad}`,
        },
      });

      revalidatePath(`/sayim/${sayimId}`);
      const ad = `${cihaz.marka} ${cihaz.model}`;
      return satilmis
        ? { sonuc: "SATILMIS", mesaj: `${ad} satılmış görünüyor ama rafta çıktı. Fazla listesine eklendi.` }
        : {
            sonuc: "BASKA_MAGAZADA",
            mesaj: `${ad} sistemde ${cihaz.magaza.ad} deposunda kayıtlı. Fazla listesine eklendi.`,
          };
    }

    // 3) Hiç kayıtlı değil.
    const ayniKod = await prisma.sayimKalemi.findFirst({
      where: { sayimId, stokKalemiId: null, okutulanKod: aranan },
      select: { id: true },
    });
    if (ayniKod) {
      return { sonuc: "ZATEN_SAYILDI", mesaj: `${aranan} bu sayımda zaten kayıtsız olarak işaretli.` };
    }

    await prisma.sayimKalemi.create({
      data: {
        sayimId,
        stokKalemiId: null,
        beklenen: false,
        sayildi: true,
        sonuc: SAYIM_SONUC.KAYITSIZ,
        okutulanKod: aranan,
        okutmaTarihi: new Date(),
        okutanId: oturum.kullaniciId,
      },
    });

    revalidatePath(`/sayim/${sayimId}`);
    return { sonuc: "KAYITSIZ", mesaj: `${aranan} sistemde kayıtlı değil. Fazla listesine eklendi.` };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { sonuc: "HATA", mesaj: hata.message };
    console.error("Sayım okutması başarısız:", hata);
    return { sonuc: "HATA", mesaj: "Okutma kaydedilemedi. Tekrar deneyin." };
  }
}

// --------------------------------------------------------------- Kapatma

/**
 * Sayımı kapatır. Okutulmayan cihazlar "eksik" olarak işaretlenir.
 * Stok miktarına otomatik müdahale edilmez; fark raporu yöneticinin kararına bırakılır.
 */
export async function sayimKapat(_onceki: SayimDurumu, form: FormData): Promise<SayimDurumu> {
  try {
    const oturum = await oturumZorunlu();
    const sayimId = Number(form.get("sayimId"));
    if (!Number.isInteger(sayimId) || sayimId <= 0) return { hata: "Sayım bulunamadı." };

    const sayim = await prisma.sayim.findUnique({
      where: { id: sayimId },
      include: { magaza: { select: { ad: true } } },
    });
    if (!sayim) return { hata: "Sayım bulunamadı." };
    magazaIslemiZorunlu(oturum, sayim.magazaId);
    if (sayim.durum !== SAYIM_DURUM.DEVAM) return { hata: "Bu sayım zaten kapatılmış." };

    const sonuclar = await prisma.$transaction(async (tx) => {
      const eksik = await tx.sayimKalemi.updateMany({
        where: { sayimId, beklenen: true, sayildi: false },
        data: { sonuc: SAYIM_SONUC.EKSIK },
      });

      await tx.sayim.update({
        where: { id: sayimId },
        data: {
          durum: SAYIM_DURUM.TAMAMLANDI,
          bitisTarihi: new Date(),
          kapatanId: oturum.kullaniciId,
        },
      });

      const sayilan = await tx.sayimKalemi.count({ where: { sayimId, beklenen: true, sayildi: true } });
      const fazla = await tx.sayimKalemi.count({ where: { sayimId, beklenen: false } });
      return { eksik: eksik.count, sayilan, fazla };
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.SAYIM_KAPAT,
      hedefTip: "Sayim",
      hedefId: sayimId,
      detay: `${sayim.magaza.ad} · ${sonuclar.sayilan} sayıldı, ${sonuclar.eksik} eksik, ${sonuclar.fazla} fazla`,
    });

    revalidatePath(`/sayim/${sayimId}`);
    revalidatePath("/sayim");
    return {
      basari: `Sayım kapatıldı: ${sonuclar.sayilan} sayıldı, ${sonuclar.eksik} eksik, ${sonuclar.fazla} fazla.`,
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Sayım kapatılamadı:", hata);
    return { hata: "Sayım kapatılamadı. Lütfen tekrar deneyin." };
  }
}

/** Yanlışlıkla açılan sayımı iptal eder; hiçbir stok kaydına dokunmaz. */
export async function sayimIptal(_onceki: SayimDurumu, form: FormData): Promise<SayimDurumu> {
  try {
    const oturum = await oturumZorunlu();
    const sayimId = Number(form.get("sayimId"));
    if (!Number.isInteger(sayimId) || sayimId <= 0) return { hata: "Sayım bulunamadı." };

    const sayim = await prisma.sayim.findUnique({ where: { id: sayimId } });
    if (!sayim) return { hata: "Sayım bulunamadı." };
    magazaIslemiZorunlu(oturum, sayim.magazaId);
    if (sayim.durum !== SAYIM_DURUM.DEVAM) return { hata: "Yalnızca devam eden sayım iptal edilebilir." };

    await prisma.sayim.update({
      where: { id: sayimId },
      data: { durum: SAYIM_DURUM.IPTAL, bitisTarihi: new Date(), kapatanId: oturum.kullaniciId },
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.SAYIM_KAPAT,
      hedefTip: "Sayim",
      hedefId: sayimId,
      detay: "Sayım iptal edildi",
    });

    revalidatePath(`/sayim/${sayimId}`);
    revalidatePath("/sayim");
    return { basari: "Sayım iptal edildi." };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Sayım iptal edilemedi:", hata);
    return { hata: "Sayım iptal edilemedi. Lütfen tekrar deneyin." };
  }
}
