import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SIRALANABILIR,
  VARSAYILAN_SIRALAMA,
  siralamaCoz,
  siralamaIsareti,
  siralamaOrderBy,
  sonrakiSiralama,
} from "./cihazSiralama";

// ------------------------------------------------------------- çözümleme

test("tanınmayan sütun varsayılana düşer", () => {
  assert.deepEqual(siralamaCoz("yokBoyleSutun", "artan"), VARSAYILAN_SIRALAMA);
  assert.deepEqual(siralamaCoz(undefined, undefined), VARSAYILAN_SIRALAMA);
  assert.deepEqual(siralamaCoz(7, "artan"), VARSAYILAN_SIRALAMA);
});

test("geçerli sütun ve yön okunuyor", () => {
  assert.deepEqual(siralamaCoz("marka", "artan"), { anahtar: "marka", yon: "artan" });
  assert.deepEqual(siralamaCoz("marka", "azalan"), { anahtar: "marka", yon: "azalan" });
});

test("tanınmayan yön azalan sayılıyor", () => {
  assert.equal(siralamaCoz("marka", "sapsal").yon, "azalan");
});

test("sıralanabilir sütunların hepsi çözülüyor", () => {
  for (const anahtar of Object.values(SIRALANABILIR)) {
    assert.equal(siralamaCoz(anahtar, "artan").anahtar, anahtar);
  }
});

test("bekleme sütunu giriş tarihine eşleniyor", () => {
  // Bekleme süresi giriş tarihinin tersi; ayrı bir sıralama gerekmiyor.
  assert.equal(SIRALANABILIR.bekleme, "girisTarihi");
});

test("kâr sütunu sıralanamıyor", () => {
  // Hesaplanmış alan; veritabanında sütunu yok.
  assert.equal(SIRALANABILIR.kar, undefined);
});

// ----------------------------------------------------------------- orderBy

test("varsayılan sıralama en yeni girişi öne alıyor", () => {
  assert.deepEqual(siralamaOrderBy(VARSAYILAN_SIRALAMA), [
    { girisTarihi: "desc" },
    { id: "desc" },
  ]);
});

test("artan marka sıralaması model ile inceltiliyor", () => {
  assert.deepEqual(siralamaOrderBy({ anahtar: "marka", yon: "artan" }), [
    { marka: "asc" },
    { model: "asc" },
    { id: "desc" },
  ]);
});

test("fiyat sıralaması kuruş sütununu kullanıyor", () => {
  assert.deepEqual(siralamaOrderBy({ anahtar: "alisFiyati", yon: "azalan" })[0], {
    alisFiyatiKurus: "desc",
  });
  assert.deepEqual(siralamaOrderBy({ anahtar: "satisFiyati", yon: "artan" })[0], {
    satisFiyatiKurus: "asc",
  });
});

test("her sıralama id ile bitiyor", () => {
  // Eşit değerli satırların sırası sabit kalmazsa sayfalamada kayıt atlanıyor.
  for (const anahtar of Object.values(SIRALANABILIR)) {
    for (const yon of ["artan", "azalan"] as const) {
      const liste = siralamaOrderBy({ anahtar, yon });
      const son = liste[liste.length - 1];
      assert.ok("id" in son, `${anahtar}/${yon} id ile bitmiyor`);
    }
  }
});

// -------------------------------------------------------------- döngü

test("başka sütuna tıklayınca artan başlıyor", () => {
  assert.deepEqual(sonrakiSiralama(VARSAYILAN_SIRALAMA, "marka"), {
    anahtar: "marka",
    yon: "artan",
  });
  assert.deepEqual(sonrakiSiralama({ anahtar: "model", yon: "azalan" }, "marka"), {
    anahtar: "marka",
    yon: "artan",
  });
});

test("aynı sütuna ikinci tıklama azalana çeviriyor", () => {
  assert.deepEqual(sonrakiSiralama({ anahtar: "marka", yon: "artan" }, "marka"), {
    anahtar: "marka",
    yon: "azalan",
  });
});

test("üçüncü tıklama sıralamayı kaldırıyor", () => {
  assert.deepEqual(
    sonrakiSiralama({ anahtar: "marka", yon: "azalan" }, "marka"),
    VARSAYILAN_SIRALAMA,
  );
});

test("üç tıklama başa döndürüyor", () => {
  let s = VARSAYILAN_SIRALAMA;
  for (let i = 0; i < 3; i += 1) s = sonrakiSiralama(s, "barkod");
  assert.deepEqual(s, VARSAYILAN_SIRALAMA);
});

// ------------------------------------------------------------- işaret

test("işaret yalnız etkin sütunda çıkıyor", () => {
  const siralama = { anahtar: "marka", yon: "artan" } as const;
  assert.equal(siralamaIsareti(siralama, "marka"), "▲");
  assert.equal(siralamaIsareti(siralama, "model"), "");
});

test("azalanda ok aşağı bakıyor", () => {
  assert.equal(siralamaIsareti({ anahtar: "marka", yon: "azalan" }, "marka"), "▼");
});

test("varsayılanda hiçbir sütunda işaret yok", () => {
  for (const anahtar of Object.values(SIRALANABILIR)) {
    assert.equal(siralamaIsareti(VARSAYILAN_SIRALAMA, anahtar), "");
  }
});
