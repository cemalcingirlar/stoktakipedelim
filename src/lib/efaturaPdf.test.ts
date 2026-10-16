import assert from "node:assert/strict";
import { test } from "node:test";
import {
  efaturaCoz,
  efaturaMi,
  efaturaTarihiCoz,
  efaturadanTedarikciFaturasi,
  kodTeyitEdildi,
  seriNolariTopla,
  seriParcasiMi,
  seriSatiriMi,
} from "./efaturaPdf";

/**
 * Gerçek fatura dosyası depoya konmuyor (müşteri ve fiyat bilgisi taşıyor).
 * Buradaki örnek, pdfjs'in gerçek e-Faturadan çıkardığı parça akışının birebir
 * aynı düzeninde ama uydurma verilerle: parçalar satır satır, tutarlar bazen
 * "1.000,00 TL" tek parça bazen "1.000,00" + "TL" ayrı parçalar halinde.
 */
function ornekMetin(
  ayarlar: { kalemler?: string[]; notlar?: string[]; araToplam?: string } = {},
): string {
  const kalemler = ayarlar.kalemler ?? [
    // Kısa ürün adı: tutarlar "TL" ile bitişik tek parça gelir.
    ["1", "4000000000011", "4000000000011", "4000000000011", "ALFA FON 10 4/128GB SIYAH", "2,00", "1.000,00 TL", "%20", "200,00 TL", "2.000,00 TL"].join("\n"),
    // Uzun ürün adı: açıklama iki parçaya bölünür, tutar ve TL ayrılır.
    ["2", "4000000000028", "4000000000028", "4000000000028", "BETA FON 70 PRO 5G 8/128GB", "MAVI", "3,00", "2.000,00", "TL", "%20", "1.200,00", "TL", "6.000,00 TL"].join("\n"),
  ];
  const notlar = ayarlar.notlar ?? [
    'Not:\n1 Numaralı satırdaki; "4000000000011/1000001" kodlu ürün için seriler: 350000000000011; 350000000000029',
    '2 Numaralı satırdaki; "4000000000028/1000002" kodlu ürün için seriler: 350000000000037; 350000000000045;',
    "350000000000052",
  ];

  return [
    "Vergi No:1111111111",
    "SAYIN",
    "ÖRNEK ALICI LTD. ŞTİ.",
    "E-Posta: ornek@example.com",
    "",
    "ÖRNEK TEDARİKÇİ BİLGİSAYAR",
    "MALZEMELERİ TİCARET",
    "ANONİM ŞİRKETİ",
    "",
    "Ayazağa Mah.",
    "No: 21",
    "Tel: 02120000000",
    "Faks: 02120000001",
    "Vergi Dairesi: Büyük Mükellefler",
    "Mersis No: 0000000000000011",
    "Vergi No : 2222222222",
    "",
    "Fatura No:",
    " ",
    "DG02026000099999",
    "",
    "Fatura Tarihi:",
    " ",
    "12 - 10 - 2026",
    "",
    "Sipariş No:",
    " ",
    "0001234567",
    "",
    "Ara Toplam",
    " ",
    ayarlar.araToplam ?? "8.000,00",
    " ",
    "TL",
    "",
    "Genel Toplam",
    " ",
    "9.600,00",
    " ",
    "TL",
    "",
    ...notlar,
    "Ödeme Şekli:",
    " ",
    "Ödeme Günü Havale",
    "",
    "Vade Tarihi:",
    " ",
    "26 - 11 - 2026",
    "",
    "Sıra",
    "No",
    "EAN Kodu",
    "Satıcı Ürün",
    "Kodu",
    "Alıcı Ürün",
    "Kodu",
    "Açıklama",
    "Adet",
    "Birim Fiyat",
    "KDV",
    "KDV Tutarı",
    "Tutar",
    "",
    ...kalemler,
  ].join("\n");
}

// ----------------------------------------------------------------- tarih

test("e-fatura tarih biçimi çözülür", () => {
  const t = efaturaTarihiCoz("12 - 10 - 2026");
  assert.equal(t?.getFullYear(), 2026);
  assert.equal(t?.getMonth(), 9);
  assert.equal(t?.getDate(), 12);
});

test("nokta ve eğik çizgili tarihler de çözülür", () => {
  assert.equal(efaturaTarihiCoz("12.10.2026")?.getDate(), 12);
  assert.equal(efaturaTarihiCoz("12/10/2026")?.getDate(), 12);
});

test("geçersiz tarih null döner", () => {
  assert.equal(efaturaTarihiCoz(""), null);
  assert.equal(efaturaTarihiCoz("yok"), null);
  assert.equal(efaturaTarihiCoz("31 - 02 - 2026"), null, "taşan gün kaymamalı");
});

// ----------------------------------------------------------------- seri no

test("not bölümünden seri numaraları sıraya göre toplanır", () => {
  const harita = seriNolariTopla(ornekMetin());
  assert.deepEqual(harita.get(1)?.seriler, ["350000000000011", "350000000000029"]);
  assert.equal(harita.get(1)?.kod, "4000000000011/1000001");
});

test("sonraki satıra taşan seri listesi de okunur", () => {
  const harita = seriNolariTopla(ornekMetin());
  assert.deepEqual(harita.get(2)?.seriler, [
    "350000000000037",
    "350000000000045",
    "350000000000052",
  ]);
});

// ----------------------------------------------------------------- tanıma

test("e-fatura düzeni tanınır", () => {
  assert.equal(efaturaMi(ornekMetin()), true);
});

test("başka bir PDF tanınmaz", () => {
  assert.equal(efaturaMi("Kira sözleşmesi\nTaraflar\nMadde 1"), false);
});

test("tanınmayan metin yol gösteren hata verir", () => {
  const sonuc = efaturaCoz("Kira sözleşmesi\nMadde 1");
  assert.equal(sonuc.tanindi, false);
  assert.match(sonuc.hatalar[0], /e-Fatura düzeninde görünmüyor/);
});

// ----------------------------------------------------------------- başlık

test("fatura başlık alanları okunur", () => {
  const s = efaturaCoz(ornekMetin());
  assert.equal(s.faturaNo, "DG02026000099999");
  assert.equal(s.siparisNo, "0001234567");
  assert.equal(s.faturaTarihi?.getDate(), 12);
  assert.equal(s.vadeTarihi?.getDate(), 26);
  assert.equal(s.vadeTarihi?.getMonth(), 10);
});

test("satıcı unvanı ve vergi no okunur, alıcınınki karışmaz", () => {
  const s = efaturaCoz(ornekMetin());
  assert.equal(s.tedarikciAdi, "ÖRNEK TEDARİKÇİ BİLGİSAYAR MALZEMELERİ TİCARET ANONİM ŞİRKETİ");
  assert.equal(s.tedarikciVergiNo, "2222222222", "alıcının vergi no'su alınmamalı");
});

test("ara ve genel toplam okunur", () => {
  const s = efaturaCoz(ornekMetin());
  assert.equal(s.araToplamKurus, 800000);
  assert.equal(s.genelToplamKurus, 960000);
});

// ----------------------------------------------------------------- kalemler

test("kalemler ve seri numaraları doğru eşleşir", () => {
  const s = efaturaCoz(ornekMetin());
  assert.deepEqual(s.hatalar, []);
  assert.equal(s.kalemler.length, 2);

  const [bir, iki] = s.kalemler;
  assert.equal(bir.barkod, "4000000000011");
  assert.equal(bir.urunAdi, "ALFA FON 10 4/128GB SIYAH");
  assert.equal(bir.adet, 2);
  assert.equal(bir.birimFiyatKurus, 100000);
  assert.equal(bir.kdvOrani, 20);
  assert.equal(bir.tutarKurus, 200000);
  assert.deepEqual(bir.seriNolar, ["350000000000011", "350000000000029"]);

  assert.equal(iki.urunAdi, "BETA FON 70 PRO 5G 8/128GB MAVI", "bölünmüş açıklama birleşmeli");
  assert.equal(iki.adet, 3);
  assert.equal(iki.birimFiyatKurus, 200000);
  assert.equal(iki.seriNolar.length, 3);
});

test("KDV hariç birim fiyat alınır, KDV tutarı fiyat sanılmaz", () => {
  const s = efaturaCoz(ornekMetin());
  // 1. kalem: birim 1.000,00 / KDV 200,00 / tutar 2.000,00
  assert.equal(s.kalemler[0].birimFiyatKurus, 100000);
  assert.notEqual(s.kalemler[0].birimFiyatKurus, 20000);
});

// ----------------------------------------------------------------- denetim

test("seri sayısı adede uymazsa hata verir", () => {
  const metin = ornekMetin({
    notlar: [
      'Not:\n1 Numaralı satırdaki; "4000000000011/1000001" kodlu ürün için seriler: 350000000000011',
      '2 Numaralı satırdaki; "4000000000028/1000002" kodlu ürün için seriler: 350000000000037; 350000000000045; 350000000000052',
    ],
  });
  const s = efaturaCoz(metin);
  assert.ok(
    s.hatalar.some((h) => /adet 2 ama 1 seri numarası/.test(h)),
    s.hatalar.join(" | "),
  );
});

test("birim fiyat × adet tutarı vermiyorsa hata verir", () => {
  const metin = ornekMetin({
    kalemler: [
      ["1", "4000000000011", "4000000000011", "4000000000011", "ALFA FON", "2,00", "1.000,00 TL", "%20", "200,00 TL", "9.999,00 TL"].join("\n"),
    ],
    notlar: [
      'Not:\n1 Numaralı satırdaki; "4000000000011/1000001" kodlu ürün için seriler: 350000000000011; 350000000000029',
    ],
  });
  const s = efaturaCoz(metin);
  assert.ok(
    s.hatalar.some((h) => /satır tutarını vermiyor/.test(h)),
    s.hatalar.join(" | "),
  );
});

test("satır toplamı ara toplamı tutmuyorsa hata verir", () => {
  const s = efaturaCoz(ornekMetin({ araToplam: "99.999,00" }));
  assert.ok(
    s.hatalar.some((h) => /ara toplamını tutmuyor/.test(h)),
    s.hatalar.join(" | "),
  );
});

test("aynı seri numarası iki kalemde geçerse hata verir", () => {
  const metin = ornekMetin({
    notlar: [
      'Not:\n1 Numaralı satırdaki; "4000000000011/1000001" kodlu ürün için seriler: 350000000000011; 350000000000029',
      '2 Numaralı satırdaki; "4000000000028/1000002" kodlu ürün için seriler: 350000000000011; 350000000000045; 350000000000052',
    ],
  });
  const s = efaturaCoz(metin);
  assert.ok(
    s.hatalar.some((h) => /birden fazla var/.test(h)),
    s.hatalar.join(" | "),
  );
});

test("seri notundaki kod tutmuyorsa uyarı verir, fatura reddedilmez", () => {
  // Eskiden bu bir hataydı ve faturayı tümden reddediyordu. Gerçek bir
  // Datagate faturasında not kısmı EAN yerine satıcı ürün kodunu yazınca
  // fatura yüklenemedi. Seriler kalemle sıra numarasından eşleşiyor; koddaki
  // fark yalnızca dikkat çekilecek bir durum.
  const metin = ornekMetin({
    notlar: [
      'Not:\n1 Numaralı satırdaki; "9999999999999/1000001" kodlu ürün için seriler: 350000000000011; 350000000000029',
      '2 Numaralı satırdaki; "4000000000028/1000002" kodlu ürün için seriler: 350000000000037; 350000000000045; 350000000000052',
    ],
  });
  const s = efaturaCoz(metin);
  assert.deepEqual(s.hatalar, [], s.hatalar.join(" | "));
  assert.ok(
    s.uyarilar.some((u) => /eşleşmiyor/.test(u)),
    s.uyarilar.join(" | "),
  );
  // Seriler yine sıra numarasına göre bağlanmış olmalı.
  assert.deepEqual(s.kalemler[0].seriNolar, ["350000000000011", "350000000000029"]);
});

test("model kodlu sütunlar ürün adına karışmıyor", () => {
  // KOD_KALIBI yalnız rakam kabul ederken "GAMA11TU/A" ürün adının başına
  // yapışıyordu: "GAMA11TU/A GAMA11TU/A GAMA FON 20 128GB SIYAH".
  const s = efaturaCoz(modelKoduNotluMetin());
  assert.equal(s.kalemler[0].urunAdi, "GAMA FON 20 128GB SIYAH");
  assert.equal(s.kalemler[1].urunAdi, "GAMA FON 30 PRO MAX 256GB BUZUL");
});

test("model kodu satırın kodları arasında tutuluyor", () => {
  const s = efaturaCoz(modelKoduNotluMetin());
  assert.deepEqual(s.kalemler[0].urunKodlari, ["4000000000035", "GAMA11TU/A", "GAMA11TU/A"]);
  assert.equal(s.kalemler[0].barkod, "4000000000035", "barkod yine EAN olmalı");
});

test("açıklama parçası kod sanılmıyor", () => {
  // "128GB" rakam ve harf taşıyor ama ayracı yok; kod sütunu sayılmamalı.
  const s = efaturaCoz(
    ornekMetin({
      kalemler: [
        ["1", "4000000000011", "128GB", "SIYAH", "2,00", "1.000,00 TL", "%20", "200,00 TL", "2.000,00 TL"].join("\n"),
      ],
      notlar: [
        'Not:\n1 Numaralı satırdaki; "4000000000011/1000001" kodlu ürün için seriler: 350000000000011; 350000000000029',
      ],
      araToplam: "2.000,00",
    }),
  );
  assert.equal(s.kalemler[0].urunAdi, "128GB SIYAH");
  assert.deepEqual(s.kalemler[0].urunKodlari, ["4000000000011"]);
});

test("seri numarası olmayan kalem uyarı üretir, hata değil", () => {
  const metin = ornekMetin({
    kalemler: [
      ["1", "4000000000011", "4000000000011", "4000000000011", "KILIF SILIKON", "5,00", "100,00 TL", "%20", "100,00 TL", "500,00 TL"].join("\n"),
    ],
    notlar: [],
    araToplam: "500,00",
  });
  const s = efaturaCoz(metin);
  assert.deepEqual(s.hatalar, []);
  assert.ok(s.uyarilar.some((u) => /seri numarası yok/.test(u)), s.uyarilar.join(" | "));
});

// ----------------------------------------------------------------- dönüşüm

test("okuma tedarikçi faturası yapısına çevrilir", () => {
  const sonuc = efaturadanTedarikciFaturasi(efaturaCoz(ornekMetin()));
  assert.equal(sonuc.basliklarTamam, true);
  assert.equal(sonuc.faturalar.length, 1);

  const f = sonuc.faturalar[0];
  assert.equal(f.faturaNo, "DG02026000099999");
  assert.equal(f.siparisNo, "0001234567");
  assert.equal(f.vadeTarihi?.getDate(), 26);
  assert.equal(f.gruplar.length, 2);
  assert.equal(f.cihazSayisi, 5, "2 + 3 cihaz");
  assert.equal(f.toplamKurus, 800000, "2×1.000 + 3×2.000");
});

test("her seri numarası ayrı bir cihaz olur", () => {
  const f = efaturadanTedarikciFaturasi(efaturaCoz(ornekMetin())).faturalar[0];
  const cihazlar = f.gruplar.flatMap((g) => g.cihazlar);
  assert.equal(cihazlar.length, 5);
  assert.equal(new Set(cihazlar.map((c) => c.seriNo)).size, 5, "seri numaraları tekrarsız");
  assert.ok(cihazlar.every((c) => c.alisFiyatiKurus > 0));
});

test("marka ürün adının ilk kelimesinden türetilir", () => {
  const f = efaturadanTedarikciFaturasi(efaturaCoz(ornekMetin())).faturalar[0];
  assert.equal(f.gruplar[0].marka, "ALFA");
  assert.equal(f.gruplar[1].marka, "BETA");
});

test("seri numarasız kalemde adet kadar cihaz açılır", () => {
  const metin = ornekMetin({
    kalemler: [
      ["1", "4000000000011", "4000000000011", "4000000000011", "KILIF SILIKON", "5,00", "100,00 TL", "%20", "100,00 TL", "500,00 TL"].join("\n"),
    ],
    notlar: [],
    araToplam: "500,00",
  });
  const f = efaturadanTedarikciFaturasi(efaturaCoz(metin)).faturalar[0];
  assert.equal(f.cihazSayisi, 5);
  assert.ok(f.gruplar[0].cihazlar.every((c) => c.seriNo === null));
});

test("hatalı okuma fatura üretmez ve okuma başarısız sayılır", () => {
  const sonuc = efaturadanTedarikciFaturasi(efaturaCoz(ornekMetin({ araToplam: "99.999,00" })));
  assert.equal(sonuc.faturalar.length, 0);
  assert.ok(sonuc.hatalar.length > 0);
  // basliklarTamam false olmalı: ekran hatayı ancak böyle gösteriyor, aksi
  // halde kullanıcı boş bir önizleme görüp ne olduğunu anlamıyor.
  assert.equal(sonuc.basliklarTamam, false);
});

test("tanınmayan PDF de okuma başarısız sayılır", () => {
  const sonuc = efaturadanTedarikciFaturasi(efaturaCoz("Kira sözleşmesi"));
  assert.equal(sonuc.basliklarTamam, false);
  assert.equal(sonuc.faturalar.length, 0);
});

// ------------------------------- notta satıcı ürün kodu yazan fatura

/**
 * Gerçek bir Datagate faturasında not kısmı EAN yerine satıcı ürün kodunu
 * yazmıştı ("GAMA11TU/A/1400001"), program da kalemi reddetmişti. Seriler
 * kalemle sıra numarasından eşleşiyor; koddaki fark hatayı değil uyarıyı
 * gerektiriyor.
 */
function modelKoduNotluMetin(): string {
  return ornekMetin({
    kalemler: [
      ["1", "4000000000035", "GAMA11TU/A", "GAMA11TU/A", "GAMA FON 20 128GB SIYAH", "1,00", "50.000,00 TL", "%20", "10.000,00 TL", "50.000,00 TL"].join("\n"),
      ["2", "4000000000042", "GAMA22TU/A", "GAMA22TU/A", "GAMA FON 30 PRO MAX 256GB BUZUL", "1,00", "80.000,00", "TL", "%20", "16.000,00", "TL", "80.000,00 TL"].join("\n"),
    ],
    notlar: [
      'Not:\n1 Numaralı satırdaki; "GAMA11TU/A/1400001" kodlu ürün için seriler: 359900000000017',
      '2 Numaralı satırdaki; "GAMA22TU/A/1400002" kodlu ürün için seriler: 359900000000025',
    ],
    araToplam: "130.000,00",
  });
}

test("notta satıcı ürün kodu yazsa bile fatura okunuyor", () => {
  const s = efaturaCoz(modelKoduNotluMetin());
  assert.deepEqual(s.hatalar, [], s.hatalar.join(" | "));
  assert.equal(s.kalemler.length, 2);
});

test("seriler sıra numarasına göre doğru kaleme bağlanıyor", () => {
  const s = efaturaCoz(modelKoduNotluMetin());
  assert.deepEqual(s.kalemler[0].seriNolar, ["359900000000017"]);
  assert.deepEqual(s.kalemler[1].seriNolar, ["359900000000025"]);
});

test("satıcı ürün kodlu notta uyarı da çıkmıyor", () => {
  // Kod satırın kodlarından biriyle (satıcı ürün kodu) başlıyor: teyit tamam.
  const s = efaturaCoz(modelKoduNotluMetin());
  assert.deepEqual(s.uyarilar, [], s.uyarilar.join(" | "));
});

test("EAN yazan not da çalışmaya devam ediyor", () => {
  const s = efaturaCoz(ornekMetin());
  assert.deepEqual(s.hatalar, [], s.hatalar.join(" | "));
  assert.deepEqual(s.uyarilar, [], s.uyarilar.join(" | "));
});

test("hiçbir kodla tutmayan not uyarı veriyor ama faturayı reddetmiyor", () => {
  const s = efaturaCoz(
    ornekMetin({
      notlar: [
        'Not:\n1 Numaralı satırdaki; "BASKA-URUN-KODU" kodlu ürün için seriler: 350000000000011; 350000000000029',
        '2 Numaralı satırdaki; "4000000000028/1000002" kodlu ürün için seriler: 350000000000037; 350000000000045;',
        "350000000000052",
      ],
    }),
  );
  assert.deepEqual(s.hatalar, [], s.hatalar.join(" | "));
  assert.equal(s.uyarilar.length, 1, s.uyarilar.join(" | "));
  assert.match(s.uyarilar[0], /sıra numarasına göre eşleştirildi/);
  // Seriler yine de sıra numarasına göre bağlanmış olmalı.
  assert.deepEqual(s.kalemler[0].seriNolar, ["350000000000011", "350000000000029"]);
});

test("kod teyidi her iki yönde de önek kabul ediyor", () => {
  assert.equal(kodTeyitEdildi("GAMA11TU/A/1400001", ["4000000000035", "GAMA11TU/A"]), true);
  assert.equal(kodTeyitEdildi("GAMA11TU", ["GAMA11TU/A"]), true, "notta kısa kod");
  assert.equal(kodTeyitEdildi("BASKA", ["GAMA11TU/A"]), false);
});

test("satırın kodu okunamadıysa teyit aranmıyor", () => {
  assert.equal(kodTeyitEdildi("GAMA11TU/A", []), true);
  assert.equal(kodTeyitEdildi("", ["GAMA11TU/A"]), true);
});

// ------------------ demo cihazlı fatura: harfle biten EAN, bölünmüş kod

/**
 * Gerçek bir faturada iki ayrı düzen sorunu çıktı ve "Faturada ürün satırı
 * bulunamadı" hatasıyla fatura hiç okunamadı:
 *
 *   - EAN sonunda harf vardı ("...132D"); demo cihazlar böyle işaretleniyor.
 *     Satır başlangıcı salt rakamlı kod beklediği için hiçbir satır tanınmadı.
 *   - Satıcı/alıcı ürün kodu PDF'te iki parçaya bölünüyordu ("SM-" +
 *     "S741BLGGTUR_DM"); birleştirilmeyince ürün adının başına yapışıyordu.
 *
 * Ayrıca ilk satırda üç kod sütununun üçü de aynı EAN'i taşıyordu.
 */
function demoKodluMetin(): string {
  return ornekMetin({
    kalemler: [
      // Üç kod sütunu da aynı, sonu harfli EAN.
      ["1", "4000000000011D", "4000000000011D", "4000000000011D", "ALFA FON A7 PRO 4/128GB", "SIYAH DM", "1,00", "6.000,00 TL", "%20", "1.200,00 TL", "6.000,00 TL"].join("\n"),
      // Satıcı ve alıcı ürün kodu ikiye bölünmüş.
      ["2", "4000000000028D", "SM-", "S741BLGGTUR_DM", "SM-", "S741BLGGTUR_DM", "BETA FON S26 FE", "8/256GB PISTAC DM", "1,00", "20.000,00", "TL", "%20", "4.000,00", "TL", "20.000,00 TL"].join("\n"),
    ],
    notlar: [
      'Not:\n1 Numaralı satırdaki; "4000000000011D" kodlu ürün için seriler: 359900000000017',
      '2 Numaralı satırdaki; "SM-S741BLGGTUR_DM" kodlu ürün için seriler: 359900000000025',
    ],
    araToplam: "26.000,00",
  });
}

test("sonu harfli EAN'li fatura okunuyor", () => {
  const s = efaturaCoz(demoKodluMetin());
  assert.deepEqual(s.hatalar, [], s.hatalar.join(" | "));
  assert.equal(s.kalemler.length, 2, "iki kalem bulunmalı");
});

test("sonu harfli EAN barkod olarak alınıyor", () => {
  const s = efaturaCoz(demoKodluMetin());
  assert.equal(s.kalemler[0].barkod, "4000000000011D");
  assert.equal(s.kalemler[1].barkod, "4000000000028D");
});

test("tekrarlanan EAN sütunları ürün adına karışmıyor", () => {
  const s = efaturaCoz(demoKodluMetin());
  assert.equal(s.kalemler[0].urunAdi, "ALFA FON A7 PRO 4/128GB SIYAH DM");
  assert.deepEqual(s.kalemler[0].urunKodlari, [
    "4000000000011D",
    "4000000000011D",
    "4000000000011D",
  ]);
});

test("ikiye bölünmüş ürün kodu birleştiriliyor", () => {
  const s = efaturaCoz(demoKodluMetin());
  assert.equal(s.kalemler[1].urunAdi, "BETA FON S26 FE 8/256GB PISTAC DM");
  assert.deepEqual(s.kalemler[1].urunKodlari, [
    "4000000000028D",
    "SM-S741BLGGTUR_DM",
    "SM-S741BLGGTUR_DM",
  ]);
});

test("bölünmüş kodla yazılan seri notu da eşleşiyor", () => {
  const s = efaturaCoz(demoKodluMetin());
  assert.deepEqual(s.uyarilar, [], s.uyarilar.join(" | "));
  assert.deepEqual(s.kalemler[1].seriNolar, ["359900000000025"]);
});

test("demo faturasının tutarları doğru okunuyor", () => {
  const s = efaturaCoz(demoKodluMetin());
  assert.equal(s.kalemler[0].tutarKurus, 600000);
  assert.equal(s.kalemler[1].tutarKurus, 2000000);
  assert.equal(s.araToplamKurus, 2600000);
});

// ---------------- aksesuar faturası: ayraçsız kod, tireli seri, alt satır

/**
 * Üçüncü bir gerçek fatura düzeni. İki ayrı sorun vardı:
 *
 *   - Ürün kodu ayraçsız geliyordu ("JBJBLTFLEX2GWHT"). Kod sayılmayınca
 *     ürün adının başına yapışıyordu.
 *   - Seri listesi "seriler:" satırının ALTINDA ve numaralar tireliydi
 *     ("MM0249-DQ0096939"). Devam satırı kalıbı tire kabul etmediği için
 *     liste hiç okunmuyor, ürünler "seri numarası yok" diye kaydediliyordu.
 */
function ayracsizKodluMetin(): string {
  return ornekMetin({
    kalemler: [
      ["1", "1200130016271", "GAMAFLEX2GWHT", "GAMAFLEX2GWHT", "GAMA TUNE FLEX2 KULAKICI TWS", "KUL GH BE", "2,00", "4.000,00", "TL", "%20", "1.600,00", "TL", "8.000,00 TL"].join("\n"),
      ["2", "1200130016233", "GAMAFLEX2BLK", "GAMAFLEX2BLK", "GAMA TUNE FLEX2 KULAKICI TWS", "KUL SIYAH", "2,00", "4.000,00", "TL", "%20", "1.600,00", "TL", "8.000,00 TL"].join("\n"),
    ],
    notlar: [
      // Başlık satırı "seriler:" ile bitiyor, liste alt satırda.
      'Not:\n1 Numaralı satırdaki; "GAMAFLEX2GWHT/1424090" kodlu ürün için seriler:\nMM0249-DQ0096939; MM0249-DQ0096955',
      '2 Numaralı satırdaki; "GAMAFLEX2BLK/1424112" kodlu ürün için seriler:\nMM0245-EP0304818; MM0245-EP0304822',
    ],
    araToplam: "16.000,00",
  });
}

test("ayraçsız ürün kodlu fatura okunuyor", () => {
  const s = efaturaCoz(ayracsizKodluMetin());
  assert.deepEqual(s.hatalar, [], s.hatalar.join(" | "));
  assert.equal(s.kalemler.length, 2);
});

test("ayraçsız kod ürün adına karışmıyor", () => {
  const s = efaturaCoz(ayracsizKodluMetin());
  assert.equal(s.kalemler[0].urunAdi, "GAMA TUNE FLEX2 KULAKICI TWS KUL GH BE");
  assert.deepEqual(s.kalemler[0].urunKodlari, [
    "1200130016271",
    "GAMAFLEX2GWHT",
    "GAMAFLEX2GWHT",
  ]);
});

test("alt satırdaki tireli seriler okunuyor", () => {
  const s = efaturaCoz(ayracsizKodluMetin());
  assert.deepEqual(s.kalemler[0].seriNolar, ["MM0249-DQ0096939", "MM0249-DQ0096955"]);
  assert.deepEqual(s.kalemler[1].seriNolar, ["MM0245-EP0304818", "MM0245-EP0304822"]);
});

test("tireli serilerde adet uyuştuğu için uyarı çıkmıyor", () => {
  const s = efaturaCoz(ayracsizKodluMetin());
  assert.deepEqual(s.uyarilar, [], s.uyarilar.join(" | "));
});

test("ayraçsız kod notla eşleştiği için teyit uyarısı yok", () => {
  // Not kodu "GAMAFLEX2GWHT/1424090", satır kodu "GAMAFLEX2GWHT" ile başlıyor.
  assert.equal(kodTeyitEdildi("GAMAFLEX2GWHT/1424090", ["1200130016271", "GAMAFLEX2GWHT"]), true);
});

test("kısa açıklama parçaları ayraçsız kod sanılmıyor", () => {
  // "FLEX2" ve "128GB" sekiz karakterden kısa; kod sütunu sayılmamalı.
  const s = efaturaCoz(
    ornekMetin({
      kalemler: [
        ["1", "4000000000011", "FLEX2", "128GB SIYAH", "2,00", "1.000,00 TL", "%20", "200,00 TL", "2.000,00 TL"].join("\n"),
      ],
      notlar: [
        'Not:\n1 Numaralı satırdaki; "4000000000011" kodlu ürün için seriler: 350000000000011; 350000000000029',
      ],
      araToplam: "2.000,00",
    }),
  );
  assert.equal(s.kalemler[0].urunAdi, "FLEX2 128GB SIYAH");
  assert.deepEqual(s.kalemler[0].urunKodlari, ["4000000000011"]);
});

test("rakamsız uzun kelime kod sanılmıyor", () => {
  // "KULAKICI" uzun ve büyük harfli ama rakamı yok.
  const s = efaturaCoz(
    ornekMetin({
      kalemler: [
        ["1", "4000000000011", "KULAKICI SIYAH", "2,00", "1.000,00 TL", "%20", "200,00 TL", "2.000,00 TL"].join("\n"),
      ],
      notlar: [
        'Not:\n1 Numaralı satırdaki; "4000000000011" kodlu ürün için seriler: 350000000000011; 350000000000029',
      ],
      araToplam: "2.000,00",
    }),
  );
  assert.equal(s.kalemler[0].urunAdi, "KULAKICI SIYAH");
});

// ------------------------------- seri satırı tanıma (saf kurallar)

test("salt rakamlı IMEI seri parçası sayılıyor", () => {
  assert.equal(seriParcasiMi("976461909525804"), true);
});

test("harf-rakam karışık seri parçası sayılıyor", () => {
  assert.equal(seriParcasiMi("SF16HWG06MLR0000SY5"), true);
  assert.equal(seriParcasiMi("SDCQ4CFHX5V"), true);
});

test("saf harf seri parçası da kabul ediliyor", () => {
  // Apple'da rakamsız seriler var; satır düzeyinde rakam aranıyor.
  assert.equal(seriParcasiMi("SCVGYKRFWLJ"), true);
});

test("tireli seri parçası kabul ediliyor", () => {
  assert.equal(seriParcasiMi("MM0249-DQ0096939"), true);
});

test("kısa parça seri sayılmıyor", () => {
  assert.equal(seriParcasiMi("TL"), false);
  assert.equal(seriParcasiMi("YAZI"), false);
  assert.equal(seriParcasiMi("12345"), false, "beş karakter");
});

test("küçük harfli ve Türkçe harfli parçalar eleniyor", () => {
  assert.equal(seriParcasiMi("Fatura"), false);
  assert.equal(seriParcasiMi("referansı"), false);
  assert.equal(seriParcasiMi("KURUŞ"), false);
  assert.equal(seriParcasiMi("TÜRKİYE"), false);
});

test("seri listesi satırı tanınıyor", () => {
  assert.equal(seriSatiriMi("SF16HWG06MLR0000SY5; SF16HWG07ZSZ0000SY5;"), true);
  assert.equal(seriSatiriMi("SCTK2P2XR9T; SCVGYKRFWLJ; SH1F16C4F6Q"), true);
  assert.equal(seriSatiriMi("MM0249-DQ0096939; MM0245-EP0304822"), true);
  assert.equal(seriSatiriMi("976461909525804; 982232437582838;"), true);
  assert.equal(seriSatiriMi("SGXW7C61R2H"), true, "tek seri");
});

test("fatura altındaki düzyazı satırları seri listesi sayılmıyor", () => {
  // Gerçek faturalarda seri listesinden hemen sonra gelen satırlar.
  assert.equal(seriSatiriMi("YAZI İLE YÜZ KIRKBEŞBİNBEŞYÜZYİRMİALTI TL ONSEKİZ KURUŞ"), false);
  assert.equal(seriSatiriMi("Fatura referansı:1100-93535953"), false);
  assert.equal(seriSatiriMi("Ödeme Şekli:"), false);
  assert.equal(seriSatiriMi("Vade Tarihi:"), false);
  assert.equal(seriSatiriMi("14 - 12 - 2026"), false);
  assert.equal(seriSatiriMi("TÜRKİYE GARANTİ BANKASI A.Ş."), false);
  assert.equal(seriSatiriMi("ISTANBUL KURUMSAL SB."), false);
});

test("tamamen rakamsız satır seri listesi sayılmıyor", () => {
  // Her parçası biçime uysa bile satırda hiç rakam yoksa bu bir liste değil.
  assert.equal(seriSatiriMi("SCVGYKRFWLJ; ABCDEFGHIJ"), false);
});

test("boş satır seri listesi sayılmıyor", () => {
  assert.equal(seriSatiriMi(""), false);
  assert.equal(seriSatiriMi("   "), false);
});

// ------------------ harf ağırlıklı serili fatura (uçtan uca ayrıştırma)

function harfSeriliMetin(): string {
  return ornekMetin({
    kalemler: [
      ["1", "195950673968", "GAMA4TU/A", "GAMA4TU/A", "Gama 40W Dynamic Pow.Adap.with", "60W Max", "3,00", "1.000,00", "TL", "%20", "600,00", "TL", "3.000,00 TL"].join("\n"),
      ["2", "195951378671", "GAMA5TU/A", "GAMA5TU/A", "Gama Kulaklik ve Kablosuz Sarj", "Kutusu", "3,00", "2.000,00", "TL", "%20", "1.200,00", "TL", "6.000,00 TL"].join("\n"),
    ],
    notlar: [
      // Harf-rakam karışık, üç seri iki satıra taşmış.
      'Not:\n1 Numaralı satırdaki; "GAMA4TU/A/1435372" kodlu ürün için seriler:\nSF16HWG06MLR0000SY5; SF16HWG07ZSZ0000SY5;\nSF16HWH03Z3D0000SY5',
      // Ortadaki seri tamamen harf.
      '2 Numaralı satırdaki; "GAMA5TU/A/1435879" kodlu ürün için seriler:\nSCTK2P2XR9T; SCVGYKRFWLJ; SH1F16C4F6Q',
      // Seri listesinden sonraki düzyazı listeye karışmamalı.
      "YAZI İLE DOKUZBİN TL",
      "Fatura referansı:1100-93535953",
    ],
    araToplam: "9.000,00",
  });
}

test("harf ağırlıklı serili fatura hatasız okunuyor", () => {
  const s = efaturaCoz(harfSeriliMetin());
  assert.deepEqual(s.hatalar, [], s.hatalar.join(" | "));
  assert.deepEqual(s.uyarilar, [], s.uyarilar.join(" | "));
});

test("iki satıra taşan harf-rakam seriler toplanıyor", () => {
  const s = efaturaCoz(harfSeriliMetin());
  assert.deepEqual(s.kalemler[0].seriNolar, [
    "SF16HWG06MLR0000SY5",
    "SF16HWG07ZSZ0000SY5",
    "SF16HWH03Z3D0000SY5",
  ]);
});

test("aralarında rakamsız seri olan satır eksiksiz okunuyor", () => {
  const s = efaturaCoz(harfSeriliMetin());
  assert.deepEqual(s.kalemler[1].seriNolar, ["SCTK2P2XR9T", "SCVGYKRFWLJ", "SH1F16C4F6Q"]);
});

test("seri listesinden sonraki düzyazı seriye karışmıyor", () => {
  const s = efaturaCoz(harfSeriliMetin());
  const hepsi = s.kalemler.flatMap((k) => k.seriNolar);
  assert.ok(!hepsi.some((x) => /YAZI|TL|REFERANS/i.test(x)), hepsi.join(", "));
  assert.equal(hepsi.length, 6);
});

// =========================================================================
// Seri eşleştirmesi — biçim matrisi
//
// Üç gerçek faturada üç ayrı seri biçimi çıktı ve her seferinde ayrıştırıcı
// kırıldı. Aşağısı bilinen bütün biçimleri ve makul varyasyonları tek yerde
// topluyor; yeni bir tedarikçi biçimi çıkarsa buraya bir satır eklenir.
// =========================================================================

/** Tek kalemlik fatura; seri notunu olduğu gibi yerleştirir. */
function tekKalemliMetin(notSatirlari: string[], adet = 2): string {
  return ornekMetin({
    kalemler: [
      ["1", "4000000000011", "GAMA1TU/A", "GAMA1TU/A", "GAMA FON 10 SIYAH", `${adet},00`, "1.000,00 TL", "%20", `${adet * 200},00 TL`, `${adet}.000,00 TL`].join("\n"),
    ],
    notlar: notSatirlari,
    araToplam: `${adet}.000,00`,
  });
}

const BASLIK_BICIMLERI: [string, string][] = [
  ["düz tırnak", 'Not:\n1 Numaralı satırdaki; "GAMA1TU/A/1400001" kodlu ürün için seriler:'],
  ["eğri tırnak", 'Not:\n1 Numaralı satırdaki; “GAMA1TU/A” kodlu ürün için seriler:'],
  ["tek tırnak", "Not:\n1 Numaralı satırdaki; ‘GAMA1TU/A’ kodlu ürün için seriler:"],
  ["tırnaksız", "Not:\n1 Numaralı satırdaki; GAMA1TU/A kodlu ürün için seriler:"],
  ["iki noktalı", 'Not:\n1 Numaralı satırdaki: "GAMA1TU/A" kodlu ürün için seriler:'],
  ["seri numaraları", 'Not:\n1 Numaralı satırdaki; "GAMA1TU/A" kodlu ürün için seri numaraları:'],
  ["Türkçe karaktersiz", 'Not:\n1 Numarali satirdaki; "GAMA1TU/A" kodlu urun icin seriler:'],
  ["Not öneki yok", '1 Numaralı satırdaki; "GAMA1TU/A" kodlu ürün için seriler:'],
];

for (const [ad, baslik] of BASLIK_BICIMLERI) {
  test(`başlık biçimi okunuyor: ${ad}`, () => {
    const s = efaturaCoz(tekKalemliMetin([`${baslik}\nAB123456; CD789012`]));
    assert.deepEqual(s.hatalar, [], s.hatalar.join(" | "));
    assert.deepEqual(s.kalemler[0].seriNolar, ["AB123456", "CD789012"], ad);
  });
}

const SERI_BICIMLERI: [string, string, string[]][] = [
  ["IMEI (salt rakam)", "350000000000011; 350000000000029", ["350000000000011", "350000000000029"]],
  ["harf-rakam karışık", "SF16HWG06MLR0000SY5; SDCQ4CFHX5V", ["SF16HWG06MLR0000SY5", "SDCQ4CFHX5V"]],
  ["saf harf + rakamlı", "SCVGYKRFWLJ; SH1F16C4F6Q", ["SCVGYKRFWLJ", "SH1F16C4F6Q"]],
  ["tireli", "MM0249-DQ0096939; MM0245-EP0304822", ["MM0249-DQ0096939", "MM0245-EP0304822"]],
  ["eğik çizgili", "AB/123456; CD/789012", ["AB/123456", "CD/789012"]],
  ["noktalı", "AB.123456; CD.789012", ["AB.123456", "CD.789012"]],
  ["alt tireli", "AB_123456; CD_789012", ["AB_123456", "CD_789012"]],
  ["artılı", "AB+123456; CD+789012", ["AB+123456", "CD+789012"]],
  ["diyezli", "AB#123456; CD#789012", ["AB#123456", "CD#789012"]],
  ["iki noktalı", "AB:123456; CD:789012", ["AB:123456", "CD:789012"]],
  ["virgülle ayrılmış", "AB123456, CD789012", ["AB123456", "CD789012"]],
  ["dikey çizgiyle ayrılmış", "AB123456 | CD789012", ["AB123456", "CD789012"]],
  ["yalnız boşlukla ayrılmış", "AB123456 CD789012", ["AB123456", "CD789012"]],
  ["sonda ayraç artığı", "AB123456; CD789012;", ["AB123456", "CD789012"]],
  ["araya fazladan boşluk", "  AB123456 ;   CD789012  ", ["AB123456", "CD789012"]],
];

for (const [ad, liste, beklenen] of SERI_BICIMLERI) {
  test(`seri biçimi okunuyor: ${ad}`, () => {
    const s = efaturaCoz(
      tekKalemliMetin([`Not:\n1 Numaralı satırdaki; "GAMA1TU/A" kodlu ürün için seriler:\n${liste}`]),
    );
    assert.deepEqual(s.hatalar, [], s.hatalar.join(" | "));
    assert.deepEqual(s.kalemler[0].seriNolar, beklenen, ad);
  });
}

test("seriler başlıkla aynı satırda da olabilir", () => {
  const s = efaturaCoz(
    tekKalemliMetin(['Not:\n1 Numaralı satırdaki; "GAMA1TU/A" kodlu ürün için seriler: AB123456; CD789012']),
  );
  assert.deepEqual(s.kalemler[0].seriNolar, ["AB123456", "CD789012"]);
});

test("seriler üç satıra taşsa da toplanıyor", () => {
  const s = efaturaCoz(
    tekKalemliMetin(
      ['Not:\n1 Numaralı satırdaki; "GAMA1TU/A" kodlu ürün için seriler:\nAB123456;\nCD789012;\nEF345678'],
      3,
    ),
  );
  assert.deepEqual(s.kalemler[0].seriNolar, ["AB123456", "CD789012", "EF345678"]);
});

test("adet dolunca fatura altındaki satırlar listeye girmiyor", () => {
  // Beklenen adede ulaşıldığında blok kapanıyor: sonraki satır seri biçimine
  // uysa bile alınmıyor.
  const s = efaturaCoz(
    tekKalemliMetin([
      'Not:\n1 Numaralı satırdaki; "GAMA1TU/A" kodlu ürün için seriler:\nAB123456; CD789012\nTR020006200038100006201057',
    ]),
  );
  assert.deepEqual(s.kalemler[0].seriNolar, ["AB123456", "CD789012"]);
  assert.deepEqual(s.hatalar, [], s.hatalar.join(" | "));
});

test("düzyazı satırı listeyi bitiriyor", () => {
  const s = efaturaCoz(
    tekKalemliMetin([
      'Not:\n1 Numaralı satırdaki; "GAMA1TU/A" kodlu ürün için seriler:\nAB123456; CD789012',
      "YAZI İLE İKİBİN TL",
      "Fatura referansı:1100-93535953",
    ]),
  );
  assert.deepEqual(s.kalemler[0].seriNolar, ["AB123456", "CD789012"]);
});

test("sıra numarası tutmayan not koddan eşleşiyor", () => {
  // Not bloğu yanlış numaralanmış: 7. satır diyor ama faturada tek kalem var.
  const s = efaturaCoz(
    tekKalemliMetin(['Not:\n7 Numaralı satırdaki; "GAMA1TU/A" kodlu ürün için seriler:\nAB123456; CD789012']),
  );
  assert.deepEqual(s.kalemler[0].seriNolar, ["AB123456", "CD789012"]);
  assert.ok(
    s.uyarilar.some((u) => /kod .* üzerinden bağlandı/.test(u)),
    s.uyarilar.join(" | "),
  );
});

test("koddan da eşleşmiyorsa seri bağlanmıyor ve uyarı çıkıyor", () => {
  const s = efaturaCoz(
    tekKalemliMetin(['Not:\n7 Numaralı satırdaki; "BASKA-KOD" kodlu ürün için seriler:\nAB123456; CD789012']),
  );
  assert.deepEqual(s.kalemler[0].seriNolar, []);
  assert.ok(
    s.uyarilar.some((u) => /seri numarası yok/.test(u)),
    s.uyarilar.join(" | "),
  );
});

test("adet ile seri sayısı tutmazsa hata veriliyor", () => {
  // Sessizce yanlış eşleşmektense fatura reddedilmeli.
  const s = efaturaCoz(
    tekKalemliMetin(['Not:\n1 Numaralı satırdaki; "GAMA1TU/A" kodlu ürün için seriler:\nAB123456'], 2),
  );
  assert.ok(
    s.hatalar.some((h) => /adet 2 ama 1 seri/.test(h)),
    s.hatalar.join(" | "),
  );
});
