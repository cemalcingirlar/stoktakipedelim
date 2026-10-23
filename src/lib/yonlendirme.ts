/**
 * Giriş sonrası dönülecek adresin güvenlik süzgeci.
 *
 * Giriş ekranı `?devam=` ile nereye dönüleceğini taşıyor. Bu değer dışarıdan
 * geliyor ve doğrudan `redirect()`e verilirse açık yönlendirme açığı olur:
 * saldırgan personele gerçek giriş sayfanızın linkini gönderir, kişi gerçekten
 * oturum açar, sonra sahte bir siteye düşer — kimlik avı için biçilmiş kaftan.
 *
 * "/" ile başlıyor olmak yetmez. `//kotusite.com` da "/" ile başlar ama
 * protokol-göreli bir adrestir, tarayıcı onu dış siteye çevirir. `/\kotusite`
 * ve yüzde kodlanmış karşılıkları da aynı kapıya çıkar.
 *
 * Bu yüzden kural beyaz liste mantığında: yalnız tek "/" ile başlayan, ikinci
 * karakteri eğik çizgi ya da ters eğik çizgi olmayan, denetim karakteri
 * taşımayan yollar kabul ediliyor. Şüphede kalınırsa panele dönülüyor.
 */

export const VARSAYILAN_HEDEF = "/panel";

/** Adres en çok bu kadar uzun olabilir; şişkin değer saldırı belirtisidir. */
const EN_COK_UZUNLUK = 512;

function cozulmusHali(deger: string): string {
  try {
    return decodeURIComponent(deger);
  } catch {
    // Bozuk yüzde kodlaması: çözemiyorsak güvenli saymıyoruz.
    return "\u0000";
  }
}

/**
 * Dışarıdan gelen "devam" değerini güvenli bir iç yola çevirir.
 * Güvenli değilse panele döner.
 */
export function guvenliHedef(devam: unknown): string {
  if (typeof devam !== "string") return VARSAYILAN_HEDEF;
  const ham = devam.trim();
  if (ham.length === 0 || ham.length > EN_COK_UZUNLUK) return VARSAYILAN_HEDEF;

  // Yüzde kodlaması kuralı atlatmasın: hem ham hem çözülmüş hali denetleniyor.
  for (const aday of [ham, cozulmusHali(ham)]) {
    if (!aday.startsWith("/")) return VARSAYILAN_HEDEF;
    // İkinci karakter eğik/ters eğik çizgiyse protokol-göreli adrestir.
    if (aday.length > 1 && (aday[1] === "/" || aday[1] === "\\"))
      return VARSAYILAN_HEDEF;
    // Denetim karakterleri (satır sonu dahil) başlık enjeksiyonuna açar.
    if (/[\u0000-\u001f\u007f]/.test(aday)) return VARSAYILAN_HEDEF;
  }

  return ham;
}
