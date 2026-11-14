import assert from "node:assert/strict";
import { test } from "node:test";
import {
  farkVarMi,
  kalemTarihceMetni,
  kalemlerOrtusuyorMu,
  satisFarki,
  satisFiyatiSorunu,
  satisLogDetayi,
  yeniSatisTarihi,
  type SatisDurumu,
} from "./satisDuzeltme";

const SATIS_ANI = new Date(2026, 10, 14, 16, 42, 7);
const SIMDI = new Date(2026, 10, 15, 10, 0, 0);

const durum = (ek: Partial<SatisDurumu> = {}): SatisDurumu => ({
  musteriId: 1,
  musteriAdi: "MEHMET ÖRNEK",
  satanKullaniciId: 5,
  satanAdi: "yaren",
  odemeTipi: "TEMLIK",
  satisTarihi: SATIS_ANI,
  not: null,
  kalemler: [
    { id: 10, etiket: "ALFA FON 10 (350000000000011)", satisFiyatiKurus: 879_750 },
    { id: 11, etiket: "BETA KILIF (4000000000028)", satisFiyatiKurus: 25_000 },
  ],
  ...ek,
});

// -------------------------------------------------------------------- tarih

test("gün değişmediyse satışın saati korunuyor", () => {
  const s = yeniSatisTarihi(SATIS_ANI, "2026-11-14", SIMDI);
  assert.ok(s.tamam);
  assert.equal(s.tamam && s.tarih, SATIS_ANI, "aynı nesne: saat silinmemeli");
});

test("gün değiştiyse yeni günün öğlesi alınıyor", () => {
  const s = yeniSatisTarihi(SATIS_ANI, "2026-11-12", SIMDI);
  assert.ok(s.tamam);
  const t = s.tamam ? s.tarih : new Date(0);
  assert.deepEqual([t.getFullYear(), t.getMonth(), t.getDate(), t.getHours()], [2026, 10, 12, 12]);
});

test("gelecekteki gün reddediliyor, bugün kabul", () => {
  const yarin = yeniSatisTarihi(SATIS_ANI, "2026-11-16", SIMDI);
  assert.equal(yarin.tamam, false);
  assert.match(yarin.tamam ? "" : yarin.hata, /ileri olamaz/);
  assert.equal(yeniSatisTarihi(SATIS_ANI, "2026-11-15", SIMDI).tamam, true);
});

test("bozuk ve taşan tarihler reddediliyor", () => {
  for (const gun of ["", "14.11.2026", "2026-13-01", "2026-02-31", "2026-11-14T10:00", "abc"]) {
    assert.equal(yeniSatisTarihi(SATIS_ANI, gun, SIMDI).tamam, false, gun);
  }
});

// -------------------------------------------------------------------- fiyat

test("satış fiyatı: tam sayı, eksi değil, sınırın altında", () => {
  assert.equal(satisFiyatiSorunu(879_750, "x"), null);
  assert.equal(satisFiyatiSorunu(0, "x"), null);
  assert.match(satisFiyatiSorunu(-1, "ALFA") ?? "", /ALFA: .*eksi/);
  assert.match(satisFiyatiSorunu(1.5, "x") ?? "", /okunamadı/);
  assert.match(satisFiyatiSorunu("100", "x") ?? "", /okunamadı/);
  assert.match(satisFiyatiSorunu(10_000_000_000, "x") ?? "", /sıfır fazla/);
});

test("gönderilen cihazlar satışın cihazlarıyla birebir örtüşmeli", () => {
  assert.equal(kalemlerOrtusuyorMu([10, 11], [11, 10]), true);
  assert.equal(kalemlerOrtusuyorMu([10, 11], [10]), false, "eksik");
  assert.equal(kalemlerOrtusuyorMu([10, 11], [10, 11, 99]), false, "fazla");
  assert.equal(kalemlerOrtusuyorMu([10, 11], [10, 99]), false, "başka satışın cihazı");
  assert.equal(kalemlerOrtusuyorMu([10, 11], [10, 10]), false, "tekrar");
});

// --------------------------------------------------------------------- fark

test("hiçbir şey değişmediyse fark yok", () => {
  const f = satisFarki(durum(), durum());
  assert.equal(farkVarMi(f), false);
  assert.deepEqual(f.genel, []);
  assert.equal(f.kimlikDegisti, false);
});

test("her alan eski ve yeni değeriyle listeleniyor", () => {
  const f = satisFarki(
    durum(),
    durum({
      musteriId: 2,
      musteriAdi: "AYŞE ÖRNEK",
      satanKullaniciId: 6,
      satanAdi: "ebru",
      odemeTipi: "NAKIT",
      satisTarihi: new Date(2026, 10, 12, 12),
      not: "Peşin alındı",
    }),
  );
  assert.deepEqual(f.genel, [
    "Müşteri: MEHMET ÖRNEK → AYŞE ÖRNEK",
    "Satışı yapan: yaren → ebru",
    "Ödeme tipi: Temlik → Nakit",
    "Satış tarihi: 14.11.2026 → 12.11.2026",
    'Not: (boş) → "Peşin alındı"',
  ]);
  assert.equal(f.kimlikDegisti, true);
});

test("yalnız not değiştiyse cihaz satırlarına dokunmak gerekmiyor", () => {
  const f = satisFarki(durum(), durum({ not: "yeni not" }));
  assert.equal(farkVarMi(f), true);
  assert.equal(f.kimlikDegisti, false);
});

test("boşluk farkı not değişikliği sayılmıyor", () => {
  assert.equal(farkVarMi(satisFarki(durum({ not: "abc" }), durum({ not: "  abc  " }))), false);
  assert.equal(farkVarMi(satisFarki(durum({ not: null }), durum({ not: "   " }))), false);
});

test("yalnız fiyatı değişen cihaz fiyat farkına giriyor", () => {
  const yeni = durum();
  yeni.kalemler = [
    { ...yeni.kalemler[0], satisFiyatiKurus: 900_000 },
    { ...yeni.kalemler[1] },
  ];
  const f = satisFarki(durum(), yeni);
  assert.deepEqual([...f.fiyatlar.entries()], [[10, "8.797,50 TL → 9.000,00 TL"]]);
  assert.equal(f.kimlikDegisti, false);
});

// ------------------------------------------------------------------ metinler

test("işlem kaydı satış numarasını ve bütün değişiklikleri taşıyor", () => {
  const yeni = durum({ odemeTipi: "NAKIT" });
  yeni.kalemler = [{ ...yeni.kalemler[0], satisFiyatiKurus: 900_000 }, yeni.kalemler[1]];
  const f = satisFarki(durum(), yeni);
  assert.equal(
    satisLogDetayi("SAT-20261114-003", durum(), f, " Müşteri nakit ödedi "),
    "Satış düzeltildi (SAT-20261114-003): Ödeme tipi: Temlik → Nakit · " +
      "ALFA FON 10 (350000000000011) satış fiyatı: 8.797,50 TL → 9.000,00 TL · " +
      "açıklama: Müşteri nakit ödedi",
  );
});

test("fiyat değişikliği yalnız kendi cihazının tarihçesine yazılıyor", () => {
  const yeni = durum();
  yeni.kalemler = [{ ...yeni.kalemler[0], satisFiyatiKurus: 900_000 }, yeni.kalemler[1]];
  const f = satisFarki(durum(), yeni);
  assert.match(kalemTarihceMetni(10, "SAT-1", f, null) ?? "", /Satış fiyatı: 8\.797,50 TL → 9\.000,00 TL/);
  assert.equal(kalemTarihceMetni(11, "SAT-1", f, null), null, "diğer cihaza satır düşmemeli");
});

test("genel değişiklik her cihazın tarihçesine yazılıyor", () => {
  const f = satisFarki(durum(), durum({ odemeTipi: "NAKIT" }));
  for (const id of [10, 11]) {
    assert.equal(kalemTarihceMetni(id, "SAT-1", f, null), "Satış düzeltildi (SAT-1): Ödeme tipi: Temlik → Nakit");
  }
});

test("yalnız not değişikliği cihaz tarihçesine yazılmıyor", () => {
  const f = satisFarki(durum(), durum({ not: "yeni" }));
  assert.equal(kalemTarihceMetni(10, "SAT-1", f, null), null);
});

test("çok uzun kayıt kırpılıyor", () => {
  const f = satisFarki(durum(), durum({ not: "x".repeat(5000) }));
  assert.ok(satisLogDetayi("SAT-1", durum(), f, "y".repeat(5000)).length <= 1500);
});
