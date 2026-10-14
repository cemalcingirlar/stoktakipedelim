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
