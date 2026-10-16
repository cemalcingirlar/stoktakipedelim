/**
 * Hedef mağazadaki sevkiyatı kimin kabul edebileceği.
 *
 * Bir mağazada "yetkili kullanıcı" iki yoldan oluşuyor:
 *   - ana mağazası orası olanlar (Kullanici.magazaId)
 *   - ek yetkili atananlar (Magaza.ekYetkililer)
 *
 * Yalnız ilkini saymak, Ayarlar → Mağazalar ekranından yetki verilmiş bir
 * mağazayı "kullanıcısı yok" göstermeye yol açıyordu: o ekran ikisini de
 * sayarken sevkiyat ekranı yalnız ana mağazaya bakıyordu, iki ekran birbiriyle
 * çelişiyordu.
 *
 * Yönetici her mağazada işlem yapabildiği için (bkz. magazadaIslemYapabilirMi)
 * aslında kabul edecek biri her zaman var. Yine de mağazanın kendi yetkilisi
 * yoksa bunu söylemek gerekiyor: sevkiyat orada bekler, yöneticiyi aramak
 * gerekir.
 */

export type KabulDurumu =
  /** Mağazanın kendi yetkilisi var; sevkiyat normal akışında kabul edilir. */
  | "YETKILI_VAR"
  /** Mağazanın yetkilisi yok ama yönetici kabul edebilir. */
  | "YALNIZ_YONETICI"
  /** Kimse kabul edemez; sevkiyat açılmamalı. */
  | "KIMSE_YOK";

export function kabulDurumu(
  magazaYetkiliSayisi: number,
  aktifYoneticiSayisi: number,
): KabulDurumu {
  if (magazaYetkiliSayisi > 0) return "YETKILI_VAR";
  if (aktifYoneticiSayisi > 0) return "YALNIZ_YONETICI";
  return "KIMSE_YOK";
}

/** Sevkiyat bu hedefe açılabilir mi? */
export function sevkiyatAcilabilirMi(durum: KabulDurumu): boolean {
  return durum !== "KIMSE_YOK";
}

/** Kullanıcıya gösterilecek uyarı; sorun yoksa null. */
export function kabulUyarisi(durum: KabulDurumu, magazaAdi: string): string | null {
  if (durum === "YETKILI_VAR") return null;
  if (durum === "YALNIZ_YONETICI") {
    return `${magazaAdi} mağazasının kendi yetkilisi yok; sevkiyatı yalnız yönetici kabul edebilir.`;
  }
  return `${magazaAdi} mağazasında kullanıcı yok; sevkiyatı kabul edecek kimse olmaz.`;
}
