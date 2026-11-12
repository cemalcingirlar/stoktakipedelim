/**
 * Hareketsiz kalan oturumun kapanması.
 *
 * Oturum jetonu 12 saat geçerli. Mağazada açık bırakılan bir ekran, kimse
 * dokunmasa da o süre boyunca satış yapabiliyor, stok düzenleyebiliyordu.
 * Son etkinlik anı sunucuda tutuluyor ve arası fazla açılınca oturum
 * geçersiz sayılıyor.
 *
 * Kural saf; okuma ve yazma src/lib/oturumTaze.ts içinde.
 */

/** Bu kadar süre hiçbir istek gelmezse oturum kapanır. */
export const HAREKETSIZLIK_DK = 120;

/**
 * Son etkinlik en fazla bu sıklıkta yazılır.
 *
 * Her istekte yazmak her sayfa görüntülemeyi bir veritabanı yazımına çevirir.
 * Seyrek yazmanın bedeli: ölçülen hareketsizlik en çok bu kadar erken
 * başlayabilir — 120 dakikalık sınırda beş dakika önemsiz.
 */
export const ETKINLIK_YAZMA_ARALIGI_DK = 5;

export type EtkinlikKarari = {
  /** Oturum hâlâ geçerli mi? */
  gecerli: boolean;
  /** Son etkinlik anı şimdi yazılmalı mı? */
  yaz: boolean;
};

/**
 * @param sonEtkinlik kayıtlı son etkinlik; kayıt yoksa null
 *
 * Kayıt yoksa oturum geçerli sayılıp kayıt açılıyor: yeni giriş yapılmış ya
 * da jeton bu özellikten önce üretilmiş demektir. Sürüm yükseltmesi kimseyi
 * dışarı atmamalı. Kaydı silmek istemcinin elinde olmadığı için bu, sınırı
 * atlatmanın bir yolu değil.
 */
export function etkinlikKarari(
  sonEtkinlik: Date | null,
  simdi: Date = new Date(),
): EtkinlikKarari {
  if (!sonEtkinlik) return { gecerli: true, yaz: true };

  const gecenDk = (simdi.getTime() - sonEtkinlik.getTime()) / 60_000;
  if (gecenDk > HAREKETSIZLIK_DK) return { gecerli: false, yaz: false };
  return { gecerli: true, yaz: gecenDk >= ETKINLIK_YAZMA_ARALIGI_DK };
}
