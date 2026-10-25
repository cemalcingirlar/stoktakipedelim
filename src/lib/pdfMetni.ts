import "server-only";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * PDF'ten düz metin çıkarır.
 *
 * pdfjs (Firefox'un PDF motoru) kullanılıyor: font kodlamaları, ToUnicode
 * tabloları ve Türkçe karakterler kendi çözümleyicimizle doğru çıkmaz.
 * Modül ağır olduğu için yalnız PDF yüklendiğinde isteğe bağlı yükleniyor.
 *
 * Metin görsel sırada değil, PDF'in çizim sırasında gelir; okuyucular buna
 * göre yazılmalı (etiket arayıp değerini almak gibi), sabit satır numarasına
 * güvenilmemeli.
 */
/**
 * pdfjs'in paket içindeki veri klasörleri. Font gömmeyen PDF'lerde (standart
 * Helvetica/Times kullananlar) bunlar olmadan metin hiç çıkmıyor; bazı e-Fatura
 * çıktıları fontu gömmüyor.
 *
 * Yol require.resolve ile değil dosya sisteminden aranıyor: paketleyici
 * require.resolve çağrısını kendi modül numarasına çeviriyor ve çalışma anında
 * sayı dönüyor. Bulunamazsa undefined dönülüyor — gömülü fontlu PDF'ler yine
 * okunur, yalnız gömmeyenler okunamaz.
 */
function pdfjsVeriYollari(): {
  standardFontDataUrl?: string;
  cMapUrl?: string;
} {
  let dizin = process.cwd();
  for (let i = 0; i < 6; i++) {
    const kok = join(dizin, "node_modules", "pdfjs-dist");
    if (existsSync(join(kok, "standard_fonts"))) {
      // pdfjs klasör yolunun sonunda ayraç bekliyor.
      return {
        standardFontDataUrl: `${join(kok, "standard_fonts")}/`,
        cMapUrl: `${join(kok, "cmaps")}/`,
      };
    }
    const ust = dirname(dizin);
    if (ust === dizin) break;
    dizin = ust;
  }
  return {};
}

export async function pdfMetniCikar(veri: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const yollar = pdfjsVeriYollari();

  // pdfjs 6 ile iki değişiklik: `isEvalSupported` seçeneği kalktı (eval
  // desteği motordan tümden çıkarıldı, yani artık varsayılan olarak kapalı)
  // ve belge yerine YÜKLEME GÖREVİ kapatılıyor.
  const yukleme = pdfjs.getDocument({
    data: new Uint8Array(veri),
    // Sistem fontlarına ve harici kaynaklara gidilmesin: yüklenen dosya
    // güvenilmez, ağ isteği tetiklememeli.
    useSystemFonts: false,
    ...yollar,
    cMapPacked: true,
  });
  const belge = await yukleme.promise;

  try {
    const parcalar: string[] = [];
    for (let sayfaNo = 1; sayfaNo <= belge.numPages; sayfaNo++) {
      const sayfa = await belge.getPage(sayfaNo);
      const icerik = await sayfa.getTextContent();
      for (const oge of icerik.items) {
        if ("str" in oge) parcalar.push(oge.str);
      }
      sayfa.cleanup();
    }
    return parcalar.join("\n");
  } finally {
    await yukleme.destroy();
  }
}
