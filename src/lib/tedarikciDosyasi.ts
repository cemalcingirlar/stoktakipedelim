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
  faturaNo: ["fatura no", "faturano", "belge no"],
  eFaturaNo: ["e-fatura no", "efatura no", "e fatura no"],
  tarih: ["tarih", "fatura tarihi", "belge tarihi"],
  birimTutar: ["birim tutar", "birim fiyat", "tutar", "fiyat"],
  kur: ["kur", "doviz kuru"],
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
  faturaNo: string;
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
 * "8.604,17 TRY" veya "1.234,50 USD" gibi hücreden tutarı ayırır.
 * Para birimi kodu atılır; döviz ise kur ile çarpmak çağıranın işi.
 */
export function tutariCoz(ham: string): number | null {
  const temiz = ham.replace(/[^\d.,-]/g, "").trim();
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

  const hatalar: string[] = [];
  const gorulenSeriNolar = new Map<string, number>();
  // faturaNo -> barkod -> grup
  const faturaHarita = new Map<
    string,
    { tarih: Date | null; gruplar: Map<string, TedarikciUrunGrubu & { fiyatlar: number[] }> }
  >();

  for (let i = baslikSatirNo + 1; i <= sayfa.rowCount; i++) {
    const satir = sayfa.getRow(i);

    const seriNoHam = oku(satir, "seriNo");
    const barkodHam = oku(satir, "urunKodu");
    const urunAdi = oku(satir, "urunAdi");
    const marka = oku(satir, "marka");
    const adetHam = oku(satir, "adet");
    const faturaNoHam = oku(satir, "faturaNo");
    const tarihHam = oku(satir, "tarih");
    const tutarHam = oku(satir, "birimTutar");
    const kurHam = oku(satir, "kur");

    if (![seriNoHam, barkodHam, urunAdi, tutarHam].some((d) => d !== "")) continue;

    const satirHatalari: string[] = [];

    const barkod = kodNormalize(barkodHam);
    if (!barkod) satirHatalari.push("Ürün kodu boş.");

    const faturaNo = faturaNoHam.trim();
    if (!faturaNo) satirHatalari.push("Fatura no boş.");

    const seriNo = kodNormalize(seriNoHam) || null;
    if (seriNo) {
      const onceki = gorulenSeriNolar.get(seriNo);
      if (onceki) satirHatalari.push(`Seri no ${seriNo} ${onceki}. satırda da var.`);
      else gorulenSeriNolar.set(seriNo, i);
    }

    const birim = tutariCoz(tutarHam);
    if (birim === null) satirHatalari.push(`Birim tutar okunamadı: "${tutarHam}".`);

    // Kur boş veya 1 ise TL; değilse tutar dövizdir, TL'ye çevrilir.
    const kur = kurHam ? (tlyiKurusaCevir(kurHam.replace(/[^\d.,-]/g, "")) ?? 100) / 100 : 1;
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
      fatura = { tarih: tarihiCoz(tarihHam), gruplar: new Map() };
      faturaHarita.set(faturaNo, fatura);
    }
    if (!fatura.tarih) fatura.tarih = tarihiCoz(tarihHam);

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
    faturalar.push({ faturaNo, tarih: veriler.tarih, gruplar, cihazSayisi, toplamKurus });
  }
  faturalar.sort((a, b) => a.faturaNo.localeCompare(b.faturaNo, "tr"));

  if (faturalar.length === 0 && hatalar.length === 0) {
    hatalar.push("Dosyada cihaz satırı bulunamadı.");
  }

  return { faturalar, hatalar, basliklarTamam: true };
}
