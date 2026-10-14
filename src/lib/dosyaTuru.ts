/**
 * Yüklenen dosyanın gerçek türünü içeriğinden tanır.
 *
 * Uzantıya güvenmek yetmiyor: portal çıktıları sık sık yanlış uzantıyla
 * geliyor (HTML tablosu .xls adıyla, .xlsx aslında eski .xls, vb.). Tür
 * yanlış anlaşılırsa kullanıcı "dosya okunamadı" gibi bir mesajla kalıyor ve
 * ne yapması gerektiğini bilemiyor.
 */

export type DosyaTuru =
  /** Gerçek .xlsx — zip kabı (PK). exceljs okuyabilir. */
  | "xlsx"
  /** Eski Excel biçimi (.xls, OLE2 kabı). exceljs okuyamaz. */
  | "xls"
  | "pdf"
  /** .xls adıyla gelen HTML tablosu — web dışa aktarımlarında yaygın. */
  | "html"
  /** Düz metin: CSV / TSV / noktalı virgülle ayrılmış. */
  | "metin"
  | "bilinmiyor";

const IMZALAR: { tur: DosyaTuru; bayt: number[] }[] = [
  { tur: "xlsx", bayt: [0x50, 0x4b, 0x03, 0x04] }, // PK..  (zip)
  { tur: "xlsx", bayt: [0x50, 0x4b, 0x05, 0x06] }, // boş zip
  { tur: "xls", bayt: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }, // OLE2
  { tur: "pdf", bayt: [0x25, 0x50, 0x44, 0x46] }, // %PDF
];

function imzaEslesir(veri: Uint8Array, bayt: number[]): boolean {
  if (veri.length < bayt.length) return false;
  return bayt.every((b, i) => veri[i] === b);
}

/** Baştaki BOM ve boşlukları atlayarak ilk anlamlı karakterleri verir. */
function basMetni(veri: Uint8Array, uzunluk = 1024): string {
  let bas = 0;
  // UTF-8 BOM
  if (veri[0] === 0xef && veri[1] === 0xbb && veri[2] === 0xbf) bas = 3;
  const dilim = veri.subarray(bas, bas + uzunluk);
  return new TextDecoder("utf-8", { fatal: false }).decode(dilim).trimStart();
}

/** Baytların tamamı yazdırılabilir metin mi? İkili dosyaları ayırmak için. */
function metinGibiMi(veri: Uint8Array): boolean {
  const ornek = veri.subarray(0, Math.min(veri.length, 4096));
  if (ornek.length === 0) return false;
  let ikili = 0;
  for (const b of ornek) {
    // Satır sonu, sekme ve taşıma dışındaki kontrol karakterleri ikili işareti.
    if (b === 0x09 || b === 0x0a || b === 0x0d) continue;
    if (b < 0x20 || b === 0x7f) ikili += 1;
  }
  return ikili / ornek.length < 0.01;
}

export function dosyaTuruBul(veri: Uint8Array): DosyaTuru {
  for (const { tur, bayt } of IMZALAR) {
    if (imzaEslesir(veri, bayt)) return tur;
  }

  const bas = basMetni(veri).toLowerCase();
  if (bas.startsWith("<!doctype html") || bas.startsWith("<html") || bas.startsWith("<table")) {
    return "html";
  }
  // Excel'in "XML Spreadsheet 2003" çıktısı da .xls adıyla geliyor.
  if (bas.startsWith("<?xml") && bas.includes("urn:schemas-microsoft-com:office:spreadsheet")) {
    return "html";
  }

  if (metinGibiMi(veri)) return "metin";
  return "bilinmiyor";
}

/**
 * Tür desteklenmiyorsa kullanıcıya ne yapacağını söyleyen mesaj; destekliyorsa
 * null. Mesajlar "dosya okunamadı"dan farklı olarak çıkış yolunu gösteriyor.
 */
export function desteklenmeyenTurMesaji(tur: DosyaTuru): string | null {
  switch (tur) {
    case "xlsx":
      return null;
    case "xls":
      return (
        "Bu dosya eski Excel biçiminde (.xls). Excel'de açıp " +
        "Dosya → Farklı Kaydet → tür olarak “Excel Çalışma Kitabı (*.xlsx)” seçip " +
        "kaydedin, sonra o dosyayı yükleyin."
      );
    case "pdf":
      return (
        "PDF dosyası yüklenemiyor. PDF'te satırlar tablo olarak değil çizim olarak " +
        "durduğu için adet ve fiyatlar güvenilir okunamaz. Tedarikçinizden aynı " +
        "faturanın Excel çıktısını isteyin."
      );
    case "html":
      return (
        "Bu dosya .xls adıyla gelmiş ama içeriği bir web sayfası (HTML tablosu). " +
        "Excel'de açıp Farklı Kaydet → “Excel Çalışma Kitabı (*.xlsx)” ile " +
        "kaydedin, sonra yükleyin."
      );
    case "metin":
      return (
        "Bu dosya düz metin (CSV) görünüyor. Excel'de açıp Farklı Kaydet → " +
        "“Excel Çalışma Kitabı (*.xlsx)” ile kaydedin, sonra yükleyin."
      );
    default:
      return "Dosya türü tanınamadı. Şablonu indirip doldurduğunuz .xlsx dosyasını yükleyin.";
  }
}
