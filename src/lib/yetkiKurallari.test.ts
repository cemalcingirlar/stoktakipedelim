import assert from "node:assert/strict";
import { test } from "node:test";
import { ROLLER } from "./sabitler";
import {
  adminMi,
  ayarlariYonetebilirMi,
  magazadaIslemYapabilirMi,
  stokEkleyebilirMi,
  stokSilebilirMi,
  yetkiliMagazalar,
} from "./yetkiKurallari";

const admin = { rol: ROLLER.ADMIN, magazaId: null };
const sorumlu1 = { rol: ROLLER.MAGAZA_SORUMLUSU, magazaId: 1 };
const personel1 = { rol: ROLLER.MAGAZA_PERSONELI, magazaId: 1 };
const personel2 = { rol: ROLLER.MAGAZA_PERSONELI, magazaId: 2 };
const bagsizPersonel = { rol: ROLLER.MAGAZA_PERSONELI, magazaId: null };
// Ana mağazası 1, ayrıca 3'te de yetkili.
const cokMagazali = { rol: ROLLER.MAGAZA_SORUMLUSU, magazaId: 1, magazaIdleri: [1, 3] };

test("yalnızca yönetici stok ekleyebilir ve silebilir", () => {
  assert.equal(stokEkleyebilirMi(admin), true);
  assert.equal(stokSilebilirMi(admin), true);

  for (const kullanici of [sorumlu1, personel1]) {
    assert.equal(stokEkleyebilirMi(kullanici), false);
    assert.equal(stokSilebilirMi(kullanici), false);
  }
});

test("ayar yönetimi yalnızca yöneticide", () => {
  assert.equal(ayarlariYonetebilirMi(admin), true);
  assert.equal(ayarlariYonetebilirMi(sorumlu1), false);
  assert.equal(ayarlariYonetebilirMi(personel1), false);
});

test("adminMi yalnız ADMIN rolünde doğru", () => {
  assert.equal(adminMi(admin), true);
  assert.equal(adminMi(sorumlu1), false);
  assert.equal(adminMi(personel1), false);
});

test("yönetici her mağazada işlem yapabilir", () => {
  for (const magazaId of [1, 2, 3, 99]) {
    assert.equal(magazadaIslemYapabilirMi(admin, magazaId), true);
  }
});

test("personel yalnız kendi mağazasında işlem yapabilir", () => {
  assert.equal(magazadaIslemYapabilirMi(personel1, 1), true);
  assert.equal(magazadaIslemYapabilirMi(personel1, 2), false);
  assert.equal(magazadaIslemYapabilirMi(personel2, 2), true);
  assert.equal(magazadaIslemYapabilirMi(personel2, 1), false);
});

test("mağaza sorumlusu da kendi mağazasıyla sınırlı", () => {
  assert.equal(magazadaIslemYapabilirMi(sorumlu1, 1), true);
  assert.equal(magazadaIslemYapabilirMi(sorumlu1, 3), false);
});

test("mağazaya bağlı olmayan personel hiçbir mağazada işlem yapamaz", () => {
  // magazaId null olduğunda null === null tuzağına düşülmemeli.
  assert.equal(magazadaIslemYapabilirMi(bagsizPersonel, 1), false);
  assert.equal(magazadaIslemYapabilirMi(bagsizPersonel, 2), false);
});

test("birden çok mağazada yetkili kullanıcı hepsinde işlem yapabilir", () => {
  assert.equal(magazadaIslemYapabilirMi(cokMagazali, 1), true);
  assert.equal(magazadaIslemYapabilirMi(cokMagazali, 3), true);
  assert.equal(magazadaIslemYapabilirMi(cokMagazali, 2), false);
});

test("yetkiliMagazalar listesi ana mağazayı da içerir", () => {
  assert.deepEqual(yetkiliMagazalar(cokMagazali), [1, 3]);
});

test("magazaIdleri yoksa ana mağazaya düşülür (eski oturum çerezi)", () => {
  assert.deepEqual(yetkiliMagazalar(personel1), [1]);
  assert.deepEqual(yetkiliMagazalar(bagsizPersonel), []);
  assert.deepEqual(yetkiliMagazalar(admin), []);
});

test("boş magazaIdleri dizisi ana mağazayı düşürmez", () => {
  const bos = { rol: ROLLER.MAGAZA_PERSONELI, magazaId: 2, magazaIdleri: [] };
  assert.deepEqual(yetkiliMagazalar(bos), [2]);
  assert.equal(magazadaIslemYapabilirMi(bos, 2), true);
});
