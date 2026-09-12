import assert from "node:assert/strict";
import { test } from "node:test";
import { kurusuTLYaz, kurusuTLYazSembollu, tlyiKurusaCevir } from "./para";

test("tlyiKurusaCevir — virgüllü Türkçe biçim", () => {
  assert.equal(tlyiKurusaCevir("1.234,56"), 123456);
  assert.equal(tlyiKurusaCevir("1234,56"), 123456);
  assert.equal(tlyiKurusaCevir("0,05"), 5);
  assert.equal(tlyiKurusaCevir("12.500,50"), 1250050);
});

test("tlyiKurusaCevir — noktayı binlik ayıracı olarak çözer", () => {
  // Türkçe yazımda "9.750" dokuz bin yedi yüz elli demektir.
  assert.equal(tlyiKurusaCevir("9.750"), 975000);
  assert.equal(tlyiKurusaCevir("1.234.567"), 123456700);
});

test("tlyiKurusaCevir — üç haneden kısa kesir ondalık sayılır", () => {
  assert.equal(tlyiKurusaCevir("9.75"), 975);
  assert.equal(tlyiKurusaCevir("9.7"), 970);
});

test("tlyiKurusaCevir — tam sayılar ve boşluklar", () => {
  assert.equal(tlyiKurusaCevir("1234"), 123400);
  assert.equal(tlyiKurusaCevir(" 250 "), 25000);
  assert.equal(tlyiKurusaCevir(0), 0);
  assert.equal(tlyiKurusaCevir(12.5), 1250);
});

test("tlyiKurusaCevir — negatif değer", () => {
  assert.equal(tlyiKurusaCevir("-1.500,25"), -150025);
});

test("tlyiKurusaCevir — geçersiz girdi null döner", () => {
  assert.equal(tlyiKurusaCevir(""), null);
  assert.equal(tlyiKurusaCevir(null), null);
  assert.equal(tlyiKurusaCevir(undefined), null);
  assert.equal(tlyiKurusaCevir("abc"), null);
  assert.equal(tlyiKurusaCevir("12,34,56"), null);
  assert.equal(tlyiKurusaCevir("1.2.3,4,5"), null);
});

test("tlyiKurusaCevir — yuvarlama kayan nokta hatası üretmez", () => {
  // 0,1 + 0,2 tuzağı: kuruş tam sayı olduğu için toplama güvenli.
  const a = tlyiKurusaCevir("0,10");
  const b = tlyiKurusaCevir("0,20");
  assert.equal(a! + b!, 30);
});

test("kurusuTLYaz — Türkçe biçimde yazar", () => {
  assert.equal(kurusuTLYaz(123456), "1.234,56");
  assert.equal(kurusuTLYaz(0), "0,00");
  assert.equal(kurusuTLYaz(null), "");
  assert.equal(kurusuTLYazSembollu(975000), "9.750,00 TL");
});

test("gidiş-dönüş: yazılan değer aynı kuruşa geri döner", () => {
  for (const kurus of [0, 5, 99, 100, 123456, 975000, 100000000]) {
    assert.equal(tlyiKurusaCevir(kurusuTLYaz(kurus)), kurus, `${kurus} için`);
  }
});
