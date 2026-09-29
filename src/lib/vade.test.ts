import assert from "node:assert/strict";
import { test } from "node:test";
import { vadeDurumu, vadeEtiketi, vadeTarihiHesapla, vadeyiCoz } from "./vade";

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

test("vadeEtiketi hazır seçenekleri ve serbest gün sayısını yazar", () => {
  assert.equal(vadeEtiketi(0), "Vadesiz");
  assert.equal(vadeEtiketi(21), "21 gün");
  assert.equal(vadeEtiketi(45), "45 gün");
  assert.equal(vadeEtiketi(37), "37 gün");
  assert.equal(vadeEtiketi(null), "Vadesiz");
  assert.equal(vadeEtiketi(undefined), "Vadesiz");
  assert.equal(vadeEtiketi(-5), "Vadesiz");
});

test("vadeyiCoz gün sayısından tarih üretir", () => {
  const sonuc = vadeyiCoz(new Date("2026-03-01T00:00:00"), 45, null);
  assert.equal(sonuc.vadeGun, 45);
  assert.equal(sonuc.vadeTarihi?.toISOString().slice(0, 10), "2026-04-15");
});

test("elle girilen vade tarihi gün sayısını belirler", () => {
  const sonuc = vadeyiCoz(new Date("2026-03-01T00:00:00"), 21, new Date("2026-04-07T00:00:00"));
  assert.equal(sonuc.vadeGun, 37, "seçili 21 değil, tarihten hesaplanan 37 olmalı");
  assert.equal(sonuc.vadeTarihi?.toISOString().slice(0, 10), "2026-04-07");
});

test("vade tarihi fatura tarihiyle aynı veya öncesiyse vadesiz sayılır", () => {
  const ayniGun = vadeyiCoz(new Date("2026-03-01T00:00:00"), 45, new Date("2026-03-01T00:00:00"));
  assert.deepEqual(ayniGun, { vadeGun: 0, vadeTarihi: null });

  const onceki = vadeyiCoz(new Date("2026-03-10T00:00:00"), 45, new Date("2026-03-01T00:00:00"));
  assert.deepEqual(onceki, { vadeGun: 0, vadeTarihi: null });
});

test("vadeyiCoz saat farkını yok sayar (gün bazlı)", () => {
  const sonuc = vadeyiCoz(new Date("2026-03-01T23:30:00"), 0, new Date("2026-03-22T00:10:00"));
  assert.equal(sonuc.vadeGun, 21);
});
