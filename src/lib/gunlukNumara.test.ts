import assert from "node:assert/strict";
import { test } from "node:test";
import {
  benzersizlikCakismasiMi,
  cakismadaYenidenDene,
  gunOneki,
  numaraSirasi,
  numaraYaz,
  sonrakiNumara,
  sonrakiSira,
} from "./gunlukNumara";

const ONEK = "SAT-20261106-";

test("gün öneki baş harflerle tarihten kuruluyor", () => {
  assert.equal(gunOneki("SAT-", new Date(2026, 10, 6, 23, 59)), ONEK);
  assert.equal(gunOneki("SVK-", new Date(2026, 0, 2)), "SVK-20260102-");
});

test("numara üç haneye tamamlanıyor", () => {
  assert.equal(numaraYaz(ONEK, 7), `${ONEK}007`);
  assert.equal(numaraYaz(ONEK, 1200), `${ONEK}1200`);
});

// ------------------------------------------------------------ sıra okuma

test("numaranın sırası okunuyor", () => {
  assert.equal(numaraSirasi(`${ONEK}003`, ONEK), 3);
  assert.equal(numaraSirasi(`${ONEK}1200`, ONEK), 1200);
});

test("göçten gelen harfli numaralar da sayılıyor", () => {
  assert.equal(numaraSirasi(`${ONEK}E0007`, ONEK), 7);
});

test("başka günün ya da bozuk numaranın sırası sıfır", () => {
  // Bozuk tek bir kayıt sırayı kilitlememeli.
  assert.equal(numaraSirasi("SAT-20261105-009", ONEK), 0);
  assert.equal(numaraSirasi(ONEK, ONEK), 0);
  assert.equal(numaraSirasi("ELDE-YAZILMIS", ONEK), 0);
  assert.equal(numaraSirasi(`${ONEK}000`, ONEK), 0);
});

// ----------------------------------------------------------- sıradaki sıra

test("boş günde ilk numara 1", () => {
  assert.equal(sonrakiSira([], ONEK), 1);
});

test("sıradaki numara en büyükten devam ediyor", () => {
  assert.equal(sonrakiSira([`${ONEK}001`, `${ONEK}002`], ONEK), 3);
});

test("ARADAKİ KAYIT SİLİNSE BİLE numara geri gitmiyor", () => {
  // Canlıdaki hatanın kökü: sayıma dayalı numara, kayıt silinince var olan
  // bir numarayı tekrar istiyordu.
  assert.equal(sonrakiSira([`${ONEK}002`], ONEK), 3);
  assert.equal(sonrakiSira([`${ONEK}002`, `${ONEK}005`], ONEK), 6);
});

test("başka günün numaraları sırayı etkilemiyor", () => {
  assert.equal(sonrakiSira(["SAT-20261105-900", `${ONEK}001`], ONEK), 2);
});

test("göç numaraları ile yeni numaralar aynı sırada", () => {
  assert.equal(sonrakiSira([`${ONEK}E0004`, `${ONEK}002`], ONEK), 5);
});

// --------------------------------------------------------------- üretim

test("sıradaki numara o günün en büyüğünden geliyor", async () => {
  let sorgu: unknown = null;
  const kaynak = {
    findMany: async (s: {
      where: Record<string, { startsWith: string }>;
      select: Record<string, true>;
    }) => {
      sorgu = s;
      return [{ transferNo: `${"SVK-20261106-"}004` }];
    },
  };
  const no = await sonrakiNumara(kaynak, "transferNo", "SVK-20261106-");
  assert.equal(no, "SVK-20261106-005");
  assert.deepEqual(sorgu, {
    where: { transferNo: { startsWith: "SVK-20261106-" } },
    select: { transferNo: true },
  });
});

// -------------------------------------------------------------- çakışma

const cakisma = Object.assign(new Error("Unique constraint failed"), {
  code: "P2002",
  meta: { target: ["satisNo"] },
});

test("alanın benzersizlik çakışması tanınıyor", () => {
  assert.equal(benzersizlikCakismasiMi(cakisma, "satisNo"), true);
  assert.equal(
    benzersizlikCakismasiMi({ code: "P2002", meta: { target: "transferNo" } }, "transferNo"),
    true,
  );
});

test("başka alanın çakışması sayılmıyor", () => {
  // Aynı IMEI'nin ikinci kez girilmesi kullanıcıya söylenmeli, sessizce
  // yeniden denenmemeli.
  assert.equal(benzersizlikCakismasiMi(cakisma, "transferNo"), false);
  assert.equal(
    benzersizlikCakismasiMi({ code: "P2002", meta: { target: ["seriNo"] } }, "satisNo"),
    false,
  );
  assert.equal(benzersizlikCakismasiMi(new Error("herhangi"), "satisNo"), false);
  assert.equal(benzersizlikCakismasiMi(null, "satisNo"), false);
});

test("çakışmada işlem yeniden deneniyor", async () => {
  let deneme = 0;
  const sonuc = await cakismadaYenidenDene(async () => {
    deneme += 1;
    if (deneme < 3) throw cakisma;
    return "tamam";
  }, "satisNo");
  assert.equal(sonuc, "tamam");
  assert.equal(deneme, 3);
});

test("çakışma dışındaki hata hemen yükseliyor", async () => {
  let deneme = 0;
  await assert.rejects(
    cakismadaYenidenDene(async () => {
      deneme += 1;
      throw new Error("başka hata");
    }, "satisNo"),
    /başka hata/,
  );
  assert.equal(deneme, 1, "yeniden denenmemeli");
});

test("deneme hakkı bitince hata yükseliyor", async () => {
  let deneme = 0;
  await assert.rejects(
    cakismadaYenidenDene(async () => {
      deneme += 1;
      throw cakisma;
    }, "satisNo", 3),
    /Unique constraint/,
  );
  assert.equal(deneme, 3);
});
