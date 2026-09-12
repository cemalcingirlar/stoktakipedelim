import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Rol } from "./sabitler";

export const OTURUM_CEREZI = "stok_oturum";
const OTURUM_SURESI_SN = 60 * 60 * 12; // 12 saat

export type OturumBilgisi = {
  kullaniciId: number;
  kullaniciAdi: string;
  adSoyad: string;
  rol: Rol;
  magazaId: number | null;
  magazaAdi: string | null;
};

function gizliAnahtar(): Uint8Array {
  const deger = process.env.OTURUM_SIFRESI;
  if (!deger || deger.length < 32) {
    throw new Error(
      "OTURUM_SIFRESI tanımlı değil veya 32 karakterden kısa. .env dosyasına güçlü bir değer ekleyin.",
    );
  }
  return new TextEncoder().encode(deger);
}

export async function oturumJetonuUret(bilgi: OturumBilgisi): Promise<string> {
  return new SignJWT({ ...bilgi })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${OTURUM_SURESI_SN}s`)
    .sign(gizliAnahtar());
}

export async function oturumJetonunuCoz(jeton: string): Promise<OturumBilgisi | null> {
  try {
    const { payload } = await jwtVerify(jeton, gizliAnahtar());
    if (typeof payload.kullaniciId !== "number") return null;
    return {
      kullaniciId: payload.kullaniciId,
      kullaniciAdi: String(payload.kullaniciAdi ?? ""),
      adSoyad: String(payload.adSoyad ?? ""),
      rol: payload.rol as Rol,
      magazaId: (payload.magazaId as number | null) ?? null,
      magazaAdi: (payload.magazaAdi as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** Oturum çerezini yazar. Yalnızca Server Action / Route Handler içinde çağrılabilir. */
export async function oturumAc(bilgi: OturumBilgisi): Promise<void> {
  const jeton = await oturumJetonuUret(bilgi);
  const cerezler = await cookies();
  cerezler.set(OTURUM_CEREZI, jeton, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OTURUM_SURESI_SN,
  });
}

export async function oturumKapat(): Promise<void> {
  const cerezler = await cookies();
  cerezler.delete(OTURUM_CEREZI);
}

/** Geçerli oturumu döner; oturum yoksa null. */
export async function oturumuOku(): Promise<OturumBilgisi | null> {
  const cerezler = await cookies();
  const jeton = cerezler.get(OTURUM_CEREZI)?.value;
  if (!jeton) return null;
  return oturumJetonunuCoz(jeton);
}
