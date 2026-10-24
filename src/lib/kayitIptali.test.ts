import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GEREKCE_EN_AZ,
  GEREKCE_EN_COK,
  cihazIptalEngeli,
  faturaIptalEngeli,
  faturaIptalOzeti,
  gerekceSorunu,
  iptalGeriAlmaEngeli,
  iptalliFaturaNo,
} from "./kayitIptali";
import { STOK_DURUM } from "./sabitler";

const d = (durum: string) => ({ durum });

// --------------------------------------------------------------- cihaz iptali

test("stoktaki cihaz iptal edilebilir", () => {
  assert.equal(cihazIptalEngeli(d(STOK_DURUM.STOKTA)), null);
});

test("arızalı ve iade cihazlar da iptal edilebilir", () => {
  // Bunların karşı tarafta bekleyen bir kaydı yok.
  assert.equal(cihazIptalEngeli(d(STOK_DURUM.ARIZALI)), null);
  assert.equal(cihazIptalEngeli(d(STOK_DURUM.IADE)), null);
});

test("satılmış cihaz iptal edilemez", () => {
  // Müşteri tarafında kaydı var; önce satış geri alınmalı.
  const engel = cihazIptalEngeli(d(STOK_DURUM.SATILDI));
  assert.match(engel ?? "", /satışı geri alın/i);
});

test("sevkiyattaki cihaz iptal edilemez", () => {
  const engel = cihazIptalEngeli(d(STOK_DURUM.TRANSFERDE));
  assert.match(engel ?? "", /sevkiyat/i);
});

test("zaten iptal edilmiş cihaz tekrar iptal edilemez", () => {
  assert.match(cihazIptalEngeli(d(STOK_DURUM.IPTAL)) ?? "", /zaten iptal/i);
});

test("yalnız iptal edilmiş cihaz geri alınabilir", () => {
  assert.equal(iptalGeriAlmaEngeli(d(STOK_DURUM.IPTAL)), null);
  assert.match(
    iptalGeriAlmaEngeli(d(STOK_DURUM.STOKTA)) ?? "",
    /iptal edilmiş değil/i,
  );
});

// ------------------------------------------------------------------- gerekçe

test("kısa gerekçe reddediliyor", () => {
  // "a" yazıp geçmek iz bırakmaz.
  assert.match(gerekceSorunu("a") ?? "", new RegExp(`${GEREKCE_EN_AZ}`));
  assert.match(gerekceSorunu("    ") ?? "", /en az/);
});

test("makul gerekçe kabul ediliyor", () => {
  assert.equal(gerekceSorunu("Yanlış IMEI girilmiş"), null);
});

test("aşırı uzun gerekçe reddediliyor", () => {
  assert.match(gerekceSorunu("x".repeat(GEREKCE_EN_COK + 1)) ?? "", /en çok/);
});

// ------------------------------------------------------------ fatura iptali

test("tüm kalemleri stokta olan fatura iptal edilebilir", () => {
  const kalemler = [d(STOK_DURUM.STOKTA), d(STOK_DURUM.STOKTA)];
  assert.equal(faturaIptalEngeli(kalemler), null);
  assert.deepEqual(faturaIptalOzeti(kalemler), {
    iptalEdilecek: 2,
    zatenIptal: 0,
    engelleyen: 0,
  });
});

test("tek bir satılmış cihaz bile faturayı engelliyor", () => {
  // Kısmen iptal, faturayı tutarı kalemlerini tutmayan bir hale sokardı.
  const engel = faturaIptalEngeli([
    d(STOK_DURUM.STOKTA),
    d(STOK_DURUM.SATILDI),
  ]);
  assert.match(engel ?? "", /1 cihaz satılmış/);
});

test("kaç cihazın engellediği sayılıyor", () => {
  const ozet = faturaIptalOzeti([
    d(STOK_DURUM.STOKTA),
    d(STOK_DURUM.SATILDI),
    d(STOK_DURUM.TRANSFERDE),
    d(STOK_DURUM.IPTAL),
  ]);
  assert.deepEqual(ozet, { iptalEdilecek: 1, zatenIptal: 1, engelleyen: 2 });
});

test("zaten tamamen iptal edilmiş fatura tekrar iptal edilmiyor", () => {
  const engel = faturaIptalEngeli([d(STOK_DURUM.IPTAL), d(STOK_DURUM.IPTAL)]);
  assert.match(engel ?? "", /zaten iptal/i);
});

test("boş fatura iptal edilmiyor", () => {
  assert.match(faturaIptalEngeli([]) ?? "", /cihaz yok/i);
});

test("kısmen iptal edilmiş fatura kalanı iptal edebiliyor", () => {
  assert.equal(
    faturaIptalEngeli([d(STOK_DURUM.IPTAL), d(STOK_DURUM.STOKTA)]),
    null,
  );
});

test("iptal edilen fatura numarası serbest kalıyor", () => {
  // Fatura numarası tedarikçi başına tekil. En olağan senaryo yanlış faturayı
  // iptal edip doğrusunu AYNI numarayla girmek; iptal edilen kayıt numarayı
  // tutsaydı bu mümkün olmazdı.
  const yeni = iptalliFaturaNo("ABC-123", 7);
  assert.notEqual(yeni, "ABC-123");
  assert.match(yeni, /ABC-123/, "özgün numara okunabilir kalmalı");
  assert.match(yeni, /iptal/i);
  assert.match(yeni, /7/, "hangi kayıt olduğu ayırt edilebilmeli");
});

test("iki ayrı iptal farklı numara üretiyor", () => {
  // Aynı numaralı fatura iki kez iptal edilebilir; ikisi çakışmamalı.
  assert.notEqual(iptalliFaturaNo("ABC-123", 7), iptalliFaturaNo("ABC-123", 9));
});
