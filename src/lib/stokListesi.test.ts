import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LISTEYE_GIREN_DURUMLAR,
  STOK_LISTESI_ONEKI,
  STOK_LISTESI_SAKLAMA,
  STOK_SUTUNLARI,
  bosOzet,
  magazaOzetiSatirlari,
  ozeteEkle,
  silinecekListeler,
  stokListesiDosyaAdi,
  stokListesiKaydiniCoz,
  stokListesiOzeti,
  stokSatiri,
  urunOzetiSatirlari,
  ustBilgiler,
  type StokListesiCihazi,
} from "./stokListesi";

const cihaz = (ek: Partial<StokListesiCihazi> = {}): StokListesiCihazi => ({
  magaza: "1 Nolu Mağaza",
  durum: "STOKTA",
  kategori: "Cep Telefonu",
  altKategori: "Sıfır",
  marka: "Alfa",
  model: "Fon 10",
  renk: "Siyah",
  kapasite: "128GB",
  seriNo: "350000000000011",
  barkod: "4000000000011",
  tedarikci: "Örnek Tedarikçi",
  alisFiyatiKurus: 1_000_000,
  girisTarihi: new Date(2026, 10, 3, 14),
  not: null,
  ...ek,
});

// ------------------------------------------------------------- dosya adı

test("dosya adı yerel günü taşıyor, günde bir dosya", () => {
  assert.equal(stokListesiDosyaAdi(new Date(2026, 10, 13, 2, 5)), "stok-listesi-2026-11-13.xlsx");
  assert.equal(stokListesiDosyaAdi(new Date(2026, 0, 5, 23, 59)), "stok-listesi-2026-01-05.xlsx");
});

test("dosya adı yedek dosyalarının adıyla çakışmıyor", () => {
  // Yedek rotasyonu ve geri yükleme provası "stok-yedek-" arıyor; liste o
  // aramaya girerse sağlam bir yedeği düşürür ya da prova Excel'i açmaya çalışır.
  assert.ok(!stokListesiDosyaAdi(new Date()).includes("stok-yedek-"));
  assert.ok(!STOK_LISTESI_ONEKI.includes("yedek"));
});

// ---------------------------------------------------------------- satırlar

test("satır sütunlarla aynı sayıda hücre taşıyor", () => {
  assert.equal(stokSatiri(cihaz()).length, STOK_SUTUNLARI.length);
});

test("seri no ve barkod metin: Excel IMEI'yi sayıya çevirip bozmasın", () => {
  const s = stokSatiri(cihaz());
  const seri = s[STOK_SUTUNLARI.findIndex((x) => x.baslik.startsWith("Seri No"))];
  const barkod = s[STOK_SUTUNLARI.findIndex((x) => x.baslik === "Barkod")];
  assert.equal(typeof seri, "string");
  assert.equal(seri, "350000000000011");
  assert.equal(typeof barkod, "string");
});

test("alış fiyatı sayı ve TL cinsinden", () => {
  const s = stokSatiri(cihaz({ alisFiyatiKurus: 1_424_775 }));
  const fiyat = s[STOK_SUTUNLARI.findIndex((x) => x.baslik.startsWith("Alış Fiyatı"))];
  assert.equal(fiyat, 14247.75);
});

test("durum Türkçe etiketiyle, boş alanlar boş metin olarak yazılıyor", () => {
  const s = stokSatiri(cihaz({ durum: "TRANSFERDE", renk: null, seriNo: null, not: null }));
  assert.equal(s[1], "Transferde");
  assert.ok(!s.includes(null), "null hücre olmamalı");
});

test("formül gibi başlayan not metin olarak kalıyor", () => {
  // Hücre değeri dize; exceljs dizeyi formül olarak yazmıyor. Değerin
  // değiştirilmeden geçtiği sınanıyor.
  const s = stokSatiri(cihaz({ not: "=HYPERLINK(\"http://x\")" }));
  assert.equal(s[s.length - 1], "=HYPERLINK(\"http://x\")");
});

test("giriş tarihi gün.ay.yıl", () => {
  const s = stokSatiri(cihaz());
  assert.equal(s[STOK_SUTUNLARI.findIndex((x) => x.baslik === "Giriş Tarihi")], "03.11.2026");
});

test("satılan ve iptal edilen kayıtlar listeye girmiyor", () => {
  assert.ok(!LISTEYE_GIREN_DURUMLAR.includes("SATILDI"));
  assert.ok(!LISTEYE_GIREN_DURUMLAR.includes("IPTAL"));
  assert.ok(LISTEYE_GIREN_DURUMLAR.includes("STOKTA"));
  assert.ok(LISTEYE_GIREN_DURUMLAR.includes("TRANSFERDE"));
});

// ------------------------------------------------------------------ özetler

test("mağaza özeti adet ve tutarı topluyor, sonda toplam var", () => {
  const ozet = bosOzet();
  ozeteEkle(ozet, cihaz({ magaza: "2 Nolu Mağaza", alisFiyatiKurus: 500_000 }));
  ozeteEkle(ozet, cihaz({ magaza: "1 Nolu Mağaza", alisFiyatiKurus: 1_000_000 }));
  ozeteEkle(ozet, cihaz({ magaza: "1 Nolu Mağaza", alisFiyatiKurus: 250_050 }));
  assert.deepEqual(magazaOzetiSatirlari(ozet), [
    ["1 Nolu Mağaza", 2, 12500.5],
    ["2 Nolu Mağaza", 1, 5000],
    ["TOPLAM", 3, 17500.5],
  ]);
});

test("mağazalar sayıya göre sıralanıyor: 10, 2'den sonra", () => {
  const ozet = bosOzet();
  for (const ad of ["10 Nolu Mağaza", "2 Nolu Mağaza", "1 Nolu Mağaza"]) ozeteEkle(ozet, cihaz({ magaza: ad }));
  assert.deepEqual(
    magazaOzetiSatirlari(ozet).slice(0, 3).map((s) => s[0]),
    ["1 Nolu Mağaza", "2 Nolu Mağaza", "10 Nolu Mağaza"],
  );
});

test("ürün özeti harf büyüklüğünü birleştiriyor, en çok bulunan üstte", () => {
  const ozet = bosOzet();
  ozeteEkle(ozet, cihaz({ marka: "SAMSUNG", model: "Galaxy A55" }));
  ozeteEkle(ozet, cihaz({ marka: "Samsung", model: "galaxy a55" }));
  ozeteEkle(ozet, cihaz({ marka: "Alfa", model: "Fon 10" }));
  const s = urunOzetiSatirlari(ozet);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0].slice(2), [2, 20000]);
  assert.equal(s[1][0], "Alfa");
});

test("I ve İ taşıyan markalar da birleşiyor", () => {
  // Türkçe kurallı küçültme "XIAOMI"yi "xıaomı" yapıp "Xiaomi"den ayırıyordu.
  const ozet = bosOzet();
  ozeteEkle(ozet, cihaz({ marka: "XIAOMI", model: "REDMI 15" }));
  ozeteEkle(ozet, cihaz({ marka: "Xiaomi", model: "Redmi 15" }));
  ozeteEkle(ozet, cihaz({ marka: "xiaomi", model: "redmi 15" }));
  const s = urunOzetiSatirlari(ozet);
  assert.equal(s.length, 1, s.map((x) => `${x[0]} ${x[1]}`).join(" | "));
  assert.equal(s[0][2], 3);
});

test("farklı modeller birleşmiyor", () => {
  const ozet = bosOzet();
  ozeteEkle(ozet, cihaz({ marka: "Xiaomi", model: "Redmi 15" }));
  ozeteEkle(ozet, cihaz({ marka: "Xiaomi", model: "Redmi 15C" }));
  assert.equal(urunOzetiSatirlari(ozet).length, 2);
});

test("boş stokta özetler boş, toplam sıfır", () => {
  const ozet = bosOzet();
  assert.deepEqual(magazaOzetiSatirlari(ozet), [["TOPLAM", 0, 0]]);
  assert.deepEqual(urunOzetiSatirlari(ozet), []);
});

test("üst bilgi tarihi, adedi ve toplam değeri söylüyor", () => {
  const ozet = bosOzet();
  ozeteEkle(ozet, cihaz({ alisFiyatiKurus: 1_234_550 }));
  const b = ustBilgiler(new Date(2026, 10, 13, 2, 5), ozet);
  assert.match(b[0], /13\.11\.2026 02:05/);
  assert.match(b[1], /1 cihaz/);
  assert.match(b[1], /12\.345,50 TL/);
});

// ------------------------------------------------------------------ saklama

const d = (gun: string, id: string, createdTime = `${gun}T02:00:00Z`) => ({
  id,
  name: `stok-listesi-${gun}.xlsx`,
  createdTime,
});

test("saklama sınırının altında hiçbir şey silinmiyor", () => {
  assert.deepEqual(silinecekListeler([d("2026-11-13", "a"), d("2026-11-12", "b")], 30), []);
});

test("en yeni günler kalıyor, eskiler siliniyor", () => {
  const dosyalar = [d("2026-11-10", "eski"), d("2026-11-13", "yeni"), d("2026-11-11", "orta"), d("2026-11-12", "dun")];
  assert.deepEqual(silinecekListeler(dosyalar, 2).sort(), ["eski", "orta"]);
});

test("aynı günün iki dosyasından yenisi kalıyor", () => {
  const dosyalar = [
    d("2026-11-13", "sabah", "2026-11-13T02:00:00Z"),
    d("2026-11-13", "ogle", "2026-11-13T12:00:00Z"),
    d("2026-11-12", "dun"),
  ];
  assert.deepEqual(silinecekListeler(dosyalar, 30), ["sabah"]);
});

test("aynı günün kopyası gün sayısını şişirmiyor", () => {
  // İki kopya iki gün sayılırsa bir gün fazladan silinir.
  const dosyalar = [
    d("2026-11-13", "a1", "2026-11-13T02:00:00Z"),
    d("2026-11-13", "a2", "2026-11-13T12:00:00Z"),
    d("2026-11-12", "b"),
  ];
  assert.deepEqual(silinecekListeler(dosyalar, 2), ["a1"]);
});

test("klasördeki başka dosyalara dokunulmuyor", () => {
  const dosyalar = [
    { id: "x", name: "notlarim.xlsx", createdTime: "2020-01-01T00:00:00Z" },
    { id: "y", name: "stok-yedek-202611130200.db.gz", createdTime: "2020-01-01T00:00:00Z" },
    { id: "z", name: "stok-listesi-eski.pdf", createdTime: "2020-01-01T00:00:00Z" },
    { id: null, name: "stok-listesi-2020-01-01.xlsx" },
    d("2026-11-13", "a"),
  ];
  assert.deepEqual(silinecekListeler(dosyalar, 1), []);
});

test("geçersiz saklama sayısında gün silinmiyor", () => {
  const dosyalar = [d("2026-11-13", "a"), d("2026-11-12", "b")];
  assert.deepEqual(silinecekListeler(dosyalar, 0), []);
  assert.deepEqual(silinecekListeler(dosyalar, Number.NaN), []);
});

test("varsayılan saklama bir ay", () => {
  assert.equal(STOK_LISTESI_SAKLAMA, 30);
});

// -------------------------------------------------------------------- kayıt

test("saklanan kayıt çözülüyor, bozuğu yok sayılıyor", () => {
  const k = { tarihISO: "2026-11-13T02:00:00Z", basarili: true, dosyaAdi: "x.xlsx", cihazSayisi: 5 };
  assert.deepEqual(stokListesiKaydiniCoz(JSON.stringify(k)), k);
  assert.equal(stokListesiKaydiniCoz(null), null);
  assert.equal(stokListesiKaydiniCoz("{bozuk"), null);
  assert.equal(stokListesiKaydiniCoz(JSON.stringify({ basarili: "evet" })), null);
});

test("yedek mesajına eklenen özet: başarı, hata ve denenmemiş", () => {
  assert.equal(stokListesiOzeti(undefined), "");
  assert.equal(stokListesiOzeti(null), "");
  assert.equal(
    stokListesiOzeti({ basarili: true, dosyaAdi: "stok-listesi-2026-11-13.xlsx", cihazSayisi: 412 }),
    " Stok listesi: stok-listesi-2026-11-13.xlsx (412 cihaz).",
  );
  assert.match(
    stokListesiOzeti({ basarili: false, dosyaAdi: "x", cihazSayisi: 0, hata: "kota doldu" }),
    /yüklenemedi: kota doldu/,
  );
});
