import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANONIM_AD,
  aciklamayiAnonimlestir,
  anonimAlanlar,
  musteriAlanSorunu,
  musteriAlanlariniCoz,
  musteriSilmeKarari,
  silmeOzeti,
  telefonNormalize,
} from "./musteriDuzenleme";

const tam = {
  adSoyad: "Ayşe Yılmaz",
  telefon: "05321112233",
  tcknVkn: "12345678901",
  adres: "Örnek Mah.",
  not: null,
};

test("telefon boşluk, tire ve parantezden arınıyor", () => {
  assert.equal(telefonNormalize("0532 111 22 33"), "05321112233");
  assert.equal(telefonNormalize("(0532) 111-22.33"), "05321112233");
  assert.equal(telefonNormalize("   "), null);
  assert.equal(telefonNormalize(null), null);
});

test("geçerli müşteri sorunsuz", () => {
  assert.equal(musteriAlanSorunu(tam), null);
});

test("ad soyad zorunlu ve en az iki karakter", () => {
  assert.match(musteriAlanSorunu({ ...tam, adSoyad: "" })!, /Ad soyad/);
  assert.match(musteriAlanSorunu({ ...tam, adSoyad: "A" })!, /en az 2/);
  assert.match(
    musteriAlanSorunu({ ...tam, adSoyad: "A".repeat(81) })!,
    /en fazla/,
  );
});

test("telefon rakam dışı karakter kabul etmiyor", () => {
  assert.match(
    musteriAlanSorunu({ ...tam, telefon: "0532 abc" })!,
    /yalnız rakam/,
  );
  assert.match(musteriAlanSorunu({ ...tam, telefon: "123" })!, /7 ile 15/);
  assert.match(
    musteriAlanSorunu({ ...tam, telefon: "1".repeat(16) })!,
    /7 ile 15/,
  );
  assert.equal(musteriAlanSorunu({ ...tam, telefon: "+905321112233" }), null);
});

test("telefon boş bırakılabiliyor", () => {
  assert.equal(musteriAlanSorunu({ ...tam, telefon: null }), null);
});

test("TCKN 11, VKN 10 rakam", () => {
  assert.equal(musteriAlanSorunu({ ...tam, tcknVkn: "1234567890" }), null);
  assert.match(musteriAlanSorunu({ ...tam, tcknVkn: "123" })!, /11, VKN 10/);
  assert.match(
    musteriAlanSorunu({ ...tam, tcknVkn: "1234567890a" })!,
    /yalnız rakam/,
  );
  assert.equal(musteriAlanSorunu({ ...tam, tcknVkn: null }), null);
});

test("form alanları temizlenip doğrulanıyor", () => {
  const sonuc = musteriAlanlariniCoz({
    adSoyad: "  Ayşe Yılmaz  ",
    telefon: "0532 111 22 33",
    tcknVkn: " 12345678901 ",
    adres: "   ",
    not: "",
  });
  assert.ok("alanlar" in sonuc);
  assert.deepEqual(sonuc.alanlar, {
    adSoyad: "Ayşe Yılmaz",
    telefon: "05321112233",
    tcknVkn: "12345678901",
    adres: null,
    not: null,
  });
});

test("geçersiz form hata veriyor", () => {
  const sonuc = musteriAlanlariniCoz({ adSoyad: "x" });
  assert.ok("hata" in sonuc);
});

test("satışı olmayan müşteri tamamen silinir", () => {
  assert.equal(musteriSilmeKarari(0), "SIL");
  assert.match(silmeOzeti(0), /tamamen silinecek/);
});

test("satışı olan müşteri anonimleştirilir", () => {
  assert.equal(musteriSilmeKarari(3), "ANONIMLESTIR");
  const ozet = silmeOzeti(3);
  assert.match(ozet, /3 satışı/);
  assert.match(ozet, /korunacak/);
});

test("anonim alanlarda kişisel veri kalmıyor", () => {
  const a = anonimAlanlar();
  assert.equal(a.adSoyad, ANONIM_AD);
  assert.equal(a.telefon, null);
  assert.equal(a.tcknVkn, null);
  assert.equal(a.adres, null);
  assert.equal(a.not, null);
});

test("hareket açıklamasındaki ad anonim adla değişiyor", () => {
  assert.equal(
    aciklamayiAnonimlestir("Ayşe Yılmaz müşterisine satıldı", "Ayşe Yılmaz"),
    `${ANONIM_AD} müşterisine satıldı`,
  );
});

test("ad açıklamada birden çok kez geçse de hepsi değişiyor", () => {
  const sonuc = aciklamayiAnonimlestir(
    "Ayşe Yılmaz · Ayşe Yılmaz geri aldı",
    "Ayşe Yılmaz",
  );
  assert.ok(!sonuc!.includes("Ayşe Yılmaz"));
});

test("açıklama boşsa ya da ad boşsa dokunulmuyor", () => {
  assert.equal(aciklamayiAnonimlestir(null, "Ayşe"), null);
  assert.equal(aciklamayiAnonimlestir("Bir açıklama", "  "), "Bir açıklama");
});

test("başka müşterinin adı geçen açıklama bozulmuyor", () => {
  assert.equal(
    aciklamayiAnonimlestir("Mehmet Demir müşterisine satıldı", "Ayşe Yılmaz"),
    "Mehmet Demir müşterisine satıldı",
  );
});
