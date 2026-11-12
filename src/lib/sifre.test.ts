import assert from "node:assert/strict";
import { test } from "node:test";
import { sifreDogrula, sifreDogrulaSabitSure, sifreHashle } from "./sifre";

test("doğru şifre doğrulanıyor, yanlışı reddediliyor", async () => {
  const hash = await sifreHashle("Dogru-Sifre-1");
  assert.equal(await sifreDogrula("Dogru-Sifre-1", hash), true);
  assert.equal(await sifreDogrula("yanlis", hash), false);
});

test("sabit süreli doğrulama kayıt varken aynı sonucu veriyor", async () => {
  const hash = await sifreHashle("Dogru-Sifre-1");
  assert.equal(await sifreDogrulaSabitSure("Dogru-Sifre-1", hash), true);
  assert.equal(await sifreDogrulaSabitSure("yanlis", hash), false);
});

test("kullanıcı yokken sonuç her zaman false", async () => {
  assert.equal(await sifreDogrulaSabitSure("herhangi", null), false);
  assert.equal(await sifreDogrulaSabitSure("herhangi", undefined), false);
  assert.equal(await sifreDogrulaSabitSure("", ""), false);
});

test("kullanıcı yokken de scrypt çalışıyor: süre ayırt etmiyor", async () => {
  // Var olmayan adda scrypt atlanıyordu; cevap süresi hangi adların kayıtlı
  // olduğunu ele veriyordu. İki yolun süresi aynı mertebede olmalı.
  const hash = await sifreHashle("Dogru-Sifre-1");
  await sifreDogrulaSabitSure("isinma", null);
  const olc = async (saklanan: string | null) => {
    const t = performance.now();
    for (let i = 0; i < 5; i++) await sifreDogrulaSabitSure("deneme", saklanan);
    return (performance.now() - t) / 5;
  };
  const varken = await olc(hash);
  const yokken = await olc(null);
  assert.ok(
    yokken > varken * 0.5,
    `kayıt yokken ${yokken.toFixed(1)} ms, varken ${varken.toFixed(1)} ms`,
  );
});
