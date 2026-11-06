import assert from "node:assert/strict";
import { test } from "node:test";
import { ayniSatisMi, satisBagiKarari } from "./satisKarti";

const T = (g: string) => new Date(`${g}T00:00:00.000Z`);

const kart = {
  musteriId: 7,
  satanKullaniciId: 2,
  odemeTipi: "NAKIT",
  satisTarihi: T("2026-11-01"),
};

// ------------------------------------------------------------- ayniSatisMi

test("aynı dört alan aynı satış", () => {
  assert.equal(ayniSatisMi(kart, { ...kart, satisTarihi: T("2026-11-01") }), true);
});

test("müşteri, satan, ödeme tipi ya da tarih değiştiyse aynı satış değil", () => {
  assert.equal(ayniSatisMi(kart, { ...kart, musteriId: 8 }), false);
  assert.equal(ayniSatisMi(kart, { ...kart, satanKullaniciId: 3 }), false);
  assert.equal(ayniSatisMi(kart, { ...kart, odemeTipi: "KREDI_KARTI" }), false);
  assert.equal(ayniSatisMi(kart, { ...kart, satisTarihi: T("2026-11-02") }), false);
});

test("iki tarafta da tarih yoksa aynı sayılıyor", () => {
  const bos = { ...kart, satisTarihi: null };
  assert.equal(ayniSatisMi(bos, { ...bos }), true);
  assert.equal(ayniSatisMi(bos, kart), false);
});

// --------------------------------------------------------- satisBagiKarari

test("kartı olmayan cihaza kart uydurulmuyor", () => {
  assert.deepEqual(satisBagiKarari(null, { ...kart, musteriId: 8 }), {
    tip: "kalsin",
  });
});

test("bilgiler değişmediyse karta dokunulmuyor", () => {
  const karar = satisBagiKarari({ ...kart, kalemSayisi: 3 }, { ...kart });
  assert.deepEqual(karar, { tip: "kalsin" });
});

test("tek cihazlı satışta kart cihaza uyduruluyor", () => {
  const karar = satisBagiKarari(
    { ...kart, kalemSayisi: 1 },
    { ...kart, musteriId: 8 },
  );
  assert.deepEqual(karar, { tip: "kaydiGuncelle" });
});

test("çok cihazlı satışta cihaz karttan koparılıyor", () => {
  // Diğer iki cihazın kartı bozulmamalı: üçünün müşterisi aynı sanılmasın.
  const karar = satisBagiKarari(
    { ...kart, kalemSayisi: 3 },
    { ...kart, musteriId: 8 },
  );
  assert.deepEqual(karar, { tip: "ayir" });
});

test("müşterisi silinen cihaz tek cihazlı satıştan da koparılıyor", () => {
  // Kartın müşterisi zorunlu; müşterisiz satışın kartı olamaz.
  const karar = satisBagiKarari(
    { ...kart, kalemSayisi: 1 },
    { ...kart, musteriId: null },
  );
  assert.deepEqual(karar, { tip: "ayir" });
});
