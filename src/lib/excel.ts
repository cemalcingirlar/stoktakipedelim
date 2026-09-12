import "server-only";
import ExcelJS from "exceljs";

export type ExcelSutunu = {
  baslik: string;
  genislik?: number;
  /** Sayısal hücreler sağa yaslanır ve binlik ayıraçla biçimlenir. */
  sayisal?: boolean;
};

export type ExcelSayfasi = {
  ad: string;
  /** Tablonun üstüne yazılan başlık satırları (özet bilgiler). */
  ustBilgiler?: string[];
  sutunlar: ExcelSutunu[];
  satirlar: (string | number | null)[][];
};

const BASLIK_DOLGU = "FF1E293B"; // slate-800

/**
 * Verilen sayfalardan bir .xlsx dosyası üretir.
 * Türkçe karakterler ve kuruş biçimi için tek merkezden biçimlendirme yapar.
 */
export async function excelUret(sayfalar: ExcelSayfasi[]): Promise<Buffer> {
  const kitap = new ExcelJS.Workbook();
  kitap.creator = "Stok Takip";
  kitap.created = new Date();

  for (const sayfaTanimi of sayfalar) {
    // Excel sayfa adında bu karakterler kullanılamaz.
    const guvenliAd = sayfaTanimi.ad.replace(/[*?:/\\[\]]/g, "-").slice(0, 31);
    const sayfa = kitap.addWorksheet(guvenliAd, {
      views: [{ state: "frozen", ySplit: (sayfaTanimi.ustBilgiler?.length ?? 0) + 1 }],
    });

    for (const bilgi of sayfaTanimi.ustBilgiler ?? []) {
      const satir = sayfa.addRow([bilgi]);
      satir.font = { bold: true, size: 11 };
      sayfa.mergeCells(satir.number, 1, satir.number, Math.max(1, sayfaTanimi.sutunlar.length));
    }

    const baslikSatiri = sayfa.addRow(sayfaTanimi.sutunlar.map((s) => s.baslik));
    baslikSatiri.font = { bold: true, color: { argb: "FFFFFFFF" } };
    baslikSatiri.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BASLIK_DOLGU } };
    baslikSatiri.alignment = { vertical: "middle" };

    for (const satir of sayfaTanimi.satirlar) {
      sayfa.addRow(satir);
    }

    sayfaTanimi.sutunlar.forEach((sutun, i) => {
      const kolon = sayfa.getColumn(i + 1);
      kolon.width = sutun.genislik ?? Math.max(12, sutun.baslik.length + 4);
      if (sutun.sayisal) {
        kolon.numFmt = "#,##0.00";
        kolon.alignment = { horizontal: "right" };
      }
    });

    sayfa.autoFilter = {
      from: { row: (sayfaTanimi.ustBilgiler?.length ?? 0) + 1, column: 1 },
      to: {
        row: (sayfaTanimi.ustBilgiler?.length ?? 0) + 1,
        column: Math.max(1, sayfaTanimi.sutunlar.length),
      },
    };
  }

  const veri = await kitap.xlsx.writeBuffer();
  return Buffer.from(veri);
}

/** Tarayıcının dosyayı indirmesi için Content-Disposition başlığı üretir. */
export function excelBasliklari(dosyaAdi: string): HeadersInit {
  const guvenli = dosyaAdi.replace(/[^\w.\-]+/g, "_");
  return {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${guvenli}"; filename*=UTF-8''${encodeURIComponent(dosyaAdi)}`,
    "Cache-Control": "no-store",
  };
}

/** Kuruş değerini Excel'in sayı olarak anlayacağı TL değerine çevirir. */
export function kurusuExcelSayisi(kurus: number | null | undefined): number | null {
  if (kurus === null || kurus === undefined) return null;
  return Number((kurus / 100).toFixed(2));
}
