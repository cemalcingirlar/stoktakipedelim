import assert from "node:assert/strict";
import { test } from "node:test";
import {
  efaturaCoz,
  efaturaMi,
  efaturaTarihiCoz,
  efaturadanTedarikciFaturasi,
  seriNolariTopla,
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

test("seri notu başka ürüne aitse hata verir", () => {
  const metin = ornekMetin({
    notlar: [
      'Not:\n1 Numaralı satırdaki; "9999999999999/1000001" kodlu ürün için seriler: 350000000000011; 350000000000029',
      '2 Numaralı satırdaki; "4000000000028/1000002" kodlu ürün için seriler: 350000000000037; 350000000000045; 350000000000052',
    ],
  });
  const s = efaturaCoz(metin);
  assert.ok(
    s.hatalar.some((h) => /başka ürüne ait/.test(h)),
    s.hatalar.join(" | "),
  );
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
