import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARSIV_YIL_SECENEKLERI,
  EN_AZ_YIL,
  arsivDosyaAdi,
  arsivOzeti,
  arsivSiniri,
  csvSatiri,
  silmeEngeli,
  yilSorunu,
} from "./logArsivi";

const BUGUN = new Date(2026, 9, 24, 15, 30); // 24 Ekim 2026

test("arşiv sınırı verilen yıl kadar geriye gidiyor", () => {
  const sinir = arsivSiniri(2, BUGUN);
  assert.equal(sinir.getFullYear(), 2024);
  assert.equal(sinir.getMonth(), 9);
  assert.equal(sinir.getDate(), 24);
});

test("sınır günün başına sabitleniyor", () => {
  const sinir = arsivSiniri(1, BUGUN);
  assert.equal(sinir.getHours(), 0);
  assert.equal(sinir.getMinutes(), 0);
});

test("bir yıldan yakın sınır kabul edilmiyor", () => {
  // Taze kayıtlar denetim için gerekli; sıfır yıl "bugünü de sil" demek.
  assert.equal(arsivSiniri(0, BUGUN).getFullYear(), 2025);
  assert.ok(yilSorunu(0));
  assert.ok(yilSorunu(-3));
  assert.ok(yilSorunu("abc"));
  assert.equal(yilSorunu(EN_AZ_YIL), null);
  assert.equal(yilSorunu(5), null);
  assert.ok(yilSorunu(51));
});

test("seçenekler en az bir yıldan başlıyor", () => {
  assert.ok(ARSIV_YIL_SECENEKLERI.every((y) => y >= EN_AZ_YIL));
});

test("dosya adı sınır tarihini taşıyor", () => {
  assert.equal(
    arsivDosyaAdi(new Date(2024, 9, 24)),
    "stok-log-arsivi-20241024-oncesi.csv",
  );
});

test("CSV alanları noktalı virgülle ayrılıyor", () => {
  assert.equal(csvSatiri(["a", 1, null]), "a;1;");
});

test("CSV'de ayraç ve tırnak kaçırılıyor", () => {
  // Detay alanında noktalı virgül ve tırnak olabiliyor; kaçırılmazsa
  // sütunlar kayar ve arşiv okunamaz hale gelir.
  assert.equal(csvSatiri(["Ali;Veli"]), '"Ali;Veli"');
  assert.equal(csvSatiri(['12" ekran']), '"12"" ekran"');
  assert.equal(csvSatiri(["iki\nsatır"]), '"iki\nsatır"');
});

test("indirilmemiş aralık silinemiyor", () => {
  const sinir = arsivSiniri(2, BUGUN);
  assert.match(silmeEngeli(null, sinir)!, /indirin/);
});

test("başka tarihi kapsayan arşivle silinemiyor", () => {
  const sinir = arsivSiniri(2, BUGUN);
  const baska = arsivSiniri(3, BUGUN);
  const engel = silmeEngeli(
    { sinirISO: baska.toISOString(), adet: 10, tarihISO: BUGUN.toISOString() },
    sinir,
  );
  assert.match(engel!, /başka bir tarihi/i);
});

test("doğru arşivle silme serbest", () => {
  const sinir = arsivSiniri(2, BUGUN);
  assert.equal(
    silmeEngeli(
      {
        sinirISO: sinir.toISOString(),
        adet: 10,
        tarihISO: BUGUN.toISOString(),
      },
      sinir,
    ),
    null,
  );
});

test("boş arşivle silme reddediliyor", () => {
  const sinir = arsivSiniri(2, BUGUN);
  assert.match(
    silmeEngeli(
      { sinirISO: sinir.toISOString(), adet: 0, tarihISO: BUGUN.toISOString() },
      sinir,
    )!,
    /kayıt yok/,
  );
});

test("özet adedi ve tahmini boyutu yazıyor", () => {
  const ozet = arsivOzeti(12431);
  assert.match(ozet, /12\.431 kayıt/);
  assert.match(ozet, /MB/);
  assert.match(arsivOzeti(10), /KB/);
});
