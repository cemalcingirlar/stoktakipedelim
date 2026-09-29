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
  /** Ana mağaza — formlarda varsayılan seçim. */
  magazaId: number | null;
  magazaAdi: string | null;
  /** Ana mağaza dahil, işlem yapabildiği mağazaların kimlikleri. */
  magazaIdleri: number[];
  /** Aynı sırada mağaza adları — başlıkta ve satış ekranında gösterilir. */
  magazaAdlari: string[];
};

/** JWT yükünden sayı dizisi okur; yoksa tek değere düşer. */
function sayiDizisi(deger: unknown, tekil: unknown): number[] {
  if (Array.isArray(deger)) return deger.filter((d): d is number => typeof d === "number");
  return typeof tekil === "number" ? [tekil] : [];
}

/** JWT yükünden metin dizisi okur; yoksa tek değere düşer. */
function metinDizisi(deger: unknown, tekil: unknown): string[] {
  if (Array.isArray(deger)) return deger.filter((d): d is string => typeof d === "string");
  return typeof tekil === "string" ? [tekil] : [];
}

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
      // Sürüm yükseltmesinden önce açılmış çerezlerde bu alanlar yok; ana
      // mağazaya düşerek oturumu geçerli tutuyoruz.
      magazaIdleri: sayiDizisi(payload.magazaIdleri, payload.magazaId),
      magazaAdlari: metinDizisi(payload.magazaAdlari, payload.magazaAdi),
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
