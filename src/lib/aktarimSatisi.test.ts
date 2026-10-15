import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EN_YUKSEK_TUTAR_KURUS,
  aktarimKari,
  aktarimSatisAciklamasi,
  aktarimSatisSorunu,
  aktarimSatislariniTopla,
  dokumleriBirlestir,
} from "./aktarimSatisi";

// ------------------------------------------------------------- doğrulama

test("geçerli satır sorun vermiyor", () => {
  assert.equal(
    aktarimSatisSorunu({ satisFiyatiKurus: 1300000, yeniAlisFiyatiKurus: 1200000 }),
    null,
  );
});

test("okunamayan satış fiyatı yakalanıyor", () => {
  const sorun = aktarimSatisSorunu({ satisFiyatiKurus: null, yeniAlisFiyatiKurus: 100 });
  assert.match(sorun ?? "", /Satış fiyatını/);
});

test("okunamayan yeni alış fiyatı yakalanıyor", () => {
  const sorun = aktarimSatisSorunu({ satisFiyatiKurus: 100, yeniAlisFiyatiKurus: null });
  assert.match(sorun ?? "", /Yeni alış fiyatını/);
});

test("satış fiyatı sıfır olamaz", () => {
  const sorun = aktarimSatisSorunu({ satisFiyatiKurus: 0, yeniAlisFiyatiKurus: 500000 });
  assert.match(sorun ?? "", /girilmeli/);
});

test("geri alış fiyatı sıfır olabilir", () => {
  // Cihaz bedelsiz geri alınmış olabilir; satış fiyatı varsa kayıt geçerli.
  assert.equal(aktarimSatisSorunu({ satisFiyatiKurus: 500000, yeniAlisFiyatiKurus: 0 }), null);
});

test("negatif tutarlar reddediliyor", () => {
  assert.ok(aktarimSatisSorunu({ satisFiyatiKurus: -1, yeniAlisFiyatiKurus: 100 }));
  assert.ok(aktarimSatisSorunu({ satisFiyatiKurus: 100, yeniAlisFiyatiKurus: -1 }));
});

test("ondalıklı kuruş değeri reddediliyor", () => {
  assert.ok(aktarimSatisSorunu({ satisFiyatiKurus: 100.5, yeniAlisFiyatiKurus: 100 }));
});

test("çok yüksek tutarlar reddediliyor", () => {
  assert.match(
    aktarimSatisSorunu({
      satisFiyatiKurus: EN_YUKSEK_TUTAR_KURUS + 1,
      yeniAlisFiyatiKurus: 100,
    }) ?? "",
    /Satış fiyatı çok yüksek/,
  );
  assert.match(
    aktarimSatisSorunu({
      satisFiyatiKurus: 100,
      yeniAlisFiyatiKurus: EN_YUKSEK_TUTAR_KURUS + 1,
    }) ?? "",
    /alış fiyatı çok yüksek/,
  );
});

test("sınır değer tam kabul ediliyor", () => {
  assert.equal(
    aktarimSatisSorunu({
      satisFiyatiKurus: EN_YUKSEK_TUTAR_KURUS,
      yeniAlisFiyatiKurus: EN_YUKSEK_TUTAR_KURUS,
    }),
    null,
  );
});

// ------------------------------------------------------------------- kâr

test("kâr satış anındaki maliyete göre hesaplanıyor", () => {
  // 10.000'e alınan cihaz 13.000'e satıldı, 12.000'e geri alındı.
  // Satışın kârı 3.000 TL; geri alış fiyatı kâra karışmıyor.
  assert.equal(aktarimKari(1300000, 1000000), 300000);
});

test("zararına satış negatif kâr veriyor", () => {
  assert.equal(aktarimKari(900000, 1000000), -100000);
});

test("maliyeti sıfır olan cihazın kârı satış fiyatının tamamı", () => {
  assert.equal(aktarimKari(500000, 0), 500000);
});

// ------------------------------------------------- aktarım satışı dökümü

test("aktarım satışları döküm satırına çevriliyor", () => {
  const dokum = aktarimSatislariniTopla([
    { anahtar: "Ebru", satisFiyatiKurus: 1300000, maliyetKurus: 1000000 },
  ]);
  assert.deepEqual(dokum, [
    { anahtar: "Ebru", satir: { adet: 1, satisKurus: 1300000, karKurus: 300000 } },
  ]);
});

test("her kayıt bir adet sayılıyor", () => {
  const dokum = aktarimSatislariniTopla([
    { anahtar: 1, satisFiyatiKurus: 100, maliyetKurus: 0 },
    { anahtar: 1, satisFiyatiKurus: 200, maliyetKurus: 0 },
  ]);
  assert.equal(dokum.length, 2);
  assert.ok(dokum.every((d) => d.satir.adet === 1));
});

test("boş liste boş döküm veriyor", () => {
  assert.deepEqual(aktarimSatislariniTopla([]), []);
});

// ----------------------------------------------------------- birleştirme

test("aynı anahtarın satırları toplanıyor", () => {
  const sonuc = dokumleriBirlestir([
    { anahtar: "Ebru", satir: { adet: 2, satisKurus: 1000, karKurus: 300 } },
    { anahtar: "Ebru", satir: { adet: 1, satisKurus: 500, karKurus: 100 } },
  ]);
  assert.equal(sonuc.length, 1);
  assert.deepEqual(sonuc[0], {
    anahtar: "Ebru",
    satir: { adet: 3, satisKurus: 1500, karKurus: 400 },
  });
});

test("farklı anahtarlar ayrı kalıyor", () => {
  const sonuc = dokumleriBirlestir([
    { anahtar: "Ebru", satir: { adet: 1, satisKurus: 100, karKurus: 10 } },
    { anahtar: "Ülkü", satir: { adet: 1, satisKurus: 200, karKurus: 20 } },
  ]);
  assert.equal(sonuc.length, 2);
  assert.deepEqual(
    sonuc.map((s) => s.anahtar).sort(),
    ["Ebru", "Ülkü"],
  );
});

test("cihaz satışı ile aktarım satışı birleşiyor", () => {
  // Personelin 1 normal satışı (2.000 kâr) ve 1 aktarım satışı (300 kâr) var.
  const cihazSatislari = [{ anahtar: 7, satir: { adet: 1, satisKurus: 1500000, karKurus: 200000 } }];
  const aktarimlar = aktarimSatislariniTopla([
    { anahtar: 7, satisFiyatiKurus: 1300000, maliyetKurus: 1270000 },
  ]);
  const sonuc = dokumleriBirlestir([...cihazSatislari, ...aktarimlar]);
  assert.equal(sonuc.length, 1);
  assert.deepEqual(sonuc[0].satir, { adet: 2, satisKurus: 2800000, karKurus: 230000 });
});

test("yalnız aktarım satışı olan personel dökümde çıkıyor", () => {
  const sonuc = dokumleriBirlestir(
    aktarimSatislariniTopla([{ anahtar: 9, satisFiyatiKurus: 100, maliyetKurus: 40 }]),
  );
  assert.deepEqual(sonuc, [{ anahtar: 9, satir: { adet: 1, satisKurus: 100, karKurus: 60 } }]);
});

test("birleştirme girdi satırlarını değiştirmiyor", () => {
  const girdi = { anahtar: "A", satir: { adet: 1, satisKurus: 100, karKurus: 10 } };
  dokumleriBirlestir([girdi, { anahtar: "A", satir: { adet: 5, satisKurus: 500, karKurus: 50 } }]);
  assert.deepEqual(girdi.satir, { adet: 1, satisKurus: 100, karKurus: 10 });
});

test("boş birleştirme boş dönüyor", () => {
  assert.deepEqual(dokumleriBirlestir([]), []);
});

// -------------------------------------------------------------- açıklama

test("fiyat değiştiyse açıklamada eski → yeni yazıyor", () => {
  const metin = aktarimSatisAciklamasi({
    musteriAdi: "Ayşe Yılmaz",
    satisFiyatiYazi: "13.000,00",
    eskiAlisYazi: "10.000,00",
    yeniAlisYazi: "12.000,00",
  });
  assert.match(metin, /Ayşe Yılmaz müşterisine 13\.000,00 TL'ye satılıp geri alındı/);
  assert.match(metin, /alış fiyatı 10\.000,00 → 12\.000,00 TL/);
});

test("fiyat değişmediyse açıklama tekrar etmiyor", () => {
  const metin = aktarimSatisAciklamasi({
    musteriAdi: "Ayşe Yılmaz",
    satisFiyatiYazi: "13.000,00",
    eskiAlisYazi: "10.000,00",
    yeniAlisYazi: "10.000,00",
  });
  assert.ok(!metin.includes("→"), metin);
});
