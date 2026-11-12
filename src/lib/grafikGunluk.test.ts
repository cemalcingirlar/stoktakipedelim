import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GRAFIK_DONEMLERI,
  donemKovalari,
  gunlukToplamlariKovala,
  kovaAnahtari,
  sabitSaatFarkiDk,
  sqliteSaatKaydirmasi,
} from "./grafikDonem";

/** Testi belirli bir saat diliminde çalıştırır, sonra eskisine döner. */
function dilimde<T>(dilim: string, is: () => T): T {
  const onceki = process.env.TZ;
  process.env.TZ = dilim;
  try {
    return is();
  } finally {
    if (onceki === undefined) delete process.env.TZ;
    else process.env.TZ = onceki;
  }
}

const donem = (anahtar: string) => GRAFIK_DONEMLERI.find((d) => d.anahtar === anahtar)!;
const gunYaz = (t: Date) =>
  `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;

test("Türkiye'de saat farkı yıl boyu sabit: +180", () => {
  dilimde("Europe/Istanbul", () => {
    assert.equal(sabitSaatFarkiDk(new Date("2025-11-01T00:00:00Z"), new Date("2026-11-12T12:00:00Z")), 180);
  });
});

test("yaz saati geçişini kapsayan aralıkta sabit fark yok", () => {
  dilimde("Europe/Berlin", () => {
    // Mart sonunda +60 -> +120.
    assert.equal(sabitSaatFarkiDk(new Date("2026-03-01T00:00:00Z"), new Date("2026-04-15T00:00:00Z")), null);
  });
});

test("fark iki kez değişip başa dönse de yakalanıyor", () => {
  dilimde("Europe/Berlin", () => {
    // Kasım -> ertesi Kasım: iki uçta da +60, arada +120.
    assert.equal(sabitSaatFarkiDk(new Date("2025-11-12T00:00:00Z"), new Date("2026-11-12T00:00:00Z")), null);
  });
});

test("geçiş içermeyen kısa aralıkta yaz saatli dilimde de sabit fark var", () => {
  dilimde("Europe/Berlin", () => {
    assert.equal(sabitSaatFarkiDk(new Date("2026-06-01T00:00:00Z"), new Date("2026-06-30T00:00:00Z")), 120);
  });
});

test("SQLite kaydırması işaretiyle yazılıyor", () => {
  assert.equal(sqliteSaatKaydirmasi(180), "+180 minutes");
  assert.equal(sqliteSaatKaydirmasi(0), "+0 minutes");
  assert.equal(sqliteSaatKaydirmasi(-300), "-300 minutes");
  assert.equal(sqliteSaatKaydirmasi(330), "+330 minutes");
});

test("günlük toplamlar gün kovalarına birebir düşüyor", () => {
  dilimde("Europe/Istanbul", () => {
    const bugun = new Date(2026, 10, 12, 15);
    const { kovalar } = donemKovalari(donem("1h"), bugun);
    const s = gunlukToplamlariKovala(
      kovalar,
      "gun",
      [{ gun: "2026-11-12", adet: 3, kurus: 300 }, { gun: "2026-11-06", adet: 1, kurus: 50 }],
      [{ gun: "2026-11-12", adet: 2, kurus: 900 }],
    );
    assert.equal(s.length, 7);
    const son = s[s.length - 1];
    assert.deepEqual([son.giris, son.girisKurus, son.satis, son.ciroKurus], [3, 300, 2, 900]);
    assert.equal(s[0].giris, 1);
    assert.equal(s.reduce((t, k) => t + k.giris, 0), 4);
  });
});

test("aynı güne iki kaynaktan gelen satışlar toplanıyor", () => {
  // Cihaz satışları ve aktarım satışları ayrı sorgulardan geliyor.
  dilimde("Europe/Istanbul", () => {
    const { kovalar } = donemKovalari(donem("1h"), new Date(2026, 10, 12, 15));
    const s = gunlukToplamlariKovala(kovalar, "gun", [], [
      { gun: "2026-11-11", adet: 4, kurus: 4000 },
      { gun: "2026-11-11", adet: 1, kurus: 500 },
    ]);
    const k = s.find((x) => x.satis > 0)!;
    assert.deepEqual([k.satis, k.ciroKurus], [5, 4500]);
  });
});

test("günler hafta ve ay kovalarına satır satır yoldaki kuralla düşüyor", () => {
  dilimde("Europe/Istanbul", () => {
    const bugun = new Date(2026, 10, 12, 15);
    for (const anahtar of ["3a", "12a"]) {
      const d = donem(anahtar);
      const { baslangic, kovalar } = donemKovalari(d, bugun);
      // Dönemin her günü için bir satış: her kova, içindeki gün sayısını vermeli.
      const gunler: { gun: string; adet: number; kurus: number }[] = [];
      const beklenen = new Map<string, number>();
      for (let t = new Date(baslangic); t <= bugun; t.setDate(t.getDate() + 1)) {
        gunler.push({ gun: gunYaz(t), adet: 1, kurus: 10 });
        const a = kovaAnahtari(new Date(t.getFullYear(), t.getMonth(), t.getDate(), 9), d.kova);
        beklenen.set(a, (beklenen.get(a) ?? 0) + 1);
      }
      const s = gunlukToplamlariKovala(kovalar, d.kova, [], gunler);
      for (const k of s) assert.equal(k.satis, beklenen.get(k.anahtar) ?? 0, `${anahtar} ${k.anahtar}`);
      assert.equal(s.reduce((t, k) => t + k.satis, 0), gunler.length, anahtar);
    }
  });
});

test("dönemin dışındaki ve bozuk günler atlanıyor", () => {
  dilimde("Europe/Istanbul", () => {
    const { kovalar } = donemKovalari(donem("1h"), new Date(2026, 10, 12, 15));
    const s = gunlukToplamlariKovala(kovalar, "gun", [
      { gun: "2020-01-01", adet: 9, kurus: 9 },
      { gun: "bozuk", adet: 9, kurus: 9 },
      { gun: "", adet: 9, kurus: 9 },
    ], []);
    assert.equal(s.reduce((t, k) => t + k.giris, 0), 0);
  });
});
