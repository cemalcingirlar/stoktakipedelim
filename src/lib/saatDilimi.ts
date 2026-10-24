/**
 * Sunucunun saat dilimi denetimi.
 *
 * Bütün gün/hafta/ay gruplaması sunucunun YEREL saatine göre yapılıyor
 * (`getFullYear`, `getMonth`, `getDate`). Sunucu UTC'ye düşerse Türkiye'de
 * gece 00:00–03:00 arasında yapılan satışlar bir önceki güne yazılır, fatura
 * formunun varsayılan tarihi dünü gösterir ve "bugün satılanlar" kartı eksik
 * çıkar.
 *
 * Dilim neden kod içinden ayarlanmıyor: denendi ve ölçüldü. Next üretimde
 * birden çok işçi süreçte çalışıyor ve `instrumentation` kancası her sürecte
 * istek karşılanmadan önce çalışmıyor — bir süreç UTC ile, diğeri Türkiye
 * saatiyle render ediyordu. Aynı kullanıcının iki isteğinin farklı güne
 * düşmesi, hiç ayarlamamaktan kötü. Bu yüzden dilim servis biriminde
 * sabitleniyor (betikler/sunucu-guncelle.sh) ve burada yalnız denetleniyor.
 */

export const BEKLENEN_SAAT_DILIMI = "Europe/Istanbul";

export type SaatDilimiDurumu = {
  dogru: boolean;
  mevcut: string;
  beklenen: string;
  /** Beklenen dilime göre kaç saat kayık; doğruysa 0. */
  saatFarki: number;
};

/** Node'un o an kullandığı dilim. */
export function mevcutSaatDilimi(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Bir anın verilen dilimdeki saat değeri. */
function dilimdekiSaat(an: Date, dilim: string): number {
  const metin = new Intl.DateTimeFormat("en-GB", {
    timeZone: dilim,
    hour: "2-digit",
    hour12: false,
  }).format(an);
  return Number(metin);
}

/**
 * Mevcut dilim beklenenle uyuşuyor mu, uyuşmuyorsa kaç saat kayık?
 *
 * Fark saat üzerinden ölçülüyor: "Europe/Istanbul" yerine "Asia/Nicosia"
 * yazılmışsa adlar farklı ama saat aynı — kullanıcıyı boşuna uyarmamak için
 * asıl ölçüt saat farkı.
 */
export function saatDilimiDurumu(
  mevcut: string = mevcutSaatDilimi(),
  beklenen: string = BEKLENEN_SAAT_DILIMI,
  an: Date = new Date(),
): SaatDilimiDurumu {
  let fark = 0;
  try {
    fark = dilimdekiSaat(an, mevcut) - dilimdekiSaat(an, beklenen);
  } catch {
    // Tanınmayan dilim adı: adlara bakarak karar veriyoruz.
    return { dogru: mevcut === beklenen, mevcut, beklenen, saatFarki: 0 };
  }
  // Gün sınırını aşan fark (23 ile -1 aynı şey) normalleştiriliyor.
  if (fark > 12) fark -= 24;
  if (fark < -12) fark += 24;

  return { dogru: fark === 0, mevcut, beklenen, saatFarki: fark };
}

/** Yöneticiye gösterilecek uyarı; sorun yoksa null. */
export function saatDilimiUyarisi(durum: SaatDilimiDurumu): string | null {
  if (durum.dogru) return null;
  const yon = durum.saatFarki > 0 ? "ileri" : "geri";
  return (
    `Sunucunun saat dilimi "${durum.mevcut}"; beklenen "${durum.beklenen}". ` +
    `Saatler ${Math.abs(durum.saatFarki)} saat ${yon}. Bu haliyle gün sınırına yakın ` +
    `yapılan satışlar yanlış güne yazılabilir.`
  );
}

/**
 * Ayarlar ekranında her zaman duran bilgi satırı.
 *
 * Uyarı bandı yalnız sorun varken çıkıyor; doğruyken hiçbir şey görünmediği
 * için "ayar nerede, çalışıyor mu" sorusu cevapsız kalıyordu. Sessizliğin iki
 * anlamı vardı — ya her şey yolunda ya da güncelleme inmemiş. Bu satır ikisini
 * ayırıyor: dilim her durumda yazılı.
 */
export function saatDilimiOzeti(durum: SaatDilimiDurumu = saatDilimiDurumu()): {
  metin: string;
  dogru: boolean;
} {
  return { metin: `Saat dilimi: ${durum.mevcut}`, dogru: durum.dogru };
}
