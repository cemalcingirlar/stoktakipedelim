/**
 * Alış fiyatının sonradan düzeltilmesi.
 *
 * Fatura yanlış girildiğinde ya da tedarikçi fiyat farkı kestiğinde cihazın
 * alış fiyatını düzeltmenin yolu yoktu; tek çare kaydı iptal edip yeniden
 * girmekti. Fiyat stok değerini, kârı ve vade borcunu doğrudan değiştirdiği
 * için düzeltme yalnız yöneticide ve iz bırakıyor: eski fiyat, yeni fiyat ve
 * gerekçe cihazın tarihçesine ve işlem kaydına yazılıyor.
 *
 * Bu dosya saf: kurallar burada, yetki ve veritabanı eylemde.
 */
import { kurusuTLYazSembollu, tlyiKurusaCevir } from "./para";
import { STOK_DURUM } from "./sabitler";

export const DUZELTME_GEREKCE_EN_AZ = 5;
export const DUZELTME_GEREKCE_EN_COK = 300;

/** Tek cihazın fiyatı için makul üst sınır: 10 milyon TL. Bir sıfır fazla
 *  yazılmış fiyatı yakalamak için; gerçek bir cihaz buna yaklaşmıyor. */
export const ALIS_FIYATI_EN_COK_KURUS = 1_000_000_000;

export type FiyatGirdisi =
  | { tamam: true; kurus: number }
  | { tamam: false; hata: string };

/** Kullanıcının yazdığı fiyatı çözer: "1.165,83" -> 116583. */
export function yeniFiyatiCoz(ham: string | null | undefined): FiyatGirdisi {
  const metin = (ham ?? "").trim();
  if (!metin) return { tamam: false, hata: "Yeni alış fiyatını yazın." };
  const kurus = tlyiKurusaCevir(metin);
  if (kurus === null || !Number.isInteger(kurus)) {
    return { tamam: false, hata: "Alış fiyatı okunamadı. Örnek: 1.165,83" };
  }
  if (kurus < 0) return { tamam: false, hata: "Alış fiyatı eksi olamaz." };
  if (kurus > ALIS_FIYATI_EN_COK_KURUS) {
    return {
      tamam: false,
      hata: `Alış fiyatı ${kurusuTLYazSembollu(ALIS_FIYATI_EN_COK_KURUS)} üstünde olamaz; bir sıfır fazla yazılmış olabilir.`,
    };
  }
  return { tamam: true, kurus };
}

/** Gerekçe sorunu; yoksa null. */
export function duzeltmeGerekceSorunu(gerekce: string): string | null {
  const temiz = gerekce.trim();
  if (temiz.length < DUZELTME_GEREKCE_EN_AZ) {
    return `Düzeltme gerekçesi en az ${DUZELTME_GEREKCE_EN_AZ} karakter olmalı.`;
  }
  if (temiz.length > DUZELTME_GEREKCE_EN_COK) {
    return `Düzeltme gerekçesi en çok ${DUZELTME_GEREKCE_EN_COK} karakter olabilir.`;
  }
  return null;
}

/**
 * Bu cihazın fiyatı düzeltilebilir mi? Engel varsa sebebi, yoksa null.
 *
 * İptal edilmiş kayıt hiçbir toplama girmiyor; fiyatını değiştirmek anlamsız
 * ve iptal geri alınırsa yanıltıcı olur — önce iptal geri alınmalı.
 */
export function fiyatDuzeltmeEngeli(cihaz: { durum: string }): string | null {
  if (cihaz.durum === STOK_DURUM.IPTAL) {
    return "İptal edilmiş kaydın fiyatı düzeltilemez. Önce iptali geri alın.";
  }
  return null;
}

/** Fiyat gerçekten değişiyor mu? Aynı fiyat boş bir tarihçe satırı üretirdi. */
export function fiyatDegisiyorMu(eskiKurus: number, yeniKurus: number): boolean {
  return eskiKurus !== yeniKurus;
}

export type KardesKosulu = {
  alisFaturasiId: number;
  alisFiyatiKurus: number;
  durum: { not: string };
  id: { not: number };
} & ({ barkod: string } | { barkod: null; marka: string; model: string });

/**
 * "Aynı faturadaki aynı ürün" koşulu; fatura yoksa null.
 *
 * Bir fatura satırı çoğu zaman birden çok cihaz: 10 adet aynı telefonun
 * fiyatı yanlışsa onunu tek tek düzeltmek yerine hepsi birlikte
 * düzeltilebiliyor. Kapsam bilerek dar:
 *
 *   - aynı alış faturası (başka faturadaki aynı ürünün fiyatı farklı olabilir),
 *   - aynı ürün (barkod; barkod yoksa marka + model),
 *   - ŞU ANKİ fiyatı aynı olanlar — fiyatı zaten farklı olan cihaz ayrıca
 *     düzeltilmiş demektir, üzerine yazılmamalı,
 *   - iptal edilmemiş.
 */
export function kardesKosulu(cihaz: {
  id: number;
  alisFaturasiId: number | null;
  alisFiyatiKurus: number;
  barkod: string | null;
  marka: string;
  model: string;
}): KardesKosulu | null {
  if (cihaz.alisFaturasiId === null) return null;
  const ortak = {
    alisFaturasiId: cihaz.alisFaturasiId,
    alisFiyatiKurus: cihaz.alisFiyatiKurus,
    durum: { not: STOK_DURUM.IPTAL },
    id: { not: cihaz.id },
  };
  return cihaz.barkod
    ? { ...ortak, barkod: cihaz.barkod }
    : { ...ortak, barkod: null, marka: cihaz.marka, model: cihaz.model };
}

/** Tarihçeye yazılan satır. */
export function duzeltmeAciklamasi(
  eskiKurus: number,
  yeniKurus: number,
  gerekce: string,
): string {
  return (
    `Alış fiyatı düzeltildi: ${kurusuTLYazSembollu(eskiKurus)} → ` +
    `${kurusuTLYazSembollu(yeniKurus)} · gerekçe: ${gerekce.trim()}`
  );
}
