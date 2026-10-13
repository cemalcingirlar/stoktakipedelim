import ExcelJS from "exceljs";

/**
 * Farklı dosya biçimlerini tek bir satır/hücre matrisine çevirir.
 *
 * İçe aktarma mantığı (başlık eşleme, doğrulama) matris üzerinde çalışıyor;
 * böylece yeni bir biçim eklemek yalnız yeni bir okuyucu yazmak demek oluyor,
 * eşleme kodu tekrarlanmıyor.
 */
export type Matris = string[][];

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
    if ("hyperlink" in deger && "text" in deger) return String(deger.text ?? "").trim();
  }
  return String(deger).trim();
}

/** Gerçek .xlsx dosyasını matrise çevirir. */
export async function xlsxtenMatris(veri: ArrayBuffer): Promise<Matris> {
  const kitap = new ExcelJS.Workbook();
  await kitap.xlsx.load(veri);
  const sayfa = kitap.worksheets[0];
  if (!sayfa) return [];

  const matris: Matris = [];
  for (let i = 1; i <= sayfa.rowCount; i++) {
    const satir = sayfa.getRow(i);
    const hucreler: string[] = [];
    // Boş hücreler de yerini korumalı, yoksa sütunlar kayar.
    for (let s = 1; s <= sayfa.columnCount; s++) {
      hucreler.push(hucreMetni(satir.getCell(s).value));
    }
    matris.push(hucreler);
  }
  return matris;
}

/** Satırdaki ayırıcıyı tahmin eder: Türkçe Excel CSV'yi noktalı virgülle yazar. */
export function ayiriciBul(metin: string): string {
  const ilkSatir = metin.split(/\r?\n/).find((s) => s.trim() !== "") ?? "";
  const sayac = [
    { ayirici: ";", adet: (ilkSatir.match(/;/g) ?? []).length },
    { ayirici: "\t", adet: (ilkSatir.match(/\t/g) ?? []).length },
    { ayirici: ",", adet: (ilkSatir.match(/,/g) ?? []).length },
  ];
  sayac.sort((a, b) => b.adet - a.adet);
  return sayac[0].adet > 0 ? sayac[0].ayirici : ";";
}

/**
 * CSV / TSV metnini matrise çevirir. Tırnak içindeki ayırıcılar ve satır
 * sonları korunur; iki tırnak ("") tek tırnak olarak okunur.
 */
export function metindenMatris(metin: string, ayirici = ayiriciBul(metin)): Matris {
  const matris: Matris = [];
  let satir: string[] = [];
  let hucre = "";
  let tirnakta = false;

  for (let i = 0; i < metin.length; i++) {
    const k = metin[i];

    if (tirnakta) {
      if (k === '"') {
        if (metin[i + 1] === '"') {
          hucre += '"';
          i += 1;
        } else {
          tirnakta = false;
        }
      } else {
        hucre += k;
      }
      continue;
    }

    if (k === '"') {
      tirnakta = true;
    } else if (k === ayirici) {
      satir.push(hucre.trim());
      hucre = "";
    } else if (k === "\n") {
      satir.push(hucre.trim());
      matris.push(satir);
      satir = [];
      hucre = "";
    } else if (k === "\r") {
      // \r\n ikilisinde \n işi bitiriyor; tek başına \r de satır sonu sayılır.
      if (metin[i + 1] !== "\n") {
        satir.push(hucre.trim());
        matris.push(satir);
        satir = [];
        hucre = "";
      }
    } else {
      hucre += k;
    }
  }

  if (hucre !== "" || satir.length > 0) {
    satir.push(hucre.trim());
    matris.push(satir);
  }

  // Tamamen boş satırlar sütun eşlemesini bozmasın.
  return matris.filter((s) => s.some((h) => h !== ""));
}

const VARLIKLAR: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function varlikCoz(metin: string): string {
  return metin
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (e) => VARLIKLAR[e] ?? e)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/**
 * HTML tablosunu matrise çevirir. Web dışa aktarımları sık sık HTML tablosunu
 * .xls adıyla veriyor; Excel bunu açabildiği için kullanıcı dosyayı gerçek
 * Excel sanıyor. En çok satır içeren tablo veri tablosu kabul edilir —
 * sayfadaki başlık/menü tabloları küçük olur.
 */
export function htmldenMatris(metin: string): Matris {
  const tablolar = metin.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  let enIyi: Matris = [];

  for (const tablo of tablolar) {
    const satirlar = tablo.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    const matris: Matris = [];
    for (const satir of satirlar) {
      const hucreler = satir.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? [];
      const degerler = hucreler.map((h) =>
        varlikCoz(
          h
            .replace(/<br\s*\/?>/gi, " ")
            .replace(/<[^>]*>/g, "")
            .replace(/\s+/g, " "),
        ).trim(),
      );
      if (degerler.length > 0) matris.push(degerler);
    }
    if (matris.length > enIyi.length) enIyi = matris;
  }

  return enIyi;
}

/**
 * Excel'in "XML Spreadsheet 2003" çıktısı (.xml / .xls adıyla gelir).
 * Hücreler <Cell><Data>…</Data></Cell>, satırlar <Row> içinde.
 */
export function xmlTablodanMatris(metin: string): Matris {
  const satirlar = metin.match(/<Row[\s\S]*?<\/Row>/gi) ?? [];
  const matris: Matris = [];
  for (const satir of satirlar) {
    const hucreler = satir.match(/<Cell[\s\S]*?<\/Cell>/gi) ?? [];
    const degerler = hucreler.map((h) => {
      const veri = h.match(/<Data[^>]*>([\s\S]*?)<\/Data>/i);
      return varlikCoz((veri?.[1] ?? "").replace(/<[^>]*>/g, "")).trim();
    });
    matris.push(degerler);
  }
  return matris.filter((s) => s.some((h) => h !== ""));
}
