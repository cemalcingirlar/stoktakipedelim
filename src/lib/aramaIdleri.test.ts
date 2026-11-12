import assert from "node:assert/strict";
import { test } from "node:test";
import { ARAMA_ID_SINIRI, aramaIdleriniSec } from "./aramaIdleri";

test("az eşleşmede kimlik listesi kullanılıyor", () => {
  assert.deepEqual(aramaIdleriniSec([7, 9]), [7, 9]);
  const tam = Array.from({ length: ARAMA_ID_SINIRI }, (_, i) => i + 1);
  assert.equal(aramaIdleriniSec(tam)?.length, ARAMA_ID_SINIRI);
});

test("hiç eşleşme yoksa boş liste dönüyor, null değil", () => {
  // null "liste bilinmiyor, metinle ara" demek; boş liste "eşleşme yok".
  // İkisi karışırsa eşleşmesi olmayan arama gereksiz yere yavaş yola düşer.
  assert.deepEqual(aramaIdleriniSec([]), []);
});

test("sınır aşılınca liste kullanılmıyor: eksik liste sonucu kırpardı", () => {
  const fazla = Array.from({ length: ARAMA_ID_SINIRI + 1 }, (_, i) => i + 1);
  assert.equal(aramaIdleriniSec(fazla), null);
});

test("sınır tek sorgunun parametre sınırının çok altında", () => {
  assert.ok(ARAMA_ID_SINIRI <= 900);
});
