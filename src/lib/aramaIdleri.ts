/**
 * Cihaz listesinde az eşleşen aramayı hızlandıran ön adım.
 *
 * Liste tarih sırasıyla geliyor. Arama metin koşuluyla yapıldığında
 * veritabanı o sırayla yürüyüp her satırı tek tek sınıyor ve 50 eşleşme
 * bulana kadar durmuyor; tek eşleşmesi olan bir aramada bu bütün tablo demek
 * (ölçüldü: 90 bin cihazda 81 ms). Eşleşenlerin kimlikleri önce yalnız arama
 * dizininden bulunuyor (7 ms), liste sorgusu onlarla sınırlanıyor.
 *
 * Bu dosya saf: sorgu sayfada, kural burada.
 */

/**
 * Arama bu kadar ya da daha az cihazla eşleşiyorsa kimlikleri önden bulunur.
 *
 * Sınırın üstünde gerek yok: çok eşleşen aramada sıralı gezinti ilk sayfayı
 * zaten çabuk dolduruyor. Sınır ayrıca kimlik listesini veritabanının tek
 * sorguda kabul ettiği parametre sayısının çok altında tutuyor.
 */
export const ARAMA_ID_SINIRI = 500;

/**
 * Önden bulunan kimlikler kullanılabilir mi?
 *
 * `bulunan` sınırın BİR FAZLASIYLA sorgulanmış listedir: sınırı aşıyorsa
 * liste eksiktir ve kullanılırsa sonuçlar kırpılır — o durumda null.
 */
export function aramaIdleriniSec(bulunan: number[]): number[] | null {
  return bulunan.length > ARAMA_ID_SINIRI ? null : bulunan;
}
