/**
 * Arama metni normalleştirme.
 *
 * SQLite'ın LIKE operatörü yalnız ASCII harflerde büyük/küçük harf duyarsızdır;
 * "Kılıf" kaydı "KILIF" araması ile eşleşmez. Bu yüzden aranabilir alanlar
 * normalleştirilmiş halde `StokKalemi.aramaMetni` içinde saklanır ve arama
 * sorgusu da aynı işlemden geçirilir.
 *
 * Türkçe karakterler ASCII karşılığına indirgenir: "Kılıf" ve "KILIF" -> "kilif".
 */

const HARITA: Record<string, string> = {
  ı: "i", İ: "i", I: "i", i: "i",
  ş: "s", Ş: "s",
  ğ: "g", Ğ: "g",
  ü: "u", Ü: "u",
  ö: "o", Ö: "o",
  ç: "c", Ç: "c",
  â: "a", Â: "a", î: "i", Î: "i", û: "u", Û: "u",
};

export function aramaNormalize(metin: string | null | undefined): string {
  if (!metin) return "";
  let sonuc = "";
  for (const harf of metin) {
    sonuc += HARITA[harf] ?? harf.toLowerCase();
  }
  return sonuc.replace(/\s+/g, " ").trim();
}

/** Bir stok kaleminin aranabilir alanlarını tek normalleştirilmiş metne indirger. */
export function aramaMetniUret(parcalar: (string | null | undefined)[]): string {
  return aramaNormalize(parcalar.filter(Boolean).join(" "));
}

/** Barkod / seri no karşılaştırmaları için: boşlukları atar, büyük harfe çevirir. */
export function kodNormalize(kod: string | null | undefined): string {
  if (!kod) return "";
  return kod.replace(/\s+/g, "").toUpperCase();
}
