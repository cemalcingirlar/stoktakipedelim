import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GENEL_EN_COK_DENEME,
  denemeAnahtarlari,
  kayitIcinAd,
  EN_COK_DENEME,
  KILIT_DK,
  PENCERE_DK,
  basarisizDenemeSonrasi,
  kilitDurumu,
  kilitMesaji,
  type DenemeKaydi,
} from "./girisSiniri";

const T0 = new Date("2026-10-23T10:00:00Z");
const dk = (n: number) => new Date(T0.getTime() + n * 60_000);

/** Arka arkaya n başarısız deneme. */
function denemeler(n: number, baslangic = T0): DenemeKaydi | null {
  let kayit: DenemeKaydi | null = null;
  for (let i = 0; i < n; i++) {
    kayit = basarisizDenemeSonrasi(
      kayit,
      new Date(baslangic.getTime() + i * 1000),
    );
  }
  return kayit;
}

test("kayıt yokken kilit yok", () => {
  assert.deepEqual(kilitDurumu(null, T0), { kilitli: false, kalanSn: 0 });
});

test("sınırın altında kilit yok", () => {
  const kayit = denemeler(EN_COK_DENEME - 1)!;
  assert.equal(kayit.basarisiz, EN_COK_DENEME - 1);
  assert.equal(kayit.kilitBitis, null);
  assert.equal(kilitDurumu(kayit, T0).kilitli, false);
});

test("sınıra ulaşınca kilitleniyor", () => {
  const kayit = denemeler(EN_COK_DENEME)!;
  assert.equal(kayit.basarisiz, EN_COK_DENEME);
  assert.ok(kayit.kilitBitis, "kilit bitişi yazılmalı");
  assert.equal(kilitDurumu(kayit, T0).kilitli, true);
});

test("kilit süresi dolunca açılıyor", () => {
  const kayit = denemeler(EN_COK_DENEME)!;
  assert.equal(kilitDurumu(kayit, dk(KILIT_DK - 1)).kilitli, true);
  assert.equal(kilitDurumu(kayit, dk(KILIT_DK + 1)).kilitli, false);
});

test("kalan süre saniye cinsinden bildiriliyor", () => {
  const kayit = denemeler(EN_COK_DENEME)!;
  const durum = kilitDurumu(kayit, dk(1));
  assert.ok(
    durum.kalanSn > 0 && durum.kalanSn <= KILIT_DK * 60,
    `${durum.kalanSn}`,
  );
});

test("pencere dolmuşsa sayaç sıfırdan başlıyor", () => {
  // İki gün arayla iki yanlış deneme saldırı değil, insan hatası.
  const eski = denemeler(EN_COK_DENEME - 1)!;
  const yeni = basarisizDenemeSonrasi(eski, dk(PENCERE_DK + 1));
  assert.equal(yeni.basarisiz, 1, "sayaç sıfırlanmalı");
  assert.equal(yeni.kilitBitis, null);
});

test("pencere içindeki denemeler birikiyor", () => {
  const kayit = denemeler(3)!;
  const sonraki = basarisizDenemeSonrasi(kayit, dk(PENCERE_DK - 1));
  assert.equal(sonraki.basarisiz, 4);
});

test("mesaj dakika cinsinden ve Türkçe", () => {
  const m = kilitMesaji(15 * 60);
  assert.match(m, /15 dakika/);
  assert.match(m, /hatalı deneme/);
  assert.match(kilitMesaji(30), /1 dakika/, "yarım dakika yukarı yuvarlanmalı");
});

test("sınır değerleri makul", () => {
  // Çok düşük sınır personeli kilitler, çok yüksek sınır işe yaramaz.
  assert.ok(EN_COK_DENEME >= 5 && EN_COK_DENEME <= 15, `${EN_COK_DENEME}`);
  assert.ok(KILIT_DK >= 5, `${KILIT_DK}`);
});

// ------------------------------------------- kullanıcı adı + IP sayaçları

test("aynı ad farklı adreslerde ayrı sayaçlara düşüyor", () => {
  // Asıl dert: adı bilen biri kendi adresinden deneyerek hesabın sahibini
  // kilitleyebiliyordu. Sayaç artık denemeyi yapan adrese ait.
  const saldirgan = denemeAnahtarlari("admin", "203.0.113.7");
  const sahibi = denemeAnahtarlari("admin", "198.51.100.4");
  assert.notEqual(saldirgan.ipli, sahibi.ipli);
  assert.equal(saldirgan.genel, sahibi.genel, "genel sayaç ortak");
});

test("çift anahtarı ile genel anahtar birbirine karışmıyor", () => {
  const a = denemeAnahtarlari("admin", "203.0.113.7");
  assert.notEqual(a.ipli, a.genel);
  // Kullanıcı adına önek gibi görünen bir metin yazmak başkasının sayacına
  // ulaşmamalı.
  const sahte = denemeAnahtarlari("ip:203.0.113.7 admin", "198.51.100.4");
  assert.notEqual(sahte.genel, a.ipli);
  assert.notEqual(sahte.ipli, a.ipli);
});

test("boşluklu kullanıcı adı başka bir adres-ad çiftiyle çakışmıyor", () => {
  const a = denemeAnahtarlari("b c", "10.0.0.1");
  const b = denemeAnahtarlari("c", "10.0.0.1 b");
  assert.notEqual(a.ipli, b.ipli);
});

test("IP okunamazsa ortak kovaya düşüyor, sınır yine işliyor", () => {
  const a = denemeAnahtarlari("ayse", undefined);
  const b = denemeAnahtarlari("ayse", "");
  assert.equal(a.ipli, b.ipli);
  assert.match(a.ipli, /bilinmiyor/);
});

test("genel sayaç tek adresin ulaşamayacağı kadar yüksek", () => {
  assert.ok(GENEL_EN_COK_DENEME > EN_COK_DENEME * 2);
});

test("genel sayaç kendi sınırında kilitleniyor", () => {
  let kayit: DenemeKaydi | null = null;
  for (let i = 0; i < GENEL_EN_COK_DENEME - 1; i++) {
    kayit = basarisizDenemeSonrasi(kayit, new Date(T0.getTime() + i * 1000), GENEL_EN_COK_DENEME);
  }
  assert.equal(kayit?.kilitBitis, null, "sınırın bir altında kilit yok");
  kayit = basarisizDenemeSonrasi(kayit, dk(1), GENEL_EN_COK_DENEME);
  assert.ok(kayit.kilitBitis, "sınırda kilitlenmeli");
});

test("denetim kaydına yazılan ad kırpılıyor ve tek satır kalıyor", () => {
  assert.equal(kayitIcinAd("admin"), "admin");
  assert.equal(kayitIcinAd("a\nb\tc"), "a b c");
  const uzun = kayitIcinAd("x".repeat(500));
  assert.ok(uzun.length <= 61, String(uzun.length));
});
