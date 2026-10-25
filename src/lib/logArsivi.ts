/**
 * İşlem loglarının arşivlenmesi.
 *
 * Log tablosu hiç küçülmüyordu: kayıt silinmemesi bilinçli bir karar ve
 * doğru — "kim ne zaman ne yaptı" denetimin temeli. Ama sınırsız büyüme de
 * bir maliyet.
 *
 * ÖLÇÜLDÜ, çünkü asıl korku ekranın yavaşlamasıydı ve bu doğru çıkmadı:
 *   500.000 kayıt → log ekranı 139–262 ms (panel 88 ms)
 *   3.000.000 kayıt → 221–463 ms
 * Yani ekran yıllarca yavaşlamıyor. Gerçek maliyet veritabanı dosyası:
 * satır başına ~205 bayt, 3 milyon kayıt 555 MB. Veritabanı her gün
 * yedeklendiği için bu boyut doğrudan yedek süresine ve Drive alanına
 * yazılıyor.
 *
 * Bu yüzden arşivleme iki adımlı ve bilinçli: önce eski kayıtlar CSV olarak
 * indiriliyor, sonra indirilen aralık silinebiliyor. Silme işleminin kendisi
 * de loga yazılıyor, yani "kayıtlar sessizce kaybolmuyor" kuralı duruyor.
 */

/** Arşiv sınırı en az bir yıl geride olmalı: taze kayıtlar denetim için gerekli. */
export const EN_AZ_YIL = 1;

/** Ekranda sunulan "şu kadar yıldan eski" seçenekleri. */
export const ARSIV_YIL_SECENEKLERI = [1, 2, 3, 5] as const;

/** Ölçülen ortalama satır boyutu (indeksler dahil). */
export const SATIR_BAYT_TAHMINI = 205;

/** Ayar tablosunda son arşivin tutulduğu anahtar. */
export const ARSIV_ANAHTARI = "log_arsiv_son";

export type ArsivKaydi = {
  /** Arşivin kapsadığı sınır: bu andan ÖNCEKİ kayıtlar indirildi. */
  sinirISO: string;
  adet: number;
  /** İndirme anı. */
  tarihISO: string;
};

/** Verilen yıl kadar geriye giden sınır; o günün başlangıcına sabitlenir. */
export function arsivSiniri(yil: number, bugun: Date = new Date()): Date {
  const sinir = new Date(bugun);
  sinir.setFullYear(sinir.getFullYear() - Math.max(EN_AZ_YIL, Math.trunc(yil)));
  sinir.setHours(0, 0, 0, 0);
  return sinir;
}

/** Yıl seçimi geçerli mi? */
export function yilSorunu(yil: unknown): string | null {
  const sayi = Number(yil);
  if (!Number.isInteger(sayi) || sayi < EN_AZ_YIL) {
    return `Arşiv sınırı en az ${EN_AZ_YIL} yıl geride olmalı.`;
  }
  if (sayi > 50) return "Arşiv sınırı en çok 50 yıl olabilir.";
  return null;
}

/** stok-log-arsivi-20251024-oncesi.csv */
export function arsivDosyaAdi(sinir: Date): string {
  const iki = (n: number) => String(n).padStart(2, "0");
  const damga = `${sinir.getFullYear()}${iki(sinir.getMonth() + 1)}${iki(sinir.getDate())}`;
  return `stok-log-arsivi-${damga}-oncesi.csv`;
}

/**
 * CSV satırı üretir.
 *
 * Ayraç noktalı virgül: Türkçe Windows'ta Excel virgülü ondalık ayıracı
 * sayıyor ve virgüllü dosyayı tek sütuna yapıştırıyor. Tırnak içindeki
 * tırnak ikileniyor, satır sonu ve ayraç içeren alanlar tırnaklanıyor.
 */
export function csvSatiri(
  alanlar: (string | number | null | undefined)[],
): string {
  return alanlar
    .map((alan) => {
      if (alan === null || alan === undefined) return "";
      const metin = String(alan);
      if (/[";\n\r]/.test(metin)) return `"${metin.replace(/"/g, '""')}"`;
      return metin;
    })
    .join(";");
}

/** CSV başlık satırı — arşiv dosyası kendi kendini açıklasın. */
export const CSV_BASLIKLARI = [
  "Kayıt No",
  "Tarih",
  "Kullanıcı",
  "İşlem",
  "Hedef Tip",
  "Hedef No",
  "Detay",
  "IP",
];

/**
 * Silme izni: yalnız indirilmiş bir arşivin kapsadığı aralık silinebilir.
 *
 * Önce indirip sonra silmek, "bir daha asla erişilemez" riskini kaldırıyor.
 * Arşiv kaydı yoksa ya da başka bir sınırı kapsıyorsa silme reddediliyor.
 */
export function silmeEngeli(
  arsiv: ArsivKaydi | null,
  sinir: Date,
): string | null {
  if (!arsiv) {
    return "Önce bu aralığı arşiv dosyası olarak indirin; indirilmemiş kayıt silinmez.";
  }
  if (arsiv.sinirISO !== sinir.toISOString()) {
    return "İndirilen arşiv başka bir tarihi kapsıyor. Silmeden önce bu aralığı yeniden indirin.";
  }
  if (arsiv.adet === 0) return "Arşivlenecek kayıt yok.";
  return null;
}

/** "12.431 kayıt · yaklaşık 2,4 MB" */
export function arsivOzeti(adet: number): string {
  const bayt = adet * SATIR_BAYT_TAHMINI;
  const mb = bayt / 1_048_576;
  const boyut =
    mb >= 1
      ? `${mb.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`
      : `${Math.max(1, Math.round(bayt / 1024))} KB`;
  return `${adet.toLocaleString("tr-TR")} kayıt · yaklaşık ${boyut}`;
}
