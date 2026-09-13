import { ROLLER, type Rol } from "./sabitler";

/**
 * Rol tabanlı yetki kuralları.
 *
 * Bu dosya bilerek "server-only" işaretlenmemiştir: saf karar fonksiyonları
 * içerir ve doğrudan test edilebilir olması gerekir. Oturum okuma ve
 * yönlendirme yapan sarmalayıcılar yetki.ts içindedir.
 */

/** Yetki kararlarının ihtiyaç duyduğu asgari oturum bilgisi. */
export type YetkiSahibi = { rol: Rol; magazaId: number | null };

export function adminMi(oturum: YetkiSahibi): boolean {
  return oturum.rol === ROLLER.ADMIN;
}

/** Stok ekleme ve silme yalnızca yöneticide. */
export function stokEkleyebilirMi(oturum: YetkiSahibi): boolean {
  return adminMi(oturum);
}

export function stokSilebilirMi(oturum: YetkiSahibi): boolean {
  return adminMi(oturum);
}

/** Ayarlar, kullanıcı, kategori ve mağaza yönetimi yalnızca yöneticide. */
export function ayarlariYonetebilirMi(oturum: YetkiSahibi): boolean {
  return adminMi(oturum);
}

/**
 * Yönetici tüm mağazalarda işlem yapabilir; diğer roller yalnız kendi
 * mağazasında. Mağazaya bağlı olmayan bir personel hiçbir mağazada işlem yapamaz.
 */
export function magazadaIslemYapabilirMi(oturum: YetkiSahibi, magazaId: number): boolean {
  if (adminMi(oturum)) return true;
  if (oturum.magazaId === null) return false;
  return oturum.magazaId === magazaId;
}

export type { Rol };
