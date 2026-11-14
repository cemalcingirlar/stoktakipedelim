import assert from "node:assert/strict";
import { test } from "node:test";
import { aktarimNotu, cikisToplami } from "./cikisOzeti";

const cihazlar = { adet: 5, satisKurus: 5_000_000, maliyetKurus: 4_000_000 };
const aktarimlar = { adet: 2, satisKurus: 1_500_000, maliyetKurus: 1_200_000 };

test("stok görünümünde aktarım satışları adede, ciroya ve kâra katılmıyor", () => {
  const t = cikisToplami(cihazlar, aktarimlar, false);
  assert.equal(t.adet, 5);
  assert.equal(t.ciroKurus, 5_000_000);
  assert.equal(t.karKurus, 1_000_000);
  assert.equal(t.aktarimHaric, true);
});

test("satış görünümünde aktarım satışları sayılıyor", () => {
  const t = cikisToplami(cihazlar, aktarimlar, true);
  assert.equal(t.adet, 7);
  assert.equal(t.ciroKurus, 6_500_000);
  assert.equal(t.karKurus, 1_300_000);
  assert.equal(t.aktarimHaric, false);
});

test("aktarım sayısı ve cirosu iki görünümde de ayrıca bildiriliyor", () => {
  for (const dahil of [true, false]) {
    const t = cikisToplami(cihazlar, aktarimlar, dahil);
    assert.equal(t.aktarimAdedi, 2);
    assert.equal(t.aktarimCiroKurus, 1_500_000);
  }
});

test("yalnız aktarım satışı olan günde stoktan çıkan sıfır", () => {
  // Asıl şikâyet: tek işlem mağaza içi aktarımken panel "1 cihaz çıktı" diyordu.
  const t = cikisToplami({ adet: 0, satisKurus: 0, maliyetKurus: 0 }, aktarimlar, false);
  assert.equal(t.adet, 0);
  assert.equal(t.ciroKurus, 0);
  assert.equal(t.karKurus, 0);
});

test("stok görünümünde sayılmayan aktarımlar için not çıkıyor", () => {
  const not = aktarimNotu(cikisToplami(cihazlar, aktarimlar, false));
  assert.match(not ?? "", /2 mağaza içi aktarım satışı/);
  assert.match(not ?? "", /stokta kaldığı için/);
});

test("aktarım yoksa ya da zaten sayılıyorsa not yok", () => {
  assert.equal(aktarimNotu(cikisToplami(cihazlar, { adet: 0, satisKurus: 0, maliyetKurus: 0 }, false)), null);
  assert.equal(aktarimNotu(cikisToplami(cihazlar, aktarimlar, true)), null);
});
