import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
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
export function veritabaniYolu(
  url = process.env.DATABASE_URL ?? "file:./dev.db",
): string {
  return path.resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    url.replace(/^file:/, ""),
  );
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

/**
 * Yedek dosyasının bütünlüğünü sınar; SQLite'ın cevabını olduğu gibi döner
 * ("ok" ya da sorunların dökümü).
 *
 * VACUUM INTO tutarlı bir dosya yazar ama diskte bozulma varsa onu da
 * kopyalayabilir. Yedeğin bozuk olduğunu felaket günü öğrenmemek için her
 * yedekte çalıştırılıyor.
 *
 * Dosya hiç açılamıyorsa (bozuk başlık, yarım yazılmış) hata fırlatmak
 * yerine sebebi metin olarak dönüyor: çağıran taraf bunu doğrulama
 * sonucuna yazıyor, yedekleme akışı tek bir try bloğunda kesilmiyor.
 */
export function butunlukKontrolu(yol: string): string {
  let db: Database.Database | null = null;
  try {
    db = new Database(yol, { readonly: true, fileMustExist: true });
    const satirlar = db.prepare("PRAGMA integrity_check").all() as {
      integrity_check: string;
    }[];
    return satirlar.map((s) => s.integrity_check).join("\n");
  } catch (hata) {
    return hata instanceof Error ? hata.message : String(hata);
  } finally {
    db?.close();
  }
}

/** Dosyayı gzip'ler ve oluşan dosyanın bayt cinsinden boyutunu döner. */
export async function gziple(
  kaynakYol: string,
  hedefYol: string,
): Promise<number> {
  await pipeline(
    createReadStream(kaynakYol),
    createGzip({ level: 9 }),
    createWriteStream(hedefYol),
  );
  return (await stat(hedefYol)).size;
}

/** Gzip dosyasını açar; oluşan dosyanın boyutunu döner. */
export async function gzipAc(
  kaynakYol: string,
  hedefYol: string,
): Promise<number> {
  await pipeline(
    createReadStream(kaynakYol),
    createGunzip(),
    createWriteStream(hedefYol),
  );
  return (await stat(hedefYol)).size;
}

/**
 * Yedek dosyasındaki temel tablo sayıları.
 *
 * Geri yükleme provasında kullanılıyor: dosyanın açılması yetmiyor, içinde
 * beklenen verinin olduğunu da görmek gerekiyor.
 */
export function yedekTablolariniSay(yol: string): {
  kullanici: number;
  cihaz: number;
  fatura: number;
} {
  const db = new Database(yol, { readonly: true, fileMustExist: true });
  try {
    const say = (tablo: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${tablo}`).get() as { n: number })
        .n;
    return {
      kullanici: say("Kullanici"),
      cihaz: say("StokKalemi"),
      fatura: say("AlisFaturasi"),
    };
  } finally {
    db.close();
  }
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
