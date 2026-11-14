"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logYaz } from "@/lib/log";
import { aramaMetniUret } from "@/lib/metin";
import { prisma } from "@/lib/prisma";
import { HAREKET_TIP, LOG_ISLEM, ODEME_TIPI, STOK_DURUM } from "@/lib/sabitler";
import {
  SATIS_NOTU_EN_COK,
  farkVarMi,
  kalemTarihceMetni,
  kalemlerOrtusuyorMu,
  satisFarki,
  satisFiyatiSorunu,
  satisLogDetayi,
  yeniSatisTarihi,
  type SatisDurumu,
} from "@/lib/satisDuzeltme";
import { YetkiHatasi, adminZorunlu } from "@/lib/yetki";

export type SatisKartiDurumu = { hata?: string; basari?: string };

const sema = z.object({
  satisId: z.number().int().positive(),
  musteriId: z.number().int().positive("Müşteri seçin."),
  satanKullaniciId: z.number().int().positive("Satışı yapan kişiyi seçin."),
  odemeTipi: z.enum(
    Object.values(ODEME_TIPI) as [string, ...string[]],
    "Ödeme tipi seçin.",
  ),
  satisTarihi: z.string(),
  not: z.string().trim().max(SATIS_NOTU_EN_COK, "Not çok uzun.").nullable(),
  aciklama: z.string().trim().max(300, "Açıklama çok uzun.").nullable(),
  fiyatlar: z
    .array(z.object({ cihazId: z.number().int().positive(), kurus: z.number() }))
    .min(1)
    .max(500),
});

/**
 * Satış kartını düzeltir: müşteri, satışı yapan, ödeme tipi, tarih, not ve
 * her cihazın satış fiyatı.
 *
 * Yalnız yöneticide ve yetki burada, sunucuda sınanıyor: bu alanlar ciro ve
 * kâr raporlarının, prim hesabının temeli.
 *
 * Kart ve cihaz satırları AYNI işlemde güncelleniyor. Müşteri, satan, ödeme
 * tipi ve tarih iki yerde de duruyor (raporlar cihaz satırından okuyor); biri
 * güncellenip diğeri kalırsa ekranlar birbirini tutmaz.
 *
 * Her düzeltme iz bırakıyor: neyin neyden neye değiştiği işlem kaydına
 * (SATIS_DUZENLE) ve ilgili cihazların tarihçesine yazılıyor.
 */
export async function satisKartiniDuzenle(
  _onceki: SatisKartiDurumu,
  form: FormData,
): Promise<SatisKartiDurumu> {
  try {
    const oturum = await adminZorunlu();

    let ham: unknown;
    try {
      ham = JSON.parse(String(form.get("veri") ?? ""));
    } catch {
      return { hata: "Veri okunamadı. Sayfayı yenileyip tekrar deneyin." };
    }
    const cozum = sema.safeParse(ham);
    if (!cozum.success) return { hata: cozum.error.issues[0].message };
    const veri = cozum.data;

    const satis = await prisma.satis.findUnique({
      where: { id: veri.satisId },
      include: {
        musteri: { select: { adSoyad: true } },
        satanKullanici: { select: { adSoyad: true } },
        kalemler: {
          orderBy: { id: "asc" },
          include: { tedarikci: { select: { ad: true } } },
        },
      },
    });
    if (!satis) return { hata: "Satış bulunamadı." };
    if (satis.kalemler.length === 0) {
      return { hata: "Bu satışta cihaz kalmamış; düzenlenecek bir şey yok." };
    }
    if (satis.kalemler.some((k) => k.durum !== STOK_DURUM.SATILDI)) {
      return {
        hata: "Satıştaki cihazlardan biri artık satılmış görünmüyor. Sayfayı yenileyin.",
      };
    }

    // Gönderilen fiyatlar satışın cihazlarıyla birebir örtüşmeli; başka
    // satışın cihazına bu yoldan dokunulamamalı.
    if (
      !kalemlerOrtusuyorMu(
        satis.kalemler.map((k) => k.id),
        veri.fiyatlar.map((f) => f.cihazId),
      )
    ) {
      return {
        hata: "Satıştaki cihazlar değişmiş. Sayfayı yenileyip tekrar deneyin.",
      };
    }
    const yeniFiyat = new Map(veri.fiyatlar.map((f) => [f.cihazId, f.kurus]));
    const etiket = (k: { marka: string; model: string; seriNo: string | null; barkod: string | null }) =>
      `${k.marka} ${k.model} (${k.seriNo ?? k.barkod ?? "kodsuz"})`;
    for (const k of satis.kalemler) {
      const sorun = satisFiyatiSorunu(yeniFiyat.get(k.id), `${k.marka} ${k.model}`);
      if (sorun) return { hata: sorun };
    }

    const tarih = yeniSatisTarihi(satis.satisTarihi, veri.satisTarihi);
    if (!tarih.tamam) return { hata: tarih.hata };

    const [musteri, satan] = await Promise.all([
      prisma.musteri.findUnique({
        where: { id: veri.musteriId },
        select: { id: true, adSoyad: true, telefon: true },
      }),
      prisma.kullanici.findUnique({
        where: { id: veri.satanKullaniciId },
        select: { id: true, adSoyad: true, aktif: true },
      }),
    ]);
    if (!musteri) return { hata: "Müşteri bulunamadı." };
    if (!satan) return { hata: "Satışı yapan kişi bulunamadı." };
    // Pasif kullanıcı yalnız zaten satışın sahibiyse kalabilir: eski bir
    // satışı düzeltirken, işten ayrılmış satıcıyı değiştirmeye zorlamak
    // kaydı yanlışlar. Yeni atama ise aktif birine yapılmalı.
    if (!satan.aktif && satan.id !== satis.satanKullaniciId) {
      return { hata: "Satışı yapan kişi pasif; aktif bir kullanıcı seçin." };
    }

    const eski: SatisDurumu = {
      musteriId: satis.musteriId,
      musteriAdi: satis.musteri.adSoyad,
      satanKullaniciId: satis.satanKullaniciId,
      satanAdi: satis.satanKullanici.adSoyad,
      odemeTipi: satis.odemeTipi,
      satisTarihi: satis.satisTarihi,
      not: satis.not,
      kalemler: satis.kalemler.map((k) => ({
        id: k.id,
        etiket: etiket(k),
        satisFiyatiKurus: k.satisFiyatiKurus ?? 0,
      })),
    };
    const yeni: SatisDurumu = {
      musteriId: musteri.id,
      musteriAdi: musteri.adSoyad,
      satanKullaniciId: satan.id,
      satanAdi: satan.adSoyad,
      odemeTipi: veri.odemeTipi,
      satisTarihi: tarih.tarih,
      not: veri.not && veri.not !== "" ? veri.not : null,
      kalemler: eski.kalemler.map((k) => ({
        ...k,
        satisFiyatiKurus: yeniFiyat.get(k.id)!,
      })),
    };

    const fark = satisFarki(eski, yeni);
    if (!farkVarMi(fark)) return { hata: "Değişiklik yapılmadı." };

    await prisma.$transaction(async (tx) => {
      await tx.satis.update({
        where: { id: satis.id },
        data: {
          musteriId: yeni.musteriId,
          satanKullaniciId: yeni.satanKullaniciId,
          odemeTipi: yeni.odemeTipi,
          satisTarihi: yeni.satisTarihi,
          not: yeni.not,
        },
      });

      for (const k of satis.kalemler) {
        const fiyatDegisti = fark.fiyatlar.has(k.id);
        if (fark.kimlikDegisti || fiyatDegisti) {
          await tx.stokKalemi.update({
            where: { id: k.id },
            data: {
              satisFiyatiKurus: yeniFiyat.get(k.id)!,
              ...(fark.kimlikDegisti
                ? {
                    musteriId: yeni.musteriId,
                    satanKullaniciId: yeni.satanKullaniciId,
                    odemeTipi: yeni.odemeTipi,
                    satisTarihi: yeni.satisTarihi,
                    cikisTarihi: yeni.satisTarihi,
                    // Müşteri adı ve telefonu arama metninde; müşteri
                    // değiştiyse cihaz yeni müşteriyle bulunabilmeli.
                    aramaMetni: aramaMetniUret([
                      k.marka,
                      k.model,
                      k.renk,
                      k.kapasite,
                      k.seriNo,
                      k.barkod,
                      k.tedarikci?.ad,
                      k.not,
                      musteri.adSoyad,
                      musteri.telefon,
                    ]),
                  }
                : {}),
            },
          });
        }

        const metin = kalemTarihceMetni(k.id, satis.satisNo, fark, veri.aciklama);
        if (metin) {
          await tx.stokHareketi.create({
            data: {
              stokKalemiId: k.id,
              tip: HAREKET_TIP.DUZELTME,
              kaynakMagazaId: k.magazaId,
              kullaniciId: oturum.kullaniciId,
              aciklama: metin,
            },
          });
        }
      }
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.SATIS_DUZENLE,
      hedefTip: "Satis",
      hedefId: satis.id,
      detay: satisLogDetayi(satis.satisNo, eski, fark, veri.aciklama),
    });

    revalidatePath(`/satislar/${satis.id}`);
    for (const k of satis.kalemler) revalidatePath(`/cihazlar/${k.id}`);
    revalidatePath("/cihazlar");
    revalidatePath("/panel");
    revalidatePath("/satis");
    revalidatePath("/rapor");
    revalidatePath("/musteriler");
    revalidatePath(`/musteriler/${eski.musteriId}`);
    revalidatePath(`/musteriler/${yeni.musteriId}`);

    const adet = fark.genel.length + fark.fiyatlar.size;
    return { basari: `Satış güncellendi (${adet} değişiklik); işlem kaydına yazıldı.` };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Satış kartı düzenlenemedi:", hata);
    return { hata: "Satış düzenlenemedi. Lütfen tekrar deneyin." };
  }
}
