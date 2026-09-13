import assert from "node:assert/strict";
import { test } from "node:test";
import type { CihazSatiri } from "./cihazFiltre";
import {
  SUTUNLAR,
  SUTUN_ANAHTARLARI,
  VARSAYILAN_SUTUNLAR,
  beklemeGunu,
  karKurus,
  sutunTercihiniCoz,
  sutunlariSirala,
} from "./sutunlar";

/** Testler için asgari alanlarla bir cihaz satırı üretir. */
function cihaz(ekler: Partial<CihazSatiri> = {}): CihazSatiri {
  return {
    girisTarihi: new Date("2026-01-01T10:00:00"),
    satisTarihi: null,
    cikisTarihi: null,
    alisFiyatiKurus: 100000,
    satisFiyatiKurus: null,
    ...ekler,
  } as CihazSatiri;
}

test("beklemeGunu — satılmamış cihazda bugüne kadar sayar", () => {
  const bugun = new Date("2026-01-31T10:00:00");
  assert.equal(beklemeGunu(cihaz(), bugun), 30);
});

test("beklemeGunu — satılmışsa giriş ile satış arasını sayar", () => {
  const bugun = new Date("2026-06-01T10:00:00");
  const satilan = cihaz({ satisTarihi: new Date("2026-01-11T10:00:00") });
  assert.equal(beklemeGunu(satilan, bugun), 10);
});

test("beklemeGunu — saat farkı gün sayısını bozmaz", () => {
  const bugun = new Date("2026-01-02T01:00:00");
  assert.equal(beklemeGunu(cihaz({ girisTarihi: new Date("2026-01-01T23:00:00") }), bugun), 1);
});

test("beklemeGunu — ileri tarihli girişte negatif dönmez", () => {
  const bugun = new Date("2026-01-01T10:00:00");
  assert.equal(beklemeGunu(cihaz({ girisTarihi: new Date("2026-02-01") }), bugun), 0);
});

test("karKurus — satış eksi alış", () => {
  assert.equal(karKurus(cihaz({ satisFiyatiKurus: 150000 })), 50000);
});

test("karKurus — zararına satışta negatif", () => {
  assert.equal(karKurus(cihaz({ satisFiyatiKurus: 80000 })), -20000);
});

test("karKurus — satılmamış cihazda null", () => {
  assert.equal(karKurus(cihaz()), null);
});

test("karKurus — sıfır fiyatlı satış zarar olarak görünür", () => {
  assert.equal(karKurus(cihaz({ satisFiyatiKurus: 0 })), -100000);
});

test("sutunTercihiniCoz — geçersiz girdide varsayılana döner", () => {
  assert.deepEqual(sutunTercihiniCoz(null), VARSAYILAN_SUTUNLAR);
  assert.deepEqual(sutunTercihiniCoz(""), VARSAYILAN_SUTUNLAR);
  assert.deepEqual(sutunTercihiniCoz("bozuk json"), VARSAYILAN_SUTUNLAR);
  assert.deepEqual(sutunTercihiniCoz('{"a":1}'), VARSAYILAN_SUTUNLAR);
  assert.deepEqual(sutunTercihiniCoz("[]"), VARSAYILAN_SUTUNLAR);
});

test("sutunTercihiniCoz — tanınmayan sütun adları elenir", () => {
  assert.deepEqual(sutunTercihiniCoz('["model","uydurma","durum"]'), ["model", "durum"]);
});

test("sutunTercihiniCoz — hepsi tanınmıyorsa varsayılana döner", () => {
  assert.deepEqual(sutunTercihiniCoz('["uydurma","baska"]'), VARSAYILAN_SUTUNLAR);
});

test("sutunlariSirala — kullanıcı sırayı bozamaz, tanımlı sıra korunur", () => {
  const karisik = sutunlariSirala(["durum", "kategori", "model"]);
  assert.deepEqual(karisik, ["kategori", "model", "durum"]);
});

test("sutunlariSirala — tekrarlananlar bir kez görünür", () => {
  assert.deepEqual(sutunlariSirala(["model", "model", "durum"]), ["model", "durum"]);
});

test("her sütunun başlığı ve metin üreticisi tanımlı", () => {
  for (const anahtar of SUTUN_ANAHTARLARI) {
    const sutun = SUTUNLAR[anahtar];
    assert.equal(sutun.anahtar, anahtar, `${anahtar} anahtarı tutarsız`);
    assert.ok(sutun.baslik.length > 0, `${anahtar} başlığı boş`);
    assert.equal(typeof sutun.metin, "function", `${anahtar} metin üreticisi yok`);
  }
});
