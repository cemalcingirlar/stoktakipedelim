import assert from "node:assert/strict";
import { test } from "node:test";
import { aramaMetniUret, aramaNormalize, kodNormalize } from "./metin";

test("aramaNormalize — Türkçe büyük/küçük harf ayrımını kaldırır", () => {
  // SQLite LIKE bu harflerde duyarsız değil; bu yüzden normalleştiriyoruz.
  assert.equal(aramaNormalize("KILIF"), "kilif");
  assert.equal(aramaNormalize("Kılıf"), "kilif");
  assert.equal(aramaNormalize("kılıf"), "kilif");
  assert.equal(aramaNormalize("İSTANBUL"), "istanbul");
  assert.equal(aramaNormalize("İstanbul"), "istanbul");
});

test("aramaNormalize — diğer Türkçe karakterler ASCII'ye indirgenir", () => {
  assert.equal(aramaNormalize("Şarj Güç Çözüm Ğ"), "sarj guc cozum g");
});

test("aramaNormalize — boşluklar sadeleşir", () => {
  assert.equal(aramaNormalize("  Galaxy   A50  "), "galaxy a50");
});

test("aramaNormalize — boş girdi boş metin", () => {
  assert.equal(aramaNormalize(null), "");
  assert.equal(aramaNormalize(undefined), "");
  assert.equal(aramaNormalize(""), "");
});

test("aramaMetniUret — boş parçaları atar ve normalleştirir", () => {
  assert.equal(
    aramaMetniUret(["Samsung", "Galaxy A50", null, "Siyah", undefined, "Yılmaz Telekom"]),
    "samsung galaxy a50 siyah yilmaz telekom",
  );
});

test("aranan kelime normalleştirilmiş metnin içinde geçer", () => {
  const kayit = aramaMetniUret(["Şeffaf Kılıf", "İstanbul Toptancı"]);
  assert.ok(kayit.includes(aramaNormalize("KILIF")));
  assert.ok(kayit.includes(aramaNormalize("istanbul")));
});

test("kodNormalize — boşlukları atar, büyük harfe çevirir", () => {
  assert.equal(kodNormalize(" 3510 1234 5678 901 "), "351012345678901");
  assert.equal(kodNormalize("abc123"), "ABC123");
  assert.equal(kodNormalize(null), "");
});
