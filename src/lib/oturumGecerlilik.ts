/**
 * Oturumun şifre değişikliğinden sonra geçersiz sayılması.
 *
 * Açık şuydu: şifre sıfırlandığında eski çerez çalışmaya devam ediyordu.
 * Hesabı ele geçirilen bir kullanıcının şifresi değiştirilse bile saldırgan
 * 12 saat boyunca içeride kalabiliyordu — şifre değiştirmenin asıl amacı da
 * tam olarak bunu kesmekti.
 *
 * Çözüm ucuz: her isteğin başında kullanıcı zaten veritabanından okunuyor
 * (src/lib/oturumTaze.ts). Şifrenin son değişme anı jetonun üretilme anından
 * (JWT `iat`) sonraysa, o jeton eski şifre döneminden kalmıştır.
 */

/** JWT `iat` alanı saniye cinsinden; Date ile karşılaştırmak için çeviriyoruz. */
export function jetonAni(iatSn: number | undefined): Date | null {
  if (typeof iatSn !== "number" || !Number.isFinite(iatSn)) return null;
  return new Date(iatSn * 1000);
}

/**
 * Jeton hâlâ geçerli mi?
 *
 * `sifreDegisikligi` null ise (eski kayıtlar, hiç şifre değişmemiş) oturum
 * geçerli: sürüm yükseltmesi kimseyi dışarı atmamalı.
 *
 * Bir saniyelik tolerans var: JWT `iat` saniyeye yuvarlanıyor, şifre
 * değişikliği milisaniyeli. Toleranssız, kullanıcının kendi şifresini
 * değiştirdiği anda kendi oturumu da düşüyordu.
 */
export function oturumGecerliMi(
  jetonAnı: Date | null,
  sifreDegisikligi: Date | null,
): boolean {
  if (!sifreDegisikligi) return true;
  if (!jetonAnı) return false;
  return sifreDegisikligi.getTime() <= jetonAnı.getTime() + 1000;
}
