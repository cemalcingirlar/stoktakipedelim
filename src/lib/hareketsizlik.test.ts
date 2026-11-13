import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ETKINLIK_YAZMA_ARALIGI_DK,
  HAREKETSIZLIK_DK,
  etkinlikKarari,
} from "./hareketsizlik";

const SIMDI = new Date("2026-11-12T12:00:00Z");
const dkOnce = (dk: number) => new Date(SIMDI.getTime() - dk * 60_000);

test("kayıt yoksa oturum geçerli ve kayıt açılıyor", () => {
  assert.deepEqual(etkinlikKarari(null, SIMDI), { gecerli: true, yaz: true });
});

test("az önce etkin olan oturum geçerli, yeniden yazılmıyor", () => {
  assert.deepEqual(etkinlikKarari(dkOnce(1), SIMDI), { gecerli: true, yaz: false });
});

test("yazma aralığı dolunca son etkinlik tazeleniyor", () => {
  assert.deepEqual(etkinlikKarari(dkOnce(ETKINLIK_YAZMA_ARALIGI_DK), SIMDI), { gecerli: true, yaz: true });
  assert.deepEqual(etkinlikKarari(dkOnce(90), SIMDI), { gecerli: true, yaz: true });
});

test("sınırın tam üstünde oturum hâlâ geçerli", () => {
  assert.equal(etkinlikKarari(dkOnce(HAREKETSIZLIK_DK), SIMDI).gecerli, true);
});

test("sınır aşılınca oturum kapanıyor ve kayıt tazelenmiyor", () => {
  // Tazelenseydi, süresi dolmuş oturumla yapılan istek onu yeniden canlandırırdı.
  assert.deepEqual(etkinlikKarari(dkOnce(HAREKETSIZLIK_DK + 1), SIMDI), { gecerli: false, yaz: false });
  assert.equal(etkinlikKarari(dkOnce(600), SIMDI).gecerli, false);
});

test("yazma aralığı sınırdan çok küçük: çalışan kullanıcı düşmüyor", () => {
  assert.ok(ETKINLIK_YAZMA_ARALIGI_DK * 10 <= HAREKETSIZLIK_DK);
});
