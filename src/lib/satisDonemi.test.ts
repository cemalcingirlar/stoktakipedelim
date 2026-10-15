import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SATIS_DONEMLERI,
  VARSAYILAN_SATIS_DONEMI,
  satisDonemAraligi,
  satisDonemiCoz,
  satisToplami,
} from "./satisDonemi";

// 15 Ekim 2026 bir perşembe; haftanın pazartesisi 12 Ekim.
const PERSEMBE = new Date(2026, 9, 15, 14, 30);

test("tanınmayan dönem bugüne düşer", () => {
  assert.equal(satisDonemiCoz("yok").anahtar, VARSAYILAN_SATIS_DONEMI);
  assert.equal(satisDonemiCoz(undefined).anahtar, "gun");
  assert.equal(satisDonemiCoz(7).anahtar, "gun");
});

test("üç dönem de çözülüyor", () => {
  for (const d of SATIS_DONEMLERI) {
    assert.equal(satisDonemiCoz(d.anahtar).anahtar, d.anahtar);
  }
});

test("günlük aralık bugünün başından başlar", () => {
  const { baslangic, bitis } = satisDonemAraligi(satisDonemiCoz("gun"), PERSEMBE);
  assert.equal(baslangic.getDate(), 15);
  assert.equal(baslangic.getHours(), 0);
  assert.equal(baslangic.getMinutes(), 0);
  assert.equal(bitis.getDate(), 15);
});

test("haftalık aralık pazartesiden başlar", () => {
  const { baslangic } = satisDonemAraligi(satisDonemiCoz("hafta"), PERSEMBE);
  assert.equal(baslangic.getDate(), 12, "12 Ekim 2026 pazartesi");
  assert.equal(baslangic.getDay(), 1);
  assert.equal(baslangic.getHours(), 0);
});

test("pazar günü hafta yine o pazartesiden başlar", () => {
  // 18 Ekim 2026 pazar; haftanın başı 12 Ekim olmalı, 19 değil.
  const { baslangic } = satisDonemAraligi(satisDonemiCoz("hafta"), new Date(2026, 9, 18, 10));
  assert.equal(baslangic.getDate(), 12);
});

test("pazartesi günü hafta o günden başlar", () => {
  const { baslangic } = satisDonemAraligi(satisDonemiCoz("hafta"), new Date(2026, 9, 12, 10));
  assert.equal(baslangic.getDate(), 12);
});

test("aylık aralık ayın birinden başlar", () => {
  const { baslangic } = satisDonemAraligi(satisDonemiCoz("ay"), PERSEMBE);
  assert.equal(baslangic.getDate(), 1);
  assert.equal(baslangic.getMonth(), 9);
  assert.equal(baslangic.getHours(), 0);
});

test("ay başında haftalık aralık önceki aya taşabilir", () => {
  // 1 Kasım 2026 pazar: haftanın başı 26 Ekim.
  const { baslangic } = satisDonemAraligi(satisDonemiCoz("hafta"), new Date(2026, 10, 1, 12));
  assert.equal(baslangic.getMonth(), 9, "ekim");
  assert.equal(baslangic.getDate(), 26);
});

test("yıl başında aylık aralık doğru", () => {
  const { baslangic } = satisDonemAraligi(satisDonemiCoz("ay"), new Date(2027, 0, 5));
  assert.equal(baslangic.getFullYear(), 2027);
  assert.equal(baslangic.getMonth(), 0);
  assert.equal(baslangic.getDate(), 1);
});

test("başlangıç her zaman bitişten önce ya da eşit", () => {
  for (const d of SATIS_DONEMLERI) {
    const { baslangic, bitis } = satisDonemAraligi(d, PERSEMBE);
    assert.ok(baslangic <= bitis, `${d.anahtar}: başlangıç bitişten sonra`);
  }
});

// ----------------------------------------------------------------- toplam

test("boş dökümün toplamı sıfır", () => {
  assert.deepEqual(satisToplami([]), { adet: 0, satisKurus: 0, karKurus: 0 });
});

test("döküm satırları toplanıyor", () => {
  const toplam = satisToplami([
    { adet: 2, satisKurus: 1300000, karKurus: 300000 },
    { adet: 1, satisKurus: 50000, karKurus: -10000 },
  ]);
  assert.deepEqual(toplam, { adet: 3, satisKurus: 1350000, karKurus: 290000 });
});

test("zarar toplamı negatif kalabilir", () => {
  const toplam = satisToplami([{ adet: 1, satisKurus: 100, karKurus: -5000 }]);
  assert.equal(toplam.karKurus, -5000);
});
