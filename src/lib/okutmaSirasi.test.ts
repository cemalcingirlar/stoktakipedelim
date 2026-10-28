import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hepsiOkutulduNotu,
  ilerlemeNotu,
  siradakiOkutma,
  type KalemDurumu,
} from "./okutmaSirasi";

type Kalem = { id: number; durum: KalemDurumu };
const durumu = (k: Kalem) => k.durum;
const kalemler = (...durumlar: KalemDurumu[]): Kalem[] =>
  durumlar.map((durum, i) => ({ id: i + 1, durum }));

test("eşleşen kalem yoksa YOK döner", () => {
  assert.deepEqual(siradakiOkutma([], durumu), { durum: "YOK" });
});

test("tek bekleyen kalem okutulur", () => {
  const sonuc = siradakiOkutma(kalemler("BEKLIYOR"), durumu);
  assert.equal(sonuc.durum, "OKUT");
  assert.equal(sonuc.durum === "OKUT" && sonuc.kalem.id, 1);
  assert.equal(sonuc.durum === "OKUT" && sonuc.sira, 1);
  assert.equal(sonuc.durum === "OKUT" && sonuc.toplam, 1);
});

test("ilk kalem okutulmuşsa sıradaki bekleyene geçer", () => {
  // Kullanıcının bildirdiği hata buydu: aynı barkodtan 20 adet varken
  // ikinci okutma "zaten okutuldu" deyip duruyordu.
  const sonuc = siradakiOkutma(
    kalemler("OKUTULDU", "BEKLIYOR", "BEKLIYOR"),
    durumu,
  );
  assert.equal(sonuc.durum, "OKUT");
  assert.equal(sonuc.durum === "OKUT" && sonuc.kalem.id, 2);
  assert.equal(sonuc.durum === "OKUT" && sonuc.sira, 2);
  assert.equal(sonuc.durum === "OKUT" && sonuc.toplam, 3);
});

test("okutulmuşlar arada kalsa bile ilk bekleyen seçilir", () => {
  const sonuc = siradakiOkutma(
    kalemler("OKUTULDU", "OKUTULDU", "BEKLIYOR", "OKUTULDU"),
    durumu,
  );
  assert.equal(sonuc.durum === "OKUT" && sonuc.kalem.id, 3);
  // Sıra, işaretlenmiş adet sayısına göre: üçüncü adet okutuluyor.
  assert.equal(sonuc.durum === "OKUT" && sonuc.sira, 4);
});

test("bekleyen kalmadıysa hepsinin okutulduğu söylenir", () => {
  const sonuc = siradakiOkutma(kalemler("OKUTULDU", "OKUTULDU"), durumu);
  assert.deepEqual(sonuc, { durum: "HEPSI_OKUTULDU", toplam: 2 });
});

test("reddedilmiş adetler toplamın dışında kalır", () => {
  // Reddedilen adet sevkiyattan düşülmüştür; "3/20" derken kullanıcının
  // elindeki paketteki adet kastediliyor.
  const sonuc = siradakiOkutma(
    kalemler("DISI", "OKUTULDU", "BEKLIYOR"),
    durumu,
  );
  assert.equal(sonuc.durum === "OKUT" && sonuc.kalem.id, 3);
  assert.equal(sonuc.durum === "OKUT" && sonuc.sira, 2);
  assert.equal(sonuc.durum === "OKUT" && sonuc.toplam, 2);
});

test("hepsi okutmaya kapalıysa DISI döner", () => {
  assert.deepEqual(siradakiOkutma(kalemler("DISI", "DISI"), durumu), {
    durum: "DISI",
  });
});

test("ilerleme notu tek adette boş, çok adette oranı yazar", () => {
  assert.equal(ilerlemeNotu(1, 1), "");
  assert.equal(ilerlemeNotu(3, 20), " (3/20)");
});

test("hepsi okutuldu notu adede göre değişir", () => {
  assert.equal(hepsiOkutulduNotu(1), "zaten okutuldu");
  assert.equal(hepsiOkutulduNotu(20), "bu koddaki 20 adedin hepsi okutuldu");
});

test("hepsi okutuldu notunun fiili ekrana göre değişir", () => {
  // Sayım ekranında "okutuldu" değil "sayıldı" deniyor.
  assert.equal(hepsiOkutulduNotu(1, "sayıldı"), "zaten sayıldı");
  assert.equal(
    hepsiOkutulduNotu(20, "sayıldı"),
    "bu koddaki 20 adedin hepsi sayıldı",
  );
});
