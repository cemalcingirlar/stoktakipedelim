"use server";

import { revalidatePath } from "next/cache";
import {
  degisiklikOzeti,
  duzenlemeSorunu,
  sonucMesaji,
  type DuzenlemeKapsami,
  type KunyeDegisikligi,
} from "@/lib/cihazDuzenleme";
import { logYaz } from "@/lib/log";
import { aramaMetniUret } from "@/lib/metin";
import { prisma } from "@/lib/prisma";
import { HAREKET_TIP, LOG_ISLEM } from "@/lib/sabitler";
import {
  SUTUN_ANAHTARLARI,
  sutunlariSirala,
  type SutunAnahtari,
} from "@/lib/sutunlar";
import { YetkiHatasi, adminZorunlu, oturumZorunlu } from "@/lib/yetki";

export type SutunDurumu = { hata?: string };

/**
 * Cihaz listesinde görünecek sütunları kullanıcıya özel kaydeder.
 * Seçim kullanıcı kaydında JSON olarak durur, oturumlar arası korunur.
 */
export async function sutunTercihiKaydet(
  _onceki: SutunDurumu,
  form: FormData,
): Promise<SutunDurumu> {
  try {
    const oturum = await oturumZorunlu();

    const secilenler = form
      .getAll("sutun")
      .map(String)
      .filter((a): a is SutunAnahtari =>
        SUTUN_ANAHTARLARI.includes(a as SutunAnahtari),
      );

    if (secilenler.length === 0) {
      return { hata: "En az bir sütun seçili kalmalı." };
    }

    await prisma.kullanici.update({
      where: { id: oturum.kullaniciId },
      data: { sutunTercihi: JSON.stringify(sutunlariSirala(secilenler)) },
    });

    revalidatePath("/cihazlar");
    return {};
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Sütun tercihi kaydedilemedi:", hata);
    return { hata: "Sütun tercihi kaydedilemedi." };
  }
}

/** Sütun seçimini varsayılana döndürür. */
export async function sutunTercihiSifirla(): Promise<void> {
  const oturum = await oturumZorunlu();
  await prisma.kullanici.update({
    where: { id: oturum.kullaniciId },
    data: { sutunTercihi: null },
  });
  revalidatePath("/cihazlar");
}

// ------------------------------------------------- Künye (marka / kategori)

export type KunyeDuzenlemeSonucu =
  | { durum: "TAMAM"; mesaj: string; etkilenen: number }
  | { durum: "HATA"; mesaj: string };

/**
 * Cihazın marka, model ve kategorisini listeden düzeltir.
 *
 * Aynı ürün çoğu zaman çok sayıda cihaz olarak duruyor (20 adet aynı kablo,
 * her biri ayrı satır). Kapsam "BARKOD" ise aynı barkodu taşıyan bütün
 * cihazlar birlikte düzeltiliyor; tek tek uğraşmak hem uzun sürüyor hem
 * yarısı unutuluyordu.
 *
 * Yalnız yöneticide: kategori seri no zorunluluğunu belirliyor ve bütün
 * raporların kırılımı buradan geliyor, mağaza bazlı bir karar değil.
 *
 * Satılmış cihazlar da kapsama giriyor — bu bir düzeltme, geçmişi de
 * ilgilendiriyor. Kapsam barkod olduğunda kaç cihazın etkileneceği kullanıcıya
 * önceden söyleniyor.
 */
export async function cihazKunyesiniDuzenle(girdi: {
  cihazId: number;
  kapsam: DuzenlemeKapsami;
  degisiklik: KunyeDegisikligi;
}): Promise<KunyeDuzenlemeSonucu> {
  try {
    const oturum = await adminZorunlu();

    const sorun = duzenlemeSorunu(girdi.degisiklik);
    if (sorun) return { durum: "HATA", mesaj: sorun };

    const cihaz = await prisma.stokKalemi.findUnique({
      where: { id: girdi.cihazId },
      include: {
        kategori: { select: { ad: true } },
        altKategori: { select: { ad: true } },
        tedarikci: { select: { ad: true } },
        musteri: { select: { adSoyad: true, telefon: true } },
      },
    });
    if (!cihaz) return { durum: "HATA", mesaj: "Cihaz bulunamadı." };

    // Kategori ve alt kategori gerçekten var mı, alt kategori o kategoriye mi
    // ait? Ekranda eşleşmiş geliyor ama istek elle de kurulabilir.
    const kategoriId = girdi.degisiklik.kategoriId ?? cihaz.kategoriId;
    const kategori = await prisma.kategori.findUnique({
      where: { id: kategoriId },
      select: { id: true, ad: true },
    });
    if (!kategori) return { durum: "HATA", mesaj: "Kategori bulunamadı." };

    let altKategoriId: number | null =
      girdi.degisiklik.altKategoriId !== undefined
        ? girdi.degisiklik.altKategoriId
        : cihaz.altKategoriId;
    let altKategoriAdi: string | null = null;

    if (altKategoriId !== null) {
      const alt = await prisma.altKategori.findUnique({
        where: { id: altKategoriId },
        select: { id: true, ad: true, kategoriId: true },
      });
      if (!alt) return { durum: "HATA", mesaj: "Alt kategori bulunamadı." };
      // Kategori değişip alt kategori eski kategoriye aitse düşürülüyor:
      // yanlış eşleşmiş bir alt kategori bırakmaktansa boş bırakmak doğru.
      if (alt.kategoriId !== kategori.id) {
        altKategoriId = null;
      } else {
        altKategoriAdi = alt.ad;
      }
    }

    const marka = girdi.degisiklik.marka?.trim() ?? cihaz.marka;
    const model = girdi.degisiklik.model?.trim() ?? cihaz.model;

    const ozet = degisiklikOzeti(
      {
        marka: cihaz.marka,
        model: cihaz.model,
        kategoriAdi: cihaz.kategori.ad,
        altKategoriAdi: cihaz.altKategori?.ad ?? null,
      },
      { marka, model, kategoriAdi: kategori.ad, altKategoriAdi },
    );
    if (!ozet) {
      return { durum: "TAMAM", mesaj: "Değişiklik yok.", etkilenen: 0 };
    }

    // Kapsam barkod ise aynı barkodu taşıyan bütün cihazlar; barkod yoksa
    // kapsam zorunlu olarak tek cihaz.
    const hedefler =
      girdi.kapsam === "BARKOD" && cihaz.barkod
        ? await prisma.stokKalemi.findMany({
            where: { barkod: cihaz.barkod },
            include: {
              tedarikci: { select: { ad: true } },
              musteri: { select: { adSoyad: true, telefon: true } },
            },
          })
        : [{ ...cihaz }];

    await prisma.$transaction(async (tx) => {
      for (const hedef of hedefler) {
        await tx.stokKalemi.update({
          where: { id: hedef.id },
          data: {
            marka,
            model,
            kategoriId: kategori.id,
            altKategoriId,
            // Arama metni marka ve modeli taşıyor; güncellenmezse cihaz eski
            // adıyla aranmaya devam eder.
            aramaMetni: aramaMetniUret([
              marka,
              model,
              hedef.renk,
              hedef.kapasite,
              hedef.seriNo,
              hedef.barkod,
              hedef.tedarikci?.ad,
              hedef.not,
              hedef.musteri?.adSoyad,
              hedef.musteri?.telefon,
            ]),
          },
        });

        await tx.stokHareketi.create({
          data: {
            stokKalemiId: hedef.id,
            tip: HAREKET_TIP.DUZELTME,
            kaynakMagazaId: hedef.magazaId,
            kullaniciId: oturum.kullaniciId,
            aciklama: ozet,
          },
        });
      }
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.STOK_DUZENLE,
      hedefTip: "StokKalemi",
      hedefId: cihaz.id,
      detay:
        `${hedefler.length} cihaz · ${ozet}` +
        (girdi.kapsam === "BARKOD" && cihaz.barkod
          ? ` · barkod ${cihaz.barkod}`
          : ""),
    });

    revalidatePath("/cihazlar");
    revalidatePath("/panel");
    revalidatePath("/rapor");

    return {
      durum: "TAMAM",
      mesaj: sonucMesaji(girdi.kapsam, hedefler.length),
      etkilenen: hedefler.length,
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi)
      return { durum: "HATA", mesaj: hata.message };
    console.error("Cihaz künyesi düzeltilemedi:", hata);
    return { durum: "HATA", mesaj: "Düzeltme kaydedilemedi. Tekrar deneyin." };
  }
}
