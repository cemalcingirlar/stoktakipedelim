/**
 * Para birimi kuruş cinsinden tam sayı olarak saklanır; kayan nokta hatası olmaz.
 * 1.234,56 TL -> 123456
 */

const bicimlendirici = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 123456 -> "1.234,56" */
export function kurusuTLYaz(kurus: number | null | undefined): string {
  if (kurus === null || kurus === undefined) return "";
  return bicimlendirici.format(kurus / 100);
}

/** 123456 -> "1.234,56 TL" */
export function kurusuTLYazSembollu(kurus: number | null | undefined): string {
  if (kurus === null || kurus === undefined) return "";
  return `${kurusuTLYaz(kurus)} TL`;
}

/**
 * Kullanıcının yazdığı tutarı kuruşa çevirir.
 * "1.234,56", "1234,56", "1234.56" ve "1234" kabul edilir.
 * Geçersiz girdide null döner.
 */
export function tlyiKurusaCevir(metin: string | number | null | undefined): number | null {
  if (metin === null || metin === undefined || metin === "") return null;
  if (typeof metin === "number") {
    return Number.isFinite(metin) ? Math.round(metin * 100) : null;
  }

  const temiz = metin.trim().replace(/\s/g, "");
  if (temiz === "") return null;

  // Binlik ayıracı olarak nokta, ondalık ayıracı olarak virgül kullanımını normalize et.
  let normal: string;
  if (temiz.includes(",")) {
    normal = temiz.replace(/\./g, "").replace(",", ".");
  } else {
    normal = temiz;
  }

  if (!/^-?\d+(\.\d+)?$/.test(normal)) return null;

  const sayi = Number(normal);
  if (!Number.isFinite(sayi)) return null;
  return Math.round(sayi * 100);
}
