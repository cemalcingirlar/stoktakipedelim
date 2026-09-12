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
 *
 * Türkçe yazımda nokta binlik, virgül ondalık ayıracıdır. Sadece nokta
 * içeren girdi belirsizdir; şu kural uygulanır:
 *   - Virgül varsa: noktalar binlik ayıracı, virgül ondalık  ("1.234,56" -> 123456)
 *   - Birden çok nokta varsa: hepsi binlik ayıracı          ("1.234.567" -> 123456700)
 *   - Tek nokta ve ardından tam 3 hane varsa: binlik        ("9.750"    -> 975000)
 *   - Diğer tek nokta durumları: ondalık                    ("9.75"     -> 975)
 * Geçersiz girdide null döner.
 */
export function tlyiKurusaCevir(metin: string | number | null | undefined): number | null {
  if (metin === null || metin === undefined || metin === "") return null;
  if (typeof metin === "number") {
    return Number.isFinite(metin) ? Math.round(metin * 100) : null;
  }

  const temiz = metin.trim().replace(/\s/g, "");
  if (temiz === "") return null;
  if (!/^-?[\d.,]+$/.test(temiz)) return null;

  const eksi = temiz.startsWith("-");
  const govde = eksi ? temiz.slice(1) : temiz;

  let normal: string;
  if (govde.includes(",")) {
    // Virgül ondalık ayıracı; noktalar binlik.
    if ((govde.match(/,/g) ?? []).length > 1) return null;
    normal = govde.replace(/\./g, "").replace(",", ".");
  } else {
    const noktalar = (govde.match(/\./g) ?? []).length;
    if (noktalar === 0) {
      normal = govde;
    } else if (noktalar > 1) {
      normal = govde.replace(/\./g, "");
    } else {
      const [tam, kesir] = govde.split(".");
      // "9.750" -> binlik ayıracı; "9.75" -> ondalık.
      normal = kesir.length === 3 && tam.length > 0 ? tam + kesir : govde;
    }
  }

  if (!/^\d+(\.\d+)?$/.test(normal)) return null;

  const sayi = Number(normal);
  if (!Number.isFinite(sayi)) return null;
  return Math.round(sayi * 100) * (eksi ? -1 : 1);
}
