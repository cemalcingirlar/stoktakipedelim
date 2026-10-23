import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PANEL_URUN_SAYISI,
  URUN_DONEMLERI,
  VARSAYILAN_URUN_DONEMI,
  enCokSatirlar,
  urunAdi,
  urunAnahtari,
  urunDonemBaslangici,
  urunDonemiCoz,
  urunleriBirlestir,
  type UrunSatiri,
} from "./urunSiralamasi";

function satir(
  marka: string,
  model: string,
  adet: number,
  tutarKurus = 0,
): UrunSatiri {
  return { marka, model, adet, tutarKurus };
}

// ------------------------------------------------------------------ dönemler

test("dönem seçenekleri kullanıcının istediği üç pencere", () => {
  assert.deepEqual(
    URUN_DONEMLERI.map((d) => d.anahtar),
    ["hafta", "ay", "tum"],
  );
});

test("URL değeri döneme çevriliyor, tanınmayan varsayılana düşüyor", () => {
  assert.equal(urunDonemiCoz("hafta").anahtar, "hafta");
  assert.equal(urunDonemiCoz("tum").anahtar, "tum");
  assert.equal(urunDonemiCoz("yok").anahtar, VARSAYILAN_URUN_DONEMI);
  assert.equal(urunDonemiCoz(undefined).anahtar, VARSAYILAN_URUN_DONEMI);
  assert.equal(urunDonemiCoz(["hafta"]).anahtar, VARSAYILAN_URUN_DONEMI);
});

test("tüm zamanlar için başlangıç sınırı yok", () => {
  assert.equal(urunDonemBaslangici(urunDonemiCoz("tum")), null);
});

test("son 1 hafta bugün dahil 7 gün", () => {
  // 23 Ekim Cuma'dan geriye: 17 Ekim Cumartesi günün başı.
  const baslangic = urunDonemBaslangici(
    urunDonemiCoz("hafta"),
    new Date(2026, 9, 23, 14, 30),
  );
  assert.equal(baslangic?.getDate(), 17);
  assert.equal(baslangic?.getMonth(), 9);
  assert.equal(baslangic?.getHours(), 0, "gün başına çekilmeli");
});

test("başlangıç gün başına çekiliyor", () => {
  // Saatinden başlatmak bugün sabah yapılan satışı dışarıda bırakırdı.
  const baslangic = urunDonemBaslangici(
    urunDonemiCoz("ay"),
    new Date(2026, 9, 23, 23, 59),
  );
  assert.equal(baslangic?.getHours(), 0);
  assert.equal(baslangic?.getMinutes(), 0);
});

test("son 1 ay 30 günü kapsıyor", () => {
  const bugun = new Date(2026, 9, 23);
  const baslangic = urunDonemBaslangici(urunDonemiCoz("ay"), bugun)!;
  const gunFarki = Math.round(
    (bugun.getTime() - baslangic.getTime()) / 86400000,
  );
  assert.equal(gunFarki, 29, "bugün dahil 30 gün");
});

// --------------------------------------------------------------- birleştirme

test("aynı ürünün iki kaynaktaki satırı toplanıyor", () => {
  // Normal satışlar ile aktarımdaki sat-geri al ayrı sorgulanıyor; ikisi de satış.
  const sonuc = urunleriBirlestir([
    satir("JBL", "TUNE FLEX", 3, 300_00),
    satir("JBL", "TUNE FLEX", 2, 200_00),
  ]);
  assert.equal(sonuc.length, 1);
  assert.equal(sonuc[0].adet, 5);
  assert.equal(sonuc[0].tutarKurus, 500_00);
});

test("yazım farkı aynı ürün sayılıyor", () => {
  // Gerçek veride aynı ürün "SAMSUNG" ve "Samsung" diye girilmiş olabiliyor.
  const sonuc = urunleriBirlestir([
    satir("SAMSUNG", "A54", 4),
    satir("Samsung", "a54", 3),
    satir("ŞARJ", "ALETİ", 1),
    satir("şarj", "aleti", 1),
  ]);
  assert.equal(sonuc.length, 2, "iki ayrı ürün kalmalı");
  assert.equal(
    sonuc.find((s) => urunAnahtari(s.marka, s.model) === "samsung|a54")?.adet,
    7,
  );
});

test("görünen ad ilk yazımdan alınıyor", () => {
  const sonuc = urunleriBirlestir([
    satir("Samsung", "A54", 1),
    satir("SAMSUNG", "A54", 1),
  ]);
  assert.equal(
    urunAdi(sonuc[0]),
    "Samsung A54",
    "kullanıcının girdiği hali durmalı",
  );
});

test("farklı ürünler birleşmiyor", () => {
  const sonuc = urunleriBirlestir([
    satir("JBL", "TUNE FLEX", 1),
    satir("JBL", "TUNE 510", 1),
  ]);
  assert.equal(sonuc.length, 2);
});

// ------------------------------------------------------------------ sıralama

test("en çok satan başa geliyor", () => {
  const sonuc = enCokSatirlar(
    [satir("A", "1", 2), satir("B", "2", 9), satir("C", "3", 5)],
    PANEL_URUN_SAYISI,
  );
  assert.deepEqual(
    sonuc.map((s) => s.marka),
    ["B", "C", "A"],
  );
});

test("liste istenen sayıda kısalıyor", () => {
  const cok = Array.from({ length: 20 }, (_, i) => satir(`M${i}`, "x", i + 1));
  assert.equal(enCokSatirlar(cok, PANEL_URUN_SAYISI).length, PANEL_URUN_SAYISI);
  assert.equal(enCokSatirlar(cok, 0).length, 0);
});

test("eşit adette sıralama her yüklemede aynı", () => {
  // Tutar, sonra ad belirleyici: liste sayfa yenilendikçe yer değiştirmesin.
  const girdi = [
    satir("Z", "1", 3, 100),
    satir("A", "1", 3, 100),
    satir("M", "1", 3, 900),
  ];
  const bir = enCokSatirlar(girdi, 3).map((s) => s.marka);
  const iki = enCokSatirlar([...girdi].reverse(), 3).map((s) => s.marka);
  assert.deepEqual(bir, ["M", "A", "Z"], "önce tutar, sonra ad");
  assert.deepEqual(bir, iki, "girdi sırası sonucu değiştirmemeli");
});

test("sıfır adetli ürün listeye girmiyor", () => {
  // Satışı olmayan ürün "en çok satan" listesinde yer almamalı.
  const sonuc = enCokSatirlar([satir("A", "1", 0), satir("B", "2", 1)], 5);
  assert.deepEqual(
    sonuc.map((s) => s.marka),
    ["B"],
  );
});

test("boş listede sıralama çökmüyor", () => {
  assert.deepEqual(enCokSatirlar([], 5), []);
  assert.deepEqual(urunleriBirlestir([]), []);
});
