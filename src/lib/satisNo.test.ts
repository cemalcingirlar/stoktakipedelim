import assert from "node:assert/strict";
import { test } from "node:test";
import { gunAraligi, satisNoUret, satisNoYaz } from "./satisNo";

test("numara tarih ve üç haneli sırayla yazılıyor", () => {
  assert.equal(satisNoYaz(new Date(2026, 10, 6, 15, 30), 1), "SAT-20261106-001");
  assert.equal(satisNoYaz(new Date(2026, 0, 2, 0, 0), 42), "SAT-20260102-042");
});

test("günde 999'dan çok satış numarayı kesmiyor", () => {
  assert.equal(satisNoYaz(new Date(2026, 10, 6), 1000), "SAT-20261106-1000");
});

test("gün aralığı yerel gün başından ertesi gün başına", () => {
  const { gunBas, gunBit } = gunAraligi(new Date(2026, 10, 6, 23, 59, 59));
  assert.equal(gunBas.getDate(), 6);
  assert.equal(gunBas.getHours(), 0);
  assert.equal(gunBit.getDate(), 7);
  assert.equal(gunBit.getHours(), 0);
});

test("numara o gün kayıtlı satış sayısının bir fazlası", async () => {
  let sorulan: { gte: Date; lt: Date } | null = null;
  const sayac = {
    satis: {
      count: async (s: { where: { createdAt: { gte: Date; lt: Date } } }) => {
        sorulan = s.where.createdAt;
        return 2;
      },
    },
  };
  const no = await satisNoUret(sayac, new Date(2026, 10, 6, 10, 0));
  assert.equal(no, "SAT-20261106-003");
  // Sayım yalnız o günü kapsamalı; yoksa sıra her gün artarak büyür.
  assert.equal(sorulan!.gte.getDate(), 6);
  assert.equal(sorulan!.lt.getDate(), 7);
});
