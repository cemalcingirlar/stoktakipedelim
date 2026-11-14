import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALIS_FIYATI_EN_COK_KURUS,
  DUZELTME_GEREKCE_EN_AZ,
  duzeltmeAciklamasi,
  duzeltmeGerekceSorunu,
  fiyatDegisiyorMu,
  fiyatDuzeltmeEngeli,
  kardesKosulu,
  yeniFiyatiCoz,
} from "./alisFiyatiDuzeltme";

test("Türkçe biçimli fiyat kuruşa çevriliyor", () => {
  assert.deepEqual(yeniFiyatiCoz("1.165,83"), { tamam: true, kurus: 116583 });
  assert.deepEqual(yeniFiyatiCoz(" 1200 "), { tamam: true, kurus: 120000 });
  assert.deepEqual(yeniFiyatiCoz("1.200,5"), { tamam: true, kurus: 120050 });
});

test("sıfır fiyat kabul: bedelsiz gelen ürün olabilir", () => {
  assert.deepEqual(yeniFiyatiCoz("0"), { tamam: true, kurus: 0 });
});

test("boş, okunamayan ve eksi fiyat reddediliyor", () => {
  for (const ham of ["", "   ", null, undefined, "abc", "-5", "12,34,56"]) {
    assert.equal(yeniFiyatiCoz(ham).tamam, false, JSON.stringify(ham));
  }
});

test("bir sıfır fazla yazılmış fiyat sınıra takılıyor", () => {
  const s = yeniFiyatiCoz("100.000.000,00");
  assert.equal(s.tamam, false);
  assert.match(s.tamam ? "" : s.hata, /sıfır fazla/);
  assert.equal(yeniFiyatiCoz("10.000.000,00").tamam, true);
  assert.equal(ALIS_FIYATI_EN_COK_KURUS, 1_000_000_000);
});

test("gerekçe zorunlu ve sınırlı", () => {
  assert.match(duzeltmeGerekceSorunu("") ?? "", /en az/);
  assert.match(duzeltmeGerekceSorunu("  ab  ") ?? "", /en az/);
  assert.equal(duzeltmeGerekceSorunu("x".repeat(DUZELTME_GEREKCE_EN_AZ)), null);
  assert.equal(duzeltmeGerekceSorunu("Fatura yanlış girilmiş"), null);
  assert.match(duzeltmeGerekceSorunu("x".repeat(301)) ?? "", /en çok/);
});

test("iptal edilmiş kaydın fiyatı düzeltilemiyor, diğer durumlar serbest", () => {
  assert.match(fiyatDuzeltmeEngeli({ durum: "IPTAL" }) ?? "", /iptali geri alın/);
  for (const durum of ["STOKTA", "TRANSFERDE", "SATILDI", "IADE", "ARIZALI"]) {
    assert.equal(fiyatDuzeltmeEngeli({ durum }), null, durum);
  }
});

test("aynı fiyat değişiklik sayılmıyor", () => {
  assert.equal(fiyatDegisiyorMu(116583, 116583), false);
  assert.equal(fiyatDegisiyorMu(116583, 116584), true);
});

const cihaz = {
  id: 7,
  alisFaturasiId: 3,
  alisFiyatiKurus: 116583,
  barkod: "8683948501789D" as string | null,
  marka: "FLEX",
  model: "AKILLI SAAT",
};

test("kardeş koşulu: aynı fatura, aynı barkod, aynı fiyat, iptal değil, kendisi hariç", () => {
  assert.deepEqual(kardesKosulu(cihaz), {
    alisFaturasiId: 3,
    alisFiyatiKurus: 116583,
    durum: { not: "IPTAL" },
    id: { not: 7 },
    barkod: "8683948501789D",
  });
});

test("barkod yoksa marka ve model ile eşleşiyor, barkodlu olanlar karışmıyor", () => {
  assert.deepEqual(kardesKosulu({ ...cihaz, barkod: null }), {
    alisFaturasiId: 3,
    alisFiyatiKurus: 116583,
    durum: { not: "IPTAL" },
    id: { not: 7 },
    barkod: null,
    marka: "FLEX",
    model: "AKILLI SAAT",
  });
});

test("faturasız cihazda toplu düzeltme yok", () => {
  // Fatura bağı olmadan "aynı ürün" bütün stoğa yayılırdı.
  assert.equal(kardesKosulu({ ...cihaz, alisFaturasiId: null }), null);
});

test("tarihçe satırı eski fiyatı, yeni fiyatı ve gerekçeyi taşıyor", () => {
  assert.equal(
    duzeltmeAciklamasi(116583, 120000, "  Fiyat farkı faturası  "),
    "Alış fiyatı düzeltildi: 1.165,83 TL → 1.200,00 TL · gerekçe: Fiyat farkı faturası",
  );
});
