import assert from "node:assert/strict";
import { createGunzip } from "node:zlib";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";
import { anlikGoruntuAl, gziple, veritabaniYolu, yedekDosyaAdi } from "./sqliteAnlik";

let calismaDizini: string;
let kaynakDb: string;

before(async () => {
  calismaDizini = await mkdtemp(path.join(tmpdir(), "yedek-testi-"));
  kaynakDb = path.join(calismaDizini, "kaynak.db");

  // Yedeklenecek örnek bir veritabanı kur.
  const db = new Database(kaynakDb);
  db.exec("CREATE TABLE cihaz (id INTEGER PRIMARY KEY, seriNo TEXT, fiyat INTEGER)");
  const ekle = db.prepare("INSERT INTO cihaz (seriNo, fiyat) VALUES (?, ?)");
  for (let i = 1; i <= 500; i++) ekle.run(`35000000000${String(i).padStart(4, "0")}`, i * 1000);
  db.close();
});

after(async () => {
  await rm(calismaDizini, { recursive: true, force: true });
});

test("anlikGoruntuAl — okunabilir ve eksiksiz bir kopya üretir", () => {
  const hedef = path.join(calismaDizini, "anlik.db");
  anlikGoruntuAl(kaynakDb, hedef);

  const kopya = new Database(hedef, { readonly: true, fileMustExist: true });
  try {
    const adet = kopya.prepare("SELECT COUNT(*) AS n FROM cihaz").get() as { n: number };
    assert.equal(adet.n, 500, "tüm satırlar kopyalanmalı");

    const toplam = kopya.prepare("SELECT SUM(fiyat) AS t FROM cihaz").get() as { t: number };
    assert.equal(toplam.t, (500 * 501 * 1000) / 2, "veri bozulmamalı");

    const butunluk = kopya.pragma("integrity_check", { simple: true });
    assert.equal(butunluk, "ok", "bütünlük kontrolü geçmeli");
  } finally {
    kopya.close();
  }
});

test("anlikGoruntuAl — kaynak veritabanı yazılabilir kalır", () => {
  const hedef = path.join(calismaDizini, "anlik2.db");
  anlikGoruntuAl(kaynakDb, hedef);

  // Yedek salt okunur bağlantıyla alınır; kaynağa yazmayı engellememeli.
  const db = new Database(kaynakDb);
  try {
    db.prepare("INSERT INTO cihaz (seriNo, fiyat) VALUES (?, ?)").run("yeni", 1);
    const adet = db.prepare("SELECT COUNT(*) AS n FROM cihaz").get() as { n: number };
    assert.equal(adet.n, 501);
    db.prepare("DELETE FROM cihaz WHERE seriNo = 'yeni'").run();
  } finally {
    db.close();
  }
});

test("anlikGoruntuAl — olmayan veritabanında hata verir", () => {
  assert.throws(() =>
    anlikGoruntuAl(path.join(calismaDizini, "yok.db"), path.join(calismaDizini, "cikti.db")),
  );
});

test("gziple — sıkıştırılmış dosya geri açıldığında aynı veriyi verir", async () => {
  const anlik = path.join(calismaDizini, "gzip-kaynak.db");
  const gz = path.join(calismaDizini, "yedek.db.gz");
  const geriAcilan = path.join(calismaDizini, "geri.db");

  anlikGoruntuAl(kaynakDb, anlik);
  const boyut = await gziple(anlik, gz);

  assert.ok(boyut > 0, "gzip dosyası boş olmamalı");
  assert.ok(boyut < (await stat(anlik)).size, "sıkıştırma yer kazandırmalı");

  await pipeline(createReadStream(gz), createGunzip(), createWriteStream(geriAcilan));

  const db = new Database(geriAcilan, { readonly: true, fileMustExist: true });
  try {
    const adet = db.prepare("SELECT COUNT(*) AS n FROM cihaz").get() as { n: number };
    assert.equal(adet.n, 500, "geri açılan yedek eksiksiz olmalı");
    assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    db.close();
  }
});

test("yedekDosyaAdi — tarih ve saat sıfır dolgulu yazılır", () => {
  assert.equal(
    yedekDosyaAdi(new Date("2026-03-05T07:09:00")),
    "stok-yedek-20260305-0709.db.gz",
  );
  assert.equal(
    yedekDosyaAdi(new Date("2026-12-31T23:59:00")),
    "stok-yedek-20261231-2359.db.gz",
  );
});

test("veritabaniYolu — file: önekini atar ve mutlak yola çevirir", () => {
  assert.equal(veritabaniYolu("file:./dev.db"), path.resolve(process.cwd(), "dev.db"));
  assert.equal(veritabaniYolu("file:/var/lib/stok/stok.db"), "/var/lib/stok/stok.db");
});
