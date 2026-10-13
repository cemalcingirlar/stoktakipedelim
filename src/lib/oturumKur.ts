import type { Rol } from "./sabitler";
import type { OturumBilgisi } from "./oturum";

/**
 * Oturum bilgisinin veritabanı kaynağı. Giriş ekranı ile her istekteki
 * tazeleme aynı eşlemeyi kullansın diye ayrı tutuluyor; ikisi ayrışırsa
 * kullanıcı girişte bir, sonraki isteklerde başka yetkiye sahip olurdu.
 */
export type OturumKaynagi = {
  id: number;
  kullaniciAdi: string;
  adSoyad: string;
  rol: string;
  magazaId: number | null;
  magaza: { id: number; ad: string } | null;
  ekMagazalar: { id: number; ad: string }[];
};

/**
 * Kullanıcı kaydından oturum bilgisi kurar. Ana mağaza listenin başında,
 * ek mağazalar verilen sırayla peşinden gelir; ana mağaza ek mağazalar
 * arasında da işaretliyse iki kez girmez.
 *
 * Mağazası olmayan kullanıcı (yönetici) boş liste alır; yetki kuralları
 * yöneticiyi liste üzerinden değil rolünden geçirir.
 */
export function oturumBilgisiKur(kullanici: OturumKaynagi): OturumBilgisi {
  const ekler = kullanici.ekMagazalar.filter((m) => m.id !== kullanici.magazaId);
  const yetkili = kullanici.magaza ? [kullanici.magaza, ...ekler] : ekler;
  return {
    kullaniciId: kullanici.id,
    kullaniciAdi: kullanici.kullaniciAdi,
    adSoyad: kullanici.adSoyad,
    rol: kullanici.rol as Rol,
    magazaId: kullanici.magazaId,
    magazaAdi: kullanici.magaza?.ad ?? null,
    magazaIdleri: yetkili.map((m) => m.id),
    magazaAdlari: yetkili.map((m) => m.ad),
  };
}
