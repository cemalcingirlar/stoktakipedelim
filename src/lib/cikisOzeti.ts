/**
 * "Stoktan çıkanlar" ile "satışlar" arasındaki ayrım.
 *
 * Mağaza içi aktarımda cihaz müşteriye satılıp hemen geri alınıyor: kasaya
 * bir satış giriyor ama cihaz fiziken mağazadan ÇIKMIYOR, stokta kalıyor.
 * Bu işlemler panelin "Stoktan Çıkanlar" kartında ve "bugün çıkan" sayacında
 * sayılıyordu; kullanıcı stokta duran cihazı çıkmış görüyordu.
 *
 * Kural:
 *   - Stok görünümü (panel: stoktan çıkanlar): aktarım satışları SAYILMAZ.
 *   - Satış görünümü (satış ekranı, satış raporları, ciro): SAYILIR ve
 *     "mağaza içi aktarım" diye işaretlenir.
 *
 * Bu dosya saf; sorgu src/lib/sorgular.ts içinde.
 */

export type ToplamGirdisi = {
  adet: number;
  satisKurus: number;
  maliyetKurus: number;
};

export type CikisToplami = {
  adet: number;
  ciroKurus: number;
  karKurus: number;
  /** Dönemdeki mağaza içi aktarım satışı sayısı (dahil olsun olmasın). */
  aktarimAdedi: number;
  aktarimCiroKurus: number;
  /** Aktarım satışları adet/ciro/kâra katılmadı mı? */
  aktarimHaric: boolean;
};

export function cikisToplami(
  cihazlar: ToplamGirdisi,
  aktarimlar: ToplamGirdisi,
  aktarimDahil: boolean,
): CikisToplami {
  const cihazKar = cihazlar.satisKurus - cihazlar.maliyetKurus;
  const aktarimKar = aktarimlar.satisKurus - aktarimlar.maliyetKurus;
  return {
    adet: cihazlar.adet + (aktarimDahil ? aktarimlar.adet : 0),
    ciroKurus: cihazlar.satisKurus + (aktarimDahil ? aktarimlar.satisKurus : 0),
    karKurus: cihazKar + (aktarimDahil ? aktarimKar : 0),
    aktarimAdedi: aktarimlar.adet,
    aktarimCiroKurus: aktarimlar.satisKurus,
    aktarimHaric: !aktarimDahil,
  };
}

/**
 * Stok görünümünde, sayılmayan aktarım satışları için gösterilen not; yoksa
 * null. Rakamlar satış raporuyla tutmadığında nedenini söylüyor.
 */
export function aktarimNotu(
  toplam: Pick<CikisToplami, "aktarimAdedi" | "aktarimHaric">,
): string | null {
  if (!toplam.aktarimHaric || toplam.aktarimAdedi === 0) return null;
  return (
    `Ayrıca ${toplam.aktarimAdedi} mağaza içi aktarım satışı var. ` +
    "Cihazlar stokta kaldığı için burada sayılmıyor; satış ekranında ve satış raporunda görünür."
  );
}
