import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { MESGUL_BEKLEME_MS, WAL_PRAGMASI, walKipiniAc } from "./sqliteAyar";
import { anlikGoruntuAl } from "./sqliteAnlik";

function geciciVeritabani(): { yol: string; temizle: () => void } {
  const klasor = mkdtempSync(path.join(tmpdir(), "walsinav-"));
  return {
    yol: path.join(klasor, "sinav.db"),
    temizle: () => rmSync(klasor, { recursive: true, force: true }),
  };
}

test("kip, verilen istemcinin kendi bağlantısında açılıyor", async () => {
  // Tasarımın özü bu: ayrı bağlantı açmak üretimde dört süreç arasında
  // checkpoint yarışı yaratıp SQLITE_CORRUPT veriyordu.
  const calistirilan: string[] = [];
  await walKipiniAc({
    $executeRawUnsafe: async (sorgu) => {
      calistirilan.push(sorgu);
      return 0;
    },
  });
  assert.deepEqual(calistirilan, [WAL_PRAGMASI], "tek pragma, tek bağlantı");
});

test("pragma gerçekten WAL kipini istiyor", () => {
  assert.match(WAL_PRAGMASI, /journal_mode\s*=\s*WAL/i);
});

test("kip açılamazsa hata fırlatmıyor", async () => {
  // Açılışta çökmek, eski kipte yavaş çalışmaktan kötüdür.
  const oncekiUyari = console.warn;
  const uyarilar: string[] = [];
  console.warn = (m: unknown) => uyarilar.push(String(m));
  try {
    await walKipiniAc({
      $executeRawUnsafe: async () => {
        throw new Error("salt okunur dosya sistemi");
      },
    });
  } finally {
    console.warn = oncekiUyari;
  }
  assert.equal(uyarilar.length, 1, "sessizce yutulmuyor, uyarı veriliyor");
  assert.match(uyarilar[0], /salt okunur dosya sistemi/);
});

test("WAL kipi SQLite varsayılanından farklı", () => {
  // Değişikliğin bir anlamı olduğunu sabitliyor: varsayılan delete.
  const { yol, temizle } = geciciVeritabani();
  try {
    const db = new Database(yol);
    assert.equal(String(db.pragma("journal_mode", { simple: true })), "delete");
    db.exec(WAL_PRAGMASI);
    assert.equal(String(db.pragma("journal_mode", { simple: true })), "wal");
    db.close();
  } finally {
    temizle();
  }
});

test("WAL açıkken yedek alınabiliyor ve veriyi eksiksiz taşıyor", () => {
  // WAL'ın asıl riski buydu: yazılanlar -wal dosyasında dururken düz kopya
  // eksik yedek üretir. Uygulama VACUUM INTO kullanıyor; bu testi geçmesi
  // yedeklemenin WAL ile bozulmadığının kanıtı.
  const { yol, temizle } = geciciVeritabani();
  const hedef = `${yol}.yedek`;
  try {
    const db = new Database(yol);
    db.exec(WAL_PRAGMASI);
    db.exec("CREATE TABLE satis (id INTEGER PRIMARY KEY, tutar INTEGER)");
    const ekle = db.prepare("INSERT INTO satis (tutar) VALUES (?)");
    for (let i = 1; i <= 50; i++) ekle.run(i * 100);
    // Bilerek checkpoint yapılmıyor: kayıtların bir kısmı -wal dosyasında.
    anlikGoruntuAl(yol, hedef);
    db.close();

    const yedek = new Database(hedef, { readonly: true });
    const satir = yedek
      .prepare("SELECT COUNT(*) adet, SUM(tutar) toplam FROM satis")
      .get() as {
      adet: number;
      toplam: number;
    };
    yedek.close();
    assert.equal(satir.adet, 50, "yedek tüm kayıtları içermeli");
    assert.equal(satir.toplam, 127500, "tutarlar da eksiksiz olmalı");
  } finally {
    rmSync(hedef, { force: true });
    temizle();
  }
});

test("kilit beklemesi makul bir değer", () => {
  assert.ok(
    MESGUL_BEKLEME_MS >= 5000,
    "kısa bekleme yoğun anda 'database is locked' verir",
  );
});
