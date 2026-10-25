/**
 * Saat diliminin saf kuralları: hangi dilimler seçilebilir, seçilen dilim
 * geçerli mi, çalışan süreç o dilimde mi.
 *
 * Bütün gün/hafta/ay gruplaması sürecin YEREL saatine göre yapılıyor
 * (`getFullYear`, `getMonth`, `getDate`). Süreç UTC'ye düşerse Türkiye'de
 * gece 00:00–03:00 arasında yapılan satışlar bir önceki güne yazılır, fatura
 * formunun varsayılan tarihi dünü gösterir ve "bugün satılanlar" kartı eksik
 * çıkar.
 *
 * Dilim artık yönetici tarafından Ayarlar'dan seçiliyor ve her istekte
 * sürece uygulanıyor (src/lib/saatDilimiAyari.ts). İlk denemede dilim
 * `instrumentation` kancasından ayarlanıyordu ve işe yaramadı: Next üretimde
 * birden çok işçi süreçte çalışıyor, kanca her süreçte istek karşılanmadan
 * önce çalışmıyordu — bir süreç UTC ile, diğeri Türkiye saatiyle render
 * ediyordu. İstek başında uygulamak bu boşluğu kapatıyor: hangi süreç
 * karşılarsa karşılasın, dilim render'dan önce yerine oturuyor.
 */

/** Ayar hiç yapılmamışsa kullanılacak dilim. */
export const BEKLENEN_SAAT_DILIMI = "Europe/Istanbul";

/**
 * Ayarlar ekranındaki listede çıkan dilimler.
 *
 * Dünyadaki ~400 dilimin tamamını listelemek yöneticiye yardım etmiyor;
 * dükkânın bulunabileceği yerler ve karşılaştırma için UTC yeterli. Liste
 * dışında bir dilim gerekirse `saatDilimiGecerliMi` onu da kabul ediyor.
 */
export const SAAT_DILIMI_SECENEKLERI = [
  { deger: "Europe/Istanbul", etiket: "Türkiye (Europe/Istanbul)" },
  { deger: "Europe/Nicosia", etiket: "Kıbrıs (Europe/Nicosia)" },
  { deger: "Europe/Berlin", etiket: "Orta Avrupa (Europe/Berlin)" },
  { deger: "Europe/London", etiket: "İngiltere (Europe/London)" },
  { deger: "Asia/Dubai", etiket: "Birleşik Arap Emirlikleri (Asia/Dubai)" },
  { deger: "America/New_York", etiket: "ABD Doğu (America/New_York)" },
  { deger: "UTC", etiket: "UTC (dilimsiz)" },
] as const;

/** Dilim adı Node'un tanıdığı bir IANA adı mı? */
export function saatDilimiGecerliMi(dilim: string): boolean {
  if (dilim.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: dilim });
    return true;
  } catch {
    return false;
  }
}

/**
 * Form/veritabanı değerini kullanılabilir bir dilime çevirir; geçersizse null.
 *
 * Veritabanındaki değer de doğrulanıyor: elle düzenlenmiş ya da eski bir
 * sürümden kalmış geçersiz bir ad, `Intl` çağrılarının her sayfada
 * fırlatmasına yol açardı.
 */
export function saatDilimiCoz(deger: unknown): string | null {
  if (typeof deger !== "string") return null;
  const temiz = deger.trim();
  return saatDilimiGecerliMi(temiz) ? temiz : null;
}

export type SaatDilimiDurumu = {
  dogru: boolean;
  mevcut: string;
  beklenen: string;
  /** Beklenen dilime göre kaç saat kayık; doğruysa 0. */
  saatFarki: number;
  /**
   * Çalışan dilimdeki o anki saat (14:35).
   *
   * Dilim adı doğru görünse de yöneticinin bakacağı asıl şey saatin kendisi:
   * duvardaki saatle uyuşuyorsa ayar doğru. Ad eşleşmesi bunu göstermiyordu.
   */
  yerelSaat: string;
};

/** Node'un o an kullandığı dilim. */
export function mevcutSaatDilimi(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Bir anın verilen dilimdeki saat:dakika metni. */
export function dilimdekiSaatMetni(an: Date, dilim: string): string {
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      timeZone: dilim,
      hour: "2-digit",
      minute: "2-digit",
    }).format(an);
  } catch {
    return "—";
  }
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
  const yerelSaat = dilimdekiSaatMetni(an, mevcut);

  let fark = 0;
  try {
    fark = dilimdekiSaat(an, mevcut) - dilimdekiSaat(an, beklenen);
  } catch {
    // Tanınmayan dilim adı: adlara bakarak karar veriyoruz.
    return {
      dogru: mevcut === beklenen,
      mevcut,
      beklenen,
      saatFarki: 0,
      yerelSaat,
    };
  }
  // Gün sınırını aşan fark (23 ile -1 aynı şey) normalleştiriliyor.
  if (fark > 12) fark -= 24;
  if (fark < -12) fark += 24;

  return { dogru: fark === 0, mevcut, beklenen, saatFarki: fark, yerelSaat };
}

/** Yöneticiye gösterilecek uyarı; sorun yoksa null. */
export function saatDilimiUyarisi(durum: SaatDilimiDurumu): string | null {
  if (durum.dogru) return null;
  const yon = durum.saatFarki > 0 ? "ileri" : "geri";
  return (
    `Sunucu "${durum.mevcut}" dilimini kullanıyor; seçilen dilim "${durum.beklenen}". ` +
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
