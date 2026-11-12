import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SES_HATA,
  SES_OKUDU,
  okutmaSesi,
  sesAcikMi,
  sesTercihiYaz,
} from "./sesliOkutma";

test("sayılan cihazda 'okudu' deniyor", () => {
  assert.equal(okutmaSesi("basari"), SES_OKUDU);
});

test("hatalı okutmada 'hata var' deniyor", () => {
  assert.equal(okutmaSesi("hata"), SES_HATA);
});

test("uyarı da hata tarafında", () => {
  // "Zaten sayıldı", "başka mağazada", "satılmış": hiçbiri beklendiği gibi
  // sayılmış değil, operatör dönüp bakmalı.
  assert.equal(okutmaSesi("uyari"), SES_HATA);
});

test("sonuç yoksa ses de yok", () => {
  assert.equal(okutmaSesi(null), null);
  assert.equal(okutmaSesi(undefined), null);
});

// ------------------------------------------------------------- tercih

test("tercih saklanmamışsa ses açık", () => {
  assert.equal(sesAcikMi(null), true);
  assert.equal(sesAcikMi(undefined), true);
});

test("yalnız 'kapali' sesi kapatıyor", () => {
  assert.equal(sesAcikMi("kapali"), false);
  assert.equal(sesAcikMi("acik"), true);
  // Bozuk değer sessizliğe değil, açığa düşmeli: ses özelliği istenmişti.
  assert.equal(sesAcikMi("zırva"), true);
});

test("tercih okunabilir biçimde saklanıyor", () => {
  assert.equal(sesTercihiYaz(true), "acik");
  assert.equal(sesTercihiYaz(false), "kapali");
  assert.equal(sesAcikMi(sesTercihiYaz(false)), false);
  assert.equal(sesAcikMi(sesTercihiYaz(true)), true);
});
