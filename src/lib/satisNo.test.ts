import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cakismadaYenidenDene,
  satisNoOneki,
  satisNoUret,
  satisNoYaz,
  sonrakiSira,
} from "./satisNo";

const ONEK = "SAT-20261106-";

test("numara tarih ve üç haneli sırayla yazılıyor", () => {
  assert.equal(satisNoYaz(new Date(2026, 10, 6, 15, 30), 1), "SAT-20261106-001");
  assert.equal(satisNoYaz(new Date(2026, 0, 2, 0, 0), 42), "SAT-20260102-042");
});

test("günde 999'dan çok satış numarayı kesmiyor", () => {
  assert.equal(satisNoYaz(new Date(2026, 10, 6), 1000), "SAT-20261106-1000");
});

test("gün öneki tarihten kuruluyor", () => {
  assert.equal(satisNoOneki(new Date(2026, 10, 6, 23, 59)), ONEK);
});

test("numara o günün en büyüğünün bir fazlası", async () => {
  let sorulan: Record<string, { startsWith: string }> | null = null;
  const kaynak = {
    satis: {
      findMany: async (s: {
        where: Record<string, { startsWith: string }>;
        select: Record<string, true>;
      }) => {
        sorulan = s.where;
        // Aradan bir kayıt silinmiş: 001 ve 003 yok. Sayıma dayalı eski kod
        // burada var olan bir numarayı isteyip çakışıyordu.
        return [{ satisNo: `${ONEK}002` }, { satisNo: `${ONEK}004` }];
      },
    },
  };
  assert.equal(
    await satisNoUret(kaynak, new Date(2026, 10, 6, 10, 0)),
    `${ONEK}005`,
  );
  // Sorgu yalnız o günü kapsamalı.
  assert.equal(sorulan!.satisNo.startsWith, ONEK);
});

test("o güne ait kayıt yoksa 001", async () => {
  const kaynak = { satis: { findMany: async () => [] } };
  assert.equal(await satisNoUret(kaynak, new Date(2026, 10, 6)), `${ONEK}001`);
});

test("silinen kayıttan sonra numara geri gitmiyor", () => {
  // Canlıdaki hata: satış geri alınınca boşalan kart siliniyor ve sayıma
  // dayalı numara var olan bir numarayı istiyordu.
  assert.equal(sonrakiSira([`${ONEK}002`], ONEK), 3);
});

test("satış numarası çakışmasında işlem yeniden deneniyor", async () => {
  const cakisma = Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
    meta: { target: ["satisNo"] },
  });
  let deneme = 0;
  const sonuc = await cakismadaYenidenDene(async () => {
    deneme += 1;
    if (deneme < 2) throw cakisma;
    return "tamam";
  });
  assert.equal(sonuc, "tamam");
  assert.equal(deneme, 2);
});
