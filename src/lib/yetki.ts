import "server-only";
import { redirect } from "next/navigation";
import { oturumuOku, type OturumBilgisi } from "./oturum";
import {
  adminMi,
  ayarlariYonetebilirMi,
  magazadaIslemYapabilirMi,
  stokEkleyebilirMi,
  stokSilebilirMi,
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
  const oturum = await oturumuOku();
  if (!oturum) redirect("/giris");
  return oturum;
}

/** Server Action'lar için: oturum yoksa hata fırlatır (yönlendirme yapmaz). */
export async function oturumZorunlu(): Promise<OturumBilgisi> {
  const oturum = await oturumuOku();
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
};
export type { Rol };
