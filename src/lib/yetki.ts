import "server-only";
import { redirect } from "next/navigation";
import type { OturumBilgisi } from "./oturum";
import { oturumuTazeOku } from "./oturumTaze";
import {
  adminMi,
  ayarlariYonetebilirMi,
  magazadaIslemYapabilirMi,
  stokEkleyebilirMi,
  stokSilebilirMi,
  yetkiliMagazalar,
  type Rol,
} from "./yetkiKurallari";

/** Yetkisiz erişim denemelerinde fırlatılır; Server Action'larda mesajı kullanıcıya döner. */
export class YetkiHatasi extends Error {
  constructor(mesaj = "Bu işlem için yetkiniz yok.") {
    super(mesaj);
    this.name = "YetkiHatasi";
  }
}

/** Sayfalar için: oturum yoksa giriş ekranına yönlendirir. */
export async function oturumGerekli(): Promise<OturumBilgisi> {
  const oturum = await oturumuTazeOku();
  if (!oturum) redirect("/giris");
  return oturum;
}

/** Server Action'lar için: oturum yoksa hata fırlatır (yönlendirme yapmaz). */
export async function oturumZorunlu(): Promise<OturumBilgisi> {
  const oturum = await oturumuTazeOku();
  if (!oturum) throw new YetkiHatasi("Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.");
  return oturum;
}

export async function adminZorunlu(): Promise<OturumBilgisi> {
  const oturum = await oturumZorunlu();
  if (!adminMi(oturum)) {
    throw new YetkiHatasi("Bu işlemi yalnızca yönetici yapabilir.");
  }
  return oturum;
}

/** Sayfa seviyesinde yönetici kontrolü; yetkisizse panele döner. */
export async function adminSayfasi(): Promise<OturumBilgisi> {
  const oturum = await oturumGerekli();
  if (!adminMi(oturum)) redirect("/panel");
  return oturum;
}

export function magazaIslemiZorunlu(oturum: OturumBilgisi, magazaId: number): void {
  if (!magazadaIslemYapabilirMi(oturum, magazaId)) {
    throw new YetkiHatasi("Yalnızca kendi mağazanızda işlem yapabilirsiniz.");
  }
}

export {
  adminMi,
  ayarlariYonetebilirMi,
  magazadaIslemYapabilirMi,
  stokEkleyebilirMi,
  stokSilebilirMi,
  yetkiliMagazalar,
};
export type { Rol };

/**
 * Kullanıcıya gösterilmesi amaçlanan hata.
 *
 * Sunucu eylemleri yakaladıkları her hatanın metnini ekrana basıyordu;
 * beklenmeyen bir veritabanı hatası da olduğu gibi kullanıcıya gidiyordu
 * (canlıda "Unique constraint failed on the fields: (satisNo)" görüldü).
 * Bu sınıfla işaretlenen mesajlar gösteriliyor, gerisi günlüğe yazılıp
 * yerine anlaşılır bir cümle konuyor.
 */
export class KullaniciHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "KullaniciHatasi";
  }
}
