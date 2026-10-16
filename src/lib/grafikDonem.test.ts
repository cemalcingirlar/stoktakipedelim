import assert from "node:assert/strict";
import { test } from "node:test";
import {
  donemKovalari,
  donemiCoz,
  haftaBasi,
  kovaAnahtari,
  kovaEtiketi,
  GRAFIK_DONEMLERI,
  VARSAYILAN_DONEM,
  cubukYuzdesi,
  enYuksekDeger,
} from "./grafikDonem";

// 14 Ekim 2026 bir çarşamba.
const CARSAMBA = new Date(2026, 9, 14, 15, 30);

test("tanınmayan dönem varsayılana düşer", () => {
  assert.equal(donemiCoz("yok").anahtar, VARSAYILAN_DONEM);
  assert.equal(donemiCoz(undefined).anahtar, VARSAYILAN_DONEM);
  assert.equal(donemiCoz(42).anahtar, VARSAYILAN_DONEM);
});

test("bilinen dönem anahtarları çözülür", () => {
  for (const d of GRAFIK_DONEMLERI) {
    assert.equal(donemiCoz(d.anahtar).anahtar, d.anahtar);
  }
});

test("hafta pazartesi başlar", () => {
  assert.equal(haftaBasi(CARSAMBA).getDate(), 12); // 12 Ekim 2026 pazartesi
  assert.equal(haftaBasi(new Date(2026, 9, 12)).getDate(), 12);
  // Pazar, önceki pazartesiye bağlanmalı — pazar haftanın sonu.
  assert.equal(haftaBasi(new Date(2026, 9, 18)).getDate(), 12);
  assert.equal(haftaBasi(new Date(2026, 9, 19)).getDate(), 19);
});

test("kova anahtarı türe göre üretilir", () => {
  assert.equal(kovaAnahtari(CARSAMBA, "gun"), "2026-10-14");
  assert.equal(kovaAnahtari(CARSAMBA, "hafta"), "2026-10-12");
  assert.equal(kovaAnahtari(CARSAMBA, "ay"), "2026-10");
});

test("gün sonu yapılan satış ertesi güne kaymaz", () => {
  assert.equal(kovaAnahtari(new Date(2026, 9, 14, 23, 59), "gun"), "2026-10-14");
  assert.equal(kovaAnahtari(new Date(2026, 9, 14, 0, 1), "gun"), "2026-10-14");
});

test("1 hafta 7 günlük kova üretir ve bugünle biter", () => {
  const { kovalar, baslangic } = donemKovalari(donemiCoz("1h"), CARSAMBA);
  assert.equal(kovalar.length, 7);
  assert.equal(kovalar[kovalar.length - 1].anahtar, "2026-10-14");
  assert.equal(kovalar[0].anahtar, "2026-10-08");
  assert.equal(baslangic.getDate(), 8);
  assert.equal(baslangic.getHours(), 0, "başlangıç günün başına çekilmeli");
});

test("1 ay 30 günlük kova üretir", () => {
  const { kovalar } = donemKovalari(donemiCoz("1a"), CARSAMBA);
  assert.equal(kovalar.length, 30);
  assert.equal(kovalar[kovalar.length - 1].anahtar, "2026-10-14");
  assert.equal(kovalar[0].anahtar, "2026-09-15");
});

test("3 ay haftalık kovaya bölünür", () => {
  const { kovalar, baslangic } = donemKovalari(donemiCoz("3a"), CARSAMBA);
  assert.equal(kovalar.length, 13); // 90 / 7 yukarı yuvarlanır
  assert.equal(kovalar[kovalar.length - 1].anahtar, "2026-10-12", "son kova bu hafta");
  assert.equal(baslangic.getDay(), 1, "başlangıç pazartesi olmalı");
});

test("6 ve 12 ay aylık kovaya bölünür", () => {
  const alti = donemKovalari(donemiCoz("6a"), CARSAMBA);
  assert.equal(alti.kovalar.length, 6);
  assert.equal(alti.kovalar[0].anahtar, "2026-05");
  assert.equal(alti.kovalar[5].anahtar, "2026-10");

  const oniki = donemKovalari(donemiCoz("12a"), CARSAMBA);
  assert.equal(oniki.kovalar.length, 12);
  assert.equal(oniki.kovalar[0].anahtar, "2025-11");
  assert.equal(oniki.kovalar[11].anahtar, "2026-10");
  assert.equal(oniki.baslangic.getDate(), 1, "aylık dönem ayın birinde başlar");
});

test("kova anahtarları tekrarsız ve sıralı", () => {
  for (const d of GRAFIK_DONEMLERI) {
    const { kovalar } = donemKovalari(d, CARSAMBA);
    const anahtarlar = kovalar.map((k) => k.anahtar);
    assert.equal(new Set(anahtarlar).size, anahtarlar.length, `${d.anahtar}: tekrar var`);
    const sirali = [...anahtarlar].sort();
    assert.deepEqual(anahtarlar, sirali, `${d.anahtar}: sıralı değil`);
  }
});

test("her kovanın başlangıcı kendi anahtarını üretir", () => {
  for (const d of GRAFIK_DONEMLERI) {
    const { kovalar } = donemKovalari(d, CARSAMBA);
    for (const k of kovalar) {
      assert.equal(kovaAnahtari(k.baslangic, d.kova), k.anahtar, `${d.anahtar}/${k.anahtar}`);
    }
  }
});

test("dönem içindeki her tarih bir kovaya düşer", () => {
  for (const d of GRAFIK_DONEMLERI) {
    const { kovalar, baslangic } = donemKovalari(d, CARSAMBA);
    const anahtarlar = new Set(kovalar.map((k) => k.anahtar));
    for (let t = new Date(baslangic); t <= CARSAMBA; t.setDate(t.getDate() + 1)) {
      assert.ok(
        anahtarlar.has(kovaAnahtari(t, d.kova)),
        `${d.anahtar}: ${t.toDateString()} hiçbir kovaya düşmedi`,
      );
    }
  }
});

test("ay sınırını geçen dönem doğru ay kovaları üretir", () => {
  // Ocak başı: önceki yıla taşmalı.
  const ocak = new Date(2027, 0, 3);
  const { kovalar } = donemKovalari(donemiCoz("6a"), ocak);
  assert.equal(kovalar[0].anahtar, "2026-08");
  assert.equal(kovalar[5].anahtar, "2027-01");
});

test("yıl sınırını geçen günlük dönem doğru çalışır", () => {
  const { kovalar } = donemKovalari(donemiCoz("1h"), new Date(2027, 0, 3));
  assert.equal(kovalar[0].anahtar, "2026-12-28");
  assert.equal(kovalar[6].anahtar, "2027-01-03");
});

test("etiketler boş değil", () => {
  for (const d of GRAFIK_DONEMLERI) {
    const { kovalar } = donemKovalari(d, CARSAMBA);
    for (const k of kovalar) assert.ok(k.etiket.length > 0, `${d.anahtar}: boş etiket`);
  }
});

test("haftalık etiket aralık gösterir", () => {
  assert.equal(kovaEtiketi(new Date(2026, 9, 12), "hafta"), "12-18 Eki");
});

// ------------------------------------------------------- çubuk ölçeği

function kova(giris: number, satis = 0) {
  return { anahtar: "a", etiket: "a", giris, satis, ciroKurus: 0 };
}

test("en yüksek değer giriş ve satışın büyüğü", () => {
  assert.equal(enYuksekDeger([kova(3, 7), kova(5, 2)]), 7);
});

test("boş grafikte en yüksek değer bire düşüyor", () => {
  // Sıfıra bölme olmasın; tüm çubuklar zaten sıfır yüksekliğinde.
  assert.equal(enYuksekDeger([]), 1);
  assert.equal(enYuksekDeger([kova(0, 0)]), 1);
});

test("sıfır değer çubuk çizdirmiyor", () => {
  assert.equal(cubukYuzdesi(0, 10), 0);
  assert.equal(cubukYuzdesi(-1, 10), 0);
});

test("en yüksek değer tam yüzde yüz", () => {
  assert.equal(cubukYuzdesi(10, 10), 100);
});

test("yarısı yüzde elli", () => {
  assert.equal(cubukYuzdesi(5, 10), 50);
});

test("çok küçük değer görünür kalıyor", () => {
  // 1/100 = %1 olurdu; 160 piksellik alanda 1.6 piksel, görünmez.
  assert.equal(cubukYuzdesi(1, 100), 2);
});

test("sıfır ile küçük değer birbirinden ayırt ediliyor", () => {
  assert.equal(cubukYuzdesi(0, 100), 0);
  assert.ok(cubukYuzdesi(1, 100) > 0);
});

test("yüzde hiçbir zaman yüzü aşmıyor", () => {
  for (const [deger, enYuksek] of [[1, 1], [10, 10], [3, 7], [1, 100]] as const) {
    const y = cubukYuzdesi(deger, enYuksek);
    assert.ok(y <= 100, `${deger}/${enYuksek} -> ${y}`);
  }
});
