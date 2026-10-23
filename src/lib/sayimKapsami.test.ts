import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EN_COK_MAGAZA,
  kapsamEtiketi,
  kapsamNotu,
  kapsamSorunu,
  kapsamdaMi,
  kapsamiDuzenle,
  type SecilebilirMagaza,
} from "./sayimKapsami";

function magaza(ozel: Partial<SecilebilirMagaza> & { id: number }): SecilebilirMagaza {
  return { ad: `Mağaza ${ozel.id}`, aktif: true, acikSayimVar: false, ...ozel };
}

const KOZAN = magaza({ id: 1, ad: "KOZAN CADDESİ" });
const KOZAN_NAKIT = magaza({ id: 2, ad: "KOZAN CAD NAKİT" });
const PASIF = magaza({ id: 3, ad: "KAPALI ŞUBE", aktif: false });
const MESGUL = magaza({ id: 4, ad: "OPTİMUM AVM", acikSayimVar: true });
const TUMU = [KOZAN, KOZAN_NAKIT, PASIF, MESGUL];

test("iki mağaza birlikte seçilebilir", () => {
  assert.equal(kapsamSorunu([1, 2], TUMU), null);
});

test("tek mağaza da geçerli", () => {
  assert.equal(kapsamSorunu([1], TUMU), null);
});

test("hiç mağaza seçilmezse uyarır", () => {
  assert.equal(kapsamSorunu([], TUMU), "En az bir mağaza seçin.");
});

test("pasif mağaza sayıma giremez", () => {
  assert.match(kapsamSorunu([1, 3], TUMU) ?? "", /KAPALI ŞUBE pasif/);
});

test("açık sayımı olan mağaza ikinci kez sayıma giremez", () => {
  // Aynı cihaz iki sayımda birden beklenirse ikisinin de sonucu yanlış çıkar.
  assert.match(kapsamSorunu([1, 4], TUMU) ?? "", /OPTİMUM AVM için devam eden bir sayım/);
});

test("bilinmeyen mağaza kimliği reddedilir", () => {
  // Kutular ekrandan geliyor ama istek elle de kurulabilir.
  assert.equal(kapsamSorunu([999], TUMU), "Seçilen mağaza bulunamadı.");
});

test("çok fazla mağaza seçilemez", () => {
  const cok = Array.from({ length: EN_COK_MAGAZA + 1 }, (_, i) => magaza({ id: i + 10 }));
  const sorun = kapsamSorunu(
    cok.map((m) => m.id),
    cok,
  );
  assert.match(sorun ?? "", new RegExp(`en çok ${EN_COK_MAGAZA} mağaza`));
});

test("tekrarlı seçim tek sayılır", () => {
  assert.deepEqual(kapsamiDuzenle([2, 1, 2, 1]), [1, 2]);
  assert.equal(kapsamSorunu([1, 1, 1], TUMU), null, "aynı mağaza iki kez işaretlenmiş sayılmaz");
});

test("geçersiz kimlikler ayıklanır", () => {
  assert.deepEqual(kapsamiDuzenle([0, -3, 2, 1.5, 4]), [2, 4]);
});

test("etiket tek mağazada sade, çoklu mağazada hepsini yazar", () => {
  assert.equal(kapsamEtiketi(["KOZAN CADDESİ"]), "KOZAN CADDESİ");
  assert.equal(
    kapsamEtiketi(["KOZAN CADDESİ", "KOZAN CAD NAKİT"]),
    "KOZAN CADDESİ + KOZAN CAD NAKİT",
  );
  assert.equal(kapsamEtiketi([]), "—");
});

test("kapsam notu yalnız çoklu mağazada çıkar", () => {
  assert.equal(kapsamNotu(["KOZAN CADDESİ"]), "");
  assert.match(kapsamNotu(["A", "B"]), /2 mağaza birlikte/);
});

test("kapsamdaki mağazanın cihazı başka mağazada sayılmaz", () => {
  // Birlikte saymanın bütün amacı bu.
  assert.equal(kapsamdaMi([1, 2], 2), true);
  assert.equal(kapsamdaMi([1, 2], 5), false);
  assert.equal(kapsamdaMi([1], 1), true);
});
