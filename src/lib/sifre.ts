import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const TUZ_UZUNLUK = 16;
const ANAHTAR_UZUNLUK = 64;

/**
 * Şifreyi scrypt ile hashler. Harici bağımlılık gerektirmez; Node'un
 * kendi crypto modülünü kullanır, bu yüzden VPS kurulumunda derleme sorunu çıkmaz.
 * Biçim: scrypt$<tuz-hex>$<hash-hex>
 */
export async function sifreHashle(sifre: string): Promise<string> {
  const tuz = randomBytes(TUZ_UZUNLUK);
  const anahtar = (await scryptAsync(sifre, tuz, ANAHTAR_UZUNLUK)) as Buffer;
  return `scrypt$${tuz.toString("hex")}$${anahtar.toString("hex")}`;
}

/** Girilen şifreyi saklanan hash ile sabit zamanlı karşılaştırır. */
export async function sifreDogrula(sifre: string, saklanan: string): Promise<boolean> {
  const parcalar = saklanan.split("$");
  if (parcalar.length !== 3 || parcalar[0] !== "scrypt") return false;

  const tuz = Buffer.from(parcalar[1], "hex");
  const beklenen = Buffer.from(parcalar[2], "hex");
  if (tuz.length !== TUZ_UZUNLUK || beklenen.length !== ANAHTAR_UZUNLUK) return false;

  const anahtar = (await scryptAsync(sifre, tuz, ANAHTAR_UZUNLUK)) as Buffer;
  return timingSafeEqual(anahtar, beklenen);
}
