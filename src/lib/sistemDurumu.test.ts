import assert from "node:assert/strict";
import { test } from "node:test";
import {
  boyutYaz,
  diskSatiri,
  genelDurum,
  veritabaniSatiri,
  yedekSatiri,
} from "./sistemDurumu";

const GB = 1_073_741_824;
const SIMDI = new Date("2026-10-24T12:00:00Z");

test("boyut okunur birime çevriliyor", () => {
  assert.match(boyutYaz(5 * GB), /5 GB/);
  assert.match(boyutYaz(250 * 1_048_576), /250 MB/);
  assert.match(boyutYaz(4096), /4 KB/);
});

test("rahat diskte uyarı yok", () => {
  const satir = diskSatiri(100 * GB, 60 * GB);
  assert.equal(satir.siddet, "iyi");
  assert.match(satir.deger, /%40 dolu/);
});

test("dolmaya başlayan disk uyarı veriyor", () => {
  const satir = diskSatiri(100 * GB, 12 * GB);
  assert.equal(satir.siddet, "uyari");
  assert.ok(satir.oneri);
});

test("dolmak üzere olan disk kritik", () => {
  const satir = diskSatiri(100 * GB, 2 * GB);
  assert.equal(satir.siddet, "kritik");
  // Sebebi yazmalı: disk dolunca hata satış ekranında çıkıyor, sebebi orada
  // görünmüyor.
  assert.match(satir.oneri!, /yazamaz|satış/);
});

test("disk okunamazsa sessiz kalınmıyor", () => {
  assert.equal(diskSatiri(0, 0).siddet, "uyari");
});

test("büyük veritabanı uyarı veriyor", () => {
  assert.equal(veritabaniSatiri(200 * 1_048_576).siddet, "iyi");
  assert.equal(veritabaniSatiri(2 * GB).siddet, "uyari");
});

test("hiç yedek yoksa kritik", () => {
  const satir = yedekSatiri(null, false, SIMDI);
  assert.equal(satir.siddet, "kritik");
  assert.match(satir.deger, /hiç alınmamış/);
});

test("taze ve doğrulanmış yedek iyi", () => {
  const satir = yedekSatiri(new Date(SIMDI.getTime() - 3_600_000), true, SIMDI);
  assert.equal(satir.siddet, "iyi");
  assert.match(satir.deger, /doğrulandı/);
});

test("doğrulanmamış yedek uyarı", () => {
  const satir = yedekSatiri(
    new Date(SIMDI.getTime() - 3_600_000),
    false,
    SIMDI,
  );
  assert.equal(satir.siddet, "uyari");
  assert.match(satir.deger, /doğrulanmadı/);
});

test("iki günden eski yedek kritik", () => {
  // Günlük yedek bir gün atlarsa makul; iki gün atlarsa bozulmuş demektir.
  const satir = yedekSatiri(
    new Date(SIMDI.getTime() - 50 * 3_600_000),
    true,
    SIMDI,
  );
  assert.equal(satir.siddet, "kritik");
  assert.match(satir.deger, /2 gün önce/);
});

test("genel durum en kötü satırı yansıtıyor", () => {
  const iyi = { etiket: "a", deger: "b", siddet: "iyi" as const };
  const uyari = { etiket: "a", deger: "b", siddet: "uyari" as const };
  const kritik = { etiket: "a", deger: "b", siddet: "kritik" as const };
  assert.equal(genelDurum([iyi, iyi]), "iyi");
  assert.equal(genelDurum([iyi, uyari]), "uyari");
  assert.equal(genelDurum([uyari, kritik]), "kritik");
});
