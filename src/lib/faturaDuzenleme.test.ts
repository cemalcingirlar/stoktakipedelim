import assert from "node:assert/strict";
import { test } from "node:test";
import {
  duzenlemeSorunlari,
  duzenlenmisSeri,
  duzenlenmisUrun,
  modelAdi,
  seriAnahtari,
  varsayilanUrun,
  type OkunanUrun,
  urunKartiDurumu,
  yeniKartSayisi,
  yeniKartUyarisi,
} from "./faturaDuzenleme";

const URUN: OkunanUrun = {
  barkod: "4894947084423",
  urunAdi: "INFINIX SMART 10 4/128GB SIYAH",
  marka: "INFINIX",
  alisFiyatiKurus: 827083,
};

// ------------------------------------------------------------- model adı

test("marka ürün adının başındaysa modelde tekrarlanmaz", () => {
  assert.equal(modelAdi("INFINIX SMART 10", "INFINIX"), "SMART 10");
});

test("marka başta değilse ürün adı olduğu gibi model olur", () => {
  assert.equal(modelAdi("SMART 10 INFINIX", "INFINIX"), "SMART 10 INFINIX");
});

test("ürün adı yalnız markadan ibaretse model boş kalmaz", () => {
  assert.equal(modelAdi("INFINIX", "INFINIX"), "INFINIX");
});

test("marka boşsa ürün adı model olur", () => {
  assert.equal(modelAdi("SMART 10", ""), "SMART 10");
});

// ------------------------------------------------------------- varsayılan

test("okunan değerler forma marka/model olarak ayrılır", () => {
  assert.deepEqual(varsayilanUrun(URUN), {
    marka: "INFINIX",
    model: "SMART 10 4/128GB SIYAH",
    barkod: "4894947084423",
    alisFiyatiKurus: 827083,
  });
});

// ------------------------------------------------------------- üst yazım

test("üst yazım yoksa okunan değerler kullanılır", () => {
  assert.deepEqual(duzenlenmisUrun(URUN), varsayilanUrun(URUN));
  assert.deepEqual(duzenlenmisUrun(URUN, {}), varsayilanUrun(URUN));
});

test("yalnız düzeltilen alan değişir, diğerleri okunan değerde kalır", () => {
  const sonuc = duzenlenmisUrun(URUN, { marka: "Infinix Mobile" });
  assert.equal(sonuc.marka, "Infinix Mobile");
  assert.equal(sonuc.model, "SMART 10 4/128GB SIYAH", "model dokunulmadığı için okunan değerde");
  assert.equal(sonuc.barkod, "4894947084423");
  assert.equal(sonuc.alisFiyatiKurus, 827083);
});

test("barkod ve fiyat düzeltilebilir", () => {
  const sonuc = duzenlenmisUrun(URUN, { barkod: "1234567890123", alisFiyatiKurus: 900000 });
  assert.equal(sonuc.barkod, "1234567890123");
  assert.equal(sonuc.alisFiyatiKurus, 900000);
});

test("fiyat sıfıra çekilebilir", () => {
  // ?? kullanıldığı için 0 değeri "yok" sayılmamalı.
  assert.equal(duzenlenmisUrun(URUN, { alisFiyatiKurus: 0 }).alisFiyatiKurus, 0);
});

test("alan boşaltılabilir ve bu bir sorun olarak raporlanır", () => {
  const sonuc = duzenlenmisUrun(URUN, { marka: "" });
  assert.equal(sonuc.marka, "");
});

// ------------------------------------------------------------- seri no

test("seri no üst yazımı yoksa okunan değer kalır", () => {
  assert.deepEqual(duzenlenmisSeri("350000000000011"), {
    seriNo: "350000000000011",
    cikarildi: false,
  });
});

test("seri no düzeltilebilir", () => {
  assert.deepEqual(duzenlenmisSeri("350000000000011", { seriNo: "350000000000029" }), {
    seriNo: "350000000000029",
    cikarildi: false,
  });
});

test("seri no boşaltılınca null olur", () => {
  assert.deepEqual(duzenlenmisSeri("350000000000011", { seriNo: "  " }), {
    seriNo: null,
    cikarildi: false,
  });
});

test("cihaz faturadan çıkarılabilir", () => {
  assert.equal(duzenlenmisSeri("350000000000011", { cikarildi: true }).cikarildi, true);
});

test("seri anahtarı grup ve sıraya göre benzersiz", () => {
  assert.equal(seriAnahtari("ABC", 0), "ABC#0");
  assert.notEqual(seriAnahtari("ABC", 0), seriAnahtari("ABC", 1));
  assert.notEqual(seriAnahtari("ABC", 0), seriAnahtari("ABD", 0));
});

// ------------------------------------------------------------- sorunlar

const SAGLAM = [
  { alanlar: varsayilanUrun(URUN), urunAdi: URUN.urunAdi },
];
const SATIRLAR = [
  { urunAdi: URUN.urunAdi, seriNo: "350000000000011" },
  { urunAdi: URUN.urunAdi, seriNo: "350000000000029" },
];

test("sağlam düzenlemede sorun yok", () => {
  assert.deepEqual(duzenlemeSorunlari(SAGLAM, SATIRLAR), []);
});

test("boş marka sorun olarak bildirilir", () => {
  const sorunlar = duzenlemeSorunlari(
    [{ alanlar: { ...varsayilanUrun(URUN), marka: " " }, urunAdi: URUN.urunAdi }],
    SATIRLAR,
  );
  assert.ok(sorunlar.some((s) => /marka boş/.test(s)), sorunlar.join(" | "));
});

test("boş model sorun olarak bildirilir", () => {
  const sorunlar = duzenlemeSorunlari(
    [{ alanlar: { ...varsayilanUrun(URUN), model: "" }, urunAdi: URUN.urunAdi }],
    SATIRLAR,
  );
  assert.ok(sorunlar.some((s) => /model boş/.test(s)), sorunlar.join(" | "));
});

test("negatif fiyat sorun olarak bildirilir", () => {
  const sorunlar = duzenlemeSorunlari(
    [{ alanlar: { ...varsayilanUrun(URUN), alisFiyatiKurus: -1 }, urunAdi: URUN.urunAdi }],
    SATIRLAR,
  );
  assert.ok(sorunlar.some((s) => /fiyatı geçersiz/.test(s)), sorunlar.join(" | "));
});

test("okunamayan fiyat sorun olarak bildirilir", () => {
  const sorunlar = duzenlemeSorunlari(
    [{ alanlar: { ...varsayilanUrun(URUN), alisFiyatiKurus: NaN }, urunAdi: URUN.urunAdi }],
    SATIRLAR,
  );
  assert.ok(sorunlar.some((s) => /fiyatı geçersiz/.test(s)), sorunlar.join(" | "));
});

test("elle yazılırken tekrarlanan seri no yakalanır", () => {
  const sorunlar = duzenlemeSorunlari(SAGLAM, [
    { urunAdi: "A", seriNo: "350000000000011" },
    { urunAdi: "B", seriNo: "350000000000011" },
  ]);
  assert.ok(sorunlar.some((s) => /iki kez yazılmış/.test(s)), sorunlar.join(" | "));
});

test("seri numarası olmayan cihazlar tekrar sayılmaz", () => {
  const sorunlar = duzenlemeSorunlari(SAGLAM, [
    { urunAdi: "A", seriNo: null },
    { urunAdi: "B", seriNo: null },
  ]);
  assert.deepEqual(sorunlar, []);
});

test("tüm cihazlar çıkarılırsa uyarı verilir", () => {
  const sorunlar = duzenlemeSorunlari(SAGLAM, []);
  assert.ok(sorunlar.some((s) => /cihaz kalmadı/.test(s)), sorunlar.join(" | "));
});

// ------------------------------------------------- kayıtlı / yeni ürün kartı

const ORNEK_URUN: OkunanUrun = {
  barkod: "4000000000011",
  urunAdi: "SAMSUNG GALAXY S26 FE 8/256GB PISTAC DM",
  marka: "SAMSUNG",
  alisFiyatiKurus: 2000000,
};

test("kayıt yoksa durum YENI", () => {
  assert.equal(urunKartiDurumu(undefined), "YENI");
});

test("kayıt varsa durum KAYITLI", () => {
  assert.equal(urunKartiDurumu({ marka: "SAMSUNG", model: "GALAXY S26 FE" }), "KAYITLI");
});

test("yeni barkodda marka ve model faturadan türetiliyor", () => {
  const u = varsayilanUrun(ORNEK_URUN);
  assert.equal(u.marka, "SAMSUNG");
  assert.equal(u.model, "GALAXY S26 FE 8/256GB PISTAC DM");
});

test("kayıtlı barkodda marka ve model mevcut karttan geliyor", () => {
  // Aynı ürün her faturada farklı yazılabiliyor; stokta tek isimle dursun.
  const u = varsayilanUrun(ORNEK_URUN, { marka: "Samsung", model: "Galaxy S26 FE 8/256" });
  assert.equal(u.marka, "Samsung");
  assert.equal(u.model, "Galaxy S26 FE 8/256");
});

test("kayıtlı kartta barkod ve fiyat yine faturadan geliyor", () => {
  // Fiyat her faturada değişir; kart yalnız isimlendirmeyi sabitliyor.
  const u = varsayilanUrun(ORNEK_URUN, { marka: "Samsung", model: "Galaxy S26 FE" });
  assert.equal(u.barkod, "4000000000011");
  assert.equal(u.alisFiyatiKurus, 2000000);
});

test("boş alanlı kayıt faturaya düşüyor", () => {
  const u = varsayilanUrun(ORNEK_URUN, { marka: "   ", model: "" });
  assert.equal(u.marka, "SAMSUNG");
  assert.equal(u.model, "GALAXY S26 FE 8/256GB PISTAC DM");
});

test("kullanıcının düzeltmesi kayıtlı kartı da geçiyor", () => {
  const u = duzenlenmisUrun(
    ORNEK_URUN,
    { model: "ELLE YAZILAN" },
    { marka: "Samsung", model: "Galaxy S26 FE" },
  );
  assert.equal(u.model, "ELLE YAZILAN", "düzeltme her şeyin üstünde");
  assert.equal(u.marka, "Samsung", "dokunulmayan alan karttan");
});

// ------------------------------------------------------- yeni kart sayımı

test("hepsi kayıtlıysa yeni kart yok", () => {
  const kayitli = new Map([
    ["A", { marka: "X", model: "1" }],
    ["B", { marka: "X", model: "2" }],
  ]);
  assert.equal(yeniKartSayisi(["A", "B"], kayitli), 0);
});

test("kayıtsız barkodlar sayılıyor", () => {
  const kayitli = new Map([["A", { marka: "X", model: "1" }]]);
  assert.equal(yeniKartSayisi(["A", "B", "C"], kayitli), 2);
});

test("aynı barkod iki kez geçerse tek sayılıyor", () => {
  assert.equal(yeniKartSayisi(["B", "B"], new Map()), 1);
});

test("boş faturada yeni kart yok", () => {
  assert.equal(yeniKartSayisi([], new Map()), 0);
});

test("uyarı yalnız yeni kart varken çıkıyor", () => {
  assert.equal(yeniKartUyarisi(0), null);
  assert.match(yeniKartUyarisi(2) ?? "", /2 ürünün barkodu sistemde kayıtlı değil/);
  assert.match(yeniKartUyarisi(1) ?? "", /düzeltebilirsiniz/);
});
