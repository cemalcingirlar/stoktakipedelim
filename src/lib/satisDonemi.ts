/**
 * Paneldeki satış dökümlerinin dönem seçenekleri: bugün, bu hafta, bu ay.
 *
 * Grafikteki dönemlerden ayrı: orada geriye doğru sabit uzunlukta bir pencere
 * var (son 7 gün gibi), burada içinde bulunulan takvim dilimi sorulyor —
 * "bu hafta ne sattık" sorusunun karşılığı son 7 gün değil, pazartesiden beri.
 */
import { haftaBasi } from "./grafikDonem";

export type SatisDonemAnahtari = "gun" | "hafta" | "ay";

export type SatisDonemi = {
  anahtar: SatisDonemAnahtari;
  /** Düğme metni. */
  etiket: string;
  /** Kart başlığında kullanılan hali. */
  baslik: string;
};

export const SATIS_DONEMLERI: SatisDonemi[] = [
  { anahtar: "gun", etiket: "Bugün", baslik: "bugün" },
  { anahtar: "hafta", etiket: "Bu Hafta", baslik: "bu hafta" },
  { anahtar: "ay", etiket: "Bu Ay", baslik: "bu ay" },
];

export const VARSAYILAN_SATIS_DONEMI: SatisDonemAnahtari = "gun";

/** URL parametresini döneme çevirir; tanınmayan değer bugüne düşer. */
export function satisDonemiCoz(deger: unknown): SatisDonemi {
  const anahtar = typeof deger === "string" ? deger : "";
  return (
    SATIS_DONEMLERI.find((d) => d.anahtar === anahtar) ??
    SATIS_DONEMLERI.find((d) => d.anahtar === VARSAYILAN_SATIS_DONEMI)!
  );
}

/**
 * Dönemin tarih aralığı. Başlangıç günün başına çekilir; bitiş bugündür
 * (rapor tarafı bitişi gün sonuna tamamlıyor).
 */
export function satisDonemAraligi(
  donem: SatisDonemi,
  bugun: Date = new Date(),
): { baslangic: Date; bitis: Date } {
  const gunBasi = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate());

  if (donem.anahtar === "gun") return { baslangic: gunBasi, bitis: bugun };
  if (donem.anahtar === "hafta") return { baslangic: haftaBasi(bugun), bitis: bugun };
  return { baslangic: new Date(bugun.getFullYear(), bugun.getMonth(), 1), bitis: bugun };
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
