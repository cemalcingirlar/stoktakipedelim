/**
 * Yedeğin gerçekten işe yarayıp yaramadığının denetimi.
 *
 * Yedek almak ile yedeği olmak aynı şey değil. Önceden yalnız "yükleme
 * isteği hata vermedi mi" bakılıyordu; bozuk ya da yarım yüklenmiş bir
 * yedeğin bozuk olduğu ancak felaket günü, geri yükleme denenince
 * anlaşılırdı. İki şey ölçülüyor:
 *
 * 1. Anlık görüntünün bütünlüğü (`PRAGMA integrity_check`). VACUUM INTO
 *    tutarlı bir dosya yazar ama diskte bozulma varsa onu da kopyalar.
 * 2. Drive'daki dosyanın boyutu yereldekiyle aynı mı. Yarım yükleme en
 *    sinsi hata: istek 200 döner, dosya kırpılmış olur. Gzip'te son
 *    baytların eksikliği dosyanın tamamını açılamaz yapar.
 */

/** SQLite'ın "sorun yok" cevabı. */
export const BUTUNLUK_TAMAM = "ok";

/** integrity_check çıktısını yorumlar; sorun yoksa null. */
export function butunlukSorunu(sonuc: string): string | null {
  const temiz = sonuc.trim();
  if (temiz === "") return "Bütünlük kontrolü cevap vermedi.";
  if (temiz.toLowerCase() === BUTUNLUK_TAMAM) return null;
  // Çıktı onlarca satır olabiliyor; ilk satır sorunu anlatmaya yetiyor.
  return `Veritabanı bütünlük kontrolünden geçmedi: ${temiz.split("\n")[0].slice(0, 120)}`;
}

/**
 * Yüklenen dosyanın boyutu yereldekiyle aynı mı?
 *
 * Drive boyutu bildirmezse (eski API cevapları, bazı Ortak Drive
 * yapılandırmaları) bu bir hata değil ama doğrulanmamış demek — çağıran
 * tarafta "doğrulanamadı" olarak gösteriliyor.
 */
export function boyutSorunu(
  yerelBayt: number,
  uzakBayt: number | null,
): string | null {
  if (yerelBayt <= 0) return "Yedek dosyası boş.";
  if (uzakBayt === null) return null;
  if (uzakBayt !== yerelBayt) {
    return `Yüklenen dosya ${uzakBayt} bayt, yereldeki ${yerelBayt} bayt — yükleme yarım kalmış.`;
  }
  return null;
}

export type DogrulamaGirdisi = {
  /** integrity_check çıktısı; alınamadıysa null. */
  butunluk: string | null;
  yerelBayt: number;
  uzakBayt: number | null;
};

export type Dogrulama = {
  /** Hem bütünlük hem boyut doğrulandı mı? */
  tamam: boolean;
  /** Yedek kaydına yazılan kısa özet. */
  metin: string;
  /** Doğrulamayı başarısız kılan sorun; yoksa null. */
  sorun: string | null;
};

/**
 * Yedek kaydına yazılacak doğrulama özeti.
 *
 * "Doğrulandı" ile "doğrulanamadı" ayrı tutuluyor: ikisini de başarı saymak,
 * hiç doğrulamamakla aynı yere çıkıyordu.
 */
export function yedegiDogrula(girdi: DogrulamaGirdisi): Dogrulama {
  const butunluk =
    girdi.butunluk === null
      ? "Bütünlük kontrolü yapılamadı."
      : butunlukSorunu(girdi.butunluk);
  if (butunluk) return { tamam: false, metin: butunluk, sorun: butunluk };

  const boyut = boyutSorunu(girdi.yerelBayt, girdi.uzakBayt);
  if (boyut) return { tamam: false, metin: boyut, sorun: boyut };

  if (girdi.uzakBayt === null) {
    return {
      tamam: false,
      metin: "Bütünlük tamam; yüklenen boyut Drive'dan okunamadı.",
      sorun: null,
    };
  }

  return {
    tamam: true,
    metin: "Bütünlük ve yüklenen boyut doğrulandı.",
    sorun: null,
  };
}
