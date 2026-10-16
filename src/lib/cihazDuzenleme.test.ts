import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MARKA_EN_COK,
  MODEL_EN_COK,
  degisiklikOzeti,
  degisiklikVarMi,
  duzenlemeSorunu,
  kapsamSorulmali,
  kapsamSorusu,
  sonucMesaji,
  varsayilanKapsam,
  type KunyeDurumu,
} from "./cihazDuzenleme";

// ------------------------------------------------------------- kapsam

test("barkodda tek cihaz varsa soru sorulmuyor", () => {
  assert.equal(kapsamSorulmali("4000000000011", 1), false);
  assert.equal(varsayilanKapsam("4000000000011", 1), "TEK");
});

test("barkodda birden çok cihaz varsa soruluyor", () => {
  assert.equal(kapsamSorulmali("4000000000011", 20), true);
  assert.equal(varsayilanKapsam("4000000000011", 20), "BARKOD");
});

test("barkodu olmayan cihazda soru sorulmuyor", () => {
  // Barkodsuz cihazda "aynı barkodtakiler" diye bir küme yok.
  assert.equal(kapsamSorulmali(null, 5), false);
  assert.equal(varsayilanKapsam(null, 5), "TEK");
});

test("sıfır adet de soru doğurmuyor", () => {
  assert.equal(kapsamSorulmali("4000000000011", 0), false);
});

// -------------------------------------------------------- doğrulama

test("boş değişiklik reddediliyor", () => {
  assert.match(duzenlemeSorunu({}) ?? "", /Değiştirilecek bir şey/);
  assert.equal(degisiklikVarMi({}), false);
});

test("tek alanlık değişiklik geçerli", () => {
  assert.equal(duzenlemeSorunu({ marka: "APPLE" }), null);
  assert.equal(duzenlemeSorunu({ kategoriId: 3 }), null);
  assert.equal(duzenlemeSorunu({ altKategoriId: null }), null, "alt kategori kaldırma");
});

test("boş marka ve model reddediliyor", () => {
  assert.match(duzenlemeSorunu({ marka: "   " }) ?? "", /Marka boş/);
  assert.match(duzenlemeSorunu({ model: "" }) ?? "", /Model boş/);
});

test("çok uzun marka ve model reddediliyor", () => {
  assert.match(duzenlemeSorunu({ marka: "A".repeat(MARKA_EN_COK + 1) }) ?? "", /en çok/);
  assert.match(duzenlemeSorunu({ model: "A".repeat(MODEL_EN_COK + 1) }) ?? "", /en çok/);
  assert.equal(duzenlemeSorunu({ marka: "A".repeat(MARKA_EN_COK) }), null, "sınır değer");
});

test("geçersiz kategori kimliği reddediliyor", () => {
  assert.ok(duzenlemeSorunu({ kategoriId: 0 }));
  assert.ok(duzenlemeSorunu({ kategoriId: -1 }));
  assert.ok(duzenlemeSorunu({ kategoriId: 1.5 }));
  assert.ok(duzenlemeSorunu({ altKategoriId: 0 }));
});

// ------------------------------------------------------------- özet

const ESKI: KunyeDurumu = {
  marka: "APPLE",
  model: "USB-C CABLE",
  kategoriAdi: "Cep Telefonu",
  altKategoriAdi: "Sıfır",
};

test("yalnız değişen alanlar özete giriyor", () => {
  const ozet = degisiklikOzeti(ESKI, { ...ESKI, kategoriAdi: "Aksesuar" });
  assert.equal(ozet, "Kategori Cep Telefonu → Aksesuar");
});

test("değişiklik yoksa özet boş", () => {
  assert.equal(degisiklikOzeti(ESKI, { ...ESKI }), "");
});

test("birden çok değişiklik ayraçla birleşiyor", () => {
  const ozet = degisiklikOzeti(ESKI, {
    marka: "Apple",
    model: "USB-C Kablo",
    kategoriAdi: "Aksesuar",
    altKategoriAdi: "Kablo / Şarj",
  });
  assert.match(ozet, /Marka APPLE → Apple/);
  assert.match(ozet, /Kategori Cep Telefonu → Aksesuar/);
  assert.match(ozet, /Alt kategori Sıfır → Kablo \/ Şarj/);
  assert.equal(ozet.split(" · ").length, 4);
});

test("alt kategori kaldırma özete yazılıyor", () => {
  const ozet = degisiklikOzeti(ESKI, { ...ESKI, altKategoriAdi: null });
  assert.equal(ozet, "Alt kategori Sıfır → —");
});

test("alt kategorisi olmayanda boş ile null aynı sayılıyor", () => {
  const bos: KunyeDurumu = { ...ESKI, altKategoriAdi: null };
  assert.equal(degisiklikOzeti(bos, { ...bos }), "");
});

// ------------------------------------------------------------ metinler

test("kapsam sorusu barkodu ve adedi söylüyor", () => {
  const soru = kapsamSorusu("4000000000011", 20);
  assert.match(soru, /4000000000011/);
  assert.match(soru, /20 cihaz/);
});

test("sonuç mesajı kapsama göre değişiyor", () => {
  assert.equal(sonucMesaji("TEK", 1), "Cihaz güncellendi.");
  assert.equal(sonucMesaji("BARKOD", 20), "20 cihaz güncellendi.");
});
