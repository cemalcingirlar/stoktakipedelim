import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aktarimaUygunKaynaklar,
  ayniDukkanMi,
  ayniDukkandakiler,
  dukkanIciAktarabilirMi,
  dukkanKoduNormalize,
} from "./dukkan";
import { ROLLER } from "./sabitler";
import type { YetkiSahibi } from "./yetkiKurallari";

const KOZAN = { id: 1, dukkanKodu: "KOZAN" };
const KOZAN_NAKIT = { id: 2, dukkanKodu: "KOZAN" };
const OPTIMUM = { id: 3, dukkanKodu: "OPTIMUM" };
const OPTIMUM_NAKIT = { id: 4, dukkanKodu: "OPTIMUM" };
const GRUPSUZ_A = { id: 5, dukkanKodu: null };
const GRUPSUZ_B = { id: 6, dukkanKodu: null };
const TUMU = [KOZAN, KOZAN_NAKIT, OPTIMUM, OPTIMUM_NAKIT, GRUPSUZ_A, GRUPSUZ_B];

const personel = (magazaIdleri: number[]): YetkiSahibi => ({
  rol: ROLLER.MAGAZA_PERSONELI as YetkiSahibi["rol"],
  magazaId: magazaIdleri[0] ?? null,
  magazaIdleri,
});
const yonetici: YetkiSahibi = { rol: ROLLER.ADMIN as YetkiSahibi["rol"], magazaId: null };

test("dükkân kodu büyük harfe çevrilir ve boşluklar atılır", () => {
  assert.equal(dukkanKoduNormalize("  kozan "), "KOZAN");
  assert.equal(dukkanKoduNormalize("Kozan"), "KOZAN");
});

test("boş dükkân kodu null olur", () => {
  assert.equal(dukkanKoduNormalize(""), null);
  assert.equal(dukkanKoduNormalize("   "), null);
  assert.equal(dukkanKoduNormalize(null), null);
  assert.equal(dukkanKoduNormalize(undefined), null);
});

test("aynı kodlu iki mağaza aynı dükkândır", () => {
  assert.equal(ayniDukkanMi(KOZAN, KOZAN_NAKIT), true);
  assert.equal(ayniDukkanMi(KOZAN_NAKIT, KOZAN), true);
});

test("farklı kodlu mağazalar aynı dükkân değildir", () => {
  assert.equal(ayniDukkanMi(KOZAN, OPTIMUM), false);
});

test("mağaza kendisiyle aynı dükkân sayılmaz", () => {
  assert.equal(ayniDukkanMi(KOZAN, { ...KOZAN }), false);
});

test("kodu olmayan mağazalar birbiriyle eşleşmez", () => {
  // Aksi halde dükkân kodu girilmemiş tüm mağazalar tek dev dükkân sayılır
  // ve gerçek sevkiyatlar kayıt dışı kalırdı.
  assert.equal(ayniDukkanMi(GRUPSUZ_A, GRUPSUZ_B), false);
  assert.equal(ayniDukkanMi(KOZAN, GRUPSUZ_A), false);
});

test("büyük/küçük harf farkı eşleşmeyi bozmaz", () => {
  assert.equal(ayniDukkanMi({ id: 7, dukkanKodu: "kozan" }, { id: 8, dukkanKodu: "KOZAN " }), true);
});

test("iki mağazada da yetkili personel aktarım yapabilir", () => {
  assert.equal(dukkanIciAktarabilirMi(personel([1, 2]), KOZAN, KOZAN_NAKIT), true);
});

test("tek mağazada yetkili personel aktarım yapamaz", () => {
  assert.equal(dukkanIciAktarabilirMi(personel([1]), KOZAN, KOZAN_NAKIT), false);
  assert.equal(dukkanIciAktarabilirMi(personel([2]), KOZAN, KOZAN_NAKIT), false);
});

test("yetkili olsa da farklı dükkânlar arasında aktarım yapılamaz", () => {
  assert.equal(dukkanIciAktarabilirMi(personel([1, 3]), KOZAN, OPTIMUM), false);
  assert.equal(dukkanIciAktarabilirMi(yonetici, KOZAN, OPTIMUM), false);
});

test("yönetici aynı dükkân içinde aktarım yapabilir", () => {
  assert.equal(dukkanIciAktarabilirMi(yonetici, KOZAN, KOZAN_NAKIT), true);
});

test("aynı dükkândaki diğer mağazalar listelenir", () => {
  assert.deepEqual(
    ayniDukkandakiler(KOZAN, TUMU).map((m) => m.id),
    [2],
  );
  assert.deepEqual(
    ayniDukkandakiler(GRUPSUZ_A, TUMU).map((m) => m.id),
    [],
  );
});

test("üç kayıtlı dükkânda iki hedef çıkar", () => {
  const ucuncu = { id: 9, dukkanKodu: "KOZAN" };
  assert.deepEqual(
    ayniDukkandakiler(KOZAN, [...TUMU, ucuncu]).map((m) => m.id),
    [2, 9],
  );
});

test("kaynak listesi yalnız yetkili ve eşi olan mağazaları içerir", () => {
  assert.deepEqual(
    aktarimaUygunKaynaklar(personel([1, 2, 5]), TUMU).map((m) => m.id),
    [1, 2],
  );
});

test("eşi olmayan mağazada çalışan personel için kaynak çıkmaz", () => {
  assert.deepEqual(aktarimaUygunKaynaklar(personel([5, 6]), TUMU), []);
});

test("yönetici için tüm eşleşen mağazalar kaynak olur", () => {
  assert.deepEqual(
    aktarimaUygunKaynaklar(yonetici, TUMU).map((m) => m.id),
    [1, 2, 3, 4],
  );
});

test("hiç dükkân kodu tanımlı değilse kaynak çıkmaz", () => {
  assert.deepEqual(aktarimaUygunKaynaklar(yonetici, [GRUPSUZ_A, GRUPSUZ_B]), []);
});
