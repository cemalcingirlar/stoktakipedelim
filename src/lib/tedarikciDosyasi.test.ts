import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { markayiTuret, tarihiCoz, tedarikciDosyasiniOku, tutariCoz } from "./tedarikciDosyasi";

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

/** Gerçek portal çıktısının başlıkları: Marka sütunu yok, Döviz Tipi ayrı. */
const GERCEK_BASLIKLAR = [
  "Seri No",
  "Ürün Kodu",
  "Ürün Adı",
  "Adet",
  "E-Fatura No",
  "Fatura No",
  "Tarih",
  "Birim Tutar",
  "Döviz Tipi",
  "Kur",
];

/** Gerçek dosyadan alınmış üç satır: tutarlar düz sayı, marka sütunu yok. */
const GERCEK_SATIRLAR = [
  ["5MKUN26307G00762", "53014KCK", "Huawei MatePad 11.5(W09C) 8/128 Gray", 1, "DG12026000051622", "0093519331", "02.10.2026", 11250, "TRY", 1],
  ["5QCUN25C12G15347", "53014KBE", "Huawei MatePad 11.5(W09FK) 8/256 GRY+KB", 1, "DG12026000051622", "0093519331", "02.10.2026", 13750, "TRY", 1],
  ["2TEEX25B18005774", "55037214", "Huawei M Pen Lite (AF63-R)", 1, "DG12026000051622", "0093519331", "02.10.2026", 0.08, "TRY", 1],
];

test("markayiTuret ürün adının ilk kelimesini alır", () => {
  assert.equal(markayiTuret("Huawei MatePad 11.5(W09C) 8/128 Gray"), "Huawei");
  assert.equal(markayiTuret("XIAOMI REDMI PAD 2"), "XIAOMI");
  assert.equal(markayiTuret("  Apple iPhone 15  "), "Apple");
  assert.equal(markayiTuret(""), "");
});

test("gerçek portal dosyası: e-fatura no fatura, fatura no sipariş olarak okunur", async () => {
  const sonuc = await tedarikciDosyasiniOku(
    await dosyaUret(GERCEK_SATIRLAR, GERCEK_BASLIKLAR),
  );

  assert.equal(sonuc.basliklarTamam, true);
  assert.deepEqual(sonuc.hatalar, []);
  assert.equal(sonuc.faturalar.length, 1, "tek e-fatura numarası tek fatura olmalı");

  const fatura = sonuc.faturalar[0];
  assert.equal(fatura.faturaNo, "DG12026000051622", "fatura no e-fatura sütunundan gelmeli");
  assert.equal(fatura.siparisNo, "0093519331", "sipariş no Fatura No sütunundan gelmeli");
  assert.equal(fatura.tarih?.getDate(), 2);
  assert.equal(fatura.tarih?.getMonth(), 9);
  assert.equal(fatura.cihazSayisi, 3);
  assert.equal(fatura.gruplar.length, 3, "üç ayrı ürün kodu üç grup");

  // Marka sütunu olmadığı için ürün adından türetilir.
  assert.ok(fatura.gruplar.every((g) => g.marka === "Huawei"));

  const kalem = fatura.gruplar.find((g) => g.barkod === "55037214")!;
  assert.equal(kalem.alisFiyatiKurus, 8, "0.08 TL = 8 kuruş");

  const tablet = fatura.gruplar.find((g) => g.barkod === "53014KCK")!;
  assert.equal(tablet.alisFiyatiKurus, 1_125_000, "11250 sayısı 11.250,00 TL olmalı");

  assert.equal(fatura.toplamKurus, 1_125_000 + 1_375_000 + 8);
});

test("sayısal hücreler binlik ayıracı sanılmaz", async () => {
  // Metin olarak "9.750" binlik ayıracı sayılır; sayı olarak 9750 ise 9.750,00 TL.
  const sonuc = await tedarikciDosyasiniOku(
    await dosyaUret(
      [["SN1", "KOD1", "Huawei Test", 1, "EF1", "SIP1", "02.10.2026", 9750, "TRY", 1]],
      GERCEK_BASLIKLAR,
    ),
  );
  assert.equal(sonuc.faturalar[0].gruplar[0].alisFiyatiKurus, 975_000);
});

test("e-fatura no boşsa sipariş numarasına düşülür", async () => {
  const sonuc = await tedarikciDosyasiniOku(
    await dosyaUret(
      [["SN2", "KOD2", "Huawei Test", 1, "", "0093519331", "02.10.2026", 100, "TRY", 1]],
      GERCEK_BASLIKLAR,
    ),
  );
  assert.deepEqual(sonuc.hatalar, []);
  assert.equal(sonuc.faturalar[0].faturaNo, "0093519331");
  assert.equal(sonuc.faturalar[0].siparisNo, "0093519331");
});

test("TL dışı para birimi olan satır alınmaz ve açıkça bildirilir", async () => {
  // Program yalnız TL fatura işler. Döviz satırı sessizce yanlış fiyatla
  // kaydedilmesin diye reddedilir.
  const sonuc = await tedarikciDosyasiniOku(
    await dosyaUret(
      [
        ["SN3", "KOD3", "Apple iPhone 16", 1, "EF9", "SIP9", "02.10.2026", 1000, "USD", 41.5],
        ["SN4", "KOD4", "Huawei Test", 1, "EF9", "SIP9", "02.10.2026", 500, "TRY", 1],
      ],
      GERCEK_BASLIKLAR,
    ),
  );

  assert.equal(sonuc.hatalar.length, 1);
  assert.match(sonuc.hatalar[0], /USD/);
  assert.match(sonuc.hatalar[0], /yalnız TL/);
  // TL satırı alınmış olmalı.
  assert.equal(sonuc.faturalar[0].cihazSayisi, 1);
  assert.equal(sonuc.faturalar[0].gruplar[0].alisFiyatiKurus, 50_000);
});

test("TL kodu yazımı ne olursa olsun kabul edilir", async () => {
  for (const kod of ["TRY", "TL", "TRL", ""]) {
    const sonuc = await tedarikciDosyasiniOku(
      await dosyaUret(
        [["SN5", "KOD5", "Huawei Test", 1, "EF1", "SIP1", "02.10.2026", 100, kod, 1]],
        GERCEK_BASLIKLAR,
      ),
    );
    assert.deepEqual(sonuc.hatalar, [], `"${kod}" reddedilmemeli`);
    assert.equal(sonuc.faturalar[0].gruplar[0].alisFiyatiKurus, 10_000);
  }
});

test("tutariCoz para birimi ekli hücreyi çözer", () => {
  assert.equal(tutariCoz(11250), 1_125_000, "sayısal hücre doğrudan çarpılır");
  assert.equal(tutariCoz(0.08), 8);
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
  // Bu düzende E-Fatura No sütunu boş; fatura no sipariş numarasına düşer.
  assert.equal(fatura.faturaNo, "0093523875");
  assert.equal(fatura.siparisNo, "0093523875");
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

test("tutar hücresindeki para birimi kodu da denetlenir", async () => {
  // Ekran görüntüsü düzeninde para birimi tutarın içinde yazıyor. Döviz
  // sütunu olmadığı için satır alınır ama tutarın kodu TL değilse kaydın
  // yanlış olacağını kullanıcı önizlemede görür: tutar olduğu gibi okunur,
  // kur çevrimi yapılmaz.
  const sonuc = await tedarikciDosyasiniOku(
    await dosyaUret([
      ["IMEI900", "4444444444444", "APPLE IPHONE 16", "APPLE", 1, "", "0093524100", "06.10.2026", "1.000,00 TRY", "1.00"],
    ]),
  );

  assert.deepEqual(sonuc.hatalar, []);
  assert.equal(sonuc.faturalar[0].gruplar[0].alisFiyatiKurus, 100_000);
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
