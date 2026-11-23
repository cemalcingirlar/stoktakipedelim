import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aktarimDuzeltmeMetni,
  aktarimGeriAlmaMetni,
  aktarimSatisFarki,
  maliyetKarari,
  type AktarimSatisDurumu,
} from "./aktarimSatisDuzeltme";

const satis = (ek: Partial<AktarimSatisDurumu> = {}): AktarimSatisDurumu => ({
  musteriId: 4,
  musteriAdi: "MÜŞTERİ ÖRNEK",
  satanKullaniciId: 7,
  satanAdi: "begüm",
  odemeTipi: "NAKIT",
  satisTarihi: new Date(2026, 10, 20, 18, 21),
  satisFiyatiKurus: 1_650_000,
  not: null,
  ...ek,
});

test("değişiklik yoksa fark boş", () => {
  assert.deepEqual(aktarimSatisFarki(satis(), satis()), []);
  assert.deepEqual(aktarimSatisFarki(satis({ not: "a" }), satis({ not: "  a " })), []);
});

test("her alan eski ve yeni değeriyle yazılıyor", () => {
  assert.deepEqual(
    aktarimSatisFarki(
      satis(),
      satis({
        musteriId: 5,
        musteriAdi: "AYŞE",
        satanKullaniciId: 8,
        satanAdi: "cemal",
        odemeTipi: "TEMLIK",
        satisTarihi: new Date(2026, 10, 19, 12),
        satisFiyatiKurus: 1_700_000,
        not: "düzeltildi",
      }),
    ),
    [
      "Müşteri: MÜŞTERİ ÖRNEK → AYŞE",
      "Satışı yapan: begüm → cemal",
      "Ödeme tipi: Nakit → Temlik",
      "Satış tarihi: 20.11.2026 → 19.11.2026",
      "Satış fiyatı: 16.500,00 TL → 17.000,00 TL",
      'Not: (boş) → "düzeltildi"',
    ],
  );
});

test("müşterisiz satış okunur yazılıyor", () => {
  assert.deepEqual(
    aktarimSatisFarki(satis({ musteriId: null, musteriAdi: null }), satis()),
    ["Müşteri: (müşterisiz) → MÜŞTERİ ÖRNEK"],
  );
});

test("düzeltme metni açıklamayı sona ekliyor ve uzunsa kırpılıyor", () => {
  assert.equal(
    aktarimDuzeltmeMetni(["Ödeme tipi: Nakit → Temlik"], " yanlış seçilmiş "),
    "Mağaza içi aktarım satışı düzeltildi: Ödeme tipi: Nakit → Temlik · açıklama: yanlış seçilmiş",
  );
  assert.ok(aktarimDuzeltmeMetni(["x".repeat(2000)], null).length <= 900);
});

// ---------------------------------------------------------------- maliyet

test("son satış ve fiyat değişmemişse alış fiyatı satış öncesine dönüyor", () => {
  // 357929731362553: 17.632,19 → 16.500,00 yazılmıştı.
  assert.deepEqual(
    maliyetKarari({
      sonAktarimMi: true,
      cihazAlisKurus: 1_650_000,
      satisYeniAlisKurus: 1_650_000,
      satisMaliyetKurus: 1_763_219,
    }),
    { geriYukle: true, eskiKurus: 1_650_000, yeniKurus: 1_763_219 },
  );
});

test("satış alış fiyatını değiştirmemişse dokunacak bir şey yok", () => {
  assert.deepEqual(
    maliyetKarari({ sonAktarimMi: true, cihazAlisKurus: 100, satisYeniAlisKurus: 100, satisMaliyetKurus: 100 }),
    { geriYukle: false, sebep: null },
  );
});

test("sonradan başka aktarım satışı varsa fiyata dokunulmuyor", () => {
  const k = maliyetKarari({ sonAktarimMi: false, cihazAlisKurus: 100, satisYeniAlisKurus: 100, satisMaliyetKurus: 200 });
  assert.equal(k.geriYukle, false);
  assert.match(k.geriYukle ? "" : (k.sebep ?? ""), /başka bir aktarım satışı/);
});

test("fiyat sonradan elle düzeltildiyse dokunulmuyor", () => {
  const k = maliyetKarari({ sonAktarimMi: true, cihazAlisKurus: 150, satisYeniAlisKurus: 100, satisMaliyetKurus: 200 });
  assert.equal(k.geriYukle, false);
  assert.match(k.geriYukle ? "" : (k.sebep ?? ""), /ayrıca değiştirilmiş/);
});

test("geri alma metni satışı, fiyat dönüşünü ve gerekçeyi taşıyor", () => {
  assert.equal(
    aktarimGeriAlmaMetni({
      musteriAdi: "MÜŞTERİ ÖRNEK",
      satisFiyatiKurus: 1_650_000,
      satisTarihi: new Date(2026, 10, 20, 18, 21),
      maliyet: { geriYukle: true, eskiKurus: 1_650_000, yeniKurus: 1_763_219 },
      gerekce: "  yanlış girildi ",
    }),
    "Mağaza içi aktarım satışı geri alındı (MÜŞTERİ ÖRNEK, 16.500,00 TL, 20.11.2026) · " +
      "alış fiyatı 16.500,00 TL → 17.632,19 TL · gerekçe: yanlış girildi",
  );
});

test("fiyata dokunulmadıysa sebebi geri alma metninde", () => {
  const m = aktarimGeriAlmaMetni({
    musteriAdi: null,
    satisFiyatiKurus: 100,
    satisTarihi: new Date(2026, 10, 20),
    maliyet: { geriYukle: false, sebep: "Alış fiyatı bu satıştan sonra ayrıca değiştirilmiş; dokunulmadı." },
    gerekce: "deneme 1",
  });
  assert.match(m, /\(müşterisiz/);
  assert.match(m, /ayrıca değiştirilmiş/);
});
