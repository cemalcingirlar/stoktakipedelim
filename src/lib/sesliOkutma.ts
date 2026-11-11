/**
 * Okutmanın sesli karşılığı.
 *
 * Sayımda raftaki cihaz okutulurken göz ekranda değil raftadır; sonucu
 * duymak, her okutmadan sonra ekrana bakmaktan hızlı. İki ses yetiyor:
 * sayıldıysa "okudu", sayılmadıysa "hata var".
 *
 * "Zaten sayıldı" ve "başka mağazada / satılmış" de hata tarafında: ikisi de
 * cihazın beklendiği gibi sayılmadığı anlamına geliyor ve operatörün dönüp
 * bakması gerekiyor. Üç ayrı ses ayırt edilemezdi.
 */

export const SES_OKUDU = "okudu";
export const SES_HATA = "hata var";

export type OkutmaTuru = "basari" | "uyari" | "hata";

/** Okutma sonucunun seslendirilecek metni; ses yoksa null. */
export function okutmaSesi(tur: OkutmaTuru | null | undefined): string | null {
  if (!tur) return null;
  return tur === "basari" ? SES_OKUDU : SES_HATA;
}

/** Tarayıcıda ses tercihinin saklandığı anahtar. */
export const SES_TERCIHI_ANAHTARI = "stok_okutma_sesi";

/**
 * Saklanan tercihten ses açık mı?
 *
 * Öntanımlı AÇIK: özellik duyulsun diye isteniyor. Kapatma tercihi
 * saklanıyor, çünkü kalabalık mağazada ses istenmeyebilir.
 */
export function sesAcikMi(saklanan: string | null | undefined): boolean {
  return saklanan !== "kapali";
}

/** Tercihin saklanacak hâli. */
export function sesTercihiYaz(acik: boolean): string {
  return acik ? "acik" : "kapali";
}
