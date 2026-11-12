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
 * İki sayaç var. Asıl sayaç kullanıcı adı + IP çiftine göre: yalnız kullanıcı
 * adına göre tutulurken adı bilen herkes 15 dakikada sekiz yanlış denemeyle o
 * kişiyi sürekli kilitli tutabiliyordu. Şimdi kilit yalnız denemeyi yapan
 * adrese işliyor; hesabın sahibi kendi adresinden girmeye devam ediyor. IP,
 * Cloudflare'in yazdığı başlıktan geliyor (bkz. istemciIp).
 *
 * İkinci sayaç yalnız kullanıcı adına göre ve sınırı daha yüksek: her
 * denemeyi başka adresten yapan dağıtık bir saldırı çift sayacına hiç
 * takılmazdı. Tek adres bu sınıra ulaşamaz (önce kendi kilidine takılır),
 * yani tek kişinin başkasını kilitleme yolu kapalı kalıyor.
 *
 * Var olmayan kullanıcı adları da sayılıyor. Yalnız var olanlar sayılsaydı,
 * "bu ad kilitlendi mi" sorusu hesap taramasının cevabı olurdu.
 */

/** Kilitlenmeden önceki başarısız deneme sayısı (aynı adresten, aynı ad için). */
export const EN_COK_DENEME = 8;

/** Bir kullanıcı adı için bütün adreslerden toplam başarısız deneme sınırı. */
export const GENEL_EN_COK_DENEME = 40;

/** IP okunamadığında (yerel çalıştırma) kullanılan kova. */
const BILINMEYEN_IP = "bilinmiyor";

/**
 * Sayaç tablosundaki anahtarlar.
 *
 * Tablo tek metin sütunuyla anahtarlanıyor; iki sayaç öneklerle ayrılıyor.
 * IP boşluk içeremediği için "ip:<adres> <ad>" tek anlamlı: kullanıcı adında
 * boşluk olsa bile ilk boşluk adresi bitirir. Öneksiz eski kayıtlar hiçbir
 * anahtarla eşleşmez ve kendiliğinden geçersiz kalır.
 */
export function denemeAnahtarlari(
  kullaniciAdi: string,
  ip: string | null | undefined,
): { ipli: string; genel: string } {
  const adres = (ip ?? "").trim().replace(/\s+/g, "") || BILINMEYEN_IP;
  return {
    ipli: `ip:${adres} ${kullaniciAdi}`,
    genel: `ad:${kullaniciAdi}`,
  };
}

/** Denetim kaydına yazılacak kullanıcı adı: uzun ya da satırlı girdi kırpılır. */
export function kayitIcinAd(kullaniciAdi: string): string {
  const tek = kullaniciAdi.replace(/[\r\n\t]+/g, " ").trim();
  return tek.length > 60 ? `${tek.slice(0, 60)}…` : tek;
}

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
  sinir: number = EN_COK_DENEME,
): DenemeKaydi {
  const pencereDisi =
    !kayit ||
    simdi.getTime() - kayit.pencereBasi.getTime() > PENCERE_DK * 60_000;

  const basarisiz = pencereDisi ? 1 : kayit.basarisiz + 1;
  const pencereBasi = pencereDisi ? simdi : kayit.pencereBasi;
  const kilitBitis =
    basarisiz >= sinir ? dakikaEkle(simdi, KILIT_DK) : null;

  return { basarisiz, pencereBasi, kilitBitis };
}

/** Kullanıcıya gösterilecek bekleme mesajı. */
export function kilitMesaji(kalanSn: number): string {
  const dakika = Math.ceil(kalanSn / 60);
  return `Çok fazla hatalı deneme yapıldı. ${dakika} dakika sonra tekrar deneyin.`;
}
