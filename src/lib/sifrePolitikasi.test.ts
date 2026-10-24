import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SIFRE_EN_AZ,
  sifreGucu,
  sifreKuralOzeti,
  sifreSorunu,
} from "./sifrePolitikasi";

test("kuralları geçen şifre kabul ediliyor", () => {
  assert.equal(sifreSorunu("MagazaKasa72", "ahmet", "Ahmet Yılmaz"), null);
  assert.equal(sifreSorunu("kirmizi-kalem-9", "ahmet", "Ahmet Yılmaz"), null);
});

test("kısa şifre reddediliyor", () => {
  const sorun = sifreSorunu("Kisa12");
  assert.ok(sorun);
  assert.match(sorun, new RegExp(String(SIFRE_EN_AZ)));
});

test("asgari uzunluk 10", () => {
  assert.equal(SIFRE_EN_AZ, 10);
  assert.ok(sifreSorunu("abcdefg12"), "9 karakter geçmemeli");
  assert.equal(sifreSorunu("kalemkutu7"), null, "10 karakter geçmeli");
});

test("yalnız rakamdan ya da yalnız harften oluşamaz", () => {
  assert.match(sifreSorunu("9348761250")!, /harf/);
  assert.match(sifreSorunu("kalemkutusu")!, /rakam/);
});

test("yaygın şifreler reddediliyor", () => {
  assert.match(sifreSorunu("password123")!, /yaygın/);
  assert.match(sifreSorunu("sifre12345")!, /yaygın/);
  // Türkçe karakter ve büyük harfle yazılsa da aynı şifre.
  assert.match(sifreSorunu("Sifre12345")!, /yaygın/);
});

test("sıralı diziler reddediliyor", () => {
  assert.match(sifreSorunu("kedi12345x")!, /sıralı/);
  assert.match(sifreSorunu("abcdefx123")!, /sıralı/);
  // 4'lük dizi hâlâ kabul: kural fazla dar olmamalı.
  assert.equal(sifreSorunu("kedi1234xy"), null);
});

test("çok az farklı karakter reddediliyor", () => {
  assert.match(sifreSorunu("a1a1a1a1a1")!, /az farklı/);
  assert.match(sifreSorunu("1111111111")!, /az farklı|rakam|harf/);
});

test("kullanıcı adını içeren şifre reddediliyor", () => {
  assert.match(sifreSorunu("personel1yil", "personel1")!, /kullanıcı adı/);
  // Büyük harfle yazmak da kurtarmıyor.
  assert.match(sifreSorunu("Personel1Yil", "personel1")!, /kullanıcı adı/);
});

test("ad soyadı içeren şifre reddediliyor", () => {
  assert.match(sifreSorunu("yilmaz2026kx", "ahmet", "Ahmet Yılmaz")!, /adını/);
  // Türkçe karakter farkı kuralı atlatmamalı: "Yılmaz" → "yilmaz".
  assert.match(sifreSorunu("yılmaz2026kx", "ahmet", "Ahmet Yılmaz")!, /adını/);
});

test("kısa ad parçaları yanlışlıkla engellemiyor", () => {
  // "Ali" üç harf: bunu yasaklamak "kalite123" gibi masum şifreleri de
  // düşürürdü. Kural dört harf ve üzeri için işliyor.
  assert.equal(sifreSorunu("kalitekagit1", "zeynep", "Ali Can"), null);
});

test("baştaki/sondaki boşluk reddediliyor", () => {
  assert.match(sifreSorunu("  kalemkutu7  ")!, /boşluk/);
});

test("güç göstergesi kuralı geçmeyene 0 veriyor", () => {
  assert.equal(sifreGucu("kisa1").puan, 0);
  assert.equal(sifreGucu("").etiket, "");
});

test("güç göstergesi uzunlukla artıyor", () => {
  const kisa = sifreGucu("kalemkutu7");
  const uzun = sifreGucu("kalemkutusu-mavi-72");
  assert.ok(kisa.puan >= 1);
  assert.ok(uzun.puan > kisa.puan, `${uzun.puan} > ${kisa.puan} olmalı`);
  assert.equal(uzun.etiket, "Güçlü");
});

test("kural özeti asgari uzunluğu yazıyor", () => {
  assert.match(sifreKuralOzeti(), new RegExp(String(SIFRE_EN_AZ)));
});
