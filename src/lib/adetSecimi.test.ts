import assert from "node:assert/strict";
import { test } from "node:test";
import { adediSinirla, adetliMi, adetSonucNotu, type AdetAdayi } from "./adetSecimi";

const BARKOD = "8806094899528";
const seriNosuz = (id: number): AdetAdayi => ({ id, seriNo: null });
const seriNolu = (id: number, seriNo: string): AdetAdayi => ({ id, seriNo });

test("tek aday adetli sayılmaz", () => {
  assert.equal(adetliMi(BARKOD, [seriNosuz(1)]), false);
});

test("hiç aday yoksa adetli değil", () => {
  assert.equal(adetliMi(BARKOD, []), false);
});

test("aynı barkodta çok sayıda seri numarasız cihaz adetlidir", () => {
  assert.equal(adetliMi(BARKOD, [seriNosuz(1), seriNosuz(2), seriNosuz(3)]), true);
});

test("seri numaralı cihazlar adetle işlenmez", () => {
  // Telefonda hangi IMEI'nin taşındığı kayıt altında kalmalı.
  assert.equal(adetliMi(BARKOD, [seriNolu(1, "35111"), seriNolu(2, "35222")]), false);
});

test("karışık grupta adet yolu kapalı", () => {
  // Bir tanesi bile seri numaralıysa cihazlar birbirinin yerine geçmez.
  assert.equal(adetliMi(BARKOD, [seriNosuz(1), seriNolu(2, "35222")]), false);
});

test("seri numarası okutulduysa tek cihaz kastediliyor", () => {
  const adaylar = [seriNolu(1, "35111"), seriNosuz(2)];
  assert.equal(adetliMi("35111", adaylar), false);
});

test("adet mevcutla sınırlanıyor", () => {
  assert.equal(adediSinirla(50, 20), 20);
  assert.equal(adediSinirla(5, 20), 5);
  assert.equal(adediSinirla(20, 20), 20);
});

test("geçersiz adet 1'e çekiliyor", () => {
  assert.equal(adediSinirla(0, 20), 1);
  assert.equal(adediSinirla(-3, 20), 1);
  assert.equal(adediSinirla(Number.NaN, 20), 1);
  assert.equal(adediSinirla(2.7, 20), 2);
});

test("mevcut yoksa adet sıfır", () => {
  assert.equal(adediSinirla(5, 0), 0);
});

test("istenen kadarı yoksa not bunu söylüyor", () => {
  assert.equal(
    adetSonucNotu(5, 20, "kabul edildi"),
    "20 adet istendi ama 5 adet kaldı; 5 adet kabul edildi",
  );
});

test("istenen kadarı varsa not sade", () => {
  assert.equal(adetSonucNotu(20, 20, "sevkiyata eklendi"), "20 adet sevkiyata eklendi");
});
