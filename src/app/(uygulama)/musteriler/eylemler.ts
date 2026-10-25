"use server";

import { revalidatePath } from "next/cache";
import { logYaz } from "@/lib/log";
import { aramaMetniUret } from "@/lib/metin";
import {
  ANONIM_AD,
  aciklamayiAnonimlestir,
  anonimAlanlar,
  musteriAlanlariniCoz,
  musteriSilmeKarari,
} from "@/lib/musteriDuzenleme";
import { prisma } from "@/lib/prisma";
import { LOG_ISLEM } from "@/lib/sabitler";
import { YetkiHatasi, adminZorunlu, oturumZorunlu } from "@/lib/yetki";

export type MusteriDurumu = { hata?: string; basari?: string };

/** Yetki + beklenmeyen hata sarmalayıcısı; ayarlar ekranlarındaki kalıbın aynısı. */
async function calistir(
  isIslem: () => Promise<MusteriDurumu>,
): Promise<MusteriDurumu> {
  try {
    return await isIslem();
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Müşteri işlemi başarısız:", hata);
    return { hata: "İşlem tamamlanamadı. Lütfen tekrar deneyin." };
  }
}

function musteriIdCoz(form: FormData): number | null {
  const ham = Number(form.get("musteriId"));
  return Number.isInteger(ham) && ham > 0 ? ham : null;
}

function tazele() {
  revalidatePath("/musteriler");
  revalidatePath("/satis");
}

/**
 * Müşteri bilgilerini düzeltir.
 *
 * Satışı yapan personel de düzeltebiliyor: kaydı oluşturan o ve yanlış
 * yazılan telefonu fark eden de genelde o oluyor. Yöneticiye bırakmak,
 * yanlış numarayı günlerce yanlış bırakmak demekti.
 */
export async function musteriGuncelle(
  _onceki: MusteriDurumu,
  form: FormData,
): Promise<MusteriDurumu> {
  return calistir(async () => {
    const oturum = await oturumZorunlu();
    const musteriId = musteriIdCoz(form);
    if (!musteriId) return { hata: "Müşteri bulunamadı." };

    const sonuc = musteriAlanlariniCoz({
      adSoyad: form.get("adSoyad"),
      telefon: form.get("telefon"),
      tcknVkn: form.get("tcknVkn"),
      adres: form.get("adres"),
      not: form.get("not"),
    });
    if ("hata" in sonuc) return { hata: sonuc.hata };
    const { alanlar } = sonuc;

    const mevcut = await prisma.musteri.findUnique({
      where: { id: musteriId },
      select: { id: true, adSoyad: true, telefon: true },
    });
    if (!mevcut) return { hata: "Müşteri bulunamadı." };

    // Aynı telefon tek müşteriye bağlı olmalı: satış ekranı numaraya bakıp
    // mevcut kaydı buluyor, iki kayıt olursa hangisinin bulunacağı rastgele.
    if (alanlar.telefon) {
      const cakisan = await prisma.musteri.findFirst({
        where: { telefon: alanlar.telefon, id: { not: musteriId } },
        select: { id: true, adSoyad: true },
      });
      if (cakisan) {
        return {
          hata: `Bu telefon "${cakisan.adSoyad}" müşterisinde kayıtlı. Aynı numara iki müşteriye verilemez.`,
        };
      }
    }

    await prisma.musteri.update({ where: { id: musteriId }, data: alanlar });

    await logYaz(oturum, {
      islem: LOG_ISLEM.MUSTERI_DUZENLE,
      hedefTip: "Musteri",
      hedefId: musteriId,
      detay: `${mevcut.adSoyad} → ${alanlar.adSoyad} · telefon: ${alanlar.telefon ?? "—"}`,
    });
    tazele();
    return { basari: "Müşteri bilgileri güncellendi." };
  });
}

/**
 * Kişisel veriyi müşteri satırından ve ona kopyalandığı her yerden siler.
 *
 * Ad ve telefon iki yere daha yazılıyordu: cihazın arama metnine (müşteri
 * adıyla cihaz bulunabilsin diye) ve satış hareketinin açıklamasına. Yalnız
 * Musteri satırını boşaltmak, adın cihaz aramasında ve tarihçesinde kalması
 * demekti.
 *
 * Tek işlemde yapılıyor: yarıda kalırsa kaydın bir kısmı anonim, bir kısmı
 * açık kalırdı.
 */
async function musteriyiAnonimlestir(musteriId: number, eskiAd: string) {
  await prisma.$transaction(async (tx) => {
    await tx.musteri.update({
      where: { id: musteriId },
      data: anonimAlanlar(),
    });

    // Doğrudan satılan cihazlar ve mağaza içi aktarımda satılanlar.
    const [dogrudan, aktarimlar] = await Promise.all([
      tx.stokKalemi.findMany({
        where: { musteriId },
        select: { id: true },
      }),
      tx.aktarimSatisi.findMany({
        where: { musteriId },
        select: { stokKalemiId: true },
      }),
    ]);
    const cihazIdleri = [
      ...new Set([
        ...dogrudan.map((c) => c.id),
        ...aktarimlar.map((a) => a.stokKalemiId),
      ]),
    ];
    if (cihazIdleri.length === 0) return;

    const cihazlar = await tx.stokKalemi.findMany({
      where: { id: { in: cihazIdleri } },
      select: {
        id: true,
        marka: true,
        model: true,
        renk: true,
        kapasite: true,
        seriNo: true,
        barkod: true,
        not: true,
        tedarikci: { select: { ad: true } },
      },
    });
    for (const c of cihazlar) {
      // Arama metni cihazın kendi bilgilerinden yeniden kuruluyor; müşteri
      // adı ve telefonu artık girmiyor.
      await tx.stokKalemi.update({
        where: { id: c.id },
        data: {
          aramaMetni: aramaMetniUret([
            c.marka,
            c.model,
            c.renk,
            c.kapasite,
            c.seriNo,
            c.barkod,
            c.tedarikci?.ad,
            c.not,
            ANONIM_AD,
          ]),
        },
      });
    }

    const hareketler = await tx.stokHareketi.findMany({
      where: {
        stokKalemiId: { in: cihazIdleri },
        aciklama: { contains: eskiAd },
      },
      select: { id: true, aciklama: true },
    });
    for (const h of hareketler) {
      await tx.stokHareketi.update({
        where: { id: h.id },
        data: { aciklama: aciklamayiAnonimlestir(h.aciklama, eskiAd) },
      });
    }
  });
}

/**
 * Müşteri kaydını siler; satışı varsa yalnız kişisel alanları boşaltır.
 *
 * KVKK'daki silme talebinin karşılığı. Satış kaydını da silmek ticari kaydı
 * bozardı (cihaz kime satıldı, garanti kime verildi) — kuralın ayrıntısı
 * src/lib/musteriDuzenleme.ts başında.
 *
 * Yalnız yönetici: düzeltme günlük iş, silme geri alınamaz.
 */
export async function musteriSil(
  _onceki: MusteriDurumu,
  form: FormData,
): Promise<MusteriDurumu> {
  return calistir(async () => {
    const oturum = await adminZorunlu();
    const musteriId = musteriIdCoz(form);
    if (!musteriId) return { hata: "Müşteri bulunamadı." };

    const musteri = await prisma.musteri.findUnique({
      where: { id: musteriId },
      select: {
        id: true,
        adSoyad: true,
        _count: { select: { satinAlinanlar: true, aktarimSatislari: true } },
      },
    });
    if (!musteri) return { hata: "Müşteri bulunamadı." };

    const satisAdedi =
      musteri._count.satinAlinanlar + musteri._count.aktarimSatislari;
    const karar = musteriSilmeKarari(satisAdedi);

    if (karar === "SIL") {
      await prisma.musteri.delete({ where: { id: musteriId } });
    } else {
      await musteriyiAnonimlestir(musteriId, musteri.adSoyad);
    }

    await logYaz(oturum, {
      islem: LOG_ISLEM.MUSTERI_SIL,
      hedefTip: "Musteri",
      hedefId: musteriId,
      detay:
        karar === "SIL"
          ? `${musteri.adSoyad} kaydı silindi (satışı yok)`
          : `${musteri.adSoyad} anonimleştirildi (${satisAdedi} satış korundu)`,
    });
    tazele();
    return {
      basari:
        karar === "SIL"
          ? "Müşteri kaydı silindi."
          : `Kişisel bilgiler silindi; ${satisAdedi} satış kaydı korundu.`,
    };
  });
}
