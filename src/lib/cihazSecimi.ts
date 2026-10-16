/**
 * Okutulan kod birden çok cihaza denk geldiğinde hangisinin seçileceği.
 *
 * Seri numarası olmayan ürünlerde (aksesuar, kablo) aynı barkod çok sayıda
 * cihazda bulunuyor. Okutma eşleşen ilk cihazı alırsa, o cihaz satılmışsa
 * "daha önce satılmış" deyip duruyordu — oysa aynı barkodta stokta başka
 * cihazlar vardı.
 *
 * Kural şu: seri numarası okutulduysa tek bir cihaz kastediliyor demektir,
 * doğrudan o seçilir. Barkod okutulduysa uygun cihazlar süzülür; bir tane
 * kalırsa o, birden çok kalırsa kullanıcıya sorulur.
 *
 * Hiç uygun cihaz kalmadığında neden kalmadığı söyleniyor: "satılmış",
 * "başka mağazada" ve "zaten listede" birbirinden çok farklı durumlar ve
 * kullanıcı ne yapacağını ancak doğrusunu bilirse biliyor.
 */
import { STOK_DURUM } from "./sabitler";

export type AdayCihaz = {
  id: number;
  seriNo: string | null;
  barkod: string | null;
  durum: string;
  magazaId: number;
  magazaAdi: string;
  marka: string;
  model: string;
  alisFiyatiKurus: number;
};

export type SecimBaglami = {
  /** Okutulan, normalleştirilmiş kod. */
  aranan: string;
  /** Kullanıcının işlem yapabildiği mağazalar; null = tümü (yönetici). */
  yetkiliMagazalar: number[] | null;
  /** Zaten listeye/sepete alınmış cihazlar — tekrar seçilmemeli. */
  secilmisIdler?: number[];
};

export type SecimSonucu =
  /** Tek bir cihaz belirlendi. */
  | { durum: "TEK"; cihaz: AdayCihaz }
  /** Birden çok uygun cihaz var; kullanıcı seçmeli. */
  | { durum: "SECIM"; adaylar: AdayCihaz[] }
  /** Uygun cihaz yok; mesaj nedenini söylüyor. */
  | { durum: "YOK"; mesaj: string };

/** Cihaz bu işlem için uygun mu? */
export function uygunMu(aday: AdayCihaz, baglam: SecimBaglami): boolean {
  if (aday.durum !== STOK_DURUM.STOKTA) return false;
  if (baglam.secilmisIdler?.includes(aday.id)) return false;
  if (baglam.yetkiliMagazalar !== null && !baglam.yetkiliMagazalar.includes(aday.magazaId)) {
    return false;
  }
  return true;
}

/** Okutulan kod bu cihazın seri numarası mı? */
function seriEslesmesi(aday: AdayCihaz, aranan: string): boolean {
  return Boolean(aday.seriNo) && aday.seriNo === aranan;
}

/**
 * Hiç uygun cihaz kalmadığında nedenini anlatır.
 *
 * Sıralama bilinçli: en sık karşılaşılan ve en açıklayıcı neden önce.
 */
export function uygunsuzlukMesaji(adaylar: AdayCihaz[], baglam: SecimBaglami): string {
  const { aranan } = baglam;
  if (adaylar.length === 0) return `${aranan} sistemde kayıtlı değil.`;

  const zatenSecili = adaylar.filter((a) => baglam.secilmisIdler?.includes(a.id));
  const stokta = adaylar.filter((a) => a.durum === STOK_DURUM.STOKTA);
  const baskaMagazada =
    baglam.yetkiliMagazalar === null
      ? []
      : stokta.filter((a) => !baglam.yetkiliMagazalar!.includes(a.magazaId));

  if (zatenSecili.length === adaylar.length) {
    return `${aranan} zaten listede.`;
  }

  if (stokta.length === 0) {
    const satilan = adaylar.filter((a) => a.durum === STOK_DURUM.SATILDI).length;
    const transferde = adaylar.filter((a) => a.durum === STOK_DURUM.TRANSFERDE).length;
    if (adaylar.length === 1) {
      if (satilan === 1) return `${aranan} daha önce satılmış.`;
      if (transferde === 1) return `${aranan} bir sevkiyatta, önce kabul edilmeli.`;
      return `${aranan} stokta değil (${adaylar[0].durum}).`;
    }
    const parcalar: string[] = [];
    if (satilan > 0) parcalar.push(`${satilan} tanesi satılmış`);
    if (transferde > 0) parcalar.push(`${transferde} tanesi sevkiyatta`);
    const kalan = adaylar.length - satilan - transferde;
    if (kalan > 0) parcalar.push(`${kalan} tanesi stokta değil`);
    return `${aranan} barkodunda stokta cihaz yok — ${parcalar.join(", ")}.`;
  }

  if (baskaMagazada.length === stokta.length) {
    const yerler = [...new Set(baskaMagazada.map((a) => a.magazaAdi))].join(", ");
    return (
      `${aranan} stokta ama yetkili olmadığınız mağazada (${yerler}). ` +
      "Önce kendi mağazanıza aktarılmalı."
    );
  }

  return `${aranan} zaten listede.`;
}

/**
 * Okutulan koda karşılık gelen cihazı belirler.
 *
 * Seri numarası tam eşleşmesi her şeyin önünde: kullanıcı o cihazı kastediyor
 * ve uygun değilse nedenini görmeli, sessizce başka bir cihaz seçilmemeli.
 */
export function cihazSec(adaylar: AdayCihaz[], baglam: SecimBaglami): SecimSonucu {
  if (adaylar.length === 0) {
    return { durum: "YOK", mesaj: uygunsuzlukMesaji(adaylar, baglam) };
  }

  const seriyle = adaylar.filter((a) => seriEslesmesi(a, baglam.aranan));
  if (seriyle.length === 1) {
    const cihaz = seriyle[0];
    return uygunMu(cihaz, baglam)
      ? { durum: "TEK", cihaz }
      : { durum: "YOK", mesaj: uygunsuzlukMesaji(seriyle, baglam) };
  }

  const uygunlar = adaylar.filter((a) => uygunMu(a, baglam));
  if (uygunlar.length === 0) {
    return { durum: "YOK", mesaj: uygunsuzlukMesaji(adaylar, baglam) };
  }
  if (uygunlar.length === 1) return { durum: "TEK", cihaz: uygunlar[0] };

  return { durum: "SECIM", adaylar: siralaAdaylar(uygunlar) };
}

/**
 * Seçim listesinin sırası: seri numarası olanlar önce, sonra numaraya göre.
 * Kullanıcı listede aradığı numarayı tahmin edilebilir bir yerde bulmalı.
 */
export function siralaAdaylar(adaylar: AdayCihaz[]): AdayCihaz[] {
  return [...adaylar].sort((a, b) => {
    if (Boolean(a.seriNo) !== Boolean(b.seriNo)) return a.seriNo ? -1 : 1;
    if (a.seriNo && b.seriNo) return a.seriNo.localeCompare(b.seriNo, "tr");
    return a.id - b.id;
  });
}

/** Seçim listesinde bir cihazın etiketi. */
export function adayEtiketi(aday: AdayCihaz): string {
  return aday.seriNo ?? `(seri no yok · kayıt ${aday.id})`;
}

/** Seçim sorusunun başlığı. */
export function secimBasligi(aranan: string, adet: number): string {
  return `${aranan} barkodunda ${adet} uygun cihaz var. Hangisini işleme alalım?`;
}
