import assert from "node:assert/strict";
import { test } from "node:test";
import {
  gorebilirMi,
  gorunurMagazaIdleri,
  gorunurMagazalar,
  hareketKosulu,
  magazaKosulu,
  transferKosulu,
  veriYokMu,
} from "./gorunurluk";
import { ROLLER } from "./sabitler";

const admin = { rol: ROLLER.ADMIN, magazaId: null };
const sorumlu2 = { rol: ROLLER.MAGAZA_SORUMLUSU, magazaId: 2 };
const personel1 = { rol: ROLLER.MAGAZA_PERSONELI, magazaId: 1 };
// Ana mağazası 1, ayrıca 3'te de yetkili.
const cokMagazali = { rol: ROLLER.MAGAZA_SORUMLUSU, magazaId: 1, magazaIdleri: [1, 3] };
const bagsiz = { rol: ROLLER.MAGAZA_PERSONELI, magazaId: null };

test("yönetici için kısıt yok", () => {
  assert.equal(gorunurMagazaIdleri(admin), null);
});

test("personel yalnız kendi mağazasını görür", () => {
  assert.deepEqual(gorunurMagazaIdleri(personel1), [1]);
  assert.deepEqual(gorunurMagazaIdleri(sorumlu2), [2]);
});

test("ek yetki verilen mağazalar da görünür", () => {
  assert.deepEqual(gorunurMagazaIdleri(cokMagazali), [1, 3]);
});

test("hiçbir mağazaya bağlı olmayan kullanıcı veri göremez", () => {
  // Boş dizi "hepsi" değil "hiçbiri" demek; yanlışlıkla her şeyi açmaktansa
  // hiçbir şey göstermek doğru.
  assert.deepEqual(gorunurMagazaIdleri(bagsiz), []);
  assert.equal(veriYokMu(gorunurMagazaIdleri(bagsiz)), true);
  assert.equal(veriYokMu(gorunurMagazaIdleri(personel1)), false);
  assert.equal(veriYokMu(gorunurMagazaIdleri(admin)), false);
});

test("magazaKosulu yöneticide boş, diğerlerinde kısıtlı", () => {
  assert.deepEqual(magazaKosulu(null), {});
  assert.deepEqual(magazaKosulu([1, 3]), { magazaId: { in: [1, 3] } });
  // Boş dizi hiçbir kaydı getirmemeli — koşul yine yazılıyor.
  assert.deepEqual(magazaKosulu([]), { magazaId: { in: [] } });
});

test("gorebilirMi mağaza bazında karar verir", () => {
  assert.equal(gorebilirMi(null, 7), true);
  assert.equal(gorebilirMi([1, 3], 1), true);
  assert.equal(gorebilirMi([1, 3], 3), true);
  assert.equal(gorebilirMi([1, 3], 2), false);
  assert.equal(gorebilirMi([], 1), false);
});

test("transferKosulu kaynağı ya da hedefi görünür olanları alır", () => {
  assert.deepEqual(transferKosulu(null), {});
  assert.deepEqual(transferKosulu([1, 3]), {
    OR: [{ kaynakMagazaId: { in: [1, 3] } }, { hedefMagazaId: { in: [1, 3] } }],
  });
});

test("hareketKosulu kaynağı ya da hedefi görünür olanları alır", () => {
  assert.deepEqual(hareketKosulu(null), {});
  assert.deepEqual(hareketKosulu([2]), {
    OR: [{ kaynakMagazaId: { in: [2] } }, { hedefMagazaId: { in: [2] } }],
  });
});

test("gorunurMagazalar listeyi süzer, sırayı korur", () => {
  const magazalar = [
    { id: 1, ad: "A" },
    { id: 2, ad: "B" },
    { id: 3, ad: "C" },
  ];
  assert.deepEqual(gorunurMagazalar(magazalar, null), magazalar);
  assert.deepEqual(gorunurMagazalar(magazalar, [3, 1]), [
    { id: 1, ad: "A" },
    { id: 3, ad: "C" },
  ]);
  assert.deepEqual(gorunurMagazalar(magazalar, []), []);
});
