import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alimlariSirala,
  ozetleriBirlestir,
  type MusteriAlimi,
} from "./musteriAlimlari";

const T = (g: string) => new Date(`2026-11-${g}T00:00:00.000Z`);

function alim(ek: Partial<MusteriAlimi> & { cihazId: number }): MusteriAlimi {
  return {
    anahtar: `c-${ek.cihazId}`,
    marka: "SAMSUNG",
    model: "A55",
    seriNo: null,
    barkod: null,
    magazaAdi: "1 Nolu Mağaza",
    tarih: T("01"),
    tutarKurus: 1000,
    satisId: null,
    satisNo: null,
    aktarimMi: false,
    ...ek,
  };
}

test("alımlar yeniden eskiye sıralanıyor", () => {
  const sirali = alimlariSirala([
    alim({ cihazId: 1, tarih: T("01") }),
    alim({ cihazId: 2, tarih: T("05") }),
    alim({ cihazId: 3, tarih: T("03") }),
  ]);
  assert.deepEqual(
    sirali.map((a) => a.cihazId),
    [2, 3, 1],
  );
});

test("tarihsiz alım sona gidiyor", () => {
  const sirali = alimlariSirala([
    alim({ cihazId: 1, tarih: null }),
    alim({ cihazId: 2, tarih: T("02") }),
  ]);
  assert.deepEqual(
    sirali.map((a) => a.cihazId),
    [2, 1],
  );
});

test("aynı günün alımlarında sıra kararlı", () => {
  // Satış tarihi gün hassasiyetinde; saat olmadığı için sıra oynamamalı.
  const sirali = alimlariSirala([
    alim({ cihazId: 7, tarih: T("04") }),
    alim({ cihazId: 9, tarih: T("04") }),
  ]);
  assert.deepEqual(
    sirali.map((a) => a.cihazId),
    [9, 7],
  );
});

test("iki kaynağın özeti toplanıyor", () => {
  // Normal satışlar ve aktarım satışları ayrı sorgulardan geliyor.
  const ozet = ozetleriBirlestir([
    { adet: 2, toplamKurus: 4000, ilkTarih: T("03"), sonTarih: T("09") },
    { adet: 1, toplamKurus: 1000, ilkTarih: T("01"), sonTarih: T("01") },
  ]);
  assert.equal(ozet.adet, 3);
  assert.equal(ozet.toplamKurus, 5000);
  assert.deepEqual(ozet.ilkTarih, T("01"));
  assert.deepEqual(ozet.sonTarih, T("09"));
});

test("tarihsiz kaynak ilk/son tarihi bozmuyor", () => {
  // Hiç kaydı olmayan kaynak null tarih döndürüyor.
  const ozet = ozetleriBirlestir([
    { adet: 0, toplamKurus: 0, ilkTarih: null, sonTarih: null },
    { adet: 1, toplamKurus: 700, ilkTarih: T("05"), sonTarih: T("05") },
  ]);
  assert.deepEqual(ozet.ilkTarih, T("05"));
  assert.deepEqual(ozet.sonTarih, T("05"));
  assert.equal(ozet.adet, 1);
});

test("boş listenin özeti sıfır", () => {
  assert.deepEqual(ozetleriBirlestir([]), {
    adet: 0,
    toplamKurus: 0,
    ilkTarih: null,
    sonTarih: null,
  });
});
