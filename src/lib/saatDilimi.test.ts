import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BEKLENEN_SAAT_DILIMI,
  SAAT_DILIMI_SECENEKLERI,
  saatDilimiCoz,
  saatDilimiGecerliMi,
  saatDilimiDurumu,
  saatDilimiOzeti,
  saatDilimiUyarisi,
} from "./saatDilimi";

const AN = new Date("2026-10-23T22:00:00Z"); // UTC'de 23 Ekim, Türkiye'de 24 Ekim

test("beklenen dilim Türkiye", () => {
  assert.equal(BEKLENEN_SAAT_DILIMI, "Europe/Istanbul");
});

test("doğru dilimde uyarı yok", () => {
  const durum = saatDilimiDurumu("Europe/Istanbul", "Europe/Istanbul", AN);
  assert.equal(durum.dogru, true);
  assert.equal(durum.saatFarki, 0);
  assert.equal(saatDilimiUyarisi(durum), null);
});

test("UTC sunucuda 3 saatlik kayma yakalanıyor", () => {
  // Sorunun ta kendisi: UTC'de 23 Ekim 22:00, Türkiye'de 24 Ekim 01:00.
  const durum = saatDilimiDurumu("UTC", "Europe/Istanbul", AN);
  assert.equal(durum.dogru, false);
  assert.equal(durum.saatFarki, -3);
  const uyari = saatDilimiUyarisi(durum);
  assert.match(uyari ?? "", /UTC/);
  assert.match(uyari ?? "", /3 saat geri/);
});

test("ileri yöndeki kayma da yakalanıyor", () => {
  const durum = saatDilimiDurumu("Asia/Tokyo", "Europe/Istanbul", AN);
  assert.equal(durum.dogru, false);
  assert.ok(durum.saatFarki > 0);
  assert.match(saatDilimiUyarisi(durum) ?? "", /ileri/);
});

test("gün sınırını aşan fark normalleştiriliyor", () => {
  // Honolulu ile İstanbul arasında ham fark -13 çıkar; +11 olarak okunmamalı.
  const durum = saatDilimiDurumu("Pacific/Honolulu", "Europe/Istanbul", AN);
  assert.ok(
    Math.abs(durum.saatFarki) <= 12,
    `fark ${durum.saatFarki} makul aralıkta olmalı`,
  );
});

test("adı farklı ama saati aynı dilim uyarı vermiyor", () => {
  // Boş yere uyarmamak için ölçüt ad değil saat farkı.
  const durum = saatDilimiDurumu("Asia/Nicosia", "Europe/Istanbul", AN);
  assert.equal(durum.saatFarki, 0);
  assert.equal(durum.dogru, true);
  assert.equal(saatDilimiUyarisi(durum), null);
});

test("tanınmayan dilim adında çökmüyor", () => {
  const durum = saatDilimiDurumu("Mars/Olympus", "Europe/Istanbul", AN);
  assert.equal(durum.dogru, false);
  assert.ok(saatDilimiUyarisi(durum));
});

test("özet satırı dilimi her durumda yazıyor", () => {
  // Uyarı yalnız sorun varken çıkıyordu; sessizlik "ayar doğru" ile
  // "güncelleme inmemiş" arasında ayrım bırakmıyordu.
  const dogru = saatDilimiOzeti(
    saatDilimiDurumu("Europe/Istanbul", "Europe/Istanbul", AN),
  );
  assert.equal(dogru.dogru, true);
  assert.match(dogru.metin, /Europe\/Istanbul/);

  const yanlis = saatDilimiOzeti(
    saatDilimiDurumu("UTC", "Europe/Istanbul", AN),
  );
  assert.equal(yanlis.dogru, false);
  assert.match(yanlis.metin, /UTC/, "yanlışken de hangi dilimde olduğu yazılı");
});

test("özet ile uyarı birbiriyle tutarlı", () => {
  // Rozet "doğru" derken altta uyarı çıkmamalı, tersi de.
  for (const dilim of [
    "Europe/Istanbul",
    "UTC",
    "Asia/Tokyo",
    "Asia/Nicosia",
  ]) {
    const durum = saatDilimiDurumu(dilim, "Europe/Istanbul", AN);
    const ozet = saatDilimiOzeti(durum);
    const uyari = saatDilimiUyarisi(durum);
    assert.equal(
      ozet.dogru,
      uyari === null,
      `${dilim} için özet ve uyarı çelişiyor`,
    );
  }
});

test("seçenek listesinde Türkiye ve UTC var", () => {
  const degerler = SAAT_DILIMI_SECENEKLERI.map((s) => s.deger);
  assert.ok(degerler.includes("Europe/Istanbul"));
  assert.ok(degerler.includes("UTC"));
});

test("listedeki her dilim Node'un tanıdığı bir ad", () => {
  // Listeye yazım hatasıyla eklenen bir ad, seçildiğinde her sayfayı
  // düşürürdü: Intl tanımadığı dilimle fırlatıyor.
  for (const { deger, etiket } of SAAT_DILIMI_SECENEKLERI) {
    assert.ok(saatDilimiGecerliMi(deger), `${deger} geçersiz`);
    assert.ok(etiket.includes(deger), `${etiket} dilim adını yazmıyor`);
  }
});

test("geçersiz dilim adı reddedilir", () => {
  assert.equal(saatDilimiGecerliMi("Mars/Olympus"), false);
  assert.equal(saatDilimiGecerliMi(""), false);
  assert.equal(saatDilimiGecerliMi("   "), false);
});

test("dilim çözümü boşlukları atıyor, geçersizi null veriyor", () => {
  assert.equal(saatDilimiCoz("  Europe/Istanbul  "), "Europe/Istanbul");
  assert.equal(saatDilimiCoz("Mars/Olympus"), null);
  assert.equal(saatDilimiCoz(null), null);
  assert.equal(saatDilimiCoz(undefined), null);
  assert.equal(saatDilimiCoz(42), null);
  assert.equal(saatDilimiCoz(""), null);
});

test("durum çalışan dilimdeki saati yazıyor", () => {
  // AN: UTC 22:00 → Türkiye 01:00.
  assert.equal(
    saatDilimiDurumu("Europe/Istanbul", "Europe/Istanbul", AN).yerelSaat,
    "01:00",
  );
  assert.equal(
    saatDilimiDurumu("UTC", "Europe/Istanbul", AN).yerelSaat,
    "22:00",
  );
});

test("tanınmayan dilimde bile saat alanı dolu geliyor", () => {
  const durum = saatDilimiDurumu("Mars/Olympus", "Europe/Istanbul", AN);
  assert.equal(durum.dogru, false);
  assert.equal(durum.yerelSaat, "—");
});

test("uyarı seçilen dilimden söz ediyor", () => {
  const uyari = saatDilimiUyarisi(
    saatDilimiDurumu("UTC", "Europe/Istanbul", AN),
  );
  assert.ok(uyari);
  assert.match(uyari, /seçilen/);
  assert.match(uyari, /UTC/);
  assert.match(uyari, /Europe\/Istanbul/);
});
