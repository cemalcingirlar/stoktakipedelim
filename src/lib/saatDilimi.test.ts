import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BEKLENEN_SAAT_DILIMI,
  saatDilimiDurumu,
  saatDilimiUyarisi,
} from "./saatDilimi";

const AN = new Date("2026-10-23T22:00:00Z"); // UTC'de 23 Ekim, Türkiye'de 24 Ekim

test("beklenen dilim Türkiye", () => {
  assert.equal(BEKLENEN_SAAT_DILIMI, "Europe/Istanbul");
});

test("doğru dilimde uyarı yok", () => {
  const durum = saatDilimiDurumu("Europe/Istanbul", "Europe/Istanbul", AN);
  assert.equal(durum.dogru, true);
  assert.equal(durum.saatFarki, 0);
  assert.equal(saatDilimiUyarisi(durum), null);
});

test("UTC sunucuda 3 saatlik kayma yakalanıyor", () => {
  // Sorunun ta kendisi: UTC'de 23 Ekim 22:00, Türkiye'de 24 Ekim 01:00.
  const durum = saatDilimiDurumu("UTC", "Europe/Istanbul", AN);
  assert.equal(durum.dogru, false);
  assert.equal(durum.saatFarki, -3);
  const uyari = saatDilimiUyarisi(durum);
  assert.match(uyari ?? "", /UTC/);
  assert.match(uyari ?? "", /3 saat geri/);
});

test("ileri yöndeki kayma da yakalanıyor", () => {
  const durum = saatDilimiDurumu("Asia/Tokyo", "Europe/Istanbul", AN);
  assert.equal(durum.dogru, false);
  assert.ok(durum.saatFarki > 0);
  assert.match(saatDilimiUyarisi(durum) ?? "", /ileri/);
});

test("gün sınırını aşan fark normalleştiriliyor", () => {
  // Honolulu ile İstanbul arasında ham fark -13 çıkar; +11 olarak okunmamalı.
  const durum = saatDilimiDurumu("Pacific/Honolulu", "Europe/Istanbul", AN);
  assert.ok(
    Math.abs(durum.saatFarki) <= 12,
    `fark ${durum.saatFarki} makul aralıkta olmalı`,
  );
});

test("adı farklı ama saati aynı dilim uyarı vermiyor", () => {
  // Boş yere uyarmamak için ölçüt ad değil saat farkı.
  const durum = saatDilimiDurumu("Asia/Nicosia", "Europe/Istanbul", AN);
  assert.equal(durum.saatFarki, 0);
  assert.equal(durum.dogru, true);
  assert.equal(saatDilimiUyarisi(durum), null);
});

test("tanınmayan dilim adında çökmüyor", () => {
  const durum = saatDilimiDurumu("Mars/Olympus", "Europe/Istanbul", AN);
  assert.equal(durum.dogru, false);
  assert.ok(saatDilimiUyarisi(durum));
});
