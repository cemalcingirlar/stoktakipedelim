import { aramaNormalize } from "./metin";

/**
 * Şifre kuralları.
 *
 * Eski kural tek satırdı: en az 8 karakter. "12345678" geçerliydi, kullanıcı
 * adının kendisi de geçerliydi. Dükkânda şifreler genelde bir kez konup
 * yıllarca kullanıldığı için zayıf şifre kalıcı bir açık demek.
 *
 * Kural seti karmaşıklık dayatmıyor (büyük harf + sembol + rakam zorunluluğu,
 * insanları "Sifre1!" gibi tahmin edilebilir kalıplara itiyor). Bunun yerine
 * NIST'in önerdiği yol izleniyor: daha uzun şifre, bilinen zayıf şifrelerin
 * ve kullanıcı adının reddi.
 *
 * Mevcut şifreler etkilenmiyor: kural yalnız yeni şifre konurken işliyor,
 * kimsenin oturumu kapanmıyor.
 */

export const SIFRE_EN_AZ = 10;
/** Üst sınır yalnız saçma uzunlukları kesmek için; scrypt'in sınırı yok. */
export const SIFRE_EN_COK = 128;

/**
 * Saldırganın ilk denediği şifreler. Uzun bir liste tutmanın anlamı yok;
 * buradakiler 10 karakter kuralını geçip de hâlâ ilk denemede kırılacak
 * olanlar.
 */
export const YAYGIN_SIFRELER = [
  "1234567890",
  "0123456789",
  "1234512345",
  "qwertyuiop",
  "asdfghjkl1",
  "parola1234",
  "sifre12345",
  "password12",
  "password123",
  "passw0rd12",
  "stok123456",
  "stoktakip1",
  "admin12345",
  "yonetici12",
  "telefon123",
  "iletisim12",
];

/** Karşılaştırma için: Türkçe harfleri sadeleştirir, küçük harfe çevirir. */
function sadelestir(metin: string): string {
  return aramaNormalize(metin).replace(/\s+/g, "");
}

/** "12345", "abcde" gibi 5+ uzunlukta artan/azalan dizi var mı? */
function diziVarMi(sifre: string): boolean {
  const kucuk = sifre.toLowerCase();
  let artan = 1;
  let azalan = 1;
  for (let i = 1; i < kucuk.length; i += 1) {
    const fark = kucuk.charCodeAt(i) - kucuk.charCodeAt(i - 1);
    artan = fark === 1 ? artan + 1 : 1;
    azalan = fark === -1 ? azalan + 1 : 1;
    if (artan >= 5 || azalan >= 5) return true;
  }
  return false;
}

/**
 * Şifre kurallara uyuyor mu? Uymuyorsa kullanıcıya gösterilecek sebep.
 *
 * Kullanıcı adı ve ad soyad da veriliyor: "ahmet2026" gibi şifreler, o kişiyi
 * tanıyan birinin ilk denemesi.
 */
export function sifreSorunu(
  sifre: string,
  kullaniciAdi = "",
  adSoyad = "",
): string | null {
  if (sifre.length < SIFRE_EN_AZ) {
    return `Şifre en az ${SIFRE_EN_AZ} karakter olmalı.`;
  }
  if (sifre.length > SIFRE_EN_COK) {
    return `Şifre en fazla ${SIFRE_EN_COK} karakter olabilir.`;
  }
  // Baştaki/sondaki boşluk kullanıcıyı kilitler: formda görünmez, girişte
  // tarayıcı otomatik doldurma ile kırpılabilir.
  if (sifre.trim() !== sifre) {
    return "Şifrenin başında veya sonunda boşluk olmamalı.";
  }
  if (!/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(sifre)) {
    return "Şifre en az bir harf içermeli.";
  }
  if (!/\d/.test(sifre)) {
    return "Şifre en az bir rakam içermeli.";
  }

  const sade = sadelestir(sifre);
  if (new Set(sade).size <= 2) {
    return "Şifre bu kadar az farklı karakterden oluşamaz.";
  }
  if (YAYGIN_SIFRELER.includes(sade)) {
    return "Bu şifre çok yaygın; saldırganın ilk denediklerinden biri.";
  }
  if (diziVarMi(sade)) {
    return "Şifrede 12345 / abcde gibi sıralı diziler olmamalı.";
  }

  const kAdi = sadelestir(kullaniciAdi);
  if (kAdi.length >= 3 && sade.includes(kAdi)) {
    return "Şifre kullanıcı adını içeremez.";
  }
  // Ad soyad parçalara ayrılıp ayrı ayrı sadeleştiriliyor: sadelestir
  // boşlukları attığı için önce bölmek gerekiyor.
  for (const ham of adSoyad.split(/\s+/)) {
    const parca = sadelestir(ham);
    if (parca.length >= 4 && sade.includes(parca)) {
      return "Şifre kişinin adını veya soyadını içeremez.";
    }
  }

  return null;
}

export type SifreGucu = { puan: 0 | 1 | 2 | 3 | 4; etiket: string };

/**
 * Ekranda gösterilen güç göstergesi.
 *
 * Kuralları geçmek ile iyi bir şifre olmak aynı şey değil; gösterge
 * kullanıcıyı daha uzununa itmek için. Kural ihlali varsa puan 0.
 */
export function sifreGucu(
  sifre: string,
  kullaniciAdi = "",
  adSoyad = "",
): SifreGucu {
  if (sifre === "") return { puan: 0, etiket: "" };
  if (sifreSorunu(sifre, kullaniciAdi, adSoyad)) {
    return { puan: 0, etiket: "Kurallara uymuyor" };
  }

  let puan = 1;
  if (sifre.length >= 12) puan += 1;
  if (sifre.length >= 16) puan += 1;
  // Çeşitlilik: küçük/büyük harf, rakam, diğer.
  const tur =
    Number(/[a-zçğıöşü]/.test(sifre)) +
    Number(/[A-ZÇĞİÖŞÜ]/.test(sifre)) +
    Number(/\d/.test(sifre)) +
    Number(/[^a-zA-ZçğıöşüÇĞİÖŞÜ\d]/.test(sifre));
  if (tur >= 3) puan += 1;

  const puanlar: Record<number, string> = {
    1: "Zayıf",
    2: "Orta",
    3: "İyi",
    4: "Güçlü",
  };
  const sinirli = Math.min(puan, 4) as 1 | 2 | 3 | 4;
  return { puan: sinirli, etiket: puanlar[sinirli] };
}

/** Form altında gösterilen kural özeti. */
export function sifreKuralOzeti(): string {
  return `En az ${SIFRE_EN_AZ} karakter, en az bir harf ve bir rakam. Kullanıcı adı, ad soyad ve yaygın şifreler kabul edilmiyor.`;
}
