import assert from "node:assert/strict";
import { test } from "node:test";
import {
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
