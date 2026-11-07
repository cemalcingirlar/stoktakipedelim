/**
 * Bir müşterinin bugüne kadar aldıkları.
 *
 * Alımlar iki yerden geliyor: normal satışlar cihaz kaydının kendisinde
 * (StokKalemi), mağaza içi aktarım satışları ayrı bir tabloda
 * (AktarimSatisi). Müşteri "ne aldım" diye sorduğunda ikisi de cevabın
 * parçası, o yüzden burada tek listede birleşip tarihe göre sıralanıyor.
 *
 * Dosya saf: veritabanına gitmiyor, böylece sıralama ve toplam kuralları
 * ekrandan bağımsız sınanabiliyor.
 */

export type MusteriAlimi = {
  /** Liste anahtarı; iki kaynak aynı cihaz kimliğini taşıyabiliyor. */
  anahtar: string;
  cihazId: number;
  marka: string;
  model: string;
  seriNo: string | null;
  barkod: string | null;
  magazaAdi: string;
  tarih: Date | null;
  tutarKurus: number;
  /** Satış kartı varsa kimliği ve numarası; aktarım satışlarında null. */
  satisId: number | null;
  satisNo: string | null;
  /** Mağaza içi aktarım satışı mı? */
  aktarimMi: boolean;
};

export type AlimOzeti = {
  adet: number;
  toplamKurus: number;
  ilkTarih: Date | null;
  sonTarih: Date | null;
};

/** Tarihe göre yeniden eskiye; tarihsiz kayıtlar sona. */
export function alimlariSirala(alimlar: MusteriAlimi[]): MusteriAlimi[] {
  return [...alimlar].sort((a, b) => {
    if (a.tarih === null && b.tarih === null) return b.cihazId - a.cihazId;
    if (a.tarih === null) return 1;
    if (b.tarih === null) return -1;
    const fark = b.tarih.getTime() - a.tarih.getTime();
    // Aynı gün satılanlarda sıra oynamasın: ikincil ölçüt cihaz kimliği.
    return fark !== 0 ? fark : b.cihazId - a.cihazId;
  });
}

/**
 * İki kaynağın (normal satış ve aktarım satışı) özetlerini birleştirir.
 *
 * Özet listeden değil veritabanı toplamasından geliyor: kart en çok 200 alım
 * listeliyor, ama "kaç cihaz, ne kadar" sorusunun cevabı tamamı üzerinden
 * olmalı.
 */
export function ozetleriBirlestir(ozetler: AlimOzeti[]): AlimOzeti {
  let adet = 0;
  let toplamKurus = 0;
  let ilkTarih: Date | null = null;
  let sonTarih: Date | null = null;
  for (const o of ozetler) {
    adet += o.adet;
    toplamKurus += o.toplamKurus;
    if (o.ilkTarih !== null && (ilkTarih === null || o.ilkTarih < ilkTarih)) {
      ilkTarih = o.ilkTarih;
    }
    if (o.sonTarih !== null && (sonTarih === null || o.sonTarih > sonTarih)) {
      sonTarih = o.sonTarih;
    }
  }
  return { adet, toplamKurus, ilkTarih, sonTarih };
}
