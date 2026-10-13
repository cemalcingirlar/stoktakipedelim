import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ambariEsle,
  envanterDosyasiMi,
  envanteriOku,
  magazayaGoreToplam,
  markaModelAyir,
  type EnvanterKategorisi,
  type EnvanterMagazasi,
} from "./envanterDosyasi";
import type { Matris } from "./tablo";

const MAGAZALAR: EnvanterMagazasi[] = [
  { id: 1, ad: "KOZAN CAD NAKİT", kod: "K1" },
  { id: 2, ad: "OPTİMUM", kod: "O1" },
  { id: 3, ad: "M1 MERKEZ", kod: "M1" },
];

const KATEGORI: EnvanterKategorisi = { id: 7, ad: "Telefon", seriNoZorunlu: true };
const AKSESUAR: EnvanterKategorisi = { id: 8, ad: "Aksesuar", seriNoZorunlu: false };

const BASLIK = [
  "Malzeme Kodu",
  "Malzeme Açıklaması",
  "Ambar Maliyet Grubu",
  "Ambar No.",
  "Seri/Lot No.",
  "Seri/Lot Açıklaması",
  "Envanter Miktarı",
  "Birim",
  "Ortalama Değer",
  "Envanter Tutarı",
];

/** Rapor çıktısı gibi: üstte iki başlık satırı, sonra sütun adları. */
function dosya(...satirlar: Matris): Matris {
  return [
    ["Seri/Lot Envanter Raporu"],
    ["Tarih: 13.10.2026"],
    BASLIK,
    ...satirlar,
  ];
}

function satir(
  kod: string,
  aciklama: string,
  grup: string,
  ambar: string,
  seri: string,
  seriAciklama = "",
  miktar: string | number = 1,
  ortalama: string | number = 0,
  tutar: string | number = 0,
): (string | number)[] {
  return [kod, aciklama, grup, ambar, seri, seriAciklama, miktar, "AD", ortalama, tutar];
}

// ----------------------------------------------------------- marka/model

test("açıklamanın ilk kelimesi marka, kalanı model olur", () => {
  assert.deepEqual(markaModelAyir("SAMSUNG GALAXY A55 256GB"), {
    marka: "SAMSUNG",
    model: "GALAXY A55 256GB",
  });
});

test("tek kelimelik açıklamada model boş kalmaz", () => {
  assert.deepEqual(markaModelAyir("POWERBANK"), { marka: "POWERBANK", model: "POWERBANK" });
});

test("fazla boşluklar temizlenir", () => {
  assert.deepEqual(markaModelAyir("  APPLE   iPhone 15  "), {
    marka: "APPLE",
    model: "iPhone 15",
  });
});

test("boş açıklamada marka ve model boş döner", () => {
  assert.deepEqual(markaModelAyir("   "), { marka: "", model: "" });
});

// ----------------------------------------------------------- ambar eşleme

test("ambar adı mağaza adıyla birebir eşleşir", () => {
  assert.equal(ambariEsle("KOZAN CAD NAKİT", MAGAZALAR)?.id, 1);
});

test("Türkçe karakter ve büyük/küçük harf farkı eşlemeyi bozmaz", () => {
  assert.equal(ambariEsle("kozan cad nakit", MAGAZALAR)?.id, 1);
  assert.equal(ambariEsle("optimum", MAGAZALAR)?.id, 2);
});

test("mağaza kodu da eşleşir", () => {
  assert.equal(ambariEsle("M1", MAGAZALAR)?.id, 3);
});

test("ambar metni mağaza adını içeriyorsa tek eşleşmede kabul edilir", () => {
  assert.equal(ambariEsle("01 - OPTİMUM AVM", MAGAZALAR)?.id, 2);
});

test("birden fazla mağazaya uyan ambar tahmin edilmez", () => {
  const ikiz: EnvanterMagazasi[] = [
    { id: 1, ad: "NAKİT", kod: "N1" },
    { id: 2, ad: "NAKİT DEPO", kod: "N2" },
  ];
  assert.equal(ambariEsle("NAKİT DEPO 2", ikiz), null);
});

test("boş ambar metni eşleşmez", () => {
  assert.equal(ambariEsle("   ", MAGAZALAR), null);
});

// ----------------------------------------------------------- biçim tanıma

test("envanter raporu biçimi tanınır", () => {
  assert.equal(envanterDosyasiMi(dosya(satir("A", "B", "KOZAN CAD NAKİT", "1", "123"))), true);
});

test("şablon dosyası envanter raporu sayılmaz", () => {
  const sablon: Matris = [["Kategori", "Marka", "Model", "Seri No (IMEI)", "Alış Fiyatı (TL)"]];
  assert.equal(envanterDosyasiMi(sablon), false);
});

// ----------------------------------------------------------- okuma

test("geçerli satır okunur ve mağazaya bağlanır", () => {
  const sonuc = envanteriOku(
    dosya(
      satir(
        "TEL-001",
        "SAMSUNG GALAXY A55",
        "KOZAN CAD NAKİT",
        "1",
        "352000111222333",
        "Siyah",
        1,
        "12.500,00",
        "12.500,00",
      ),
    ),
    { magazalar: MAGAZALAR, kategori: KATEGORI },
  );

  assert.equal(sonuc.basliklarTamam, true);
  assert.deepEqual(sonuc.hatalar, []);
  assert.equal(sonuc.satirlar.length, 1);
  assert.deepEqual(sonuc.satirlar[0], {
    satirNo: 4,
    magazaId: 1,
    magazaAdi: "KOZAN CAD NAKİT",
    ambarMetni: "KOZAN CAD NAKİT",
    marka: "SAMSUNG",
    model: "GALAXY A55",
    seriNo: "352000111222333",
    barkod: "TEL-001",
    alisFiyatiKurus: 1250000,
    not: "Siyah",
  });
});

test("sayı hücresindeki ortalama değer kuruşa doğru çevrilir", () => {
  // Excel'den gelen sayı hücresi: 2097,5 TL -> 209750 kuruş.
  const sonuc = envanteriOku(
    dosya(satir("A", "X Y", "OPTİMUM", "1", "111", "", 1, 2097.5)),
    { magazalar: MAGAZALAR, kategori: KATEGORI },
  );
  assert.equal(sonuc.satirlar[0].alisFiyatiKurus, 209750);
});

test("metin hücresindeki Türkçe tutar doğru okunur", () => {
  const sonuc = envanteriOku(
    dosya(satir("A", "X Y", "OPTİMUM", "1", "111", "", 1, "2.097,50")),
    { magazalar: MAGAZALAR, kategori: KATEGORI },
  );
  assert.equal(sonuc.satirlar[0].alisFiyatiKurus, 209750);
});

test("ortalama değer yoksa envanter tutarına düşülür", () => {
  const sonuc = envanteriOku(
    dosya(satir("A", "X Y", "OPTİMUM", "1", "111", "", 1, "", "1.000,00")),
    { magazalar: MAGAZALAR, kategori: KATEGORI },
  );
  assert.equal(sonuc.satirlar[0].alisFiyatiKurus, 100000);
});

test("eşleşmeyen ambar satır hatası ve ambar listesi üretir", () => {
  const sonuc = envanteriOku(
    dosya(satir("A", "X Y", "BİLİNMEYEN ŞUBE", "9", "111")),
    { magazalar: MAGAZALAR, kategori: KATEGORI },
  );
  assert.equal(sonuc.satirlar.length, 0);
  assert.equal(sonuc.hatalar.length, 1);
  assert.match(sonuc.hatalar[0].mesaj, /anlaşılamadı/);
  assert.deepEqual(sonuc.eslesmeyenAmbarlar, ["BİLİNMEYEN ŞUBE / 9"]);
});

test("mağaza adı ambar no sütunundaysa da bulunur", () => {
  const sonuc = envanteriOku(
    dosya(satir("A", "X Y", "MERKEZ GRUP", "M1 MERKEZ", "111")),
    { magazalar: MAGAZALAR, kategori: KATEGORI },
  );
  assert.deepEqual(sonuc.hatalar, []);
  assert.equal(sonuc.satirlar[0].magazaId, 3);
  assert.equal(sonuc.satirlar[0].ambarMetni, "M1 MERKEZ");
});

test("seri no zorunlu kategoride boş seri hata verir", () => {
  const sonuc = envanteriOku(dosya(satir("A", "X Y", "OPTİMUM", "1", "")), {
    magazalar: MAGAZALAR,
    kategori: KATEGORI,
  });
  assert.equal(sonuc.satirlar.length, 0);
  assert.match(sonuc.hatalar[0].mesaj, /seri no \(IMEI\) zorunlu/);
});

test("seri no zorunlu olmayan kategoride boş seri kabul edilir", () => {
  const sonuc = envanteriOku(dosya(satir("A", "KILIF SİLİKON", "OPTİMUM", "1", "")), {
    magazalar: MAGAZALAR,
    kategori: AKSESUAR,
  });
  assert.deepEqual(sonuc.hatalar, []);
  assert.equal(sonuc.satirlar[0].seriNo, null);
});

test("dosya içinde tekrarlayan seri no yakalanır", () => {
  const sonuc = envanteriOku(
    dosya(
      satir("A", "X Y", "OPTİMUM", "1", "111"),
      satir("A", "X Y", "OPTİMUM", "1", "111"),
    ),
    { magazalar: MAGAZALAR, kategori: KATEGORI },
  );
  assert.equal(sonuc.satirlar.length, 1);
  assert.equal(sonuc.hatalar.length, 1);
  assert.match(sonuc.hatalar[0].mesaj, /4\. satırda da var/);
});

test("sistemde kayıtlı seri no önizlemede hata olur", () => {
  const sonuc = envanteriOku(dosya(satir("A", "X Y", "OPTİMUM", "1", "111")), {
    magazalar: MAGAZALAR,
    kategori: KATEGORI,
    kayitliSeriNolar: new Set(["111"]),
  });
  assert.equal(sonuc.satirlar.length, 0);
  assert.match(sonuc.hatalar[0].mesaj, /zaten kayıtlı/);
});

test("miktarı 1'den büyük satır alınmaz", () => {
  const sonuc = envanteriOku(
    dosya(satir("A", "X Y", "OPTİMUM", "1", "111", "", 3)),
    { magazalar: MAGAZALAR, kategori: KATEGORI },
  );
  assert.equal(sonuc.satirlar.length, 0);
  assert.match(sonuc.hatalar[0].mesaj, /tek cihaz tutuyor/);
});

test("miktarı sıfır satır alınmaz", () => {
  const sonuc = envanteriOku(
    dosya(satir("A", "X Y", "OPTİMUM", "1", "111", "", 0)),
    { magazalar: MAGAZALAR, kategori: KATEGORI },
  );
  assert.equal(sonuc.satirlar.length, 0);
  assert.match(sonuc.hatalar[0].mesaj, /sıfır veya negatif/);
});

test("ondalıklı yazılmış 1,00 miktarı geçerlidir", () => {
  const sonuc = envanteriOku(
    dosya(satir("A", "X Y", "OPTİMUM", "1", "111", "", "1,00")),
    { magazalar: MAGAZALAR, kategori: KATEGORI },
  );
  assert.deepEqual(sonuc.hatalar, []);
  assert.equal(sonuc.satirlar.length, 1);
});

test("boş ve ara toplam satırları atlanır", () => {
  const sonuc = envanteriOku(
    [
      ...dosya(satir("A", "X Y", "OPTİMUM", "1", "111")),
      ["", "", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", 1, "", "", "12.500,00"],
    ],
    { magazalar: MAGAZALAR, kategori: KATEGORI },
  );
  assert.deepEqual(sonuc.hatalar, []);
  assert.equal(sonuc.satirlar.length, 1);
  assert.equal(sonuc.okunanSatir, 1);
});

test("başlık satırı yoksa yönlendirici hata döner", () => {
  const sonuc = envanteriOku([["Kategori", "Marka", "Model"]], {
    magazalar: MAGAZALAR,
    kategori: KATEGORI,
  });
  assert.equal(sonuc.basliklarTamam, false);
  assert.match(sonuc.hatalar[0].mesaj, /envanter raporu biçiminde değil/);
});

test("boş dosyada satır bulunamadı denir", () => {
  const sonuc = envanteriOku([], { magazalar: MAGAZALAR, kategori: KATEGORI });
  assert.equal(sonuc.basliklarTamam, false);
  assert.match(sonuc.hatalar[0].mesaj, /satır bulunamadı/);
});

test("yalnız başlık olan dosyada cihaz satırı bulunamadı denir", () => {
  const sonuc = envanteriOku(dosya(), { magazalar: MAGAZALAR, kategori: KATEGORI });
  assert.equal(sonuc.basliklarTamam, true);
  assert.match(sonuc.hatalar[0].mesaj, /cihaz satırı bulunamadı/);
});

test("mağaza özeti adet ve tutarı toplar", () => {
  const sonuc = envanteriOku(
    dosya(
      satir("A", "X Y", "OPTİMUM", "1", "111", "", 1, "100,00"),
      satir("A", "X Y", "OPTİMUM", "1", "222", "", 1, "50,00"),
      satir("A", "X Y", "KOZAN CAD NAKİT", "1", "333", "", 1, "25,00"),
    ),
    { magazalar: MAGAZALAR, kategori: KATEGORI },
  );
  const ozet = magazayaGoreToplam(sonuc.satirlar);
  assert.equal(ozet.length, 2);
  assert.deepEqual(
    ozet.map((o) => [o.magazaAdi, o.adet, o.tutarKurus]),
    [
      ["KOZAN CAD NAKİT", 1, 2500],
      ["OPTİMUM", 2, 15000],
    ],
  );
});
