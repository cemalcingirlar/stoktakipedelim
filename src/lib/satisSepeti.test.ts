import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cihazAdi,
  cihazKari,
  etkinSatisKurusu,
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

test("sepete eklenen cihazın satış fiyatı alış fiyatıyla dolu gelir", () => {
  const sonuc = sepeteEkle([], cihaz(1, 1239000));
  assert.ok("sepet" in sonuc);
  assert.equal(sonuc.sepet.length, 1);
  // 10 cihazlık satışta her kutuyu elle doldurmak yavaş ve hataya açıktı.
  assert.equal(sonuc.sepet[0].satisFiyati, "12.390,00");
  assert.equal(cihazKari(sonuc.sepet[0]), 0, "dolu gelen fiyatta kâr sıfır");
});

test("kuruşlu alış fiyatı da doğru yazılır", () => {
  const sonuc = sepeteEkle([], cihaz(1, 2549417));
  assert.ok("sepet" in sonuc);
  assert.equal(sonuc.sepet[0].satisFiyati, "25.494,17");
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

test("boş fiyat alış fiyatı sayılır, kâr sıfır olur", () => {
  // Satış fiyatı kaydetmenin önkoşulu değil: boş bırakılırsa alış fiyatına
  // satılmış sayılıyor, kullanıcı engellenmiyor.
  assert.equal(etkinSatisKurusu(cihaz(1, 1000000)), 1000000);
  assert.equal(cihazKari(cihaz(1, 1000000)), 0);
});

test("okunamayan fiyat sessizce alış fiyatına düşmez", () => {
  // Yazım hatasını alış fiyatı sayıp geçmek yanlış olurdu; burada duruyoruz.
  assert.equal(etkinSatisKurusu(cihaz(1, 1000000, "abc")), null);
  assert.equal(cihazKari(cihaz(1, 1000000, "abc")), null);
});

test("yazılan fiyat alış fiyatını ezer", () => {
  assert.equal(etkinSatisKurusu(cihaz(1, 1000000, "13.000,00")), 1300000);
  assert.equal(cihazKari(cihaz(1, 1000000, "13.000,00")), 300000);
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

test("boş fiyatlı cihaz özette alış fiyatıyla toplanır", () => {
  const sepet = [cihaz(1, 1000000, "13.000,00"), cihaz(2, 20000)];
  const ozet = sepetOzeti(sepet);
  assert.equal(ozet.fiyatiEksik, 0, "boş alan eksik sayılmaz");
  assert.equal(ozet.satisKurus, 1320000, "13.000,00 + 200,00 (alış)");
  assert.equal(ozet.alisKurus, 1020000);
  assert.equal(ozet.karKurus, 300000, "boş fiyatlı cihaz kâra katkı vermez");
});

test("okunamayan fiyatlı cihaz özette eksik sayılır", () => {
  const ozet = sepetOzeti([cihaz(1, 1000000, "13.000,00"), cihaz(2, 20000, "abc")]);
  assert.equal(ozet.fiyatiEksik, 1);
  assert.equal(ozet.satisKurus, 1300000);
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

test("boş fiyatlı cihaz alış fiyatıyla satır üretir", () => {
  assert.deepEqual(sepetSatirlari([cihaz(1, 100, "13.000,00"), cihaz(2, 200)]), [
    { cihazId: 1, satisFiyatiKurus: 1300000 },
    { cihazId: 2, satisFiyatiKurus: 200 },
  ]);
});

test("okunamayan fiyat satır üretmez", () => {
  assert.equal(sepetSatirlari([cihaz(1, 100, "13.000,00"), cihaz(2, 200, "abc")]), null);
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

test("boş fiyat kaydetmeye engel değil", () => {
  // Asıl istenen bu: satış fiyatı önkoşul olmasın.
  assert.deepEqual(sepetSorunlari([cihaz(1, 100, "500,00"), cihaz(2, 200)], true), []);
});

test("okunamayan fiyat cihaz adıyla bildirilir", () => {
  const sorunlar = sepetSorunlari([cihaz(1, 100, "500,00"), cihaz(2, 200, "abc")], true);
  assert.equal(sorunlar.length, 1);
  assert.match(sorunlar[0], /Galaxy A2 için satış fiyatı okunamadı/);
});

test("negatif fiyat cihaz adıyla bildirilir", () => {
  const sorunlar = sepetSorunlari([cihaz(1, 100, "-1,00")], true);
  assert.ok(sorunlar.some((s) => /negatif olamaz/.test(s)), sorunlar.join(" | "));
});

test("cihaz adı marka ve modelden kurulur", () => {
  assert.equal(cihazAdi({ marka: "Samsung", model: "Galaxy A55" }), "Samsung Galaxy A55");
  assert.equal(cihazAdi({ marka: " Apple ", model: "  iPhone 15 " }), "Apple iPhone 15");
});
