import assert from "node:assert/strict";
import { test } from "node:test";
import {
  baskinSecim,
  gecmistenSecim,
  tumuneUygula,
  urunSecimi,
  type BarkodGecmisKaydi,
} from "./kategoriSecim";

const SINIFLANDIRILMAMIS = 9;

function gecmisHarita(kayitlar: BarkodGecmisKaydi[]): Map<string, BarkodGecmisKaydi> {
  return new Map(kayitlar.map((k) => [k.barkod, k]));
}

test("geçmiş kaydı seçime çevrilir", () => {
  assert.deepEqual(gecmistenSecim({ barkod: "A", kategoriId: 1, altKategoriId: 2 }), {
    kat: "1",
    alt: "2",
  });
});

test("alt kategorisi olmayan geçmiş boş alt verir", () => {
  assert.deepEqual(gecmistenSecim({ barkod: "A", kategoriId: 1, altKategoriId: null }), {
    kat: "1",
    alt: "",
  });
});

// ------------------------------------------------------------- baskın seçim

test("tek bilinen ürün baskın seçimi belirler", () => {
  const baskin = baskinSecim(
    ["A", "B", "C"],
    gecmisHarita([{ barkod: "A", kategoriId: 1, altKategoriId: 2 }]),
  );
  assert.deepEqual(baskin, { kat: "1", alt: "2" });
});

test("çoğunluktaki kategori baskın olur", () => {
  const baskin = baskinSecim(
    ["A", "B", "C"],
    gecmisHarita([
      { barkod: "A", kategoriId: 1, altKategoriId: 2 },
      { barkod: "B", kategoriId: 1, altKategoriId: 2 },
      { barkod: "C", kategoriId: 5, altKategoriId: null },
    ]),
  );
  assert.deepEqual(baskin, { kat: "1", alt: "2" });
});

test("alt kategori de sayıma giriyor", () => {
  // Aynı kategori ama iki farklı alt kategori: çoğunluk hangisindeyse o.
  const baskin = baskinSecim(
    ["A", "B", "C"],
    gecmisHarita([
      { barkod: "A", kategoriId: 1, altKategoriId: 7 },
      { barkod: "B", kategoriId: 1, altKategoriId: 7 },
      { barkod: "C", kategoriId: 1, altKategoriId: 8 },
    ]),
  );
  assert.deepEqual(baskin, { kat: "1", alt: "7" });
});

test("hiçbiri bilinmiyorsa baskın seçim yok", () => {
  assert.equal(baskinSecim(["A", "B"], gecmisHarita([])), null);
});

test("geçmişte olup faturada olmayan barkod sayıma girmez", () => {
  const baskin = baskinSecim(
    ["A"],
    gecmisHarita([
      { barkod: "A", kategoriId: 1, altKategoriId: null },
      { barkod: "Z", kategoriId: 5, altKategoriId: null },
      { barkod: "Y", kategoriId: 5, altKategoriId: null },
    ]),
  );
  assert.deepEqual(baskin, { kat: "1", alt: "" });
});

// ------------------------------------------------------------- ürün seçimi

test("kullanıcının elle seçimi her şeyin önüne geçer", () => {
  const secim = urunSecimi("A", {
    ustYazim: { A: { kat: "3", alt: "4" } },
    gecmis: gecmisHarita([{ barkod: "A", kategoriId: 1, altKategoriId: 2 }]),
    baskin: { kat: "5", alt: "" },
    varsayilanKategoriId: SINIFLANDIRILMAMIS,
  });
  assert.deepEqual(secim, { kat: "3", alt: "4" });
});

test("elle seçim yoksa barkodun kendi geçmişi kullanılır", () => {
  const secim = urunSecimi("A", {
    ustYazim: {},
    gecmis: gecmisHarita([{ barkod: "A", kategoriId: 1, altKategoriId: 2 }]),
    baskin: { kat: "5", alt: "" },
    varsayilanKategoriId: SINIFLANDIRILMAMIS,
  });
  assert.deepEqual(secim, { kat: "1", alt: "2" });
});

test("geçmişi olmayan ürün faturadaki baskın seçimi alır", () => {
  // İstenen davranış: fatura genelde tek tür mal taşıyor, yeni ürün de
  // diğerleriyle aynı kategoriye düşsün.
  const secim = urunSecimi("YENI", {
    ustYazim: {},
    gecmis: gecmisHarita([{ barkod: "A", kategoriId: 1, altKategoriId: 2 }]),
    baskin: { kat: "1", alt: "2" },
    varsayilanKategoriId: SINIFLANDIRILMAMIS,
  });
  assert.deepEqual(secim, { kat: "1", alt: "2" });
});

test("geçmişte alt kategori boşsa baskın alt kategoriden tamamlanır", () => {
  // Ekranda görülen durum: aynı kategoride kimi ürünün alt kategorisi var,
  // kiminin yok. Boş olan bilinçli bir seçim değil, eksiklik.
  const secim = urunSecimi("B", {
    ustYazim: {},
    gecmis: gecmisHarita([
      { barkod: "A", kategoriId: 1, altKategoriId: 2 },
      { barkod: "B", kategoriId: 1, altKategoriId: null },
    ]),
    baskin: { kat: "1", alt: "2" },
    varsayilanKategoriId: SINIFLANDIRILMAMIS,
  });
  assert.deepEqual(secim, { kat: "1", alt: "2" });
});

test("farklı kategorideki baskın alt kategori taşınmaz", () => {
  const secim = urunSecimi("B", {
    ustYazim: {},
    gecmis: gecmisHarita([{ barkod: "B", kategoriId: 5, altKategoriId: null }]),
    baskin: { kat: "1", alt: "2" },
    varsayilanKategoriId: SINIFLANDIRILMAMIS,
  });
  assert.deepEqual(secim, { kat: "5", alt: "" }, "başka kategorinin alt kategorisi yazılmamalı");
});

test("dolu alt kategori baskın yüzünden değişmez", () => {
  const secim = urunSecimi("B", {
    ustYazim: {},
    gecmis: gecmisHarita([{ barkod: "B", kategoriId: 1, altKategoriId: 8 }]),
    baskin: { kat: "1", alt: "2" },
    varsayilanKategoriId: SINIFLANDIRILMAMIS,
  });
  assert.deepEqual(secim, { kat: "1", alt: "8" });
});

test("hiçbir ipucu yoksa Sınıflandırılmamış'a düşer", () => {
  const secim = urunSecimi("YENI", {
    ustYazim: {},
    gecmis: gecmisHarita([]),
    baskin: null,
    varsayilanKategoriId: SINIFLANDIRILMAMIS,
  });
  assert.deepEqual(secim, { kat: "9", alt: "" });
});

test("elle seçim baskını tüm ürünlerde ezebilir", () => {
  const barkodlar = ["A", "B", "C"];
  const ustYazim = tumuneUygula(barkodlar, { kat: "7", alt: "8" });
  for (const b of barkodlar) {
    assert.deepEqual(
      urunSecimi(b, {
        ustYazim,
        gecmis: gecmisHarita([{ barkod: "A", kategoriId: 1, altKategoriId: 2 }]),
        baskin: { kat: "1", alt: "2" },
        varsayilanKategoriId: SINIFLANDIRILMAMIS,
      }),
      { kat: "7", alt: "8" },
      `${b} tümüne uygula ile değişmeli`,
    );
  }
});

// ------------------------------------------------------------- tümüne uygula

test("tümüne uygula her barkoda aynı seçimi yazar", () => {
  const sonuc = tumuneUygula(["A", "B"], { kat: "1", alt: "2" });
  assert.deepEqual(sonuc, { A: { kat: "1", alt: "2" }, B: { kat: "1", alt: "2" } });
});

test("tümüne uygula boş listede boş döner", () => {
  assert.deepEqual(tumuneUygula([], { kat: "1", alt: "" }), {});
});
