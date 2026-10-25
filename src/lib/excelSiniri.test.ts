import assert from "node:assert/strict";
import { test } from "node:test";
import { EXCEL_EN_COK_SATIR, excelKesintiNotu } from "./excelSiniri";

test("sınır aşılmadıysa not yazılmaz", () => {
  assert.equal(excelKesintiNotu(false), null);
});

test("sınır aşıldıysa not eksik olduğunu ve ne yapılacağını söyler", () => {
  const not = excelKesintiNotu(true);
  assert.ok(not);
  assert.match(not, /tamamı bu dosyada değil/);
  assert.match(not, /daralt/i);
  // Sayı Türkçe binlik ayıraçla yazılmalı: "20000" değil "20.000".
  assert.match(not, /20\.000/);
});

test("not verilen sınırı kullanır", () => {
  assert.match(excelKesintiNotu(true, 5000)!, /5\.000/);
});

test("cihaz aktarım sınırı 20.000 satır", () => {
  assert.equal(EXCEL_EN_COK_SATIR, 20000);
});
