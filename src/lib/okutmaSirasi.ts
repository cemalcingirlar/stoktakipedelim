/**
 * Aynı kodu taşıyan kalemler arasından hangisinin okutulacağı.
 *
 * Seri numarası olmayan ürünlerde (aksesuar, kablo, şarj aleti) tek barkod
 * onlarca cihaza denk geliyor; bu ürünler adetle sayılıyor. Kabul ve sayım
 * okutmaları eşleşen İLK kalemi alıyordu: aynı barkodtan ikinci adedi
 * okuttuğunuzda, ilk kalem zaten işaretli olduğu için "zaten okutuldu" deyip
 * duruyordu. Kalan 19 adet bekliyor olsa bile okutmaya izin vermiyordu —
 * 40 kalemlik bir sevkiyat elle kabul edilemez hale geliyordu.
 *
 * Kural: bekleyen varsa ona yazılır, bekleyen kalmadıysa "hepsi okutuldu"
 * denir. Aynı mantık `cihazSecimi.ts`'te satış ve sevk oluşturma için
 * çözülmüştü; kabul ile sayım o düzeltmeden pay almamıştı.
 */

export type KalemDurumu =
  /** Henüz okutulmadı; sıradaki okutma buna yazılır. */
  | "BEKLIYOR"
  /** Bu okutmada zaten işaretlendi. */
  | "OKUTULDU"
  /** Okutmaya kapalı (reddedilmiş gibi); sayıma katılmaz. */
  | "DISI";

export type OkutmaSecimi<T> =
  /** `kalem` işaretlenecek; `sira`/`toplam` ilerleme göstergesi. */
  | { durum: "OKUT"; kalem: T; sira: number; toplam: number }
  /** Bu kodun tüm adetleri okutulmuş. */
  | { durum: "HEPSI_OKUTULDU"; toplam: number }
  /** Eşleşen kalem var ama hepsi okutmaya kapalı. */
  | { durum: "DISI" }
  /** Bu kodla eşleşen kalem yok. */
  | { durum: "YOK" };

/**
 * Sıradaki okutulacak kalemi seçer.
 *
 * `kalemler` çağıran tarafından sıralı verilmeli (genelde id artan): hangi
 * adedin önce okutulduğu kullanıcı için fark etmez ama sıranın kararlı
 * olması tekrarlanabilirlik sağlıyor.
 */
export function siradakiOkutma<T>(
  kalemler: readonly T[],
  durumu: (kalem: T) => KalemDurumu,
): OkutmaSecimi<T> {
  if (kalemler.length === 0) return { durum: "YOK" };

  const durumlar = kalemler.map(durumu);
  const okutulan = durumlar.filter((d) => d === "OKUTULDU").length;
  const bekleyen = durumlar.filter((d) => d === "BEKLIYOR").length;

  // Reddedilmiş adetler toplamın dışında: "3/20" derken kullanıcının
  // elindeki paketteki adedi kastediyoruz, sevkiyattan düşülmüş olanı değil.
  const toplam = okutulan + bekleyen;

  const sirasi = durumlar.indexOf("BEKLIYOR");
  if (sirasi !== -1) {
    return { durum: "OKUT", kalem: kalemler[sirasi], sira: okutulan + 1, toplam };
  }
  if (okutulan > 0) return { durum: "HEPSI_OKUTULDU", toplam: okutulan };
  return { durum: "DISI" };
}

/**
 * Mesajlara eklenecek ilerleme notu: " (3/20)".
 *
 * Tek adetlik ürünlerde (seri numaralı telefon) boş dönüyor; "(1/1)" yazmak
 * ekranı kalabalıklaştırmaktan başka bir şey yapmaz.
 */
export function ilerlemeNotu(sira: number, toplam: number): string {
  return toplam > 1 ? ` (${sira}/${toplam})` : "";
}

/**
 * "bu koddaki 20 adedin hepsi okutuldu" / tek adette sade mesaj.
 *
 * `fiil` ekrana göre değişiyor: kabulde "okutuldu", sayımda "sayıldı".
 */
export function hepsiOkutulduNotu(toplam: number, fiil = "okutuldu"): string {
  return toplam > 1 ? `bu koddaki ${toplam} adedin hepsi ${fiil}` : `zaten ${fiil}`;
}
