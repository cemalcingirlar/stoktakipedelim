/**
 * Mağaza içi aktarım satışının (sat-geri al) sonradan düzeltilmesi ve geri
 * alınması.
 *
 * Bu satışların düzeltilecek bir yeri yoktu: satış kartı yalnız gerçek
 * satışları kapsıyor, cihaz sayfasında ise tek seçenek "Kaydı İptal Et"ti.
 * Kullanıcı satışı düzeltmek isteyip o düğmeye bastı ve cihazın KENDİSİ
 * iptal edildi, stoktan düştü (357929731362553, 23.11.2026).
 *
 * Düzeltme ve geri alma iz bırakıyor: neyin neyden neye değiştiği cihazın
 * tarihçesine ve işlem kaydına (SATIS_DUZENLE) yazılıyor.
 *
 * Bu dosya saf; yetki ve veritabanı eylemde.
 */
import { kurusuTLYazSembollu } from "./para";
import { ODEME_TIPI_ETIKET, type OdemeTipi } from "./sabitler";
import { tarihYaz } from "./tarih";

export type AktarimSatisDurumu = {
  musteriId: number | null;
  musteriAdi: string | null;
  satanKullaniciId: number;
  satanAdi: string;
  odemeTipi: string;
  satisTarihi: Date;
  satisFiyatiKurus: number;
  not: string | null;
};

const odeme = (t: string) => ODEME_TIPI_ETIKET[t as OdemeTipi] ?? t;
const musteri = (ad: string | null) => ad ?? "(müşterisiz)";
const notYaz = (n: string | null) => {
  const t = (n ?? "").trim();
  return t === "" ? "(boş)" : `"${t}"`;
};

/** Değişen alanlar, eski ve yeni değerleriyle; değişmeyen alan listede yok. */
export function aktarimSatisFarki(
  eski: AktarimSatisDurumu,
  yeni: AktarimSatisDurumu,
): string[] {
  const fark: string[] = [];
  if (eski.musteriId !== yeni.musteriId) {
    fark.push(`Müşteri: ${musteri(eski.musteriAdi)} → ${musteri(yeni.musteriAdi)}`);
  }
  if (eski.satanKullaniciId !== yeni.satanKullaniciId) {
    fark.push(`Satışı yapan: ${eski.satanAdi} → ${yeni.satanAdi}`);
  }
  if (eski.odemeTipi !== yeni.odemeTipi) {
    fark.push(`Ödeme tipi: ${odeme(eski.odemeTipi)} → ${odeme(yeni.odemeTipi)}`);
  }
  if (eski.satisTarihi.getTime() !== yeni.satisTarihi.getTime()) {
    fark.push(`Satış tarihi: ${tarihYaz(eski.satisTarihi)} → ${tarihYaz(yeni.satisTarihi)}`);
  }
  if (eski.satisFiyatiKurus !== yeni.satisFiyatiKurus) {
    fark.push(
      `Satış fiyatı: ${kurusuTLYazSembollu(eski.satisFiyatiKurus)} → ${kurusuTLYazSembollu(yeni.satisFiyatiKurus)}`,
    );
  }
  if ((eski.not ?? "").trim() !== (yeni.not ?? "").trim()) {
    fark.push(`Not: ${notYaz(eski.not)} → ${notYaz(yeni.not)}`);
  }
  return fark;
}

function kirp(metin: string, enCok: number): string {
  return metin.length > enCok ? `${metin.slice(0, enCok - 1)}…` : metin;
}

/** Tarihçeye ve işlem kaydına yazılan düzeltme satırı. */
export function aktarimDuzeltmeMetni(fark: string[], aciklama: string | null): string {
  const not = (aciklama ?? "").trim();
  return kirp(
    `Mağaza içi aktarım satışı düzeltildi: ${fark.join(" · ")}` +
      (not ? ` · açıklama: ${not}` : ""),
    900,
  );
}

export type MaliyetKarari =
  | { geriYukle: true; eskiKurus: number; yeniKurus: number }
  | { geriYukle: false; sebep: string | null };

/**
 * Satış geri alınınca cihazın alış fiyatı satış öncesine dönmeli mi?
 *
 * Sat-geri al, cihazın alış fiyatını geri alış fiyatına çekiyor
 * (maliyet -> yeni alış). Geri alınca eski maliyete dönmesi doğal; ama yalnız
 * iki koşulda güvenli:
 *   - bu, cihazın EN SON aktarım satışı (sonrakiler kendi fiyatını yazmış),
 *   - cihazın fiyatı hâlâ o satışın yazdığı fiyat (sonradan elle
 *     düzeltilmediyse).
 * Biri tutmuyorsa fiyata dokunulmuyor ve neden söyleniyor.
 */
export function maliyetKarari(girdi: {
  sonAktarimMi: boolean;
  cihazAlisKurus: number;
  satisYeniAlisKurus: number;
  satisMaliyetKurus: number;
}): MaliyetKarari {
  if (girdi.satisYeniAlisKurus === girdi.satisMaliyetKurus) {
    return { geriYukle: false, sebep: null }; // satış fiyatı değiştirmemişti
  }
  if (!girdi.sonAktarimMi) {
    return {
      geriYukle: false,
      sebep: "Bu satıştan sonra başka bir aktarım satışı var; alış fiyatına dokunulmadı.",
    };
  }
  if (girdi.cihazAlisKurus !== girdi.satisYeniAlisKurus) {
    return {
      geriYukle: false,
      sebep: "Alış fiyatı bu satıştan sonra ayrıca değiştirilmiş; dokunulmadı.",
    };
  }
  return {
    geriYukle: true,
    eskiKurus: girdi.cihazAlisKurus,
    yeniKurus: girdi.satisMaliyetKurus,
  };
}

/** Geri almanın tarihçe ve kayıt satırı. */
export function aktarimGeriAlmaMetni(girdi: {
  musteriAdi: string | null;
  satisFiyatiKurus: number;
  satisTarihi: Date;
  maliyet: MaliyetKarari;
  gerekce: string;
}): string {
  const parcalar = [
    `Mağaza içi aktarım satışı geri alındı (${musteri(girdi.musteriAdi)}, ` +
      `${kurusuTLYazSembollu(girdi.satisFiyatiKurus)}, ${tarihYaz(girdi.satisTarihi)})`,
  ];
  if (girdi.maliyet.geriYukle) {
    parcalar.push(
      `alış fiyatı ${kurusuTLYazSembollu(girdi.maliyet.eskiKurus)} → ${kurusuTLYazSembollu(girdi.maliyet.yeniKurus)}`,
    );
  } else if (girdi.maliyet.sebep) {
    parcalar.push(girdi.maliyet.sebep);
  }
  parcalar.push(`gerekçe: ${girdi.gerekce.trim()}`);
  return kirp(parcalar.join(" · "), 900);
}
