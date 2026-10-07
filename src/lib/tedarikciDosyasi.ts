import ExcelJS from "exceljs";
import { aramaNormalize, kodNormalize } from "./metin";
import { tlyiKurusaCevir } from "./para";

/**
 * Tedarikçi portalından indirilen "Seri No Kontrolü" Excel dosyasını okur.
 *
 * Dosya her satırda bir cihaz taşır: seri no, ürün kodu (barkod), ürün adı,
 * marka, adet, fatura no, tarih, birim tutar ve kur. Kategori bilgisi dosyada
 * olmadığı için burada belirlenmez; çağıran taraf barkod geçmişinden bulur ya
 * da kullanıcıya sorar.
 *
 * Sütunlar sıraya göre değil başlık adına göre bulunur; portal sütun ekler
 * veya yerini değiştirirse okuma bozulmaz.
 */

/** Bir başlığın kabul edilen yazımları — ilk eşleşen sütun kullanılır. */
const BASLIK_ESLERI = {
  seriNo: ["seri no", "serino", "seri numarasi", "imei"],
  urunKodu: ["urun kodu", "urunkodu", "barkod", "stok kodu", "malzeme kodu"],
  urunAdi: ["urun adi", "urunadi", "aciklama", "malzeme adi"],
  marka: ["marka"],
  adet: ["adet", "miktar"],
  // Portal "Fatura No" sütununa sipariş numarasını, "E-Fatura No" sütununa
  // asıl fatura numarasını yazıyor. Fatura numarası olarak e-fatura no
  // kullanılır; sipariş no kayda not olarak düşülür.
  siparisNo: ["fatura no", "faturano", "siparis no", "belge no"],
  faturaNo: ["e-fatura no", "efatura no", "e fatura no", "e-fatura"],
  tarih: ["tarih", "fatura tarihi", "belge tarihi"],
  birimTutar: ["birim tutar", "birim fiyat", "tutar", "fiyat"],
  kur: ["kur", "doviz kuru"],
  dovizTipi: ["doviz tipi", "doviz", "para birimi"],
} as const;

type BaslikAnahtari = keyof typeof BASLIK_ESLERI;

export type TedarikciCihazi = {
  excelSatiri: number;
  seriNo: string | null;
  barkod: string;
  urunAdi: string;
  marka: string;
  alisFiyatiKurus: number;
};

export type TedarikciUrunGrubu = {
  barkod: string;
  urunAdi: string;
  marka: string;
  /** Satırlardaki birim tutar — grupta farklıysa en sık görülen alınır. */
  alisFiyatiKurus: number;
  /** Grup içinde farklı birim tutar varsa kullanıcı uyarılır. */
  fiyatFarkliMi: boolean;
  cihazlar: TedarikciCihazi[];
};

export type TedarikciFaturasi = {
  /** Asıl fatura numarası (dosyadaki E-Fatura No sütunu). */
  faturaNo: string;
  /** Tedarikçinin sipariş numarası (dosyadaki Fatura No sütunu). */
  siparisNo: string;
  /** Dosyadaki para birimi kodu; TRY dışındaysa tutarlar kurla çevrilmiştir. */
  dovizTipi: string;
  /** Dosyadaki tarih; okunamadıysa null. */
  tarih: Date | null;
  gruplar: TedarikciUrunGrubu[];
  cihazSayisi: number;
  toplamKurus: number;
};

export type TedarikciDosyaSonucu = {
  faturalar: TedarikciFaturasi[];
  hatalar: string[];
  /** Başlık satırı bulunamadıysa dosya bu portalın çıktısı değildir. */
  basliklarTamam: boolean;
};

function hucreMetni(deger: ExcelJS.CellValue): string {
  if (deger === null || deger === undefined) return "";
  if (typeof deger === "string") return deger.trim();
  if (typeof deger === "number" || typeof deger === "boolean") return String(deger);
  if (deger instanceof Date) return deger.toISOString();
  if (typeof deger === "object") {
    if ("text" in deger && typeof deger.text === "string") return deger.text.trim();
    if ("result" in deger) return hucreMetni(deger.result as ExcelJS.CellValue);
    if ("richText" in deger && Array.isArray(deger.richText)) {
      return deger.richText.map((p) => p.text).join("").trim();
    }
  }
  return String(deger).trim();
}

/**
 * Tutar hücresini kuruşa çevirir.
 *
 * Hücre gerçek bir sayıysa (portal böyle veriyor: 11250, 0.08) doğrudan
 * çarpılır — metne çevirip binlik/ondalık tahmini yapmak "9.750" gibi
 * değerlerde yanlış sonuç verebilir. Metinse ("8.604,17 TRY") para birimi
 * kodu atılıp Türkçe biçim çözümleyicisine verilir.
 */
export function tutariCoz(ham: ExcelJS.CellValue | string): number | null {
  if (typeof ham === "number") {
    return Number.isFinite(ham) ? Math.round(ham * 100) : null;
  }
  const metin = typeof ham === "string" ? ham : hucreMetni(ham);
  const temiz = metin.replace(/[^\d.,-]/g, "").trim();
  if (!temiz) return null;
  return tlyiKurusaCevir(temiz);
}

/** "06.10.2026", "2026-10-06" ve Excel'in Date hücresini çözer. */
export function tarihiCoz(ham: string): Date | null {
  if (!ham) return null;

  const noktali = ham.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (noktali) {
    const [, gun, ay, yil] = noktali;
    const d = new Date(Number(yil), Number(ay) - 1, Number(gun));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(ham);
  if (Number.isNaN(d.getTime())) return null;
  // ISO dizesi gece yarısı UTC olarak gelir; yerel güne sabitle.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Marka sütunu olmayan dosyalarda ürün adının ilk kelimesi marka kabul edilir
 * ("Huawei MatePad 11.5..." -> "Huawei"). Boşsa çağıran bir yer tutucu koyar.
 */
export function markayiTuret(urunAdi: string): string {
  const ilk = urunAdi.trim().split(/\s+/)[0] ?? "";
  return ilk.replace(/[^\p{L}\p{N}&.-]/gu, "");
}

/** Bir dizideki en sık görülen değeri döner. */
function enSikDeger(sayilar: number[]): number {
  const sayac = new Map<number, number>();
  for (const s of sayilar) sayac.set(s, (sayac.get(s) ?? 0) + 1);
  let enIyi = sayilar[0] ?? 0;
  let enCok = 0;
  for (const [deger, adet] of sayac) {
    if (adet > enCok) {
      enCok = adet;
      enIyi = deger;
    }
  }
  return enIyi;
}

export async function tedarikciDosyasiniOku(veri: ArrayBuffer): Promise<TedarikciDosyaSonucu> {
  const kitap = new ExcelJS.Workbook();
  await kitap.xlsx.load(veri);

  const sayfa = kitap.worksheets[0];
  if (!sayfa) {
    return { faturalar: [], hatalar: ["Dosyada sayfa bulunamadı."], basliklarTamam: false };
  }

  // Başlık satırı: seri no ve ürün kodu sütunlarını birlikte taşıyan ilk satır.
  let baslikSatirNo = 0;
  let yer: Partial<Record<BaslikAnahtari, number>> = {};

  for (let i = 1; i <= Math.min(sayfa.rowCount, 30); i++) {
    const bulunan: Partial<Record<BaslikAnahtari, number>> = {};
    sayfa.getRow(i).eachCell({ includeEmpty: false }, (hucre, sutunNo) => {
      const metin = aramaNormalize(hucreMetni(hucre.value));
      if (!metin) return;
      for (const [anahtar, esler] of Object.entries(BASLIK_ESLERI) as [
        BaslikAnahtari,
        readonly string[],
      ][]) {
        if (bulunan[anahtar]) continue;
        if (esler.some((e) => metin === e || metin.startsWith(e))) bulunan[anahtar] = sutunNo;
      }
    });
    if (bulunan.seriNo && bulunan.urunKodu) {
      baslikSatirNo = i;
      yer = bulunan;
      break;
    }
  }

  if (baslikSatirNo === 0) {
    return {
      faturalar: [],
      hatalar: [
        "Başlık satırı bulunamadı. Dosyada 'Seri No' ve 'Ürün Kodu' sütunları olmalı — " +
          "tedarikçi portalındaki 'Excel'e Aktar' çıktısını olduğu gibi yükleyin.",
      ],
      basliklarTamam: false,
    };
  }

  const oku = (satir: ExcelJS.Row, anahtar: BaslikAnahtari): string => {
    const sutunNo = yer[anahtar];
    return sutunNo ? hucreMetni(satir.getCell(sutunNo).value) : "";
  };
  /** Ham hücre değeri — sayısal hücreler metne çevrilmeden kullanılsın diye. */
  const hamOku = (satir: ExcelJS.Row, anahtar: BaslikAnahtari): ExcelJS.CellValue => {
    const sutunNo = yer[anahtar];
    return sutunNo ? satir.getCell(sutunNo).value : null;
  };

  const hatalar: string[] = [];
  const gorulenSeriNolar = new Map<string, number>();
  // faturaNo -> barkod -> grup
  const faturaHarita = new Map<
    string,
    {
      tarih: Date | null;
      siparisNo: string;
      dovizTipi: string;
      gruplar: Map<string, TedarikciUrunGrubu & { fiyatlar: number[] }>;
    }
  >();

  for (let i = baslikSatirNo + 1; i <= sayfa.rowCount; i++) {
    const satir = sayfa.getRow(i);

    const seriNoHam = oku(satir, "seriNo");
    const barkodHam = oku(satir, "urunKodu");
    const urunAdi = oku(satir, "urunAdi");
    const markaHam = oku(satir, "marka");
    const adetHam = oku(satir, "adet");
    const faturaNoHam = oku(satir, "faturaNo");
    const siparisNoHam = oku(satir, "siparisNo");
    const tarihHam = oku(satir, "tarih");
    const tutarHam = oku(satir, "birimTutar");
    const kurHam = oku(satir, "kur");
    const dovizTipi = oku(satir, "dovizTipi").trim().toUpperCase() || "TRY";

    if (![seriNoHam, barkodHam, urunAdi, tutarHam].some((d) => d !== "")) continue;

    const satirHatalari: string[] = [];

    const barkod = kodNormalize(barkodHam);
    if (!barkod) satirHatalari.push("Ürün kodu boş.");

    // Marka sütunu olmayan dosyalarda ürün adının ilk kelimesi kullanılır.
    const marka = markaHam.trim() || markayiTuret(urunAdi);

    // Asıl fatura numarası e-fatura no; yoksa sipariş numarasına düşülür.
    const siparisNo = siparisNoHam.trim();
    const faturaNo = faturaNoHam.trim() || siparisNo;
    if (!faturaNo) satirHatalari.push("Fatura no ve e-fatura no boş.");

    const seriNo = kodNormalize(seriNoHam) || null;
    if (seriNo) {
      const onceki = gorulenSeriNolar.get(seriNo);
      if (onceki) satirHatalari.push(`Seri no ${seriNo} ${onceki}. satırda da var.`);
      else gorulenSeriNolar.set(seriNo, i);
    }

    const birim = tutariCoz(hamOku(satir, "birimTutar"));
    if (birim === null) satirHatalari.push(`Birim tutar okunamadı: "${tutarHam}".`);

    // Kur boş veya 1 ise TL; değilse tutar dövizdir, TL'ye çevrilir.
    const kurKurus = kurHam ? tutariCoz(hamOku(satir, "kur")) : 100;
    const kur = (kurKurus ?? 100) / 100;
    if (kur <= 0) satirHatalari.push(`Kur okunamadı: "${kurHam}".`);

    const adet = adetHam ? Number(adetHam.replace(/[^\d]/g, "")) || 1 : 1;
    if (seriNo && adet !== 1) {
      satirHatalari.push(`Seri numaralı satırda adet 1 olmalı, ${adet} yazıyor.`);
    }

    if (satirHatalari.length > 0) {
      hatalar.push(`${i}. satır: ${satirHatalari.join(" ")}`);
      continue;
    }

    const fiyatKurus = Math.round(birim! * kur);

    let fatura = faturaHarita.get(faturaNo);
    if (!fatura) {
      fatura = { tarih: tarihiCoz(tarihHam), siparisNo, dovizTipi, gruplar: new Map() };
      faturaHarita.set(faturaNo, fatura);
    }
    if (!fatura.tarih) fatura.tarih = tarihiCoz(tarihHam);
    if (!fatura.siparisNo) fatura.siparisNo = siparisNo;

    let grup = fatura.gruplar.get(barkod);
    if (!grup) {
      grup = {
        barkod,
        urunAdi,
        marka,
        alisFiyatiKurus: fiyatKurus,
        fiyatFarkliMi: false,
        cihazlar: [],
        fiyatlar: [],
      };
      fatura.gruplar.set(barkod, grup);
    }
    grup.fiyatlar.push(fiyatKurus);

    // Seri numarası yoksa adet kadar cihaz açılır (aksesuar kalemleri böyle gelir).
    const kac = seriNo ? 1 : Math.max(1, Math.min(500, adet));
    for (let k = 0; k < kac; k++) {
      grup.cihazlar.push({
        excelSatiri: i,
        seriNo,
        barkod,
        urunAdi,
        marka,
        alisFiyatiKurus: fiyatKurus,
      });
    }
  }

  const faturalar: TedarikciFaturasi[] = [];
  for (const [faturaNo, veriler] of faturaHarita) {
    const gruplar: TedarikciUrunGrubu[] = [];
    for (const grup of veriler.gruplar.values()) {
      const { fiyatlar, ...kalan } = grup;
      const tekFiyat = enSikDeger(fiyatlar);
      gruplar.push({
        ...kalan,
        alisFiyatiKurus: tekFiyat,
        fiyatFarkliMi: fiyatlar.some((f) => f !== tekFiyat),
      });
    }
    gruplar.sort((a, b) => a.urunAdi.localeCompare(b.urunAdi, "tr"));

    const cihazSayisi = gruplar.reduce((t, g) => t + g.cihazlar.length, 0);
    const toplamKurus = gruplar.reduce(
      (t, g) => t + g.alisFiyatiKurus * g.cihazlar.length,
      0,
    );
    faturalar.push({
      faturaNo,
      siparisNo: veriler.siparisNo,
      dovizTipi: veriler.dovizTipi,
      tarih: veriler.tarih,
      gruplar,
      cihazSayisi,
      toplamKurus,
    });
  }
  faturalar.sort((a, b) => a.faturaNo.localeCompare(b.faturaNo, "tr"));

  if (faturalar.length === 0 && hatalar.length === 0) {
    hatalar.push("Dosyada cihaz satırı bulunamadı.");
  }

  return { faturalar, hatalar, basliklarTamam: true };
}
