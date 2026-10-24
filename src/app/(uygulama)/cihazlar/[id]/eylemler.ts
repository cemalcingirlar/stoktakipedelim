"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logYaz } from "@/lib/log";
import { aramaMetniUret } from "@/lib/metin";
import { prisma } from "@/lib/prisma";
import { HAREKET_TIP, LOG_ISLEM, ODEME_TIPI, STOK_DURUM } from "@/lib/sabitler";
import { YetkiHatasi, adminZorunlu } from "@/lib/yetki";
import {
  cihazIptalEngeli,
  gerekceSorunu,
  iptalGeriAlmaEngeli,
} from "@/lib/kayitIptali";

/** İptal ve geri alma aynı sayfaları tazeliyor; tek yerde dursun. */
function cihazYollariniTazele(cihazId: number): void {
  revalidatePath(`/cihazlar/${cihazId}`);
  revalidatePath("/cihazlar");
  revalidatePath("/panel");
  revalidatePath("/rapor");
  revalidatePath("/faturalar");
}

/**
 * Kaydedilmiş bir satışın düzeltilmesi ve geri alınması.
 *
 * Yalnız yöneticide: satış tutarı, ödeme tipi, tarih, satışı yapan ve müşteri
 * kâr raporlarının temeli. Yanlış girilen bir satışı mağaza personelinin
 * değiştirebilmesi denetlenebilirliği bozardı.
 */

const satisDuzenlemeSemasi = z.object({
  cihazId: z.number().int().positive(),
  satisFiyatiKurus: z
    .number()
    .int("Satış fiyatı geçersiz.")
    .min(0, "Satış fiyatı negatif olamaz.")
    .max(1_000_000_00_00, "Satış fiyatı çok yüksek."),
  odemeTipi: z.enum(
    Object.values(ODEME_TIPI) as [string, ...string[]],
    "Ödeme tipi seçin.",
  ),
  satisTarihi: z.coerce.date({ message: "Satış tarihi geçersiz." }),
  satanKullaniciId: z.number().int().positive("Satışı yapan kişiyi seçin."),
  musteriId: z.number().int().positive().nullable(),
  not: z.string().trim().max(300).nullable(),
});

export type SatisDuzenlemeDurumu = { hata?: string; basari?: string };

export async function satisiDuzenle(
  _onceki: SatisDuzenlemeDurumu,
  form: FormData,
): Promise<SatisDuzenlemeDurumu> {
  try {
    const oturum = await adminZorunlu();

    let cozulen: unknown;
    try {
      cozulen = JSON.parse(String(form.get("veri") ?? ""));
    } catch {
      return { hata: "Veri okunamadı. Sayfayı yenileyip tekrar deneyin." };
    }

    const sonuc = satisDuzenlemeSemasi.safeParse(cozulen);
    if (!sonuc.success) return { hata: sonuc.error.issues[0].message };
    const veri = sonuc.data;

    const cihaz = await prisma.stokKalemi.findUnique({
      where: { id: veri.cihazId },
      include: { tedarikci: { select: { ad: true } } },
    });
    if (!cihaz) return { hata: "Cihaz bulunamadı." };
    if (cihaz.durum !== STOK_DURUM.SATILDI) {
      return { hata: "Bu cihaz satılmış değil; düzenlenecek bir satış yok." };
    }

    const satan = await prisma.kullanici.findFirst({
      where: { id: veri.satanKullaniciId, aktif: true },
      select: { id: true, adSoyad: true },
    });
    if (!satan) return { hata: "Satışı yapan kişi bulunamadı ya da pasif." };

    let musteri: { adSoyad: string; telefon: string | null } | null = null;
    if (veri.musteriId !== null) {
      musteri = await prisma.musteri.findUnique({
        where: { id: veri.musteriId },
        select: { adSoyad: true, telefon: true },
      });
      if (!musteri) return { hata: "Müşteri bulunamadı." };
    }

    await prisma.stokKalemi.update({
      where: { id: cihaz.id },
      data: {
        satisFiyatiKurus: veri.satisFiyatiKurus,
        odemeTipi: veri.odemeTipi,
        satisTarihi: veri.satisTarihi,
        cikisTarihi: veri.satisTarihi,
        satanKullaniciId: satan.id,
        musteriId: veri.musteriId,
        not: veri.not,
        aramaMetni: aramaMetniUret([
          cihaz.marka,
          cihaz.model,
          cihaz.renk,
          cihaz.kapasite,
          cihaz.seriNo,
          cihaz.barkod,
          cihaz.tedarikci?.ad,
          veri.not,
          musteri?.adSoyad,
          musteri?.telefon,
        ]),
      },
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.STOK_DUZENLE,
      hedefTip: "StokKalemi",
      hedefId: cihaz.id,
      detay:
        `Satış düzeltildi: ${cihaz.marka} ${cihaz.model} ` +
        `(${cihaz.seriNo ?? "seri no yok"}) · ${veri.satisFiyatiKurus / 100} TL · ` +
        `${satan.adSoyad} · ${musteri?.adSoyad ?? "müşterisiz"}`,
    });

    revalidatePath(`/cihazlar/${cihaz.id}`);
    revalidatePath("/cihazlar");
    revalidatePath("/panel");
    revalidatePath("/rapor");
    revalidatePath("/musteriler");

    return { basari: "Satış bilgileri güncellendi." };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Satış düzenlenemedi:", hata);
    return { hata: "Satış düzenlenemedi. Lütfen tekrar deneyin." };
  }
}

/**
 * Satışı geri alır: cihaz satıldığı mağazanın stoğuna döner, satış alanları
 * temizlenir. Yanlış cihaz okutulduğunda tek çıkış yolu buydu.
 *
 * Kayıt silinmiyor; tarihçeye IADE hareketi yazılıyor, ne olduğu görülebilsin.
 */
export async function satisiGeriAl(
  _onceki: SatisDuzenlemeDurumu,
  form: FormData,
): Promise<SatisDuzenlemeDurumu> {
  try {
    const oturum = await adminZorunlu();

    const cihazId = Number(form.get("cihazId"));
    if (!Number.isInteger(cihazId) || cihazId <= 0)
      return { hata: "Cihaz bulunamadı." };

    const cihaz = await prisma.stokKalemi.findUnique({
      where: { id: cihazId },
      include: {
        musteri: { select: { adSoyad: true } },
        tedarikci: { select: { ad: true } },
      },
    });
    if (!cihaz) return { hata: "Cihaz bulunamadı." };
    if (cihaz.durum !== STOK_DURUM.SATILDI) {
      return { hata: "Bu cihaz satılmış değil." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.stokKalemi.update({
        where: { id: cihaz.id },
        data: {
          durum: STOK_DURUM.STOKTA,
          satisTarihi: null,
          satisFiyatiKurus: null,
          satanKullaniciId: null,
          musteriId: null,
          odemeTipi: null,
          cikisTarihi: null,
          // Müşteri artık bağlı değil; arama metninden de çıkmalı.
          aramaMetni: aramaMetniUret([
            cihaz.marka,
            cihaz.model,
            cihaz.renk,
            cihaz.kapasite,
            cihaz.seriNo,
            cihaz.barkod,
            cihaz.tedarikci?.ad,
            cihaz.not,
          ]),
        },
      });

      await tx.stokHareketi.create({
        data: {
          stokKalemiId: cihaz.id,
          tip: HAREKET_TIP.IADE,
          hedefMagazaId: cihaz.magazaId,
          kullaniciId: oturum.kullaniciId,
          aciklama: cihaz.musteri
            ? `Satış geri alındı (${cihaz.musteri.adSoyad})`
            : "Satış geri alındı",
        },
      });
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.STOK_DUZENLE,
      hedefTip: "StokKalemi",
      hedefId: cihaz.id,
      detay:
        `Satış geri alındı: ${cihaz.marka} ${cihaz.model} ` +
        `(${cihaz.seriNo ?? "seri no yok"}) · ${cihaz.musteri?.adSoyad ?? "müşterisiz"}`,
    });

    revalidatePath(`/cihazlar/${cihaz.id}`);
    revalidatePath("/cihazlar");
    revalidatePath("/panel");
    revalidatePath("/rapor");
    revalidatePath("/musteriler");

    return { basari: "Satış geri alındı; cihaz tekrar stokta." };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Satış geri alınamadı:", hata);
    return { hata: "Satış geri alınamadı. Lütfen tekrar deneyin." };
  }
}

/**
 * Yanlış girilmiş bir cihazı iptal eder.
 *
 * Kayıt silinmiyor, durumu IPTAL oluyor. Stok sayımlarının tamamı zaten
 * `durum = STOKTA` filtrelediği için cihaz toplamlardan kendiliğinden düşüyor;
 * buna karşılık kimin ne zaman hangi gerekçeyle iptal ettiği görünür kalıyor.
 * Sessizce kaybolan kayıt denetlenemez.
 *
 * Yalnız yöneticide: iptal, stok değerini doğrudan değiştiriyor.
 */
export async function cihaziIptalEt(
  _onceki: SatisDuzenlemeDurumu,
  form: FormData,
): Promise<SatisDuzenlemeDurumu> {
  try {
    const oturum = await adminZorunlu();

    const cihazId = Number(form.get("cihazId"));
    if (!Number.isInteger(cihazId) || cihazId <= 0)
      return { hata: "Cihaz bulunamadı." };

    const gerekce = String(form.get("gerekce") ?? "").trim();
    const gerekceHatasi = gerekceSorunu(gerekce);
    if (gerekceHatasi) return { hata: gerekceHatasi };

    const cihaz = await prisma.stokKalemi.findUnique({
      where: { id: cihazId },
    });
    if (!cihaz) return { hata: "Cihaz bulunamadı." };

    const engel = cihazIptalEngeli(cihaz);
    if (engel) return { hata: engel };

    await prisma.$transaction(async (tx) => {
      await tx.stokKalemi.update({
        where: { id: cihaz.id },
        data: { durum: STOK_DURUM.IPTAL },
      });
      await tx.stokHareketi.create({
        data: {
          stokKalemiId: cihaz.id,
          tip: HAREKET_TIP.IPTAL,
          kaynakMagazaId: cihaz.magazaId,
          kullaniciId: oturum.kullaniciId,
          aciklama: `Kayıt iptal edildi: ${gerekce}`,
        },
      });
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.STOK_SIL,
      hedefTip: "StokKalemi",
      hedefId: cihaz.id,
      detay:
        `Cihaz iptal edildi: ${cihaz.marka} ${cihaz.model} ` +
        `(${cihaz.seriNo ?? cihaz.barkod ?? "kodsuz"}) · gerekçe: ${gerekce}`,
    });

    cihazYollariniTazele(cihaz.id);
    return { basari: "Cihaz iptal edildi; stok toplamlarından düşüldü." };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Cihaz iptal edilemedi:", hata);
    return { hata: "Cihaz iptal edilemedi. Lütfen tekrar deneyin." };
  }
}

/** Yanlışlıkla iptal edilen cihazı stoğa geri alır. */
export async function cihazIptaliniGeriAl(
  _onceki: SatisDuzenlemeDurumu,
  form: FormData,
): Promise<SatisDuzenlemeDurumu> {
  try {
    const oturum = await adminZorunlu();

    const cihazId = Number(form.get("cihazId"));
    if (!Number.isInteger(cihazId) || cihazId <= 0)
      return { hata: "Cihaz bulunamadı." };

    const cihaz = await prisma.stokKalemi.findUnique({
      where: { id: cihazId },
    });
    if (!cihaz) return { hata: "Cihaz bulunamadı." };

    const engel = iptalGeriAlmaEngeli(cihaz);
    if (engel) return { hata: engel };

    await prisma.$transaction(async (tx) => {
      await tx.stokKalemi.update({
        where: { id: cihaz.id },
        data: { durum: STOK_DURUM.STOKTA },
      });
      await tx.stokHareketi.create({
        data: {
          stokKalemiId: cihaz.id,
          tip: HAREKET_TIP.IPTAL_GERI,
          hedefMagazaId: cihaz.magazaId,
          kullaniciId: oturum.kullaniciId,
          aciklama: "İptal geri alındı; cihaz tekrar stokta",
        },
      });
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.STOK_DUZENLE,
      hedefTip: "StokKalemi",
      hedefId: cihaz.id,
      detay: `Cihaz iptali geri alındı: ${cihaz.marka} ${cihaz.model}`,
    });

    cihazYollariniTazele(cihaz.id);
    return { basari: "İptal geri alındı; cihaz tekrar stokta." };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("İptal geri alınamadı:", hata);
    return { hata: "İptal geri alınamadı. Lütfen tekrar deneyin." };
  }
}
