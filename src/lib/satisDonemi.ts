/**
 * Panel dökümlerinin ve "stoktan çıkanlar" listesinin dönem seçenekleri.
 *
 * Grafikteki dönemlerden ayrı: orada geriye doğru sabit uzunlukta bir pencere
 * var (son 7 gün gibi), burada içinde bulunulan takvim dilimi soruluyor —
 * "bu hafta ne sattık" sorusunun karşılığı son 7 gün değil, pazartesiden beri.
 *
 * Hazır dönemlerin yanında serbest tarih aralığı da var: "geçen ayın ilk
 * haftası ne satmışız" sorusunun hazır bir düğmesi olamaz.
 */
import { haftaBasi } from "./grafikDonem";
import { gunBasi, tarihYaz } from "./tarih";

export type SatisDonemAnahtari = "gun" | "dun" | "hafta" | "ay" | "aralik";

export type SatisDonemi = {
  anahtar: SatisDonemAnahtari;
  /** Düğme metni. */
  etiket: string;
  /** Kart başlığında kullanılan hali. */
  baslik: string;
};

const TANIMLAR: Record<SatisDonemAnahtari, SatisDonemi> = {
  gun: { anahtar: "gun", etiket: "Bugün", baslik: "bugün" },
  dun: { anahtar: "dun", etiket: "Dün", baslik: "dün" },
  hafta: { anahtar: "hafta", etiket: "Bu Hafta", baslik: "bu hafta" },
  ay: { anahtar: "ay", etiket: "Bu Ay", baslik: "bu ay" },
  aralik: { anahtar: "aralik", etiket: "Tarih Aralığı", baslik: "seçilen aralık" },
};

/** Satış dökümlerinin (mağaza ve personel bazlı) dönemleri. */
export const SATIS_DONEMLERI: SatisDonemi[] = [
  TANIMLAR.gun,
  TANIMLAR.hafta,
  TANIMLAR.ay,
  TANIMLAR.aralik,
];

/** "Stoktan çıkanlar" listesinin dönemleri. */
export const CIKIS_DONEMLERI: SatisDonemi[] = [
  TANIMLAR.gun,
  TANIMLAR.dun,
  TANIMLAR.aralik,
];

export const VARSAYILAN_SATIS_DONEMI: SatisDonemAnahtari = "gun";

function donemiCozListeden(
  liste: SatisDonemi[],
  deger: unknown,
): SatisDonemi {
  const anahtar = typeof deger === "string" ? deger : "";
  return (
    liste.find((d) => d.anahtar === anahtar) ??
    liste.find((d) => d.anahtar === VARSAYILAN_SATIS_DONEMI)!
  );
}

/** URL parametresini döneme çevirir; tanınmayan değer bugüne düşer. */
export function satisDonemiCoz(deger: unknown): SatisDonemi {
  return donemiCozListeden(SATIS_DONEMLERI, deger);
}

/** Aynısı, "stoktan çıkanlar" listesinin seçenekleri için. */
export function cikisDonemiCoz(deger: unknown): SatisDonemi {
  return donemiCozListeden(CIKIS_DONEMLERI, deger);
}

/** Serbest aralıkta kullanıcının girdiği iki tarih; biri ya da ikisi boş olabilir. */
export type OzelAralik = { bas: Date | null; bit: Date | null };

export const BOS_ARALIK: OzelAralik = { bas: null, bit: null };

/**
 * Dönemin tarih aralığı. Başlangıç günün başına çekilir; bitiş gün bazlıdır
 * (sorgu tarafı bitişi gün sonuna tamamlıyor).
 *
 * Serbest aralıkta eksik uçlar diğerinden tamamlanıyor, ikisi de boşsa bugüne
 * düşüyor: yarım doldurulmuş bir form boş liste göstermemeli. Ters girilen
 * aralık (bitiş başlangıçtan önce) sessizce düzeltiliyor — kullanıcı iki
 * kutuyu karıştırdığında "kayıt yok" demek yardımcı olmaz.
 */
export function satisDonemAraligi(
  donem: SatisDonemi,
  bugun: Date = new Date(),
  ozel: OzelAralik = BOS_ARALIK,
): { baslangic: Date; bitis: Date } {
  const gun = gunBasi(bugun);

  if (donem.anahtar === "dun") {
    const dun = new Date(gun);
    dun.setDate(dun.getDate() - 1);
    return { baslangic: dun, bitis: dun };
  }
  if (donem.anahtar === "hafta") return { baslangic: haftaBasi(bugun), bitis: bugun };
  if (donem.anahtar === "ay") {
    return {
      baslangic: new Date(bugun.getFullYear(), bugun.getMonth(), 1),
      bitis: bugun,
    };
  }
  if (donem.anahtar === "aralik") {
    const bas = ozel.bas ?? ozel.bit ?? bugun;
    const bit = ozel.bit ?? ozel.bas ?? bugun;
    const ileri = bas <= bit;
    return {
      baslangic: gunBasi(ileri ? bas : bit),
      bitis: gunBasi(ileri ? bit : bas),
    };
  }
  return { baslangic: gun, bitis: bugun };
}

/** Aralık tek bir güne mi ait? Liste satırlarında tarih yazmak buna bağlı. */
export function tekGunMu(aralik: { baslangic: Date; bitis: Date }): boolean {
  return gunBasi(aralik.baslangic).getTime() === gunBasi(aralik.bitis).getTime();
}

/**
 * Kart başlığında görünen dönem adı. Serbest aralıkta hazır bir ad yok;
 * tarihlerin kendisi yazılıyor ki kullanıcı neye baktığını görsün.
 */
export function donemBasligi(
  donem: SatisDonemi,
  aralik: { baslangic: Date; bitis: Date },
): string {
  if (donem.anahtar !== "aralik") return donem.baslik;
  if (tekGunMu(aralik)) return tarihYaz(aralik.baslangic);
  return `${tarihYaz(aralik.baslangic)} – ${tarihYaz(aralik.bitis)}`;
}

export type SatisSatiri = {
  adet: number;
  satisKurus: number;
  karKurus: number;
};

/** Dökümün alt toplamı — kartın başlığında gösteriliyor. */
export function satisToplami(satirlar: SatisSatiri[]): SatisSatiri {
  return satirlar.reduce<SatisSatiri>(
    (toplam, s) => ({
      adet: toplam.adet + s.adet,
      satisKurus: toplam.satisKurus + s.satisKurus,
      karKurus: toplam.karKurus + s.karKurus,
    }),
    { adet: 0, satisKurus: 0, karKurus: 0 },
  );
}
