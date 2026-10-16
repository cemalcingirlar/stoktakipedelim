import assert from "node:assert/strict";
import { test } from "node:test";
import { kabulDurumu, kabulUyarisi, sevkiyatAcilabilirMi } from "./sevkiyatKabul";

test("mağazanın kendi yetkilisi varsa sorun yok", () => {
  assert.equal(kabulDurumu(1, 1), "YETKILI_VAR");
  assert.equal(kabulDurumu(5, 0), "YETKILI_VAR");
});

test("ek yetkili atanmış mağaza yetkili sayılıyor", () => {
  // Kullanıcı bildirdi: Ayarlar ekranından yetki verilen mağaza, sevkiyat
  // ekranında "kullanıcı yok" diyordu. Burada sayı nereden geldiğine
  // bakılmıyor; çağıran taraf ana + ek yetkilileri birleştirip veriyor.
  assert.equal(kabulDurumu(1, 0), "YETKILI_VAR");
});

test("yetkilisi olmayan mağazada yönetici devreye giriyor", () => {
  assert.equal(kabulDurumu(0, 1), "YALNIZ_YONETICI");
});

test("hiç kimse yoksa kabul edilemez", () => {
  assert.equal(kabulDurumu(0, 0), "KIMSE_YOK");
});

test("sevkiyat yalnız kimse yokken engelleniyor", () => {
  assert.equal(sevkiyatAcilabilirMi("YETKILI_VAR"), true);
  assert.equal(sevkiyatAcilabilirMi("YALNIZ_YONETICI"), true, "yönetici kabul edebilir");
  assert.equal(sevkiyatAcilabilirMi("KIMSE_YOK"), false);
});

test("yetkili varken uyarı çıkmıyor", () => {
  assert.equal(kabulUyarisi("YETKILI_VAR", "Optimum Nakit"), null);
});

test("yalnız yönetici durumunda bilgilendiriyor, engellemiyor", () => {
  const uyari = kabulUyarisi("YALNIZ_YONETICI", "Optimum Nakit");
  assert.match(uyari ?? "", /yalnız yönetici kabul edebilir/);
  assert.match(uyari ?? "", /Optimum Nakit/);
});

test("kimse yokken açık uyarı veriyor", () => {
  const uyari = kabulUyarisi("KIMSE_YOK", "Optimum Nakit");
  assert.match(uyari ?? "", /kabul edecek kimse olmaz/);
});

test("her durum için karar ve uyarı tutarlı", () => {
  for (const [yetkili, yonetici] of [
    [0, 0],
    [0, 3],
    [2, 0],
    [2, 3],
  ] as const) {
    const durum = kabulDurumu(yetkili, yonetici);
    const uyari = kabulUyarisi(durum, "X");
    // Uyarı yalnız sorun varken çıkmalı.
    assert.equal(uyari === null, durum === "YETKILI_VAR", `${yetkili}/${yonetici}`);
    // Engelleme yalnız gerçekten kimse yokken olmalı.
    assert.equal(sevkiyatAcilabilirMi(durum), yetkili > 0 || yonetici > 0);
  }
});
