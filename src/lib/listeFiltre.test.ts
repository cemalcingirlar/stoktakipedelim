import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SAYFA_BOYUTU,
  atlanacak,
  filtreOzeti,
  gecerliSayfa,
  listeFiltresiniCoz,
  toplamSayfa,
} from "./listeFiltre";

test("boş parametrelerde varsayılan filtre", () => {
  const f = listeFiltresiniCoz({});
  assert.deepEqual(f, { ara: "", magazaId: 0, sayfa: 1 });
});

test("arama metni kırpılıyor ve sınırlanıyor", () => {
  assert.equal(listeFiltresiniCoz({ ara: "  vatan  " }).ara, "vatan");
  assert.equal(listeFiltresiniCoz({ ara: "x".repeat(200) }).ara.length, 80);
});

test("dizi gelen parametrede ilk değer alınıyor", () => {
  // Aynı ad iki kez verilirse (?ara=a&ara=b) Next dizi veriyor.
  assert.equal(listeFiltresiniCoz({ ara: ["a", "b"] }).ara, "a");
});

test("geçersiz sayılar sıfıra/bire düşüyor", () => {
  assert.equal(listeFiltresiniCoz({ magaza: "abc" }).magazaId, 0);
  assert.equal(listeFiltresiniCoz({ magaza: "-5" }).magazaId, 0);
  assert.equal(listeFiltresiniCoz({ sayfa: "0" }).sayfa, 1);
  assert.equal(listeFiltresiniCoz({ sayfa: "-3" }).sayfa, 1);
  assert.equal(listeFiltresiniCoz({ sayfa: "7" }).sayfa, 7);
});

test("sayfa sayısı hesaplanıyor", () => {
  assert.equal(toplamSayfa(0), 1, "boş listede de bir sayfa");
  assert.equal(toplamSayfa(SAYFA_BOYUTU), 1);
  assert.equal(toplamSayfa(SAYFA_BOYUTU + 1), 2);
});

test("sayfa listenin dışına taşamıyor", () => {
  // Kullanıcı elle ?sayfa=999 yazarsa boş ekran yerine son sayfa gelsin.
  assert.equal(gecerliSayfa(999, 120), toplamSayfa(120));
  assert.equal(gecerliSayfa(-2, 120), 1);
  assert.equal(gecerliSayfa(2, 120), 2);
});

test("atlanacak kayıt sayısı sayfa boyutuyla uyumlu", () => {
  assert.equal(atlanacak(1), 0);
  assert.equal(atlanacak(3), SAYFA_BOYUTU * 2);
});

test("özet kayıt sayısını ve aramayı yazıyor", () => {
  assert.equal(filtreOzeti(3, { ara: "", magazaId: 0, sayfa: 1 }), "3 kayıt");
  assert.match(
    filtreOzeti(1250, { ara: "vatan", magazaId: 0, sayfa: 1 }),
    /1\.250 kayıt/,
  );
  assert.match(
    filtreOzeti(3, { ara: "vatan", magazaId: 0, sayfa: 1 }),
    /"vatan" araması/,
  );
});
