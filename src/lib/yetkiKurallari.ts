import { ROLLER, type Rol } from "./sabitler";

/**
 * Rol tabanlı yetki kuralları.
 *
 * Bu dosya bilerek "server-only" işaretlenmemiştir: saf karar fonksiyonları
 * içerir ve doğrudan test edilebilir olması gerekir. Oturum okuma ve
 * yönlendirme yapan sarmalayıcılar yetki.ts içindedir.
 */

/** Yetki kararlarının ihtiyaç duyduğu asgari oturum bilgisi. */
export type YetkiSahibi = {
  rol: Rol;
  /** Ana mağaza — formlarda varsayılan seçim. */
  magazaId: number | null;
  /** Ana mağaza dahil, işlem yapabildiği tüm mağazalar. */
  magazaIdleri?: number[];
};

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
 * Kullanıcının işlem yapabildiği mağazaların kimlikleri.
 *
 * `magazaIdleri` yoksa (eski bir oturum çerezi) ana mağazaya düşer; böylece
 * sürüm yükseltmesinden sonra açık kalan oturumlar yetkisiz kalmaz.
 */
export function yetkiliMagazalar(oturum: YetkiSahibi): number[] {
  if (oturum.magazaIdleri && oturum.magazaIdleri.length > 0) return oturum.magazaIdleri;
  return oturum.magazaId === null ? [] : [oturum.magazaId];
}

/**
 * Yönetici tüm mağazalarda işlem yapabilir; diğer roller yalnız yetkili
 * oldukları mağazalarda. Hiçbir mağazaya bağlı olmayan personel işlem yapamaz.
 */
export function magazadaIslemYapabilirMi(oturum: YetkiSahibi, magazaId: number): boolean {
  if (adminMi(oturum)) return true;
  return yetkiliMagazalar(oturum).includes(magazaId);
}

export type { Rol };
