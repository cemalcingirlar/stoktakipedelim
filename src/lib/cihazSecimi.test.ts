import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adayEtiketi,
  cihazSec,
  secimBasligi,
  siralaAdaylar,
  uygunMu,
  uygunsuzlukMesaji,
  type AdayCihaz,
} from "./cihazSecimi";
import { STOK_DURUM } from "./sabitler";

const BARKOD = "4895180760525";

function aday(üzerine: Partial<AdayCihaz> = {}): AdayCihaz {
  return {
    id: 1,
    seriNo: null,
    barkod: BARKOD,
    durum: STOK_DURUM.STOKTA,
    magazaId: 1,
    magazaAdi: "1 Nolu Mağaza",
    marka: "GAMA",
    model: "KABLO",
    alisFiyatiKurus: 10000,
    ...üzerine,
  };
}

const BAGLAM = { aranan: BARKOD, yetkiliMagazalar: [1] };

// ------------------------------------------------------------ uygunluk

test("stokta ve yetkili mağazadaki cihaz uygun", () => {
  assert.equal(uygunMu(aday(), BAGLAM), true);
});

test("satılmış cihaz uygun değil", () => {
  assert.equal(uygunMu(aday({ durum: STOK_DURUM.SATILDI }), BAGLAM), false);
});

test("başka mağazadaki cihaz uygun değil", () => {
  assert.equal(uygunMu(aday({ magazaId: 9 }), BAGLAM), false);
});

test("yönetici her mağazadakini alabiliyor", () => {
  assert.equal(uygunMu(aday({ magazaId: 9 }), { ...BAGLAM, yetkiliMagazalar: null }), true);
});

test("zaten seçilmiş cihaz tekrar uygun değil", () => {
  assert.equal(uygunMu(aday({ id: 5 }), { ...BAGLAM, secilmisIdler: [5] }), false);
});

// ------------------------------------------------------------- seçim

test("tek uygun cihaz doğrudan seçiliyor", () => {
  const s = cihazSec([aday()], BAGLAM);
  assert.equal(s.durum, "TEK");
});

test("kullanıcının bildirdiği durum: biri satılmış, diğerleri stokta", () => {
  // Eskiden ilk eşleşen alınıyor ve satılmışsa "daha önce satılmış" deniyordu.
  const s = cihazSec(
    [
      aday({ id: 1, durum: STOK_DURUM.SATILDI }),
      aday({ id: 2 }),
      aday({ id: 3 }),
    ],
    BAGLAM,
  );
  assert.equal(s.durum, "SECIM");
  if (s.durum === "SECIM") {
    assert.equal(s.adaylar.length, 2, "yalnız stoktakiler");
    assert.deepEqual(s.adaylar.map((a) => a.id).sort(), [2, 3]);
  }
});

test("barkodda tek stok kalmışsa sorulmuyor", () => {
  const s = cihazSec([aday({ id: 1, durum: STOK_DURUM.SATILDI }), aday({ id: 2 })], BAGLAM);
  assert.equal(s.durum, "TEK");
  if (s.durum === "TEK") assert.equal(s.cihaz.id, 2);
});

test("seri no okutulunca o cihaz seçiliyor, sorulmuyor", () => {
  const s = cihazSec(
    [aday({ id: 1, seriNo: "350000000000011" }), aday({ id: 2, seriNo: "350000000000029" })],
    { ...BAGLAM, aranan: "350000000000029" },
  );
  assert.equal(s.durum, "TEK");
  if (s.durum === "TEK") assert.equal(s.cihaz.id, 2);
});

test("okutulan seri satılmışsa başka cihaza kaymıyor", () => {
  // Kullanıcı o cihazı kastediyor; sessizce başkasını satmak yanlış olur.
  const s = cihazSec(
    [
      aday({ id: 1, seriNo: "350000000000011", durum: STOK_DURUM.SATILDI }),
      aday({ id: 2, seriNo: "350000000000029" }),
    ],
    { ...BAGLAM, aranan: "350000000000011" },
  );
  assert.equal(s.durum, "YOK");
  if (s.durum === "YOK") assert.match(s.mesaj, /daha önce satılmış/);
});

test("zaten sepettekiler seçim listesinden düşüyor", () => {
  const s = cihazSec([aday({ id: 1 }), aday({ id: 2 }), aday({ id: 3 })], {
    ...BAGLAM,
    secilmisIdler: [1, 2],
  });
  assert.equal(s.durum, "TEK");
  if (s.durum === "TEK") assert.equal(s.cihaz.id, 3);
});

// --------------------------------------------------------- mesajlar

test("hiç kayıt yoksa açık söyleniyor", () => {
  const s = cihazSec([], BAGLAM);
  assert.equal(s.durum, "YOK");
  if (s.durum === "YOK") assert.match(s.mesaj, /sistemde kayıtlı değil/);
});

test("tek cihaz satılmışsa eski mesaj korunuyor", () => {
  const s = cihazSec([aday({ durum: STOK_DURUM.SATILDI })], BAGLAM);
  assert.equal(s.durum, "YOK");
  if (s.durum === "YOK") assert.match(s.mesaj, /daha önce satılmış/);
});

test("hepsi satılmışsa kaç tane olduğu söyleniyor", () => {
  const s = cihazSec(
    [
      aday({ id: 1, durum: STOK_DURUM.SATILDI }),
      aday({ id: 2, durum: STOK_DURUM.SATILDI }),
      aday({ id: 3, durum: STOK_DURUM.TRANSFERDE }),
    ],
    BAGLAM,
  );
  assert.equal(s.durum, "YOK");
  if (s.durum === "YOK") {
    assert.match(s.mesaj, /stokta cihaz yok/);
    assert.match(s.mesaj, /2 tanesi satılmış/);
    assert.match(s.mesaj, /1 tanesi sevkiyatta/);
  }
});

test("hepsi başka mağazadaysa nerede olduğu söyleniyor", () => {
  const s = cihazSec([aday({ magazaId: 9, magazaAdi: "3 Nolu Mağaza" })], BAGLAM);
  assert.equal(s.durum, "YOK");
  if (s.durum === "YOK") {
    assert.match(s.mesaj, /3 Nolu Mağaza/);
    assert.match(s.mesaj, /aktarılmalı/);
  }
});

test("hepsi listedeyse söyleniyor", () => {
  const s = cihazSec([aday({ id: 1 }), aday({ id: 2 })], { ...BAGLAM, secilmisIdler: [1, 2] });
  assert.equal(s.durum, "YOK");
  if (s.durum === "YOK") assert.match(s.mesaj, /zaten listede/);
});

test("uygunsuzluk mesajı boş listede kayıt yok diyor", () => {
  assert.match(uygunsuzlukMesaji([], BAGLAM), /kayıtlı değil/);
});

// --------------------------------------------------------- sıralama

test("seri numarası olanlar listede önce", () => {
  const sirali = siralaAdaylar([
    aday({ id: 1, seriNo: null }),
    aday({ id: 2, seriNo: "350000000000029" }),
    aday({ id: 3, seriNo: "350000000000011" }),
  ]);
  assert.deepEqual(sirali.map((a) => a.id), [3, 2, 1]);
});

test("serisizler kayıt sırasını koruyor", () => {
  const sirali = siralaAdaylar([aday({ id: 7, seriNo: null }), aday({ id: 3, seriNo: null })]);
  assert.deepEqual(sirali.map((a) => a.id), [3, 7]);
});

test("etiket seri numarasını gösteriyor", () => {
  assert.equal(adayEtiketi(aday({ seriNo: "350000000000011" })), "350000000000011");
  assert.match(adayEtiketi(aday({ id: 42, seriNo: null })), /seri no yok.*42/);
});

test("seçim başlığı sayıyı söylüyor", () => {
  assert.match(secimBasligi(BARKOD, 3), /3 uygun cihaz/);
  assert.match(secimBasligi(BARKOD, 3), new RegExp(BARKOD));
});
