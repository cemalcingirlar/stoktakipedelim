import assert from "node:assert/strict";
import { test } from "node:test";
import { oturumBilgisiKur, type OturumKaynagi } from "./oturumKur";

function kaynak(ek: Partial<OturumKaynagi> = {}): OturumKaynagi {
  return {
    id: 7,
    kullaniciAdi: "gizem",
    adSoyad: "GIZEM",
    rol: "MAGAZA_PERSONELI",
    magazaId: 1,
    magaza: { id: 1, ad: "KOZAN CADDESİ" },
    ekMagazalar: [],
    ...ek,
  };
}

test("ana mağaza listenin başında gelir", () => {
  const o = oturumBilgisiKur(kaynak());
  assert.deepEqual(o.magazaIdleri, [1]);
  assert.deepEqual(o.magazaAdlari, ["KOZAN CADDESİ"]);
  assert.equal(o.magazaAdi, "KOZAN CADDESİ");
});

test("ek mağaza ana mağazanın peşine eklenir", () => {
  const o = oturumBilgisiKur(
    kaynak({ ekMagazalar: [{ id: 2, ad: "KOZAN CAD NAKİT" }] }),
  );
  assert.deepEqual(o.magazaIdleri, [1, 2]);
  assert.deepEqual(o.magazaAdlari, ["KOZAN CADDESİ", "KOZAN CAD NAKİT"]);
});

test("birden çok ek mağaza verilen sırayı korur", () => {
  const o = oturumBilgisiKur(
    kaynak({
      ekMagazalar: [
        { id: 2, ad: "KOZAN CAD NAKİT" },
        { id: 5, ad: "OPTİMUM AVM" },
        { id: 9, ad: "VİP İLETİŞİM" },
      ],
    }),
  );
  assert.deepEqual(o.magazaIdleri, [1, 2, 5, 9]);
});

test("ana mağaza ek listede de varsa iki kez girmez", () => {
  const o = oturumBilgisiKur(
    kaynak({
      ekMagazalar: [
        { id: 1, ad: "KOZAN CADDESİ" },
        { id: 2, ad: "KOZAN CAD NAKİT" },
      ],
    }),
  );
  assert.deepEqual(o.magazaIdleri, [1, 2]);
  assert.deepEqual(o.magazaAdlari, ["KOZAN CADDESİ", "KOZAN CAD NAKİT"]);
});

test("mağazası olmayan yönetici boş liste alır", () => {
  const o = oturumBilgisiKur(
    kaynak({ rol: "ADMIN", magazaId: null, magaza: null, ekMagazalar: [] }),
  );
  assert.deepEqual(o.magazaIdleri, []);
  assert.deepEqual(o.magazaAdlari, []);
  assert.equal(o.magazaAdi, null);
  assert.equal(o.magazaId, null);
});

test("ana mağazası olmayan kullanıcı yalnız ek mağazalarını alır", () => {
  const o = oturumBilgisiKur(
    kaynak({
      magazaId: null,
      magaza: null,
      ekMagazalar: [{ id: 4, ad: "M1 NAKİT" }],
    }),
  );
  assert.deepEqual(o.magazaIdleri, [4]);
  assert.deepEqual(o.magazaAdlari, ["M1 NAKİT"]);
  assert.equal(o.magazaAdi, null);
});

test("kimlik alanları olduğu gibi taşınır", () => {
  const o = oturumBilgisiKur(kaynak());
  assert.equal(o.kullaniciId, 7);
  assert.equal(o.kullaniciAdi, "gizem");
  assert.equal(o.adSoyad, "GIZEM");
  assert.equal(o.rol, "MAGAZA_PERSONELI");
});

test("kimlik ve ad dizileri aynı sırada kalır", () => {
  const o = oturumBilgisiKur(
    kaynak({
      ekMagazalar: [
        { id: 3, ad: "M1 REAL ANA DEPO" },
        { id: 8, ad: "OPTİMUM NAKİT" },
      ],
    }),
  );
  assert.equal(o.magazaIdleri.length, o.magazaAdlari.length);
  o.magazaIdleri.forEach((id, i) => {
    const beklenen = [
      { id: 1, ad: "KOZAN CADDESİ" },
      { id: 3, ad: "M1 REAL ANA DEPO" },
      { id: 8, ad: "OPTİMUM NAKİT" },
    ][i];
    assert.equal(id, beklenen.id);
    assert.equal(o.magazaAdlari[i], beklenen.ad);
  });
});
