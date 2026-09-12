import type { CihazSatiri } from "./cihazFiltre";
import { kurusuTLYaz } from "./para";
import { STOK_DURUM_ETIKET, VADE_ETIKET, type StokDurum } from "./sabitler";
import { gunFarki, tarihYaz } from "./tarih";
import { vadeDurumu } from "./vade";

export const SUTUN_ANAHTARLARI = [
  "kategori",
  "altKategori",
  "girisTarihi",
  "marka",
  "model",
  "seriNo",
  "barkod",
  "magaza",
  "alisFiyati",
  "tedarikci",
  "vade",
  "not",
  "satisTarihi",
  "satisFiyati",
  "kar",
  "musteri",
  "satanKullanici",
  "bekleme",
  "durum",
] as const;

export type SutunAnahtari = (typeof SUTUN_ANAHTARLARI)[number];

export type SutunTanimi = {
  anahtar: SutunAnahtari;
  baslik: string;
  /** Sayısal/parasal sütunlar sağa yaslanır. */
  sagaYasli?: boolean;
  /** Kullanıcı tercihi yoksa görünür mü? */
  varsayilan: boolean;
  /** Hücre metni — hem tabloda hem Excel çıktısında kullanılır. */
  metin: (satir: CihazSatiri, bugun: Date) => string;
};

/** Cihaz stokta ne kadar süredir bekliyor (satıldıysa giriş–satış farkı). */
export function beklemeGunu(satir: CihazSatiri, bugun: Date): number {
  const bitis = satir.satisTarihi ?? satir.cikisTarihi ?? bugun;
  return Math.max(0, gunFarki(satir.girisTarihi, bitis));
}

/** Kâr = satış − alış. Satılmamış cihazda null. */
export function karKurus(satir: CihazSatiri): number | null {
  if (satir.satisFiyatiKurus === null || satir.satisFiyatiKurus === undefined) return null;
  return satir.satisFiyatiKurus - satir.alisFiyatiKurus;
}

export const SUTUNLAR: Record<SutunAnahtari, SutunTanimi> = {
  kategori: {
    anahtar: "kategori",
    baslik: "Kategori",
    varsayilan: true,
    metin: (s) => s.kategori.ad,
  },
  altKategori: {
    anahtar: "altKategori",
    baslik: "Alt Kategori",
    varsayilan: false,
    metin: (s) => s.altKategori?.ad ?? "",
  },
  girisTarihi: {
    anahtar: "girisTarihi",
    baslik: "Alış Tarihi",
    varsayilan: true,
    metin: (s) => tarihYaz(s.girisTarihi),
  },
  marka: { anahtar: "marka", baslik: "Marka", varsayilan: false, metin: (s) => s.marka },
  model: { anahtar: "model", baslik: "Model", varsayilan: true, metin: (s) => `${s.marka} ${s.model}`.trim() },
  seriNo: { anahtar: "seriNo", baslik: "Seri No / IMEI", varsayilan: true, metin: (s) => s.seriNo ?? "" },
  barkod: { anahtar: "barkod", baslik: "Barkod", varsayilan: false, metin: (s) => s.barkod ?? "" },
  magaza: { anahtar: "magaza", baslik: "Depo", varsayilan: true, metin: (s) => s.magaza.ad },
  alisFiyati: {
    anahtar: "alisFiyati",
    baslik: "Alış Fiyatı",
    sagaYasli: true,
    varsayilan: true,
    metin: (s) => kurusuTLYaz(s.alisFiyatiKurus),
  },
  tedarikci: {
    anahtar: "tedarikci",
    baslik: "Satıcı",
    varsayilan: true,
    metin: (s) => s.tedarikci?.ad ?? "",
  },
  vade: {
    anahtar: "vade",
    baslik: "Vade",
    varsayilan: true,
    metin: (s, bugun) => {
      const v = vadeDurumu(s.alisFaturasi, bugun);
      if (v.durum === "YOK") return VADE_ETIKET[0];
      return `${VADE_ETIKET[s.alisFaturasi?.vadeGun ?? 0] ?? ""} · ${v.etiket}`;
    },
  },
  not: { anahtar: "not", baslik: "Genel Not", varsayilan: true, metin: (s) => s.not ?? "" },
  satisTarihi: {
    anahtar: "satisTarihi",
    baslik: "Satış Tarihi",
    varsayilan: true,
    metin: (s) => tarihYaz(s.satisTarihi),
  },
  satisFiyati: {
    anahtar: "satisFiyati",
    baslik: "Satış Fiyatı",
    sagaYasli: true,
    varsayilan: true,
    metin: (s) => kurusuTLYaz(s.satisFiyatiKurus),
  },
  kar: {
    anahtar: "kar",
    baslik: "Kâr",
    sagaYasli: true,
    varsayilan: true,
    metin: (s) => kurusuTLYaz(karKurus(s)),
  },
  musteri: {
    anahtar: "musteri",
    baslik: "Alıcı",
    varsayilan: true,
    metin: (s) => s.musteri?.adSoyad ?? "",
  },
  satanKullanici: {
    anahtar: "satanKullanici",
    baslik: "Satan",
    varsayilan: false,
    metin: (s) => s.satanKullanici?.adSoyad ?? "",
  },
  bekleme: {
    anahtar: "bekleme",
    baslik: "Bekleme",
    sagaYasli: true,
    varsayilan: true,
    metin: (s, bugun) => `${beklemeGunu(s, bugun)} gün`,
  },
  durum: {
    anahtar: "durum",
    baslik: "Durum",
    varsayilan: true,
    metin: (s) => STOK_DURUM_ETIKET[s.durum as StokDurum] ?? s.durum,
  },
};

export const VARSAYILAN_SUTUNLAR: SutunAnahtari[] = SUTUN_ANAHTARLARI.filter(
  (a) => SUTUNLAR[a].varsayilan,
);

/** Kullanıcının kaydettiği sütun tercihini güvenle çözer. */
export function sutunTercihiniCoz(json: string | null | undefined): SutunAnahtari[] {
  if (!json) return VARSAYILAN_SUTUNLAR;
  try {
    const cozulen = JSON.parse(json);
    if (!Array.isArray(cozulen)) return VARSAYILAN_SUTUNLAR;
    const gecerli = cozulen.filter((a): a is SutunAnahtari =>
      SUTUN_ANAHTARLARI.includes(a as SutunAnahtari),
    );
    return gecerli.length ? gecerli : VARSAYILAN_SUTUNLAR;
  } catch {
    return VARSAYILAN_SUTUNLAR;
  }
}

/** Sütunları her zaman tanımlı sırada tutar (kullanıcı sırayı bozamaz). */
export function sutunlariSirala(secili: SutunAnahtari[]): SutunAnahtari[] {
  const kume = new Set(secili);
  return SUTUN_ANAHTARLARI.filter((a) => kume.has(a));
}
