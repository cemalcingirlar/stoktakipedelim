import assert from "node:assert/strict";
import { test } from "node:test";
import { VARSAYILAN_HEDEF, guvenliHedef } from "./yonlendirme";

test("normal iç yollar korunuyor", () => {
  assert.equal(guvenliHedef("/panel"), "/panel");
  assert.equal(guvenliHedef("/cihazlar"), "/cihazlar");
  assert.equal(
    guvenliHedef("/cihazlar?ara=123&durum=STOKTA"),
    "/cihazlar?ara=123&durum=STOKTA",
  );
  assert.equal(guvenliHedef("/sayim/12#ozet"), "/sayim/12#ozet");
});

test("protokol-göreli adres engelleniyor", () => {
  // Açığın özü buydu: "//kotusite.com" da "/" ile başlar.
  assert.equal(guvenliHedef("//kotusite.test"), VARSAYILAN_HEDEF);
  assert.equal(guvenliHedef("//kotusite.test/giris"), VARSAYILAN_HEDEF);
  assert.equal(guvenliHedef("///kotusite.test"), VARSAYILAN_HEDEF);
});

test("ters eğik çizgi varyantları engelleniyor", () => {
  assert.equal(guvenliHedef("/\\kotusite.test"), VARSAYILAN_HEDEF);
  assert.equal(guvenliHedef("/\\/kotusite.test"), VARSAYILAN_HEDEF);
});

test("yüzde kodlaması kuralı atlatamıyor", () => {
  // Çözüldüğünde "//" ya da "/\" olan değerler de reddedilmeli.
  assert.equal(guvenliHedef("/%2Fkotusite.test"), VARSAYILAN_HEDEF);
  assert.equal(guvenliHedef("/%5Ckotusite.test"), VARSAYILAN_HEDEF);
  assert.equal(guvenliHedef("%2F%2Fkotusite.test"), VARSAYILAN_HEDEF);
});

test("mutlak adres engelleniyor", () => {
  assert.equal(guvenliHedef("https://kotusite.test"), VARSAYILAN_HEDEF);
  assert.equal(guvenliHedef("http://kotusite.test"), VARSAYILAN_HEDEF);
  assert.equal(guvenliHedef("javascript:alert(1)"), VARSAYILAN_HEDEF);
  assert.equal(guvenliHedef("data:text/html,x"), VARSAYILAN_HEDEF);
});

test("denetim karakteri taşıyan adres engelleniyor", () => {
  assert.equal(guvenliHedef("/panel\nSet-Cookie: x=1"), VARSAYILAN_HEDEF);
  assert.equal(
    guvenliHedef("/panel\r\nLocation: https://kotusite.test"),
    VARSAYILAN_HEDEF,
  );
  assert.equal(guvenliHedef("/panel\u0000"), VARSAYILAN_HEDEF);
});

test("bozuk yüzde kodlaması güvenli sayılmıyor", () => {
  assert.equal(guvenliHedef("/%zz"), VARSAYILAN_HEDEF);
});

test("boş, uzun ve metin olmayan değerler panele düşüyor", () => {
  assert.equal(guvenliHedef(""), VARSAYILAN_HEDEF);
  assert.equal(guvenliHedef("   "), VARSAYILAN_HEDEF);
  assert.equal(guvenliHedef(undefined), VARSAYILAN_HEDEF);
  assert.equal(guvenliHedef(null), VARSAYILAN_HEDEF);
  assert.equal(guvenliHedef(["/panel"]), VARSAYILAN_HEDEF);
  assert.equal(guvenliHedef(`/${"a".repeat(600)}`), VARSAYILAN_HEDEF);
});
