/**
 * Müşteri kaydının düzeltilmesi ve silinmesinin kuralları.
 *
 * İki ayrı ihtiyaç var ve ikisi de karşılıksızdı:
 *
 * 1. Satış ekranında yanlış yazılan telefon ya da ad sonsuza kadar öyle
 *    kalıyordu. Müşteriler ekranı salt okunurdu; yanlış numara da bir daha
 *    aranamayan bir müşteri demek.
 * 2. KVKK kapsamında "verilerimi silin" talebi gelince teknik bir yol yoktu.
 *
 * Silmenin iki biçimi var, çünkü satış kaydı müşteriye bağlı: satışı olan bir
 * müşterinin kaydı tamamen silinirse satışın kime yapıldığı kaybolur, ciro ve
 * garanti kaydı sakatlanır. O yüzden satışı olan müşteride kişisel alanlar
 * boşaltılıyor (anonimleştirme), satışı olmayan müşteri tamamen siliniyor.
 * KVKK'nın istediği de budur: kişisel veri gider, ticari kayıt kalır.
 */

export const AD_EN_AZ = 2;
export const AD_EN_COK = 80;
export const TELEFON_EN_COK = 30;
export const TCKN_EN_COK = 20;
export const ADRES_EN_COK = 200;
export const NOT_EN_COK = 300;

export type MusteriAlanlari = {
  adSoyad: string;
  telefon: string | null;
  tcknVkn: string | null;
  adres: string | null;
  not: string | null;
};

/**
 * Telefonu karşılaştırılabilir biçime getirir: boşluk, tire, parantez atılır.
 *
 * Aynı numaranın tek müşteriye bağlanması buna dayanıyor (satış ekranı aynı
 * telefonu bulup mevcut kaydı kullanıyor). "0532 111 22 33" ile
 * "05321112233" aynı numara; biri temizlenmezse iki ayrı müşteri oluşuyor.
 */
export function telefonNormalize(
  ham: string | null | undefined,
): string | null {
  if (typeof ham !== "string") return null;
  const temiz = ham.replace(/[\s()\-./]/g, "");
  return temiz === "" ? null : temiz;
}

/** Boş metni null'a çevirir; alanlar veritabanında null tutuluyor. */
function bosaNull(ham: unknown, enCok: number): string | null {
  if (typeof ham !== "string") return null;
  const temiz = ham.trim().slice(0, enCok);
  return temiz === "" ? null : temiz;
}

/**
 * Formdan gelen alanları doğrular.
 *
 * Telefon ve kimlik numarası serbest metin DEĞİL: rakam dışı karakter
 * kalırsa aynı numara iki ayrı kayıt olarak eşleşmeyi bırakıyor. Ama "+90"
 * gibi önekler ve yabancı numaralar da olabiliyor, bu yüzden kural
 * "yalnız rakam ve baştaki +" biçiminde.
 */
export function musteriAlanSorunu(alanlar: MusteriAlanlari): string | null {
  const ad = alanlar.adSoyad.trim();
  if (ad.length < AD_EN_AZ) return "Ad soyad en az 2 karakter olmalı.";
  if (ad.length > AD_EN_COK)
    return `Ad soyad en fazla ${AD_EN_COK} karakter olabilir.`;

  if (alanlar.telefon !== null) {
    if (!/^\+?\d+$/.test(alanlar.telefon)) {
      return "Telefon yalnız rakamlardan oluşmalı (başta + olabilir).";
    }
    const rakam = alanlar.telefon.replace(/\D/g, "");
    if (rakam.length < 7 || rakam.length > 15) {
      return "Telefon 7 ile 15 rakam arasında olmalı.";
    }
  }

  if (alanlar.tcknVkn !== null) {
    if (!/^\d+$/.test(alanlar.tcknVkn)) return "TCKN/VKN yalnız rakam olmalı.";
    if (alanlar.tcknVkn.length !== 10 && alanlar.tcknVkn.length !== 11) {
      return "TCKN 11, VKN 10 rakam olmalı.";
    }
  }

  return null;
}

/** Form alanlarını okur ve doğrular; sorun varsa `hata` döner. */
export function musteriAlanlariniCoz(
  ham: Record<string, unknown>,
): { alanlar: MusteriAlanlari } | { hata: string } {
  const alanlar: MusteriAlanlari = {
    adSoyad: typeof ham.adSoyad === "string" ? ham.adSoyad.trim() : "",
    telefon: telefonNormalize(bosaNull(ham.telefon, TELEFON_EN_COK)),
    tcknVkn: telefonNormalize(bosaNull(ham.tcknVkn, TCKN_EN_COK)),
    adres: bosaNull(ham.adres, ADRES_EN_COK),
    not: bosaNull(ham.not, NOT_EN_COK),
  };
  const sorun = musteriAlanSorunu(alanlar);
  return sorun ? { hata: sorun } : { alanlar };
}

/** Anonimleştirilen kaydın adı — listede ne olduğu anlaşılsın. */
export const ANONIM_AD = "Kaydı silinmiş müşteri";

export type SilmeKarari = "SIL" | "ANONIMLESTIR";

/**
 * Satışı olan müşteri silinmez, anonimleştirilir.
 *
 * Aksi halde satış kaydının müşterisi boşa düşer: cihazın kime satıldığı,
 * garanti başvurusunda kimin geldiği kaybolur. Ticari kaydı korumak kişisel
 * veriyi silmeye engel değil — ikisi ayrı şey.
 */
export function musteriSilmeKarari(satisAdedi: number): SilmeKarari {
  return satisAdedi > 0 ? "ANONIMLESTIR" : "SIL";
}

/** Anonimleştirmede yazılacak alanlar: kişisel olan her şey gider. */
export function anonimAlanlar(): MusteriAlanlari {
  return {
    adSoyad: ANONIM_AD,
    telefon: null,
    tcknVkn: null,
    adres: null,
    not: null,
  };
}

/**
 * Hareket açıklamasındaki müşteri adını anonim adla değiştirir.
 *
 * Müşterinin adı yalnız Musteri satırında durmuyor: satış hareketinin
 * açıklamasına ("Ayşe Yılmaz müşterisine satıldı") ve cihazın arama metnine
 * de kopyalanıyor. Yalnız Musteri satırını boşaltmak, adın cihaz
 * tarihçesinde ve cihaz aramasında durmaya devam etmesi demekti — silme
 * talebi karşılanmamış olurdu.
 *
 * İşlem logları bilerek dokunulmadan kalıyor: "kim ne zaman ne yaptı"
 * kaydının değiştirilemez olması denetimin şartı ve log kaydı adı ayrı bir
 * hukuki sebeple (işlem güvenliği) tutuyor.
 */
export function aciklamayiAnonimlestir(
  aciklama: string | null,
  eskiAd: string,
): string | null {
  if (!aciklama || eskiAd.trim() === "") return aciklama;
  return aciklama.split(eskiAd).join(ANONIM_AD);
}

/** Yöneticiye gösterilecek onay metni: ne olacağını önceden söylüyor. */
export function silmeOzeti(satisAdedi: number): string {
  if (musteriSilmeKarari(satisAdedi) === "SIL") {
    return "Bu müşterinin satışı yok; kayıt tamamen silinecek.";
  }
  return (
    `Bu müşterinin ${satisAdedi} satışı var. Satış kayıtları korunacak, ` +
    "müşterinin adı, telefonu, kimlik numarası, adresi ve notu silinecek."
  );
}
