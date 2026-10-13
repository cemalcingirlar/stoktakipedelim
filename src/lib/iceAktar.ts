import "server-only";
import { desteklenmeyenTurMesaji, dosyaTuruBul } from "./dosyaTuru";
import { aramaNormalize, kodNormalize } from "./metin";
import { tlyiKurusaCevir } from "./para";
import {
  htmldenMatris,
  metindenMatris,
  xlsxtenMatris,
  xmlTablodanMatris,
  type Matris,
} from "./tablo";
import type { FaturaSatiriGirdisi } from "@/app/(uygulama)/faturalar/dogrulama";

/** Şablondaki sütun başlıkları — sıra değil, başlık adı esas alınır. */
export const ICE_AKTAR_SUTUNLARI = [
  "Kategori",
  "Alt Kategori",
  "Marka",
  "Model",
  "Renk",
  "Kapasite",
  "Seri No (IMEI)",
  "Barkod",
  "Alış Fiyatı (TL)",
  "Not",
] as const;

export type KategoriSecenegi = {
  id: number;
  ad: string;
  seriNoZorunlu: boolean;
  altKategoriler: { id: number; ad: string }[];
};

export type OkunanSatir = FaturaSatiriGirdisi & {
  /** Excel'deki satır numarası — hata mesajlarında kullanıcıya gösterilir. */
  excelSatiri: number;
  kategoriAdi: string;
  altKategoriAdi: string | null;
};

export type IceAktarSonucu = {
  satirlar: OkunanSatir[];
  hatalar: string[];
  /** Başlık satırı bulunamadıysa dosya şablona uymuyordur. */
  basliklarTamam: boolean;
};

function bosaNull(metin: string): string | null {
  return metin === "" ? null : metin;
}

/**
 * Yüklenen dosyayı biçimine göre satır/hücre matrisine çevirir.
 *
 * Yalnız uzantıya bakmıyoruz: portal çıktıları sık sık HTML tablosunu ya da
 * CSV'yi .xls adıyla veriyor, kullanıcı da dosyayı gerçek Excel sanıyor.
 * Desteklenmeyen biçimlerde (eski .xls, PDF) ne yapılacağını söyleyen bir
 * mesaj dönüyor.
 */
export async function dosyadanMatris(
  veri: ArrayBuffer,
): Promise<{ matris: Matris } | { hata: string }> {
  const bayt = new Uint8Array(veri);
  const tur = dosyaTuruBul(bayt);

  if (tur === "xlsx") return { matris: await xlsxtenMatris(veri) };

  if (tur === "html") {
    const metin = new TextDecoder("utf-8", { fatal: false }).decode(bayt);
    // Excel'in XML Spreadsheet çıktısı da bu dalda geliyor.
    const matris = metin.includes("<Row") ? xmlTablodanMatris(metin) : htmldenMatris(metin);
    if (matris.length > 0) return { matris };
    return { hata: desteklenmeyenTurMesaji("html") ?? "Dosya okunamadı." };
  }

  if (tur === "metin") {
    const metin = new TextDecoder("utf-8", { fatal: false }).decode(bayt);
    const matris = metindenMatris(metin);
    if (matris.length > 0) return { matris };
    return { hata: "Dosyada satır bulunamadı." };
  }

  return { hata: desteklenmeyenTurMesaji(tur) ?? "Dosya okunamadı." };
}

/**
 * Matrisi fatura satırlarına çevirir.
 *
 * Kategori ve alt kategori ada göre eşleştirilir (Türkçe büyük/küçük harf
 * duyarsız). Hiçbir şey veritabanına yazılmaz; çağıran taraf önce kullanıcıya
 * önizleme gösterir.
 */
export function matristenOku(
  matris: Matris,
  kategoriler: KategoriSecenegi[],
): IceAktarSonucu {
  if (matris.length === 0) {
    return { satirlar: [], hatalar: ["Dosyada sayfa bulunamadı."], basliklarTamam: false };
  }

  // Başlık satırını bul: "Marka" ve "Model" içeren ilk satır.
  let baslikSatirNo = 0;
  let sutunYeri: Record<string, number> = {};
  for (let i = 1; i <= Math.min(matris.length, 20); i++) {
    const yerler: Record<string, number> = {};
    matris[i - 1].forEach((hucre, indeks) => {
      const baslik = aramaNormalize(hucre);
      if (baslik) yerler[baslik] = indeks + 1;
    });
    if (yerler["marka"] && yerler["model"]) {
      baslikSatirNo = i;
      sutunYeri = yerler;
      break;
    }
  }

  if (baslikSatirNo === 0) {
    return {
      satirlar: [],
      hatalar: [
        "Başlık satırı bulunamadı. Dosyada 'Marka' ve 'Model' sütunları olmalı — şablonu indirip kullanın.",
      ],
      basliklarTamam: false,
    };
  }

  const yer = (baslik: string) => sutunYeri[aramaNormalize(baslik)] ?? 0;
  const oku = (satir: string[], baslik: string): string => {
    const sutunNo = yer(baslik);
    return sutunNo ? (satir[sutunNo - 1] ?? "").trim() : "";
  };

  const kategoriHarita = new Map(kategoriler.map((k) => [aramaNormalize(k.ad), k]));

  const satirlar: OkunanSatir[] = [];
  const hatalar: string[] = [];
  const gorulenSeriNolar = new Map<string, number>();

  for (let i = baslikSatirNo + 1; i <= matris.length; i++) {
    const satir = matris[i - 1];

    const marka = oku(satir, "Marka");
    const model = oku(satir, "Model");
    const kategoriAdi = oku(satir, "Kategori");
    const seriNoHam = oku(satir, "Seri No (IMEI)");
    const barkodHam = oku(satir, "Barkod");
    const fiyatHam = oku(satir, "Alış Fiyatı (TL)");
    const altKategoriAdi = oku(satir, "Alt Kategori");
    const renk = oku(satir, "Renk");
    const kapasite = oku(satir, "Kapasite");
    const not = oku(satir, "Not");

    // Tamamen boş satırları sessizce atla (Excel dosyaları sonda boş satır taşır).
    if (![marka, model, kategoriAdi, seriNoHam, barkodHam, fiyatHam].some((d) => d !== "")) {
      continue;
    }

    const satirHatalari: string[] = [];

    const kategori = kategoriHarita.get(aramaNormalize(kategoriAdi));
    if (!kategoriAdi) satirHatalari.push("Kategori boş.");
    else if (!kategori) satirHatalari.push(`"${kategoriAdi}" adında bir kategori yok.`);

    let altKategoriId: number | null = null;
    if (altKategoriAdi && kategori) {
      const alt = kategori.altKategoriler.find(
        (a) => aramaNormalize(a.ad) === aramaNormalize(altKategoriAdi),
      );
      if (!alt) {
        satirHatalari.push(`"${kategori.ad}" altında "${altKategoriAdi}" yok.`);
      } else {
        altKategoriId = alt.id;
      }
    }

    if (!marka) satirHatalari.push("Marka boş.");
    if (!model) satirHatalari.push("Model boş.");

    const seriNo = kodNormalize(seriNoHam);
    if (kategori?.seriNoZorunlu && !seriNo) {
      satirHatalari.push(`${kategori.ad} için seri no (IMEI) zorunlu.`);
    }
    if (seriNo) {
      const onceki = gorulenSeriNolar.get(seriNo);
      if (onceki) {
        satirHatalari.push(`Seri no ${seriNo} ${onceki}. satırda da var.`);
      } else {
        gorulenSeriNolar.set(seriNo, i);
      }
    }

    const fiyatKurus = fiyatHam === "" ? 0 : tlyiKurusaCevir(fiyatHam);
    if (fiyatKurus === null) {
      satirHatalari.push(`Alış fiyatı okunamadı: "${fiyatHam}".`);
    } else if (fiyatKurus < 0) {
      satirHatalari.push("Alış fiyatı negatif olamaz.");
    }

    if (satirHatalari.length > 0) {
      hatalar.push(`${i}. satır: ${satirHatalari.join(" ")}`);
      continue;
    }

    satirlar.push({
      excelSatiri: i,
      kategoriAdi: kategori!.ad,
      altKategoriAdi: altKategoriAdi || null,
      kategoriId: kategori!.id,
      altKategoriId,
      marka,
      model,
      renk: bosaNull(renk),
      kapasite: bosaNull(kapasite),
      seriNo: bosaNull(seriNo),
      barkod: bosaNull(kodNormalize(barkodHam)),
      alisFiyatiKurus: fiyatKurus ?? 0,
      not: bosaNull(not),
    });
  }

  if (satirlar.length === 0 && hatalar.length === 0) {
    hatalar.push("Dosyada cihaz satırı bulunamadı.");
  }

  return { satirlar, hatalar, basliklarTamam: true };
}

/**
 * Dosyayı okuyup satırlara çevirir — ekranların kullandığı giriş noktası.
 * Biçim ayrımı dosyadanMatris içinde, eşleme matristenOku içinde.
 */
export async function exceliOku(
  veri: ArrayBuffer,
  kategoriler: KategoriSecenegi[],
): Promise<IceAktarSonucu> {
  const sonuc = await dosyadanMatris(veri);
  if ("hata" in sonuc) {
    return { satirlar: [], hatalar: [sonuc.hata], basliklarTamam: false };
  }
  return matristenOku(sonuc.matris, kategoriler);
}
