/**
 * Giriş deneme sınırı.
 *
 * Şifre denemesi sınırsızdı: ekrandaki sayaç yalnız arayüz içindi, sunucuda
 * hiçbir engel yoktu. scrypt denemeyi yavaşlatıyor ama durdurmuyor.
 *
 * Sayaç veritabanında tutuluyor, bellekte değil: Next üretimde dört ayrı
 * işçi süreçte çalışıyor ve bellekteki sayaç her süreçte ayrı olurdu — sınır
 * fiilen dörde katlanırdı.
 *
 * Sayaç kullanıcı adına göre tutuluyor, IP'ye göre değil: uygulama
 * cloudflared tüneli arkasında çalışıyor, gelen IP çoğu kurulumda tünelin
 * kendisi oluyor ve herkesi tek kovaya düşürürdü.
 *
 * Var olmayan kullanıcı adları da sayılıyor. Yalnız var olanlar sayılsaydı,
 * "bu ad kilitlendi mi" sorusu hesap taramasının cevabı olurdu.
 */

/** Kilitlenmeden önceki başarısız deneme sayısı. */
export const EN_COK_DENEME = 8;

/** Başarısız denemelerin sayıldığı pencere. */
export const PENCERE_DK = 15;

/** Sınır aşılınca uygulanan bekleme. */
export const KILIT_DK = 15;

export type DenemeKaydi = {
  /** Penceredeki başarısız deneme sayısı. */
  basarisiz: number;
  /** Penceredeki ilk başarısız denemenin anı. */
  pencereBasi: Date;
  /** Kilit bitişi; kilit yoksa null. */
  kilitBitis: Date | null;
};

function dakikaEkle(an: Date, dakika: number): Date {
  return new Date(an.getTime() + dakika * 60_000);
}

/** Şu an kilitli mi, kaç saniye kaldı? */
export function kilitDurumu(
  kayit: DenemeKaydi | null,
  simdi: Date = new Date(),
): { kilitli: boolean; kalanSn: number } {
  if (!kayit?.kilitBitis) return { kilitli: false, kalanSn: 0 };
  const kalanMs = kayit.kilitBitis.getTime() - simdi.getTime();
  if (kalanMs <= 0) return { kilitli: false, kalanSn: 0 };
  return { kilitli: true, kalanSn: Math.ceil(kalanMs / 1000) };
}

/**
 * Başarısız bir denemeden sonra kaydın yeni hali.
 *
 * Pencere dolmuşsa sayaç sıfırdan başlıyor: iki gün arayla yapılan iki yanlış
 * deneme saldırı değil, insan hatası.
 */
export function basarisizDenemeSonrasi(
  kayit: DenemeKaydi | null,
  simdi: Date = new Date(),
): DenemeKaydi {
  const pencereDisi =
    !kayit ||
    simdi.getTime() - kayit.pencereBasi.getTime() > PENCERE_DK * 60_000;

  const basarisiz = pencereDisi ? 1 : kayit.basarisiz + 1;
  const pencereBasi = pencereDisi ? simdi : kayit.pencereBasi;
  const kilitBitis =
    basarisiz >= EN_COK_DENEME ? dakikaEkle(simdi, KILIT_DK) : null;

  return { basarisiz, pencereBasi, kilitBitis };
}

/** Kullanıcıya gösterilecek bekleme mesajı. */
export function kilitMesaji(kalanSn: number): string {
  const dakika = Math.ceil(kalanSn / 60);
  return `Çok fazla hatalı deneme yapıldı. ${dakika} dakika sonra tekrar deneyin.`;
}
