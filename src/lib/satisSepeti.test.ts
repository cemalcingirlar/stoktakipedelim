import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cihazAdi,
  cihazKari,
  fiyatiYaz,
  sepetOzeti,
  sepetSatirlari,
  sepetSorunlari,
  sepeteEkle,
  sepettenCikar,
  type SepetCihazi,
} from "./satisSepeti";

function cihaz(id: number, alis: number, satis = ""): SepetCihazi {
  return {
    id,
    marka: "Samsung",
    model: `Galaxy A${id}`,
    seriNo: `35000000000${id}`,
    barkod: null,
    magazaId: 1,
    magazaAdi: "KOZAN CADDESİ",
    alisFiyatiKurus: alis,
    satisFiyati: satis,
  };
}

// ----------------------------------------------------------------- ekleme

test("sepete cihaz eklenir", () => {
  const sonuc = sepeteEkle([], cihaz(1, 100000));
  assert.ok("sepet" in sonuc);
  assert.equal(sonuc.sepet.length, 1);
  assert.equal(sonuc.sepet[0].satisFiyati, "", "fiyat boş başlar");
});

test("ikinci cihaz birincinin yanına eklenir", () => {
  const ilk = sepeteEkle([], cihaz(1, 100000));
  assert.ok("sepet" in ilk);
  const ikinci = sepeteEkle(ilk.sepet, cihaz(2, 50000));
  assert.ok("sepet" in ikinci);
  assert.deepEqual(
    ikinci.sepet.map((c) => c.id),
    [1, 2],
    "önceki cihaz değişmemeli",
  );
});

test("aynı cihaz iki kez okutulursa eklenmez", () => {
  const ilk = sepeteEkle([], cihaz(1, 100000));
  assert.ok("sepet" in ilk);
  const tekrar = sepeteEkle(ilk.sepet, cihaz(1, 100000));
  assert.ok("hata" in tekrar);
  assert.match(tekrar.hata, /zaten listede/);
});

test("sepetten cihaz çıkarılır", () => {
  const sepet = [cihaz(1, 100), cihaz(2, 200), cihaz(3, 300)];
  assert.deepEqual(
    sepettenCikar(sepet, 2).map((c) => c.id),
    [1, 3],
  );
});

test("olmayan cihazı çıkarmak sepeti bozmaz", () => {
  const sepet = [cihaz(1, 100)];
  assert.deepEqual(sepettenCikar(sepet, 9).map((c) => c.id), [1]);
});

test("fiyat yalnız hedef cihaza yazılır", () => {
  const sepet = [cihaz(1, 100), cihaz(2, 200)];
  const yeni = fiyatiYaz(sepet, 2, "1.500,00");
  assert.equal(yeni[0].satisFiyati, "");
  assert.equal(yeni[1].satisFiyati, "1.500,00");
});

// ----------------------------------------------------------------- kâr

test("cihaz kârı satış eksi alış", () => {
  assert.equal(cihazKari(cihaz(1, 1000000, "13.000,00")), 300000);
});

test("zararına satışta kâr negatif", () => {
  assert.equal(cihazKari(cihaz(1, 1000000, "9.000,00")), -100000);
});

test("fiyat girilmemişse kâr hesaplanmaz", () => {
  assert.equal(cihazKari(cihaz(1, 1000000)), null);
});

// ----------------------------------------------------------------- özet

test("boş sepetin özeti sıfır", () => {
  assert.deepEqual(sepetOzeti([]), {
    adet: 0,
    satisKurus: 0,
    alisKurus: 0,
    karKurus: 0,
    fiyatiEksik: 0,
  });
});

test("özet adet, tutar ve kârı toplar", () => {
  const sepet = [cihaz(1, 1000000, "13.000,00"), cihaz(2, 20000, "500,00")];
  assert.deepEqual(sepetOzeti(sepet), {
    adet: 2,
    satisKurus: 1350000,
    alisKurus: 1020000,
    karKurus: 330000,
    fiyatiEksik: 0,
  });
});

test("fiyatı girilmemiş cihaz özette sayılır ama tutara girmez", () => {
  const sepet = [cihaz(1, 1000000, "13.000,00"), cihaz(2, 20000)];
  const ozet = sepetOzeti(sepet);
  assert.equal(ozet.fiyatiEksik, 1);
  assert.equal(ozet.satisKurus, 1300000);
  assert.equal(ozet.alisKurus, 1020000, "alış fiyatı yine de toplanır");
});

test("Türkçe para biçimi doğru toplanır", () => {
  const sepet = [cihaz(1, 0, "1.234,56"), cihaz(2, 0, "2.000,44")];
  assert.equal(sepetOzeti(sepet).satisKurus, 323500);
});

// ----------------------------------------------------------------- satırlar

test("kayıt satırları cihaz başına fiyat taşır", () => {
  const sepet = [cihaz(1, 1000000, "13.000,00"), cihaz(2, 20000, "500,00")];
  assert.deepEqual(sepetSatirlari(sepet), [
    { cihazId: 1, satisFiyatiKurus: 1300000 },
    { cihazId: 2, satisFiyatiKurus: 50000 },
  ]);
});

test("fiyatı eksik sepet satır üretmez", () => {
  assert.equal(sepetSatirlari([cihaz(1, 100, "13.000,00"), cihaz(2, 200)]), null);
});

test("boş sepet satır üretmez", () => {
  assert.equal(sepetSatirlari([]), null);
});

test("negatif fiyat satır üretmez", () => {
  assert.equal(sepetSatirlari([cihaz(1, 100, "-5,00")]), null);
});

test("sıfır fiyat geçerli (promosyon / hediye)", () => {
  assert.deepEqual(sepetSatirlari([cihaz(1, 100, "0,00")]), [
    { cihazId: 1, satisFiyatiKurus: 0 },
  ]);
});

// ----------------------------------------------------------------- sorunlar

test("dolu sepet ve müşteri varsa sorun yok", () => {
  assert.deepEqual(sepetSorunlari([cihaz(1, 100, "500,00")], true), []);
});

test("boş sepet uyarı verir", () => {
  assert.ok(sepetSorunlari([], true).some((s) => /cihaz okutun/.test(s)));
});

test("müşterisiz satış uyarı verir", () => {
  const sorunlar = sepetSorunlari([cihaz(1, 100, "500,00")], false);
  assert.ok(sorunlar.some((s) => /Müşteri seçin/.test(s)), sorunlar.join(" | "));
});

test("fiyatı eksik cihaz adıyla bildirilir", () => {
  const sorunlar = sepetSorunlari([cihaz(1, 100, "500,00"), cihaz(2, 200)], true);
  assert.equal(sorunlar.length, 1);
  assert.match(sorunlar[0], /Galaxy A2 için satış fiyatı girin/);
});

test("negatif fiyat cihaz adıyla bildirilir", () => {
  const sorunlar = sepetSorunlari([cihaz(1, 100, "-1,00")], true);
  assert.ok(sorunlar.some((s) => /negatif olamaz/.test(s)), sorunlar.join(" | "));
});

test("cihaz adı marka ve modelden kurulur", () => {
  assert.equal(cihazAdi({ marka: "Samsung", model: "Galaxy A55" }), "Samsung Galaxy A55");
  assert.equal(cihazAdi({ marka: " Apple ", model: "  iPhone 15 " }), "Apple iPhone 15");
});
