/**
 * Envanter önizlemesinin mağaza özeti.
 *
 * Neden ayrı dosya: bu saf fonksiyon envanter formunda (istemci bileşeni)
 * kullanılıyor, ama envanterDosyasi.ts dosya okuma için exceljs'e bağlı.
 * Aynı dosyada durduğunda paketleyici exceljs'in TAMAMINI tarayıcıya
 * indiriyordu — ölçüldü: envanter sayfası 397 KB JS, diğer sayfalar 145 KB.
 * Saf hesap burada durunca o bağ kopuyor.
 */

/** Özetin ihtiyaç duyduğu alanlar; EnvanterSatiri bunu karşılıyor. */
export type ToplanabilirSatir = {
  magazaId: number;
  magazaAdi: string;
  alisFiyatiKurus: number;
};

export type MagazaToplami = {
  magazaId: number;
  magazaAdi: string;
  adet: number;
  tutarKurus: number;
};

/** Önizlemedeki satırları mağazaya göre toplar — ekrandaki özet tablosu için. */
export function magazayaGoreToplam(
  satirlar: ToplanabilirSatir[],
): MagazaToplami[] {
  const harita = new Map<number, MagazaToplami>();
  for (const satir of satirlar) {
    const mevcut = harita.get(satir.magazaId);
    if (mevcut) {
      mevcut.adet += 1;
      mevcut.tutarKurus += satir.alisFiyatiKurus;
    } else {
      harita.set(satir.magazaId, {
        magazaId: satir.magazaId,
        magazaAdi: satir.magazaAdi,
        adet: 1,
        tutarKurus: satir.alisFiyatiKurus,
      });
    }
  }
  return [...harita.values()].sort((a, b) =>
    a.magazaAdi.localeCompare(b.magazaAdi, "tr"),
  );
}
