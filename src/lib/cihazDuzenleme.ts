/**
 * Cihaz künyesinin (marka, model, kategori) listeden düzeltilmesi.
 *
 * Aynı ürün genelde çok sayıda cihaz olarak duruyor: 20 adet aynı kablo, her
 * biri ayrı satır. Yanlış kategori ya da marka tek tek düzeltilirse hem uzun
 * sürer hem yarısı unutulur. Bu yüzden düzeltme iki kapsamda yapılabiliyor:
 * yalnız o cihaz, ya da aynı barkodu taşıyan bütün cihazlar.
 *
 * Buradaki her şey saf: aynı kurallar hem ekranda onay sorusunu belirliyor
 * hem sunucuda kapsamı denetliyor.
 */

export type DuzenlemeKapsami =
  /** Yalnız seçilen cihaz. */
  | "TEK"
  /** Aynı barkodu taşıyan bütün cihazlar. */
  | "BARKOD";

export type KunyeDegisikligi = {
  marka?: string;
  model?: string;
  kategoriId?: number;
  /** null = alt kategoriyi kaldır. */
  altKategoriId?: number | null;
};

/** En uzun marka / model metni — veritabanı alanlarıyla uyumlu. */
export const MARKA_EN_COK = 60;
export const MODEL_EN_COK = 120;

/**
 * Kapsam sorusu sorulmalı mı?
 *
 * Barkodu olmayan ya da o barkodda tek cihaz bulunan üründe soracak bir şey
 * yok; soru sormak gereksiz tıklama olur.
 */
export function kapsamSorulmali(barkod: string | null, ayniBarkodAdedi: number): boolean {
  if (!barkod) return false;
  return ayniBarkodAdedi > 1;
}

/** Kapsam sorulmayacaksa uygulanacak kapsam. */
export function varsayilanKapsam(barkod: string | null, ayniBarkodAdedi: number): DuzenlemeKapsami {
  return kapsamSorulmali(barkod, ayniBarkodAdedi) ? "BARKOD" : "TEK";
}

/**
 * Değişiklik geçerli mi? Geçerliyse null, değilse kullanıcıya gösterilecek
 * mesaj.
 */
export function duzenlemeSorunu(degisiklik: KunyeDegisikligi): string | null {
  if (!degisiklikVarMi(degisiklik)) return "Değiştirilecek bir şey seçilmedi.";

  if (degisiklik.marka !== undefined) {
    const m = degisiklik.marka.trim();
    if (!m) return "Marka boş olamaz.";
    if (m.length > MARKA_EN_COK) return `Marka en çok ${MARKA_EN_COK} karakter olabilir.`;
  }

  if (degisiklik.model !== undefined) {
    const m = degisiklik.model.trim();
    if (!m) return "Model boş olamaz.";
    if (m.length > MODEL_EN_COK) return `Model en çok ${MODEL_EN_COK} karakter olabilir.`;
  }

  if (degisiklik.kategoriId !== undefined) {
    if (!Number.isInteger(degisiklik.kategoriId) || degisiklik.kategoriId <= 0) {
      return "Kategori seçimi okunamadı.";
    }
  }

  if (degisiklik.altKategoriId !== undefined && degisiklik.altKategoriId !== null) {
    if (!Number.isInteger(degisiklik.altKategoriId) || degisiklik.altKategoriId <= 0) {
      return "Alt kategori seçimi okunamadı.";
    }
  }

  return null;
}

/** Değiştirilecek en az bir alan var mı? */
export function degisiklikVarMi(degisiklik: KunyeDegisikligi): boolean {
  return (
    degisiklik.marka !== undefined ||
    degisiklik.model !== undefined ||
    degisiklik.kategoriId !== undefined ||
    degisiklik.altKategoriId !== undefined
  );
}

export type KunyeDurumu = {
  marka: string;
  model: string;
  kategoriAdi: string;
  altKategoriAdi: string | null;
};

/**
 * Tarihçeye ve kullanıcıya gösterilecek değişiklik özeti.
 *
 * Yalnız gerçekten değişen alanlar yazılıyor: "marka A → A" gibi satırlar
 * tarihçeyi şişirip okunmaz hale getirir.
 */
export function degisiklikOzeti(eski: KunyeDurumu, yeni: KunyeDurumu): string {
  const parcalar: string[] = [];
  if (eski.marka !== yeni.marka) parcalar.push(`Marka ${eski.marka} → ${yeni.marka}`);
  if (eski.model !== yeni.model) parcalar.push(`Model ${eski.model} → ${yeni.model}`);
  if (eski.kategoriAdi !== yeni.kategoriAdi) {
    parcalar.push(`Kategori ${eski.kategoriAdi} → ${yeni.kategoriAdi}`);
  }
  if ((eski.altKategoriAdi ?? "") !== (yeni.altKategoriAdi ?? "")) {
    parcalar.push(`Alt kategori ${eski.altKategoriAdi ?? "—"} → ${yeni.altKategoriAdi ?? "—"}`);
  }
  return parcalar.join(" · ");
}

/** Kapsam sorusunun metni. */
export function kapsamSorusu(barkod: string, adet: number): string {
  return `${barkod} barkodunda ${adet} cihaz var. Değişiklik hepsine uygulansın mı?`;
}

/** İşlem sonrası kullanıcıya gösterilecek mesaj. */
export function sonucMesaji(kapsam: DuzenlemeKapsami, etkilenen: number): string {
  if (kapsam === "TEK") return "Cihaz güncellendi.";
  return `${etkilenen} cihaz güncellendi.`;
}
