import assert from "node:assert/strict";
import { test } from "node:test";
import {
  magazalardaSatabilirMi,
  saticiAdaylari,
  saticiSorunu,
  type SaticiAdayi,
} from "./satici";

const ADMIN: SaticiAdayi = {
  id: 1,
  adSoyad: "Cemal Çıngırlar",
  rol: "ADMIN",
  aktif: true,
  magazaIdleri: [],
};
const ULKU: SaticiAdayi = {
  id: 2,
  adSoyad: "Ülkü Muhasebe",
  rol: "MAGAZA_SORUMLUSU",
  aktif: true,
  magazaIdleri: [1],
};
const AYSE: SaticiAdayi = {
  id: 3,
  adSoyad: "Ayşe Personel",
  rol: "MAGAZA_PERSONELI",
  aktif: true,
  magazaIdleri: [1],
};
const BURAK: SaticiAdayi = {
  id: 4,
  adSoyad: "Burak Personel",
  rol: "MAGAZA_PERSONELI",
  aktif: true,
  magazaIdleri: [2],
};
const PASIF: SaticiAdayi = {
  id: 5,
  adSoyad: "Pasif Kişi",
  rol: "MAGAZA_PERSONELI",
  aktif: false,
  magazaIdleri: [1],
};

const HEPSI = [ADMIN, ULKU, AYSE, BURAK, PASIF];

// ------------------------------------------------------- mağazada satabilme

test("personel kendi mağazasında satabilir", () => {
  assert.equal(magazalardaSatabilirMi(AYSE, [1]), true);
});

test("personel başka mağazada satamaz", () => {
  assert.equal(magazalardaSatabilirMi(AYSE, [2]), false);
});

test("yönetici her mağazada satabilir", () => {
  assert.equal(magazalardaSatabilirMi(ADMIN, [1, 2, 9]), true);
});

test("iki mağazaya yetkili kişi ikisinde de satabilir", () => {
  const ikiMagaza = { ...AYSE, magazaIdleri: [1, 2] };
  assert.equal(magazalardaSatabilirMi(ikiMagaza, [1, 2]), true);
});

test("karışık mağazalı satışta tek mağaza yetkisi yetmez", () => {
  assert.equal(magazalardaSatabilirMi(AYSE, [1, 2]), false);
});

test("pasif kullanıcı satamaz", () => {
  assert.equal(magazalardaSatabilirMi(PASIF, [1]), false);
});

// ------------------------------------------------------- aday listesi

test("yönetici herkesi seçebilir, pasifler hariç", () => {
  const liste = saticiAdaylari({ kullaniciId: 1, rol: "ADMIN", magazaIdleri: [] }, HEPSI);
  assert.deepEqual(
    liste.map((a) => a.id),
    [1, 3, 4, 2],
    "oturum sahibi başta, kalanlar ada göre sıralı",
  );
  assert.ok(!liste.some((a) => a.id === PASIF.id), "pasif kullanıcı listelenmemeli");
});

test("personel yalnız kendi mağazasındakileri seçebilir", () => {
  const liste = saticiAdaylari({ kullaniciId: 3, rol: "MAGAZA_PERSONELI", magazaIdleri: [1] }, HEPSI);
  const idler = liste.map((a) => a.id);
  assert.ok(idler.includes(3), "kendisi listede");
  assert.ok(idler.includes(2), "aynı mağazadaki Ülkü listede");
  assert.ok(!idler.includes(4), "başka mağazadaki Burak listede olmamalı");
});

test("oturum sahibi her zaman listede ve başta", () => {
  const liste = saticiAdaylari({ kullaniciId: 4, rol: "MAGAZA_PERSONELI", magazaIdleri: [2] }, HEPSI);
  assert.equal(liste[0].id, 4);
});

test("mağazası olmayan yönetici yine herkesi görür", () => {
  const liste = saticiAdaylari({ kullaniciId: 1, rol: "ADMIN", magazaIdleri: [] }, HEPSI);
  assert.equal(liste.length, 4);
});

test("mağazası olmayan personel yalnız kendini görür", () => {
  const liste = saticiAdaylari({ kullaniciId: 3, rol: "MAGAZA_PERSONELI", magazaIdleri: [] }, HEPSI);
  assert.deepEqual(liste.map((a) => a.id), [3]);
});

// ------------------------------------------------------- denetim

test("uygun satıcıda sorun yok", () => {
  assert.equal(saticiSorunu(AYSE, [1]), null);
});

test("bulunamayan satıcı sorun", () => {
  assert.match(saticiSorunu(undefined, [1]) ?? "", /bulunamadı/);
});

test("pasif satıcı sorun", () => {
  assert.match(saticiSorunu(PASIF, [1]) ?? "", /pasif/);
});

test("yetkisiz mağazada satıcı sorun", () => {
  assert.match(saticiSorunu(AYSE, [2]) ?? "", /yetkili değil/);
});

test("yönetici hiçbir mağazada sorun çıkarmaz", () => {
  assert.equal(saticiSorunu(ADMIN, [1, 2, 3]), null);
});
