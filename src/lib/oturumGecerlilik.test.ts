import assert from "node:assert/strict";
import { test } from "node:test";
import { jetonAni, oturumGecerliMi } from "./oturumGecerlilik";

const AN = new Date("2026-10-24T12:00:00.000Z");

test("iat saniyeden tarihe çevriliyor", () => {
  assert.deepEqual(jetonAni(AN.getTime() / 1000), AN);
  assert.equal(jetonAni(undefined), null);
  assert.equal(jetonAni(Number.NaN), null);
});

test("şifre hiç değişmemişse oturum geçerli", () => {
  // Sürüm yükseltmesi kimseyi dışarı atmamalı.
  assert.equal(oturumGecerliMi(AN, null), true);
  assert.equal(oturumGecerliMi(null, null), true);
});

test("şifre jetondan SONRA değiştiyse oturum düşüyor", () => {
  const sonra = new Date(AN.getTime() + 60_000);
  assert.equal(oturumGecerliMi(AN, sonra), false);
});

test("şifre jetondan ÖNCE değiştiyse oturum geçerli", () => {
  const once = new Date(AN.getTime() - 60_000);
  assert.equal(oturumGecerliMi(AN, once), true);
});

test("saniye yuvarlaması oturumu düşürmüyor", () => {
  // JWT iat saniyeye yuvarlanıyor; şifre değişikliği milisaniyeli. Aynı
  // saniye içinde yapılan değişiklik kullanıcının kendi oturumunu düşürmemeli.
  const ayniSaniye = new Date(AN.getTime() + 400);
  assert.equal(oturumGecerliMi(AN, ayniSaniye), true);
});

test("jeton anı okunamıyorsa ve şifre değişmişse oturum düşüyor", () => {
  assert.equal(oturumGecerliMi(null, AN), false);
});
