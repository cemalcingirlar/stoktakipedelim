/**
 * Kaydedilmiş bir satışın, satış kartı üzerinden toplu düzeltilmesi.
 *
 * Tek cihazın satışı cihaz sayfasından düzeltilebiliyordu, ama kartın
 * tamamı (müşteri, satışı yapan, ödeme tipi, tarih, not ve bütün cihazların
 * fiyatları) tek yerden düzeltilemiyordu; çok cihazlı satışta her cihaza
 * ayrı ayrı girmek gerekiyor ve cihaz karttan kopuyordu.
 *
 * Düzeltme iz bırakıyor: NEYİN NEYDEN NEYE değiştiği işlem kaydına ve her
 * cihazın tarihçesine yazılıyor. "Satış düzeltildi" demek yetmez; sonradan
 * bakan kişi eski değeri de görebilmeli.
 *
 * Bu dosya saf: farkı ve metinleri üretiyor; yetki ve veritabanı eylemde.
 */
import { kurusuTLYazSembollu } from "./para";
import { ODEME_TIPI_ETIKET, type OdemeTipi } from "./sabitler";
import { gunFarki, gunOrtasi, tarihYaz } from "./tarih";

/** Tek cihazın satış fiyatı için üst sınır: 10 milyon TL. */
export const SATIS_FIYATI_EN_COK_KURUS = 1_000_000_000;

export const SATIS_NOTU_EN_COK = 300;

export type SatisKalemi = {
  id: number;
  /** Kayıtta görünecek ad: "INFINIX HOT 60i (3548…)". */
  etiket: string;
  satisFiyatiKurus: number;
};

export type SatisDurumu = {
  musteriId: number;
  musteriAdi: string;
  satanKullaniciId: number;
  satanAdi: string;
  odemeTipi: string;
  satisTarihi: Date;
  not: string | null;
  kalemler: SatisKalemi[];
};

function odemeEtiketi(tip: string): string {
  return ODEME_TIPI_ETIKET[tip as OdemeTipi] ?? tip;
}

function notYaz(not: string | null): string {
  const temiz = (not ?? "").trim();
  return temiz === "" ? "(boş)" : `"${temiz}"`;
}

/**
 * Yeni satış tarihi.
 *
 * Form yalnız gün veriyor. Gün değişmediyse eski damga AYNEN kalıyor: aksi
 * halde başka bir alanı düzeltmek satışın saatini silerdi. Gün değiştiyse
 * yeni günün öğlesi alınıyor (bkz. gunOrtasi: gece yarısı saat dilimine göre
 * komşu güne kayabiliyor).
 *
 * Gelecekteki bir gün reddediliyor: yarının satışı olmaz, genelde yıl ya da
 * ay yanlış yazılmıştır.
 */
export function yeniSatisTarihi(
  eski: Date,
  gun: string,
  simdi: Date = new Date(),
): { tamam: true; tarih: Date } | { tamam: false; hata: string } {
  const e = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gun.trim());
  if (!e) return { tamam: false, hata: "Satış tarihi geçersiz." };
  const [yil, ay, g] = [Number(e[1]), Number(e[2]), Number(e[3])];
  const yeni = gunOrtasi(yil, ay - 1, g);
  if (
    Number.isNaN(yeni.getTime()) ||
    yeni.getFullYear() !== yil ||
    yeni.getMonth() !== ay - 1 ||
    yeni.getDate() !== g
  ) {
    return { tamam: false, hata: "Satış tarihi geçersiz." };
  }
  if (gunFarki(simdi, yeni) > 0) {
    return { tamam: false, hata: "Satış tarihi bugünden ileri olamaz." };
  }
  if (gunFarki(eski, yeni) === 0) return { tamam: true, tarih: eski };
  return { tamam: true, tarih: yeni };
}

/** Satış fiyatı sorunu; yoksa null. */
export function satisFiyatiSorunu(kurus: unknown, etiket: string): string | null {
  if (typeof kurus !== "number" || !Number.isInteger(kurus)) {
    return `${etiket}: satış fiyatı okunamadı.`;
  }
  if (kurus < 0) return `${etiket}: satış fiyatı eksi olamaz.`;
  if (kurus > SATIS_FIYATI_EN_COK_KURUS) {
    return `${etiket}: satış fiyatı ${kurusuTLYazSembollu(SATIS_FIYATI_EN_COK_KURUS)} üstünde olamaz; bir sıfır fazla yazılmış olabilir.`;
  }
  return null;
}

/**
 * Gönderilen fiyatlar satışın cihazlarıyla birebir örtüşüyor mu?
 *
 * Eksik cihaz, fazladan (başka satışa ait) cihaz ya da tekrar eden kimlik
 * reddediliyor: form bayatlamış ya da elle değiştirilmiş demektir ve sessizce
 * "olanları güncelle" demek başka bir satışın cihazına dokunabilir.
 */
export function kalemlerOrtusuyorMu(
  satisKalemIdleri: number[],
  gonderilenIdler: number[],
): boolean {
  if (satisKalemIdleri.length !== gonderilenIdler.length) return false;
  const beklenen = new Set(satisKalemIdleri);
  const gelen = new Set(gonderilenIdler);
  if (gelen.size !== gonderilenIdler.length) return false;
  return [...beklenen].every((id) => gelen.has(id));
}

export type SatisFarki = {
  /** Kartın tamamını ilgilendiren değişiklikler (müşteri, satan, ödeme, tarih, not). */
  genel: string[];
  /** Fiyatı değişen cihazlar: kimlik -> "8.797,50 TL → 9.000,00 TL". */
  fiyatlar: Map<number, string>;
  /** Kimlik alanlarından biri değişti mi (cihaz satırları da güncellenmeli). */
  kimlikDegisti: boolean;
};

/** Eski ve yeni durum arasındaki fark; değişmeyen alan listeye girmiyor. */
export function satisFarki(eski: SatisDurumu, yeni: SatisDurumu): SatisFarki {
  const genel: string[] = [];
  let kimlikDegisti = false;

  if (eski.musteriId !== yeni.musteriId) {
    genel.push(`Müşteri: ${eski.musteriAdi} → ${yeni.musteriAdi}`);
    kimlikDegisti = true;
  }
  if (eski.satanKullaniciId !== yeni.satanKullaniciId) {
    genel.push(`Satışı yapan: ${eski.satanAdi} → ${yeni.satanAdi}`);
    kimlikDegisti = true;
  }
  if (eski.odemeTipi !== yeni.odemeTipi) {
    genel.push(
      `Ödeme tipi: ${odemeEtiketi(eski.odemeTipi)} → ${odemeEtiketi(yeni.odemeTipi)}`,
    );
    kimlikDegisti = true;
  }
  if (eski.satisTarihi.getTime() !== yeni.satisTarihi.getTime()) {
    genel.push(
      `Satış tarihi: ${tarihYaz(eski.satisTarihi)} → ${tarihYaz(yeni.satisTarihi)}`,
    );
    kimlikDegisti = true;
  }
  if ((eski.not ?? "").trim() !== (yeni.not ?? "").trim()) {
    genel.push(`Not: ${notYaz(eski.not)} → ${notYaz(yeni.not)}`);
  }

  const fiyatlar = new Map<number, string>();
  const yeniFiyat = new Map(yeni.kalemler.map((k) => [k.id, k.satisFiyatiKurus]));
  for (const k of eski.kalemler) {
    const y = yeniFiyat.get(k.id);
    if (y !== undefined && y !== k.satisFiyatiKurus) {
      fiyatlar.set(
        k.id,
        `${kurusuTLYazSembollu(k.satisFiyatiKurus)} → ${kurusuTLYazSembollu(y)}`,
      );
    }
  }

  return { genel, fiyatlar, kimlikDegisti };
}

export function farkVarMi(fark: SatisFarki): boolean {
  return fark.genel.length > 0 || fark.fiyatlar.size > 0;
}

function kirp(metin: string, enCok: number): string {
  return metin.length > enCok ? `${metin.slice(0, enCok - 1)}…` : metin;
}

/**
 * İşlem kaydına yazılan satır: satış numarası + bütün değişiklikler.
 * Açıklama verilmişse sona ekleniyor.
 */
export function satisLogDetayi(
  satisNo: string,
  eski: SatisDurumu,
  fark: SatisFarki,
  aciklama: string | null,
): string {
  const parcalar = [...fark.genel];
  for (const k of eski.kalemler) {
    const f = fark.fiyatlar.get(k.id);
    if (f) parcalar.push(`${k.etiket} satış fiyatı: ${f}`);
  }
  const not = (aciklama ?? "").trim();
  return kirp(
    `Satış düzeltildi (${satisNo}): ${parcalar.join(" · ")}` +
      (not ? ` · açıklama: ${not}` : ""),
    1500,
  );
}

/**
 * Bir cihazın tarihçesine yazılan satır; o cihazı ilgilendiren bir değişiklik
 * yoksa null.
 *
 * Genel değişiklikler her cihaza, fiyat değişikliği yalnız kendi cihazına
 * yazılıyor: üç cihazlık satışta birinin fiyatı düzeltildiğinde diğer ikisinin
 * tarihçesine "fiyat değişti" düşmemeli.
 */
export function kalemTarihceMetni(
  kalemId: number,
  satisNo: string,
  fark: SatisFarki,
  aciklama: string | null,
): string | null {
  // Not kartın kendisinde; cihazın tarihçesini ilgilendirmiyor.
  const genel = fark.genel.filter((g) => !g.startsWith("Not: "));
  const fiyat = fark.fiyatlar.get(kalemId);
  const parcalar = [...genel, ...(fiyat ? [`Satış fiyatı: ${fiyat}`] : [])];
  if (parcalar.length === 0) return null;
  const not = (aciklama ?? "").trim();
  return kirp(
    `Satış düzeltildi (${satisNo}): ${parcalar.join(" · ")}` +
      (not ? ` · açıklama: ${not}` : ""),
    900,
  );
}
