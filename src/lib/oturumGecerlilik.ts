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
 * İki damga da jetonu kesiyor: şifre değişikliği ve "tüm cihazlardan çık".
 * İkisi de null ise (eski kayıtlar, hiç kullanılmamış) oturum geçerli —
 * sürüm yükseltmesi kimseyi dışarı atmamalı.
 *
 * Bir saniyelik tolerans var: JWT `iat` saniyeye yuvarlanıyor, damgalar
 * milisaniyeli. Toleranssız, kullanıcının kendi şifresini değiştirdiği anda
 * kendi oturumu da düşüyordu.
 */
export function oturumGecerliMi(
  jetonAnı: Date | null,
  sifreDegisikligi: Date | null,
  oturumSifirlama: Date | null = null,
): boolean {
  const damgalar = [sifreDegisikligi, oturumSifirlama].filter(
    (d): d is Date => d !== null,
  );
  if (damgalar.length === 0) return true;
  if (!jetonAnı) return false;
  return damgalar.every((d) => d.getTime() <= jetonAnı.getTime() + 1000);
}
