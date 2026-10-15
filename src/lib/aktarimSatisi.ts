/**
 * Mağaza içi aktarımda yapılan "müşteriye sat, geri al" işleminin kuralları.
 *
 * İşin aslı şu: dükkân içinde cihaz taşınırken ürün fiilen müşteriye satılıyor
 * ve hemen geri alınıyor. Cihaz dükkânda kalıyor, stokta görünmeye devam
 * ediyor; ama kasaya bir satış girmiş oluyor ve bunun personel ile mağaza
 * satış raporlarına yansıması gerekiyor.
 *
 * İki fiyat var ve karıştırılmamaları önemli:
 *   - **satış fiyatı**: müşteriye satılan tutar. Kârı, satış anındaki alış
 *     fiyatına göre hesaplanıyor.
 *   - **yeni alış fiyatı**: geri alırken ödenen tutar. Cihazın bundan sonraki
 *     maliyeti bu; stok değeri ve bir sonraki satışın kârı buna göre çıkıyor.
 *
 * Buradaki her şey saf: aynı kurallar hem ekranda hem sunucuda çalışıyor, ve
 * rapor birleştirmesi veritabanı olmadan test edilebiliyor.
 */

/** Kuruş cinsinden en yüksek makul tutar — 1 milyon TL. */
export const EN_YUKSEK_TUTAR_KURUS = 1_000_000_00_00;

export type AktarimSatisGirdisi = {
  /** Müşteriye satılan tutar (kuruş). null => okunamadı. */
  satisFiyatiKurus: number | null;
  /** Geri alış fiyatı (kuruş). null => okunamadı. */
  yeniAlisFiyatiKurus: number | null;
};

/**
 * Satır kaydedilmeye hazır mı? Hazırsa null, değilse kullanıcıya gösterilecek
 * mesaj.
 */
export function aktarimSatisSorunu(girdi: AktarimSatisGirdisi): string | null {
  const { satisFiyatiKurus: satis, yeniAlisFiyatiKurus: alis } = girdi;

  if (satis === null) return "Satış fiyatını 12.500,00 gibi yazın.";
  if (alis === null) return "Yeni alış fiyatını 12.500,00 gibi yazın.";
  if (!Number.isInteger(satis) || satis < 0) return "Satış fiyatı negatif olamaz.";
  if (!Number.isInteger(alis) || alis < 0) return "Yeni alış fiyatı negatif olamaz.";
  if (satis === 0) return "Satış fiyatı girilmeli.";
  if (satis > EN_YUKSEK_TUTAR_KURUS) return "Satış fiyatı çok yüksek.";
  if (alis > EN_YUKSEK_TUTAR_KURUS) return "Yeni alış fiyatı çok yüksek.";

  return null;
}

/**
 * Satışın kârı: satış fiyatı eksi o andaki maliyet.
 *
 * Geri alış fiyatı buraya girmiyor. Girerse satıştan kazanılan tutar kaybolur:
 * 10.000'e alınmış cihaz 13.000'e satılıp 12.000'e geri alınırsa satışın kârı
 * 3.000'dir, 1.000 değil.
 */
export function aktarimKari(satisFiyatiKurus: number, maliyetKurus: number): number {
  return satisFiyatiKurus - maliyetKurus;
}

// --------------------------------------------------------- rapor birleştirme

/** Satış dökümünün bir satırı — hem cihaz satışları hem aktarım satışları. */
export type DokumSatiri = {
  adet: number;
  satisKurus: number;
  karKurus: number;
};

/**
 * İki satış kaynağını tek döküme indirir.
 *
 * Cihaz satışları StokKalemi'nden, aktarım satışları AktarimSatisi'nden
 * geliyor; ikisi de aynı personelin ya da mağazanın satışı sayılıyor, bu yüzden
 * anahtar bazında toplanmaları gerekiyor. Rapor ekranlarının her birinde bu
 * toplama elle yapılırsa biri atlanır ve ekranlar farklı sayı gösterir.
 *
 * `anahtar` mağaza adı, kullanıcı id'si gibi gruplama anahtarı; satırların sırası
 * korunmuyor, çağıran taraf kendi ölçütüne göre sıralıyor.
 */
export function dokumleriBirlestir<A, T extends DokumSatiri>(
  kaynaklar: { anahtar: A; satir: T }[],
): { anahtar: A; satir: DokumSatiri }[] {
  const harita = new Map<A, DokumSatiri>();

  for (const { anahtar, satir } of kaynaklar) {
    const mevcut = harita.get(anahtar);
    if (mevcut) {
      mevcut.adet += satir.adet;
      mevcut.satisKurus += satir.satisKurus;
      mevcut.karKurus += satir.karKurus;
    } else {
      harita.set(anahtar, {
        adet: satir.adet,
        satisKurus: satir.satisKurus,
        karKurus: satir.karKurus,
      });
    }
  }

  return [...harita].map(([anahtar, satir]) => ({ anahtar, satir }));
}

/**
 * Aktarım satışı kayıtlarını döküm satırlarına çevirir.
 *
 * Kâr satış anındaki maliyete göre; geri alış fiyatı dökümde yer almıyor çünkü
 * o bir alış, satış değil.
 */
export function aktarimSatislariniTopla<A>(
  kayitlar: { anahtar: A; satisFiyatiKurus: number; maliyetKurus: number }[],
): { anahtar: A; satir: DokumSatiri }[] {
  return kayitlar.map((k) => ({
    anahtar: k.anahtar,
    satir: {
      adet: 1,
      satisKurus: k.satisFiyatiKurus,
      karKurus: aktarimKari(k.satisFiyatiKurus, k.maliyetKurus),
    },
  }));
}

/**
 * Aktarım satışının cihaz tarihçesine yazılacak açıklaması.
 *
 * Fiyat değiştiyse eski → yeni olarak yazılıyor; değişmediyse tekrar etmiyor.
 */
export function aktarimSatisAciklamasi(bilgi: {
  musteriAdi: string;
  satisFiyatiYazi: string;
  eskiAlisYazi: string;
  yeniAlisYazi: string;
}): string {
  const parcalar = [
    `${bilgi.musteriAdi} müşterisine ${bilgi.satisFiyatiYazi} TL'ye satılıp geri alındı`,
  ];
  if (bilgi.eskiAlisYazi !== bilgi.yeniAlisYazi) {
    parcalar.push(`alış fiyatı ${bilgi.eskiAlisYazi} → ${bilgi.yeniAlisYazi} TL`);
  }
  return parcalar.join(" · ");
}
