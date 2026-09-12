import assert from "node:assert/strict";
import { test } from "node:test";
import { vadeDurumu, vadeTarihiHesapla } from "./vade";

const BUGUN = new Date("2026-06-15T10:00:00");

function fatura(vadeGun: number, vadeTarihi: string | null, vadeOdendi = false) {
  return { vadeGun, vadeTarihi: vadeTarihi ? new Date(vadeTarihi) : null, vadeOdendi };
}

test("vadeTarihiHesapla — fatura tarihine vade günü eklenir", () => {
  const t = vadeTarihiHesapla(new Date("2026-06-01T00:00:00"), 21);
  assert.equal(t?.toISOString().slice(0, 10), "2026-06-22");
  assert.equal(vadeTarihiHesapla(new Date("2026-06-01T00:00:00"), 45)?.toISOString().slice(0, 10), "2026-07-16");
});

test("vadeTarihiHesapla — vadesiz faturada null", () => {
  assert.equal(vadeTarihiHesapla(new Date("2026-06-01"), 0), null);
});

test("vadesiz fatura YOK durumunda, satır boyanmaz", () => {
  const v = vadeDurumu(fatura(0, null), BUGUN);
  assert.equal(v.durum, "YOK");
  assert.equal(v.satirSinifi, "");
});

test("faturası olmayan cihaz YOK durumunda", () => {
  assert.equal(vadeDurumu(null, BUGUN).durum, "YOK");
  assert.equal(vadeDurumu(undefined, BUGUN).durum, "YOK");
});

test("vadesi geçmiş ve ödenmemiş fatura kırmızı", () => {
  const v = vadeDurumu(fatura(21, "2026-06-10"), BUGUN);
  assert.equal(v.durum, "GECTI");
  assert.equal(v.kalanGun, -5);
  assert.match(v.satirSinifi, /bg-red-50/);
  assert.equal(v.etiket, "5 gün geçti");
});

test("7 gün veya az kalan vade sarı", () => {
  const v = vadeDurumu(fatura(21, "2026-06-20"), BUGUN);
  assert.equal(v.durum, "YAKLASIYOR");
  assert.equal(v.kalanGun, 5);
  assert.match(v.satirSinifi, /bg-amber-50/);
});

test("tam 7 gün kala hâlâ sarı, 8 gün kala normal", () => {
  assert.equal(vadeDurumu(fatura(21, "2026-06-22"), BUGUN).durum, "YAKLASIYOR");
  assert.equal(vadeDurumu(fatura(21, "2026-06-23"), BUGUN).durum, "NORMAL");
});

test("vadesi bugün dolan fatura sarı ve 'Bugün' yazar", () => {
  const v = vadeDurumu(fatura(21, "2026-06-15T23:00:00"), BUGUN);
  assert.equal(v.durum, "YAKLASIYOR");
  assert.equal(v.etiket, "Bugün");
});

test("ödenmiş fatura vadesi geçse bile boyanmaz", () => {
  const v = vadeDurumu(fatura(45, "2026-01-01", true), BUGUN);
  assert.equal(v.durum, "ODENDI");
  assert.equal(v.satirSinifi, "");
  assert.equal(v.etiket, "Ödendi");
});

test("gün sınırı saat bileşeninden etkilenmez", () => {
  // Vade bugün 00:05'te dolmuş görünse de gün farkı sıfırdır, geçmiş sayılmaz.
  const v = vadeDurumu(fatura(21, "2026-06-15T00:05:00"), new Date("2026-06-15T23:50:00"));
  assert.equal(v.durum, "YAKLASIYOR");
  assert.equal(v.kalanGun, 0);
});
