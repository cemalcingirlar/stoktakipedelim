import assert from "node:assert/strict";
import { test } from "node:test";
import {
  girisUyarisi,
  stokListesiUyarisi,
  yedekUyarisi,
  type YedekOzeti,
} from "./sistemUyarilari";

const SIMDI = new Date("2026-11-12T12:00:00Z");
const once = (saat: number) => new Date(SIMDI.getTime() - saat * 3_600_000);
const iyi = (saat: number): YedekOzeti => ({ durum: "BASARILI", tarih: once(saat) });
const kotu = (saat: number, hata = "Drive kotası doldu"): YedekOzeti => ({ durum: "HATA", tarih: once(saat), hata });

test("hiç yedek kaydı yoksa uyarı yok", () => {
  assert.equal(yedekUyarisi([], null, SIMDI), null);
});

test("dün alınmış başarılı yedek uyarı vermiyor", () => {
  assert.equal(yedekUyarisi([iyi(10), iyi(34)], once(10), SIMDI), null);
});

test("tek başarısız yedek uyarı vermiyor: geçici olabilir", () => {
  assert.equal(yedekUyarisi([kotu(2), iyi(26)], once(26), SIMDI), null);
});

test("art arda iki başarısız yedek uyarı veriyor ve sebebi söylüyor", () => {
  const u = yedekUyarisi([kotu(2), kotu(26), iyi(50)], once(50), SIMDI);
  assert.equal(u?.tur, "yedek-hata");
  assert.match(u?.mesaj ?? "", /Son 2 yedekleme başarısız/);
  assert.match(u?.mesaj ?? "", /Drive kotası doldu/);
  assert.match(u?.mesaj ?? "", /2 gün önce/);
});

test("araya giren başarılı yedek sayacı kesiyor", () => {
  assert.equal(yedekUyarisi([kotu(2), iyi(26), kotu(50), kotu(74)], once(26), SIMDI), null);
});

test("hiç başarılı yedek yokken art arda hata bunu söylüyor", () => {
  const u = yedekUyarisi([kotu(2), kotu(26)], null, SIMDI);
  assert.match(u?.mesaj ?? "", /hiç başarılı yedek yok/);
});

test("zamanlanmış görev sustuysa (kayıt gelmiyor) bayat uyarısı çıkıyor", () => {
  const u = yedekUyarisi([iyi(80)], once(80), SIMDI);
  assert.equal(u?.tur, "yedek-bayat");
  assert.match(u?.mesaj ?? "", /3 gün önce/);
});

test("47 saatlik yedek bayat sayılmıyor, 48 saatlik sayılıyor", () => {
  assert.equal(yedekUyarisi([iyi(47)], once(47), SIMDI), null);
  assert.equal(yedekUyarisi([iyi(48)], once(48), SIMDI)?.tur, "yedek-bayat");
});

test("uzun hata metni kırpılıyor", () => {
  const u = yedekUyarisi([kotu(1, "x".repeat(900)), kotu(25, "y")], null, SIMDI);
  assert.ok((u?.mesaj.length ?? 0) < 300, String(u?.mesaj.length));
});

test("birkaç yazım hatası giriş uyarısı vermiyor", () => {
  assert.equal(girisUyarisi(0, 0), null);
  assert.equal(girisUyarisi(9, 0), null);
});

test("çok sayıda hatalı deneme uyarı veriyor", () => {
  assert.match(girisUyarisi(10, 0)?.mesaj ?? "", /10 hatalı giriş denemesi/);
});

test("tek kilitlenme bile uyarı veriyor ve toplam doğru", () => {
  const u = girisUyarisi(7, 1);
  assert.match(u?.mesaj ?? "", /8 hatalı giriş denemesi/);
  assert.match(u?.mesaj ?? "", /1 kez giriş kilitlendi/);
});

test("stok listesi hiç denenmemişse ya da başarılıysa uyarı yok", () => {
  assert.equal(stokListesiUyarisi(null), null);
  assert.equal(stokListesiUyarisi({ basarili: true }), null);
});

test("stok listesi yüklenemediyse uyarı sebebiyle birlikte çıkıyor", () => {
  const u = stokListesiUyarisi({ basarili: false, hata: "Klasöre yazma yetkisi yok" });
  assert.equal(u?.tur, "stok-listesi");
  assert.match(u?.mesaj ?? "", /yüklenemedi/);
  assert.match(u?.mesaj ?? "", /Klasöre yazma yetkisi yok/);
});

test("stok listesi uyarısında uzun hata kırpılıyor", () => {
  const u = stokListesiUyarisi({ basarili: false, hata: "x".repeat(900) });
  assert.ok((u?.mesaj.length ?? 0) < 250, String(u?.mesaj.length));
});
