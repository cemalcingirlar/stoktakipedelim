import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CIKIS_DONEMLERI,
  SATIS_DONEMLERI,
  VARSAYILAN_SATIS_DONEMI,
  cikisDonemiCoz,
  donemBasligi,
  satisDonemAraligi,
  satisDonemiCoz,
  satisToplami,
  tekGunMu,
} from "./satisDonemi";

// 15 Ekim 2026 bir perşembe; haftanın pazartesisi 12 Ekim.
const PERSEMBE = new Date(2026, 9, 15, 14, 30);

test("tanınmayan dönem bugüne düşer", () => {
  assert.equal(satisDonemiCoz("yok").anahtar, VARSAYILAN_SATIS_DONEMI);
  assert.equal(satisDonemiCoz(undefined).anahtar, "gun");
  assert.equal(satisDonemiCoz(7).anahtar, "gun");
});

test("bütün dönemler çözülüyor", () => {
  for (const d of SATIS_DONEMLERI) {
    assert.equal(satisDonemiCoz(d.anahtar).anahtar, d.anahtar);
  }
});

test("günlük aralık bugünün başından başlar", () => {
  const { baslangic, bitis } = satisDonemAraligi(satisDonemiCoz("gun"), PERSEMBE);
  assert.equal(baslangic.getDate(), 15);
  assert.equal(baslangic.getHours(), 0);
  assert.equal(baslangic.getMinutes(), 0);
  assert.equal(bitis.getDate(), 15);
});

test("haftalık aralık pazartesiden başlar", () => {
  const { baslangic } = satisDonemAraligi(satisDonemiCoz("hafta"), PERSEMBE);
  assert.equal(baslangic.getDate(), 12, "12 Ekim 2026 pazartesi");
  assert.equal(baslangic.getDay(), 1);
  assert.equal(baslangic.getHours(), 0);
});

test("pazar günü hafta yine o pazartesiden başlar", () => {
  // 18 Ekim 2026 pazar; haftanın başı 12 Ekim olmalı, 19 değil.
  const { baslangic } = satisDonemAraligi(satisDonemiCoz("hafta"), new Date(2026, 9, 18, 10));
  assert.equal(baslangic.getDate(), 12);
});

test("pazartesi günü hafta o günden başlar", () => {
  const { baslangic } = satisDonemAraligi(satisDonemiCoz("hafta"), new Date(2026, 9, 12, 10));
  assert.equal(baslangic.getDate(), 12);
});

test("aylık aralık ayın birinden başlar", () => {
  const { baslangic } = satisDonemAraligi(satisDonemiCoz("ay"), PERSEMBE);
  assert.equal(baslangic.getDate(), 1);
  assert.equal(baslangic.getMonth(), 9);
  assert.equal(baslangic.getHours(), 0);
});

test("ay başında haftalık aralık önceki aya taşabilir", () => {
  // 1 Kasım 2026 pazar: haftanın başı 26 Ekim.
  const { baslangic } = satisDonemAraligi(satisDonemiCoz("hafta"), new Date(2026, 10, 1, 12));
  assert.equal(baslangic.getMonth(), 9, "ekim");
  assert.equal(baslangic.getDate(), 26);
});

test("yıl başında aylık aralık doğru", () => {
  const { baslangic } = satisDonemAraligi(satisDonemiCoz("ay"), new Date(2027, 0, 5));
  assert.equal(baslangic.getFullYear(), 2027);
  assert.equal(baslangic.getMonth(), 0);
  assert.equal(baslangic.getDate(), 1);
});

test("başlangıç her zaman bitişten önce ya da eşit", () => {
  for (const d of SATIS_DONEMLERI) {
    const { baslangic, bitis } = satisDonemAraligi(d, PERSEMBE);
    assert.ok(baslangic <= bitis, `${d.anahtar}: başlangıç bitişten sonra`);
  }
});


// ------------------------------------------------- dün ve serbest aralık

test("dün aralığı sadece dünü kapsıyor", () => {
  const { baslangic, bitis } = satisDonemAraligi(cikisDonemiCoz("dun"), PERSEMBE);
  assert.equal(baslangic.getDate(), 14);
  assert.equal(baslangic.getHours(), 0);
  assert.equal(bitis.getDate(), 14);
  assert.equal(tekGunMu({ baslangic, bitis }), true);
});

test("ay başında dün önceki aya geçiyor", () => {
  const { baslangic } = satisDonemAraligi(cikisDonemiCoz("dun"), new Date(2026, 10, 1, 9));
  assert.equal(baslangic.getMonth(), 9, "ekim");
  assert.equal(baslangic.getDate(), 31);
});

test("çıkış listesinde hafta/ay seçeneği yok, dün var", () => {
  assert.deepEqual(
    CIKIS_DONEMLERI.map((d) => d.anahtar),
    ["gun", "dun", "aralik"],
  );
  // Tanınmayan değer (başka listenin anahtarı da olsa) bugüne düşmeli.
  assert.equal(cikisDonemiCoz("hafta").anahtar, "gun");
});

test("satış dökümünde tarih aralığı seçeneği var", () => {
  assert.equal(satisDonemiCoz("aralik").anahtar, "aralik");
});

test("serbest aralık verilen iki günü kapsıyor", () => {
  const { baslangic, bitis } = satisDonemAraligi(satisDonemiCoz("aralik"), PERSEMBE, {
    bas: new Date(2026, 9, 1, 13),
    bit: new Date(2026, 9, 5, 21),
  });
  assert.equal(baslangic.getDate(), 1);
  assert.equal(baslangic.getHours(), 0);
  assert.equal(bitis.getDate(), 5);
  assert.equal(bitis.getHours(), 0, "bitiş gün bazlı; gün sonunu sorgu tamamlıyor");
});

test("ters girilen aralık düzeltiliyor", () => {
  // Kullanıcı kutuları karıştırdığında "kayıt yok" demek yardımcı olmaz.
  const { baslangic, bitis } = satisDonemAraligi(satisDonemiCoz("aralik"), PERSEMBE, {
    bas: new Date(2026, 9, 20),
    bit: new Date(2026, 9, 10),
  });
  assert.equal(baslangic.getDate(), 10);
  assert.equal(bitis.getDate(), 20);
});

test("tek uçlu aralık o güne iniyor", () => {
  const sadeceBas = satisDonemAraligi(satisDonemiCoz("aralik"), PERSEMBE, {
    bas: new Date(2026, 9, 3),
    bit: null,
  });
  assert.equal(tekGunMu(sadeceBas), true);
  assert.equal(sadeceBas.baslangic.getDate(), 3);

  const sadeceBit = satisDonemAraligi(satisDonemiCoz("aralik"), PERSEMBE, {
    bas: null,
    bit: new Date(2026, 9, 8),
  });
  assert.equal(sadeceBit.baslangic.getDate(), 8);
});

test("boş aralık bugüne düşüyor", () => {
  const { baslangic, bitis } = satisDonemAraligi(satisDonemiCoz("aralik"), PERSEMBE);
  assert.equal(baslangic.getDate(), 15);
  assert.equal(tekGunMu({ baslangic, bitis }), true);
});

// ------------------------------------------------------------- başlıklar

test("hazır dönemlerin başlığı sabit", () => {
  const aralik = satisDonemAraligi(satisDonemiCoz("hafta"), PERSEMBE);
  assert.equal(donemBasligi(satisDonemiCoz("hafta"), aralik), "bu hafta");
  assert.equal(
    donemBasligi(cikisDonemiCoz("dun"), satisDonemAraligi(cikisDonemiCoz("dun"), PERSEMBE)),
    "dün",
  );
});

test("serbest aralığın başlığı tarihleri yazıyor", () => {
  const donem = satisDonemiCoz("aralik");
  const cok = satisDonemAraligi(donem, PERSEMBE, {
    bas: new Date(2026, 9, 1),
    bit: new Date(2026, 9, 5),
  });
  assert.equal(donemBasligi(donem, cok), "01.10.2026 – 05.10.2026");

  const tek = satisDonemAraligi(donem, PERSEMBE, {
    bas: new Date(2026, 9, 7),
    bit: new Date(2026, 9, 7),
  });
  assert.equal(donemBasligi(donem, tek), "07.10.2026");
});

// ----------------------------------------------------------------- toplam

test("boş dökümün toplamı sıfır", () => {
  assert.deepEqual(satisToplami([]), { adet: 0, satisKurus: 0, karKurus: 0 });
});

test("döküm satırları toplanıyor", () => {
  const toplam = satisToplami([
    { adet: 2, satisKurus: 1300000, karKurus: 300000 },
    { adet: 1, satisKurus: 50000, karKurus: -10000 },
  ]);
  assert.deepEqual(toplam, { adet: 3, satisKurus: 1350000, karKurus: 290000 });
});

test("zarar toplamı negatif kalabilir", () => {
  const toplam = satisToplami([{ adet: 1, satisKurus: 100, karKurus: -5000 }]);
  assert.equal(toplam.karKurus, -5000);
});
