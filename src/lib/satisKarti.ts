/**
 * Satış kartı ile cihaz kaydının tutarlılığı.
 *
 * Bir satışta satılan cihazlar ortak bir `Satis` kaydına bağlı; müşteri,
 * satışı yapan, ödeme tipi ve tarih orada duruyor. Cihazın kendi satırında da
 * aynı alanlar var (eski kayıtlar ve raporlar oradan okuyor). Yönetici tek bir
 * cihazın satışını düzelttiğinde bu ikisi birbirinden ayrılabiliyor: üç
 * cihazlık bir satışta sadece birinin müşterisi değiştiğinde kart artık doğru
 * değil.
 *
 * Karar burada, veritabanına dokunmadan veriliyor ki sınanabilsin.
 */

/** Satışı tanımlayan dört alan; cihazda da, satış kaydında da bunlar var. */
export type SatisKimligi = {
  musteriId: number | null;
  satanKullaniciId: number | null;
  odemeTipi: string | null;
  /** Gün hassasiyetinde; aynı günün iki satışı tarihe göre ayrılamıyor. */
  satisTarihi: Date | null;
};

export type SatisBagiKarari =
  /** Kayıt cihazla uyuyor ya da cihaz bir satış kartına bağlı değil. */
  | { tip: "kalsin" }
  /** Satışta tek cihaz var; kaydı cihazın yeni bilgilerine uydur. */
  | { tip: "kaydiGuncelle" }
  /** Çok cihazlı satıştan kopar: kalanların kartı bozulmasın. */
  | { tip: "ayir" };

function ayniZaman(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

/** İki kayıt aynı satışı mı anlatıyor? */
export function ayniSatisMi(a: SatisKimligi, b: SatisKimligi): boolean {
  return (
    a.musteriId === b.musteriId &&
    a.satanKullaniciId === b.satanKullaniciId &&
    a.odemeTipi === b.odemeTipi &&
    ayniZaman(a.satisTarihi, b.satisTarihi)
  );
}

/**
 * Cihazın satışı düzeltildikten sonra satış kartına ne yapılacağı.
 *
 * @param satis Cihazın bağlı olduğu satış kaydı; bağlı değilse null.
 * @param yeni  Cihazın düzeltme sonrası satış bilgileri.
 */
export function satisBagiKarari(
  satis: (SatisKimligi & { kalemSayisi: number }) | null,
  yeni: SatisKimligi,
): SatisBagiKarari {
  // Mağaza içi aktarım satışlarının ve göç öncesi kayıtların kartı yok;
  // düzeltme yüzünden kart uydurmuyoruz.
  if (satis === null) return { tip: "kalsin" };
  if (ayniSatisMi(satis, yeni)) return { tip: "kalsin" };
  // Müşterisiz satışın kartı olamaz (kartın müşterisi zorunlu); cihaz kopar.
  if (yeni.musteriId === null) return { tip: "ayir" };
  if (yeni.satanKullaniciId === null || yeni.satisTarihi === null) {
    return { tip: "ayir" };
  }
  // Kartta başka cihaz yoksa kartı cihaza uydurmak en az sürprizli yol:
  // satış numarası ve tarihçe korunuyor.
  if (satis.kalemSayisi <= 1) return { tip: "kaydiGuncelle" };
  return { tip: "ayir" };
}
