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
import { kurusuTLYaz, tlyiKurusaCevir } from "./para";

export type SepetCihazi = {
  id: number;
  marka: string;
  model: string;
  seriNo: string | null;
  barkod: string | null;
  magazaId: number;
  magazaAdi: string;
  alisFiyatiKurus: number;
  /**
   * Kullanıcının yazdığı satış fiyatı; kuruşa çevrilmemiş ham metin.
   *
   * Sepete eklenirken alış fiyatıyla dolu geliyor ve boş bırakılırsa yine alış
   * fiyatı kabul ediliyor — bkz. `etkinSatisKurusu`.
   */
  satisFiyati: string;
};

/**
 * Cihazın geçerli satış fiyatı (kuruş). Metin okunamıyorsa null.
 *
 * Boş alan hata değil, "alış fiyatına sat" demek: zararına satmamak için
 * taban zaten alış fiyatı ve çoğu satışta fiyat değiştirilmiyor. Satış fiyatı
 * girmek kaydetmenin önkoşulu olmasın diye böyle; yalnız anlamsız bir metin
 * (örn. "abc") yazıldığında kaydetme duruyor, çünkü o kullanıcının yazım
 * hatasıdır ve sessizce alış fiyatına düşmek yanlış olurdu.
 */
export function etkinSatisKurusu(cihaz: {
  satisFiyati: string;
  alisFiyatiKurus: number;
}): number | null {
  if (cihaz.satisFiyati.trim() === "") return cihaz.alisFiyatiKurus;
  return tlyiKurusaCevir(cihaz.satisFiyati);
}

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
  // Satış fiyatı alış fiyatıyla dolu geliyor: 10 cihazlık bir satışta her
  // kutuyu elle doldurmak yavaş ve hataya açıktı. Değiştirmek isteyen üzerine
  // yazıyor.
  return {
    sepet: [...sepet, { ...cihaz, satisFiyati: kurusuTLYaz(cihaz.alisFiyatiKurus) }],
  };
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
  const satis = etkinSatisKurusu(cihaz);
  if (satis === null) return null;
  return satis - cihaz.alisFiyatiKurus;
}

export type SepetOzeti = {
  adet: number;
  satisKurus: number;
  alisKurus: number;
  karKurus: number;
  /** Satış fiyatı okunamayan cihaz sayısı (boş alan buna girmez). */
  fiyatiEksik: number;
};

export function sepetOzeti(sepet: SepetCihazi[]): SepetOzeti {
  let satisKurus = 0;
  let alisKurus = 0;
  let fiyatiEksik = 0;

  for (const cihaz of sepet) {
    alisKurus += cihaz.alisFiyatiKurus;
    const satis = etkinSatisKurusu(cihaz);
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
    const satis = etkinSatisKurusu(cihaz);
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

  // Boş alan sorun değil (alış fiyatına satılır); yalnız okunamayan metin.
  const okunmayanlar = sepet.filter((c) => etkinSatisKurusu(c) === null);
  for (const cihaz of okunmayanlar) {
    sorunlar.push(`${cihazAdi(cihaz)} için satış fiyatı okunamadı.`);
  }

  const negatifler = sepet.filter((c) => {
    const satis = etkinSatisKurusu(c);
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
