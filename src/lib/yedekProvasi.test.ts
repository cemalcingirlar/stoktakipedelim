import assert from "node:assert/strict";
import { test } from "node:test";
import { provaSonucu, provaYasi, sayimSorunu } from "./yedekProvasi";

const CANLI = { kullanici: 5, cihaz: 1200, fatura: 80 };

test("yedek canlıdan biraz geride olabilir", () => {
  // Yedekten sonra iş yapılmış olması normal.
  assert.equal(
    sayimSorunu({ kullanici: 5, cihaz: 1180, fatura: 79 }, CANLI),
    null,
  );
});

test("yedekte kullanıcı yoksa sorun", () => {
  assert.match(
    sayimSorunu({ kullanici: 0, cihaz: 10, fatura: 1 }, CANLI)!,
    /kullanıcı yok/,
  );
});

test("yedek canlıdan fazlaysa dosya başka sisteme ait", () => {
  const sorun = sayimSorunu({ kullanici: 5, cihaz: 5000, fatura: 80 }, CANLI);
  assert.match(sorun!, /bu sisteme ait değil/);
});

test("canlıda kayıt varken yedekte sıfırsa kullanılamaz", () => {
  const sorun = sayimSorunu({ kullanici: 5, cihaz: 0, fatura: 80 }, CANLI);
  assert.match(sorun!, /kullanılamaz/);
});

test("boş sistemde boş yedek sorun değil", () => {
  const bos = { kullanici: 1, cihaz: 0, fatura: 0 };
  assert.equal(sayimSorunu(bos, bos), null);
});

test("bütünlük bozuksa prova başarısız", () => {
  const sonuc = provaSonucu({
    butunluk: "*** in database main ***",
    yedek: { kullanici: 5, cihaz: 1100, fatura: 70 },
    canli: CANLI,
    dosyaAdi: "stok-yedek.db.gz",
  });
  assert.equal(sonuc.basarili, false);
  assert.match(sonuc.metin, /bütünlük/i);
});

test("her şey yolundaysa prova başarılı ve sayıları yazıyor", () => {
  const sonuc = provaSonucu({
    butunluk: "ok",
    yedek: { kullanici: 5, cihaz: 1100, fatura: 70 },
    canli: CANLI,
    dosyaAdi: "stok-yedek-20261024.db.gz",
  });
  assert.equal(sonuc.basarili, true);
  assert.match(sonuc.metin, /1\.100 cihaz/);
  assert.match(sonuc.metin, /stok-yedek-20261024/);
});

test("prova yaşı okunur yazılıyor", () => {
  const simdi = new Date("2026-10-24T12:00:00Z");
  assert.match(provaYasi(null, simdi), /Hiç prova/);
  assert.match(
    provaYasi(
      {
        tarihISO: "2026-10-24T08:00:00Z",
        basarili: true,
        metin: "",
        dosyaAdi: "x",
      },
      simdi,
    ),
    /Bugün/,
  );
  assert.match(
    provaYasi(
      {
        tarihISO: "2026-10-14T08:00:00Z",
        basarili: false,
        metin: "",
        dosyaAdi: "x",
      },
      simdi,
    ),
    /10 gün önce.*BAŞARISIZ/,
  );
});
