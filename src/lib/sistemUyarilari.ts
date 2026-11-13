/**
 * Panelde yöneticiye gösterilen sistem uyarıları.
 *
 * İki sessiz arıza vardı. Yedek başarısız olunca yalnız loga yazılıyordu;
 * yedekleme ekranına bakılmadıkça kimse fark etmiyor, fark edildiği gün de
 * yedeğe ihtiyaç duyulan gün oluyordu. Hatalı giriş denemeleri ise hiçbir
 * yerde görünmüyordu.
 *
 * Kurallar saf: veritabanı okuması sayfada, karar burada.
 */

export type YedekOzeti = {
  durum: string; // BASARILI | HATA
  tarih: Date;
  hata?: string | null;
};

/** Art arda bu kadar başarısız yedek uyarı sebebi. Tek hata geçici olabilir. */
export const ART_ARDA_HATA_SINIRI = 2;

/** Son başarılı yedek bundan eskiyse uyarı: günlük yedekte bir gün kaçmış demek. */
export const YEDEK_BAYAT_SAAT = 48;

export type SistemUyarisi = {
  /** Test ve anahtar için kısa ad. */
  tur: "yedek-hata" | "yedek-bayat" | "giris";
  mesaj: string;
  baglanti: string;
  baglantiMetni: string;
};

function sureYaz(saat: number): string {
  if (saat < 48) return `${Math.floor(saat)} saat`;
  return `${Math.floor(saat / 24)} gün`;
}

/**
 * Yedek uyarısı.
 *
 * @param sonKayitlar en yeniden eskiye son yedek kayıtları
 * @param sonBasarili son başarılı yedeğin anı; hiç yoksa null
 *
 * Hiç yedek kaydı yoksa uyarı yok: yedekleme kurulmamış bir kurulumda (ve
 * testlerde) her açılışta kırmızı kutu göstermek uyarıyı değersizleştirir.
 * Kurulduktan sonra sustuğunda ise mutlaka söylenmeli.
 */
export function yedekUyarisi(
  sonKayitlar: YedekOzeti[],
  sonBasarili: Date | null,
  simdi: Date = new Date(),
): SistemUyarisi | null {
  if (sonKayitlar.length === 0) return null;

  let artArda = 0;
  for (const k of sonKayitlar) {
    if (k.durum !== "HATA") break;
    artArda += 1;
  }
  if (artArda >= ART_ARDA_HATA_SINIRI) {
    const sebep = (sonKayitlar[0].hata ?? "").replace(/\s+/g, " ").trim();
    const kisa = sebep.length > 140 ? `${sebep.slice(0, 140)}…` : sebep;
    return {
      tur: "yedek-hata",
      mesaj:
        `Son ${artArda} yedekleme başarısız oldu` +
        (sonBasarili
          ? `; son başarılı yedek ${sureYaz((simdi.getTime() - sonBasarili.getTime()) / 3_600_000)} önce.`
          : "; hiç başarılı yedek yok.") +
        (kisa ? ` Son hata: ${kisa}` : ""),
      baglanti: "/ayarlar/yedekleme",
      baglantiMetni: "Yedeklemeye git",
    };
  }

  if (!sonBasarili) return null; // tek hata, henüz başarılı yok: bir sonrakini bekle
  const saat = (simdi.getTime() - sonBasarili.getTime()) / 3_600_000;
  if (saat >= YEDEK_BAYAT_SAAT) {
    return {
      tur: "yedek-bayat",
      mesaj: `Son başarılı yedek ${sureYaz(saat)} önce alındı. Zamanlanmış yedekleme çalışmıyor olabilir.`,
      baglanti: "/ayarlar/yedekleme",
      baglantiMetni: "Yedeklemeye git",
    };
  }
  return null;
}

/** Bu kadar hatalı denemenin altı gündelik yazım hatası sayılır. */
export const GIRIS_UYARI_SINIRI = 10;

/**
 * Hatalı giriş uyarısı: son 24 saatte kilitlenme olduysa ya da hatalı deneme
 * sayısı gündelik yazım hatalarının üstündeyse.
 */
export function girisUyarisi(
  basarisiz: number,
  kilitlenme: number,
): SistemUyarisi | null {
  if (kilitlenme === 0 && basarisiz < GIRIS_UYARI_SINIRI) return null;
  const toplam = basarisiz + kilitlenme;
  return {
    tur: "giris",
    mesaj:
      `Son 24 saatte ${toplam} hatalı giriş denemesi oldu` +
      (kilitlenme > 0 ? `; ${kilitlenme} kez giriş kilitlendi.` : "."),
    baglanti: "/ayarlar/loglar?islem=GIRIS_BASARISIZ",
    baglantiMetni: "Kayıtları gör",
  };
}
