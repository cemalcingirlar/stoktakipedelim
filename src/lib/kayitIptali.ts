/**
 * Yanlış girilmiş kayıtların iptali.
 *
 * Uygulamada hiçbir cihaz silinemiyordu ve fatura iptal edilemiyordu: sehven
 * girilen bir cihaz sonsuza kadar stokta kalıp stok değerini şişiriyor, tek
 * çare eski yedeği geri yüklemek oluyordu — o da aradaki bütün işi siler.
 *
 * Silme yerine iptal: kayıt duruyor, durumu `IPTAL` oluyor. Üç sebeple:
 *   - Stok sayımlarının tamamı zaten `durum = STOKTA` filtreliyor, yani iptal
 *     edilen kayıt toplamlardan kendiliğinden düşüyor.
 *   - Hangi kaydın ne zaman, kim tarafından, hangi gerekçeyle iptal edildiği
 *     görünür kalıyor. Sessizce kaybolan kayıt denetlenemez.
 *   - Yanlışlıkla iptal edilen kayıt geri alınabiliyor.
 */
import { STOK_DURUM } from "./sabitler";

/** Gerekçe bu kadar kısa olamaz; "a" yazıp geçmek iz bırakmaz. */
export const GEREKCE_EN_AZ = 5;
export const GEREKCE_EN_COK = 200;

export type IptalEdilebilir = { durum: string };

/**
 * Cihaz iptal edilebilir mi? Edilemezse kullanıcıya gösterilecek sebep.
 *
 * Satılmış ve sevkiyattaki cihazlar bilerek engelleniyor: ikisinin de karşı
 * tarafta bir kaydı var (müşteri satışı, bekleyen transfer). Önce o işlem
 * geri alınmalı, yoksa iki kayıt birbirini tutmaz.
 */
export function cihazIptalEngeli(cihaz: IptalEdilebilir): string | null {
  if (cihaz.durum === STOK_DURUM.IPTAL) return "Bu cihaz zaten iptal edilmiş.";
  if (cihaz.durum === STOK_DURUM.SATILDI) {
    return "Satılmış cihaz iptal edilemez. Önce satışı geri alın.";
  }
  if (cihaz.durum === STOK_DURUM.TRANSFERDE) {
    return "Sevkiyattaki cihaz iptal edilemez. Önce sevkiyatı tamamlayın ya da geri çekin.";
  }
  return null;
}

/** İptal geri alınabilir mi? */
export function iptalGeriAlmaEngeli(cihaz: IptalEdilebilir): string | null {
  if (cihaz.durum !== STOK_DURUM.IPTAL) return "Bu cihaz iptal edilmiş değil.";
  return null;
}

/** Gerekçe metni geçerli mi? */
export function gerekceSorunu(gerekce: string): string | null {
  const temiz = gerekce.trim();
  if (temiz.length < GEREKCE_EN_AZ) {
    return `Gerekçe en az ${GEREKCE_EN_AZ} karakter olmalı.`;
  }
  if (temiz.length > GEREKCE_EN_COK) {
    return `Gerekçe en çok ${GEREKCE_EN_COK} karakter olabilir.`;
  }
  return null;
}

export type FaturaKalemi = { durum: string };

export type FaturaIptalOzeti = {
  /** İptal edilecek cihaz sayısı. */
  iptalEdilecek: number;
  /** Zaten iptal olanlar; tekrar dokunulmuyor. */
  zatenIptal: number;
  /** İşlemi engelleyen cihazlar (satılmış / sevkiyatta). */
  engelleyen: number;
};

export function faturaIptalOzeti(kalemler: FaturaKalemi[]): FaturaIptalOzeti {
  let iptalEdilecek = 0;
  let zatenIptal = 0;
  let engelleyen = 0;
  for (const k of kalemler) {
    if (k.durum === STOK_DURUM.IPTAL) zatenIptal += 1;
    else if (cihazIptalEngeli(k)) engelleyen += 1;
    else iptalEdilecek += 1;
  }
  return { iptalEdilecek, zatenIptal, engelleyen };
}

/**
 * Fatura iptal edilebilir mi?
 *
 * Tek bir cihazı bile satılmış ya da sevkiyattaysa fatura iptal edilmiyor.
 * Kısmen iptal etmek faturayı gerçeğe uymayan bir hale sokardı: tutarı
 * kalemlerinin toplamını göstermez.
 */
export function faturaIptalEngeli(kalemler: FaturaKalemi[]): string | null {
  if (kalemler.length === 0) return "Faturada cihaz yok.";
  const ozet = faturaIptalOzeti(kalemler);
  if (ozet.engelleyen > 0) {
    return `Faturadaki ${ozet.engelleyen} cihaz satılmış ya da sevkiyatta. Fatura iptal edilemez; önce o işlemleri geri alın.`;
  }
  if (ozet.iptalEdilecek === 0)
    return "Faturanın bütün cihazları zaten iptal edilmiş.";
  return null;
}

/**
 * İptal edilen faturanın yeni numarası.
 *
 * Fatura numarası tedarikçi başına tekil. Yanlış girilen faturayı iptal edip
 * DOĞRUSUNU aynı numarayla girmek en olağan senaryo; iptal edilen kayıt
 * numarayı tutmaya devam etseydi bu mümkün olmazdı. Numara serbest kalsın
 * diye iptal edilene bir ek konuyor, ekranda da "İptal Edildi" rozetiyle
 * birlikte okunuyor.
 */
export function iptalliFaturaNo(faturaNo: string, faturaId: number): string {
  return `${faturaNo} (iptal #${faturaId})`;
}
