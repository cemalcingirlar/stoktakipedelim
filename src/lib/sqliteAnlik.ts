import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import Database from "better-sqlite3";

/**
 * SQLite anlık görüntü ve sıkıştırma yardımcıları.
 *
 * Bu dosya bilerek "server-only" işaretlenmemiştir: saf Node dosya işlemleri
 * içerir ve doğrudan test edilebilir olması gerekir.
 */

/**
 * DATABASE_URL'den ("file:./dev.db") gerçek dosya yolunu çıkarır.
 *
 * turbopackIgnore: yol çalışma anındaki bir ayardan gelir, derlemeye gömülecek
 * bir varlık değildir. İşaret olmadan Turbopack tüm projeyi çıktıya izler ve
 * dağıtım gereksiz yere şişer.
 */
export function veritabaniYolu(url = process.env.DATABASE_URL ?? "file:./dev.db"): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), url.replace(/^file:/, ""));
}

/**
 * Uygulama çalışırken tutarlı bir anlık görüntü alır.
 *
 * Canlı bir SQLite dosyasını doğrudan kopyalamak bozuk yedek üretebilir
 * (yazma ortasında yakalanabilir). `VACUUM INTO` ise okuma kilidi altında
 * bütünlüğü korunmuş yeni bir veritabanı dosyası yazar.
 */
export function anlikGoruntuAl(kaynakYol: string, hedefYol: string): void {
  const db = new Database(kaynakYol, { readonly: true, fileMustExist: true });
  try {
    // VACUUM INTO parametre bağlamayı desteklemez; tek tırnak kaçışıyla gömülür.
    db.exec(`VACUUM INTO '${hedefYol.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
}

/** Dosyayı gzip'ler ve oluşan dosyanın bayt cinsinden boyutunu döner. */
export async function gziple(kaynakYol: string, hedefYol: string): Promise<number> {
  await pipeline(createReadStream(kaynakYol), createGzip({ level: 9 }), createWriteStream(hedefYol));
  return (await stat(hedefYol)).size;
}

/** stok-yedek-YYYYAAGG-SSDD.db.gz */
export function yedekDosyaAdi(tarih: Date): string {
  const iki = (n: number) => String(n).padStart(2, "0");
  return [
    "stok-yedek-",
    tarih.getFullYear(),
    iki(tarih.getMonth() + 1),
    iki(tarih.getDate()),
    "-",
    iki(tarih.getHours()),
    iki(tarih.getMinutes()),
    ".db.gz",
  ].join("");
}
