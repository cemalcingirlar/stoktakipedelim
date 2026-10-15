/**
 * Satış sepeti: aynı müşteriye birden çok cihaz satma kuralları.
 *
 * Bir müşteri genelde tek ürün almıyor — telefonun yanına kılıf, ekran koruyucu
 * alıyor. Her cihaz ayrı bir stok kaydı olduğu için satış fiyatı ve kârı cihaz
 * başına tutuluyor; müşteri, ödeme tipi ve tarih ise satışın tamamında ortak.
 *
 * Burada veritabanı yok: hesap ve denetim saf, ekran ve sunucu aynı kuralları
 * kullanıyor.
 */
import { tlyiKurusaCevir } from "./para";

export type SepetCihazi = {
  id: number;
  marka: string;
  model: string;
  seriNo: string | null;
  barkod: string | null;
  magazaId: number;
  magazaAdi: string;
  alisFiyatiKurus: number;
  /** Kullanıcının yazdığı satış fiyatı; kuruşa çevrilmemiş ham metin. */
  satisFiyati: string;
};

export type SepetSatiri = {
  cihazId: number;
  satisFiyatiKurus: number;
};

/** Cihazın ekranda görünen kısa adı. */
export function cihazAdi(cihaz: { marka: string; model: string }): string {
  return `${cihaz.marka} ${cihaz.model}`.replace(/\s+/g, " ").trim();
}

/**
 * Sepete cihaz ekler. Aynı cihaz iki kez okutulursa eklenmez: tek fiziksel
 * ürün iki kez satılamaz ve kullanıcı yanlışlıkla iki kez okutmuş olabilir.
 */
export function sepeteEkle(
  sepet: SepetCihazi[],
  cihaz: Omit<SepetCihazi, "satisFiyati">,
): { sepet: SepetCihazi[] } | { hata: string } {
  if (sepet.some((c) => c.id === cihaz.id)) {
    return { hata: `${cihazAdi(cihaz)} zaten listede.` };
  }
  return { sepet: [...sepet, { ...cihaz, satisFiyati: "" }] };
}

export function sepettenCikar(sepet: SepetCihazi[], cihazId: number): SepetCihazi[] {
  return sepet.filter((c) => c.id !== cihazId);
}

export function fiyatiYaz(
  sepet: SepetCihazi[],
  cihazId: number,
  fiyat: string,
): SepetCihazi[] {
  return sepet.map((c) => (c.id === cihazId ? { ...c, satisFiyati: fiyat } : c));
}

/** Bir cihazın kârı; fiyat okunamıyorsa null. */
export function cihazKari(cihaz: SepetCihazi): number | null {
  const satis = tlyiKurusaCevir(cihaz.satisFiyati);
  if (satis === null) return null;
  return satis - cihaz.alisFiyatiKurus;
}

export type SepetOzeti = {
  adet: number;
  satisKurus: number;
  alisKurus: number;
  karKurus: number;
  /** Satış fiyatı girilmemiş ya da okunamayan cihaz sayısı. */
  fiyatiEksik: number;
};

export function sepetOzeti(sepet: SepetCihazi[]): SepetOzeti {
  let satisKurus = 0;
  let alisKurus = 0;
  let fiyatiEksik = 0;

  for (const cihaz of sepet) {
    alisKurus += cihaz.alisFiyatiKurus;
    const satis = tlyiKurusaCevir(cihaz.satisFiyati);
    if (satis === null) fiyatiEksik += 1;
    else satisKurus += satis;
  }

  return {
    adet: sepet.length,
    satisKurus,
    alisKurus,
    karKurus: satisKurus - alisKurus,
    fiyatiEksik,
  };
}

/**
 * Kaydetmeye hazır satırlar. Fiyatı okunamayan cihaz varsa null döner —
 * çağıran taraf kaydetmeyi engeller.
 */
export function sepetSatirlari(sepet: SepetCihazi[]): SepetSatiri[] | null {
  const satirlar: SepetSatiri[] = [];
  for (const cihaz of sepet) {
    const satis = tlyiKurusaCevir(cihaz.satisFiyati);
    if (satis === null || satis < 0) return null;
    satirlar.push({ cihazId: cihaz.id, satisFiyatiKurus: satis });
  }
  return satirlar.length > 0 ? satirlar : null;
}

/** Kaydetmeye engel olan durumlar; boşsa kaydedilebilir. */
export function sepetSorunlari(
  sepet: SepetCihazi[],
  musteriVarMi: boolean,
): string[] {
  const sorunlar: string[] = [];

  if (sepet.length === 0) {
    sorunlar.push("Satılacak cihaz okutun.");
  }

  const eksikler = sepet.filter((c) => tlyiKurusaCevir(c.satisFiyati) === null);
  for (const cihaz of eksikler) {
    sorunlar.push(`${cihazAdi(cihaz)} için satış fiyatı girin.`);
  }

  const negatifler = sepet.filter((c) => {
    const satis = tlyiKurusaCevir(c.satisFiyati);
    return satis !== null && satis < 0;
  });
  for (const cihaz of negatifler) {
    sorunlar.push(`${cihazAdi(cihaz)} için satış fiyatı negatif olamaz.`);
  }

  if (!musteriVarMi) {
    sorunlar.push("Müşteri seçin veya ad soyad girin.");
  }

  return sorunlar;
}
