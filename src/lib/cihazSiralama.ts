/**
 * Cihaz listesinde sütun başlığına tıklayarak sıralama.
 *
 * Excel'deki gibi: başlığa bir kez tıklayınca artan, tekrar tıklayınca azalan,
 * üçüncüde varsayılana (en yeni giriş önce) dönüyor.
 *
 * Kâr sütunu listede yok: kâr satış eksi alış olarak hesaplanıyor, veritabanında
 * böyle bir sütun yok ve Prisma hesaplanmış ifadeye göre sıralayamıyor. Bekleme
 * de yok çünkü giriş tarihine göre sıralamakla aynı şey — o sütun listede var.
 */
import type { Prisma } from "@/generated/prisma/client";

export type SiralamaYonu = "artan" | "azalan";

export type SiralamaAnahtari =
  | "girisTarihi"
  | "marka"
  | "model"
  | "seriNo"
  | "barkod"
  | "alisFiyati"
  | "satisTarihi"
  | "satisFiyati"
  | "durum";

/** Sütun anahtarı → sıralama anahtarı. Burada olmayan sütun sıralanamıyor. */
export const SIRALANABILIR: Record<string, SiralamaAnahtari> = {
  girisTarihi: "girisTarihi",
  marka: "marka",
  model: "model",
  seriNo: "seriNo",
  barkod: "barkod",
  alisFiyati: "alisFiyati",
  satisTarihi: "satisTarihi",
  satisFiyati: "satisFiyati",
  durum: "durum",
  // Bekleme süresi giriş tarihinin tersi; ayrı bir sıralama gerekmiyor.
  bekleme: "girisTarihi",
};

export type Siralama = {
  anahtar: SiralamaAnahtari | null;
  yon: SiralamaYonu;
};

export const VARSAYILAN_SIRALAMA: Siralama = { anahtar: null, yon: "azalan" };

/** URL parametrelerini sıralamaya çevirir; tanınmayan değer varsayılana düşer. */
export function siralamaCoz(anahtar: unknown, yon: unknown): Siralama {
  const a = typeof anahtar === "string" ? anahtar : "";
  const gecerli = Object.values(SIRALANABILIR).includes(a as SiralamaAnahtari)
    ? (a as SiralamaAnahtari)
    : null;
  if (!gecerli) return VARSAYILAN_SIRALAMA;
  return { anahtar: gecerli, yon: yon === "artan" ? "artan" : "azalan" };
}

/**
 * Prisma `orderBy` listesi.
 *
 * Sıralama sütunu ne olursa olsun sonuna `id` ekleniyor: eşit değerli satırların
 * sırası sayfadan sayfaya değişmesin, yoksa sayfalamada kayıt atlanıp tekrar
 * edebiliyor.
 */
export function siralamaOrderBy(
  siralama: Siralama,
): Prisma.StokKalemiOrderByWithRelationInput[] {
  const yon = siralama.yon === "artan" ? "asc" : "desc";

  switch (siralama.anahtar) {
    case "girisTarihi":
      return [{ girisTarihi: yon }, { id: yon }];
    case "marka":
      return [{ marka: yon }, { model: yon }, { id: "desc" }];
    case "model":
      return [{ model: yon }, { id: "desc" }];
    case "seriNo":
      return [{ seriNo: yon }, { id: "desc" }];
    case "barkod":
      return [{ barkod: yon }, { id: "desc" }];
    case "alisFiyati":
      return [{ alisFiyatiKurus: yon }, { id: "desc" }];
    case "satisTarihi":
      return [{ satisTarihi: yon }, { id: "desc" }];
    case "satisFiyati":
      return [{ satisFiyatiKurus: yon }, { id: "desc" }];
    case "durum":
      return [{ durum: yon }, { id: "desc" }];
    default:
      // Varsayılan: en yeni giriş önce.
      return [{ girisTarihi: "desc" }, { id: "desc" }];
  }
}

/**
 * Başlığa tıklandığında gidilecek sıralama.
 *
 * Döngü: artan → azalan → varsayılan. Üçüncü tıklama sıralamayı kaldırıyor ki
 * kullanıcı başa dönmek için filtreyi temizlemek zorunda kalmasın.
 */
export function sonrakiSiralama(mevcut: Siralama, tiklanan: SiralamaAnahtari): Siralama {
  if (mevcut.anahtar !== tiklanan) return { anahtar: tiklanan, yon: "artan" };
  if (mevcut.yon === "artan") return { anahtar: tiklanan, yon: "azalan" };
  return VARSAYILAN_SIRALAMA;
}

/** Başlıkta gösterilecek ok işareti. */
export function siralamaIsareti(mevcut: Siralama, sutun: SiralamaAnahtari): string {
  if (mevcut.anahtar !== sutun) return "";
  return mevcut.yon === "artan" ? "▲" : "▼";
}
