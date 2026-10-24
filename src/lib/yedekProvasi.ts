/**
 * Geri yükleme provası: yedeğin gerçekten açılabildiğinin sınanması.
 *
 * Yedeğin alınması, doğrulanması ve GERİ YÜKLENEBİLMESİ ayrı şeyler.
 * Bütünlük kontrolü yedeği alındığı anda sınıyor; prova ise Drive'daki
 * dosyayı geri indirip açıyor — yüklemede bozulma, yanlış klasör, eksik
 * yetki gibi sorunlar ancak böyle görünür. "Yedeğim var" demek, felaket günü
 * o dosyayı açabilmek demek.
 */

export const PROVA_ANAHTARI = "yedek_prova_son";

export type ProvaKaydi = {
  tarihISO: string;
  basarili: boolean;
  metin: string;
  dosyaAdi: string;
};

export type TabloSayilari = {
  kullanici: number;
  cihaz: number;
  fatura: number;
};

/**
 * Yedekten okunan sayılar canlıyla tutarlı mı?
 *
 * Kayıtlar silinmediği için yedekteki sayı canlıdakinden FAZLA olamaz; az
 * olması normal (yedekten sonra iş yapılmış). Canlıda kayıt varken yedekte
 * sıfır çıkması ise bozuk ya da yanlış dosya demek.
 */
export function sayimSorunu(
  yedek: TabloSayilari,
  canli: TabloSayilari,
): string | null {
  if (yedek.kullanici < 1) {
    return "Yedekte hiç kullanıcı yok; dosya bozuk ya da yanlış veritabanı.";
  }
  const alanlar: [keyof TabloSayilari, string][] = [
    ["cihaz", "cihaz"],
    ["fatura", "fatura"],
    ["kullanici", "kullanıcı"],
  ];
  for (const [alan, ad] of alanlar) {
    if (yedek[alan] > canli[alan]) {
      return `Yedekte ${yedek[alan]} ${ad} var ama canlıda ${canli[alan]}; dosya bu sisteme ait değil.`;
    }
    if (canli[alan] > 0 && yedek[alan] === 0) {
      return `Canlıda ${canli[alan]} ${ad} varken yedekte hiç yok; yedek kullanılamaz.`;
    }
  }
  return null;
}

/** Prova sonucunu insan okunur hale getirir. */
export function provaSonucu(girdi: {
  butunluk: string;
  yedek: TabloSayilari;
  canli: TabloSayilari;
  dosyaAdi: string;
}): { basarili: boolean; metin: string } {
  if (girdi.butunluk.trim().toLowerCase() !== "ok") {
    return {
      basarili: false,
      metin: `Yedek açıldı ama bütünlük kontrolünden geçmedi: ${girdi.butunluk.split("\n")[0].slice(0, 100)}`,
    };
  }
  const sorun = sayimSorunu(girdi.yedek, girdi.canli);
  if (sorun) return { basarili: false, metin: sorun };

  return {
    basarili: true,
    metin: `${girdi.dosyaAdi} indirildi, açıldı ve okundu: ${girdi.yedek.cihaz.toLocaleString("tr-TR")} cihaz, ${girdi.yedek.fatura.toLocaleString("tr-TR")} fatura, ${girdi.yedek.kullanici} kullanıcı.`,
  };
}

/** Provanın ne kadar eskidiğini söyler. */
export function provaYasi(
  kayit: ProvaKaydi | null,
  simdi = new Date(),
): string {
  if (!kayit) return "Hiç prova yapılmamış.";
  const gun = Math.floor(
    (simdi.getTime() - new Date(kayit.tarihISO).getTime()) / 86_400_000,
  );
  const ne = kayit.basarili ? "başarılı" : "BAŞARISIZ";
  if (gun <= 0) return `Bugün yapıldı — ${ne}.`;
  return `${gun} gün önce yapıldı — ${ne}.`;
}
