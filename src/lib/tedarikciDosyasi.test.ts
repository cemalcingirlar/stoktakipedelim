import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { tarihiCoz, tedarikciDosyasiniOku, tutariCoz } from "./tedarikciDosyasi";

const BASLIKLAR = [
  "Seri No",
  "Ürün Kodu",
  "Ürün Adı",
  "Marka",
  "Adet",
  "E-Fatura No",
  "Fatura No",
  "Tarih",
  "Birim Tutar",
  "Kur",
];

/** Tedarikçi portalının çıktısını taklit eden bir çalışma kitabı üretir. */
async function dosyaUret(
  satirlar: (string | number)[][],
  basliklar: string[] = BASLIKLAR,
  ustBilgiler: string[][] = [],
): Promise<ArrayBuffer> {
  const kitap = new ExcelJS.Workbook();
  const sayfa = kitap.addWorksheet("Seri No Kontrolü");
  for (const u of ustBilgiler) sayfa.addRow(u);
  sayfa.addRow(basliklar);
  for (const s of satirlar) sayfa.addRow(s);
  const tampon = await kitap.xlsx.writeBuffer();
  return tampon as ArrayBuffer;
}

/** Ekran görüntüsündeki üç satır, birebir. */
const EKRAN_SATIRLARI = [
  ["78876/66SN01288", "6939093008003", "XIAOMI REDMI PAD 2 9.7 COVER SLVR 4/128", "XIAOMI", 1, "", "0093523875", "06.10.2026", "8.604,17 TRY", "1.00"],
  ["78876/66SN01299", "6939093008003", "XIAOMI REDMI PAD 2 9.7 COVER SLVR 4/128", "XIAOMI", 1, "", "0093523875", "06.10.2026", "8.604,17 TRY", "1.00"],
  ["78876/66SN00328", "6939093008003", "XIAOMI REDMI PAD 2 9.7 COVER SLVR 4/128", "XIAOMI", 1, "", "0093523875", "06.10.2026", "8.604,17 TRY", "1.00"],
];

test("tutariCoz para birimi ekli hücreyi çözer", () => {
  assert.equal(tutariCoz("8.604,17 TRY"), 860417);
  assert.equal(tutariCoz("8.604,17"), 860417);
  assert.equal(tutariCoz("1.234,50 USD"), 123450);
  assert.equal(tutariCoz("9.750"), 975000);
  assert.equal(tutariCoz(""), null);
  assert.equal(tutariCoz("TRY"), null);
});

test("tarihiCoz gg.aa.yyyy ve ISO biçimlerini çözer", () => {
  const a = tarihiCoz("06.10.2026");
  assert.equal(a?.getFullYear(), 2026);
  assert.equal(a?.getMonth(), 9);
  assert.equal(a?.getDate(), 6);

  const b = tarihiCoz("2026-10-06");
  assert.equal(b?.getDate(), 6);
  assert.equal(b?.getMonth(), 9);

  assert.equal(tarihiCoz(""), null);
  assert.equal(tarihiCoz("abc"), null);
});

test("ekran görüntüsündeki dosya tek fatura ve tek ürün grubu olarak okunur", async () => {
  const sonuc = await tedarikciDosyasiniOku(await dosyaUret(EKRAN_SATIRLARI));

  assert.equal(sonuc.basliklarTamam, true);
  assert.deepEqual(sonuc.hatalar, []);
  assert.equal(sonuc.faturalar.length, 1);

  const fatura = sonuc.faturalar[0];
  assert.equal(fatura.faturaNo, "0093523875");
  assert.equal(fatura.tarih?.getDate(), 6);
  assert.equal(fatura.tarih?.getMonth(), 9);
  assert.equal(fatura.cihazSayisi, 3);
  assert.equal(fatura.toplamKurus, 860417 * 3);

  assert.equal(fatura.gruplar.length, 1, "aynı ürün kodu tek grupta birleşmeli");
  const grup = fatura.gruplar[0];
  assert.equal(grup.barkod, "6939093008003");
  assert.equal(grup.marka, "XIAOMI");
  assert.equal(grup.urunAdi, "XIAOMI REDMI PAD 2 9.7 COVER SLVR 4/128");
  assert.equal(grup.alisFiyatiKurus, 860417);
  assert.equal(grup.fiyatFarkliMi, false);
  assert.equal(grup.cihazlar.length, 3);
  assert.deepEqual(
    grup.cihazlar.map((c) => c.seriNo),
    ["78876/66SN01288", "78876/66SN01299", "78876/66SN00328"],
  );
});

test("farklı ürün kodları ayrı gruplara, farklı fatura numaraları ayrı faturalara düşer", async () => {
  const sonuc = await tedarikciDosyasiniOku(
    await dosyaUret([
      ...EKRAN_SATIRLARI,
      ["IMEI001", "1111111111111", "SAMSUNG GALAXY A55", "SAMSUNG", 1, "", "0093523875", "06.10.2026", "12.500,00 TRY", "1.00"],
      ["IMEI002", "2222222222222", "APPLE IPHONE 15", "APPLE", 1, "", "0093523999", "07.10.2026", "45.000,00 TRY", "1.00"],
    ]),
  );

  assert.deepEqual(sonuc.hatalar, []);
  assert.equal(sonuc.faturalar.length, 2);

  const ilk = sonuc.faturalar.find((f) => f.faturaNo === "0093523875")!;
  assert.equal(ilk.gruplar.length, 2);
  assert.equal(ilk.cihazSayisi, 4);

  const ikinci = sonuc.faturalar.find((f) => f.faturaNo === "0093523999")!;
  assert.equal(ikinci.cihazSayisi, 1);
  assert.equal(ikinci.tarih?.getDate(), 7);
});

test("seri numarası olmayan satır adet kadar cihaz açar", async () => {
  const sonuc = await tedarikciDosyasiniOku(
    await dosyaUret([
      ["", "3333333333333", "XIAOMI KILIF", "XIAOMI", 25, "", "0093524000", "06.10.2026", "120,00 TRY", "1.00"],
    ]),
  );

  assert.deepEqual(sonuc.hatalar, []);
  const grup = sonuc.faturalar[0].gruplar[0];
  assert.equal(grup.cihazlar.length, 25);
  assert.ok(grup.cihazlar.every((c) => c.seriNo === null));
  assert.equal(sonuc.faturalar[0].toplamKurus, 12000 * 25);
});

test("aynı seri numarası iki satırda ise ikincisi hata olarak bildirilir", async () => {
  const sonuc = await tedarikciDosyasiniOku(
    await dosyaUret([EKRAN_SATIRLARI[0], EKRAN_SATIRLARI[0]]),
  );

  assert.equal(sonuc.faturalar[0].cihazSayisi, 1, "tekrar eden satır alınmamalı");
  assert.equal(sonuc.hatalar.length, 1);
  assert.match(sonuc.hatalar[0], /78876\/66SN01288/);
  assert.match(sonuc.hatalar[0], /2\. satırda da var/);
});

test("döviz satırı kur ile TL'ye çevrilir", async () => {
  const sonuc = await tedarikciDosyasiniOku(
    await dosyaUret([
      ["IMEI900", "4444444444444", "APPLE IPHONE 16", "APPLE", 1, "", "0093524100", "06.10.2026", "1.000,00 USD", "41,50"],
    ]),
  );

  assert.deepEqual(sonuc.hatalar, []);
  // 1.000,00 USD = 100000 kuruş; kur 41,50 -> 4.150.000 kuruş = 41.500,00 TL
  assert.equal(sonuc.faturalar[0].gruplar[0].alisFiyatiKurus, 4_150_000);
});

test("grup içinde farklı birim tutar varsa işaretlenir", async () => {
  const sonuc = await tedarikciDosyasiniOku(
    await dosyaUret([
      ["IMEI010", "5555555555555", "SAMSUNG A55", "SAMSUNG", 1, "", "0093524200", "06.10.2026", "12.000,00 TRY", "1.00"],
      ["IMEI011", "5555555555555", "SAMSUNG A55", "SAMSUNG", 1, "", "0093524200", "06.10.2026", "12.000,00 TRY", "1.00"],
      ["IMEI012", "5555555555555", "SAMSUNG A55", "SAMSUNG", 1, "", "0093524200", "06.10.2026", "13.500,00 TRY", "1.00"],
    ]),
  );

  const grup = sonuc.faturalar[0].gruplar[0];
  assert.equal(grup.fiyatFarkliMi, true);
  assert.equal(grup.alisFiyatiKurus, 1_200_000, "en sık görülen tutar alınmalı");
});

test("sütun sırası değişse de başlık adına göre okunur", async () => {
  const sonuc = await tedarikciDosyasiniOku(
    await dosyaUret(
      [["0093523875", "06.10.2026", "6939093008003", "IMEI777", "8.604,17 TRY", "XIAOMI", "PAD 2", 1, "1.00"]],
      ["Fatura No", "Tarih", "Ürün Kodu", "Seri No", "Birim Tutar", "Marka", "Ürün Adı", "Adet", "Kur"],
    ),
  );

  assert.deepEqual(sonuc.hatalar, []);
  const grup = sonuc.faturalar[0].gruplar[0];
  assert.equal(grup.barkod, "6939093008003");
  assert.equal(grup.cihazlar[0].seriNo, "IMEI777");
  assert.equal(grup.alisFiyatiKurus, 860417);
});

test("başlık satırı üstte açıklama satırları olsa da bulunur", async () => {
  const sonuc = await tedarikciDosyasiniOku(
    await dosyaUret(EKRAN_SATIRLARI, BASLIKLAR, [
      ["Seri No Kontrolü"],
      ["Rapor tarihi: 06.10.2026"],
      [],
    ]),
  );

  assert.equal(sonuc.basliklarTamam, true);
  assert.equal(sonuc.faturalar[0].cihazSayisi, 3);
});

test("şablona uymayan dosya açıkça reddedilir", async () => {
  const sonuc = await tedarikciDosyasiniOku(
    await dosyaUret([["bir", "iki"]], ["Alakasiz", "Sutunlar"]),
  );

  assert.equal(sonuc.basliklarTamam, false);
  assert.equal(sonuc.faturalar.length, 0);
  assert.match(sonuc.hatalar[0], /Seri No/);
});
