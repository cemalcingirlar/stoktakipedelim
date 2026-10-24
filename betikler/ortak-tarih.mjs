/**
 * E2E betiklerinde "bugün" hesabı.
 *
 * Betikler kendi süreçlerinin saatine göre tarih kuruyordu; kapsayıcı UTC'de,
 * uygulama ise Ayarlar'daki dilimde (öntanımlı Europe/Istanbul) çalışıyor.
 * Gece yarısından sonra ikisi farklı gün söylüyor ve testler UYGULAMA DOĞRU
 * olduğu halde düşüyordu — sahte başarısızlık, gerçek hatayı maskelemekten
 * de kötü.
 *
 * Uygulamanın gün hesabının tek sahibi sunucunun dilimi; testler de oradan
 * sorsun.
 */

/** Uygulamanın öntanımlı saat dilimi (src/lib/saatDilimi.ts). */
export const UYGULAMA_DILIMI = process.env.UYGULAMA_DILIMI ?? "Europe/Istanbul";

/** yyyy-aa-gg — <input type="date"> ve sorgu parametreleri için. */
export function gunMetni(an = new Date(), dilim = UYGULAMA_DILIMI) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: dilim,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(an);
}

/** Bugünden `gun` kadar önce/sonra (yyyy-aa-gg). */
export function gunKaydir(gun, an = new Date(), dilim = UYGULAMA_DILIMI) {
  return gunMetni(new Date(an.getTime() + gun * 86_400_000), dilim);
}
