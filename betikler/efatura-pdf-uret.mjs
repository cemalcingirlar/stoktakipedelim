/**
 * Test için en küçük PDF üreticisi.
 *
 * Doğrulama betiği gerçek tedarikçi faturasını kullanamıyor (müşteri ve fiyat
 * bilgisi taşır, depoya konmaz). Bunun yerine aynı metin düzenini taşıyan
 * sentetik bir PDF üretiliyor: her satır ayrı bir Tj komutu, yani pdfjs'in
 * gerçek e-Faturadan çıkardığı parça akışının aynısı.
 *
 * Yalnız ASCII: standart Helvetica fontuyla Türkçe karakterler doğru
 * kodlanmaz, testin konusu da kodlama değil ayrıştırma.
 */

function kacis(metin) {
  return metin.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Satırları tek sayfalık bir PDF'e yazar ve Buffer döner.
 * @param {string[]} satirlar
 */
export function pdfUret(satirlar) {
  const komutlar = [];
  let y = 820;
  for (const satir of satirlar) {
    komutlar.push(`BT /F1 8 Tf 30 ${y} Td (${kacis(satir)}) Tj ET`);
    y -= 11;
    if (y < 20) y = 820; // Taşarsa üste dön: testte görsel düzen önemli değil.
  }
  const icerik = komutlar.join("\n");

  const nesneler = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
    `<</Length ${Buffer.byteLength(icerik, "latin1")}>>\nstream\n${icerik}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
  ];

  let pdf = "%PDF-1.4\n";
  const kaymalar = [];
  nesneler.forEach((govde, i) => {
    kaymalar.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${govde}\nendobj\n`;
  });

  const xrefKaymasi = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${nesneler.length + 1}\n0000000000 65535 f \n`;
  for (const k of kaymalar) pdf += `${String(k).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<</Size ${nesneler.length + 1}/Root 1 0 R>>\nstartxref\n${xrefKaymasi}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

/**
 * Gerçek e-Fatura düzeninde örnek satırlar üretir.
 * `modelKodu` verilirse satıcı/alıcı ürün kodu sütunlarına o yazılır ve not
 * kısmı EAN yerine onu kullanır — Apple ürünlü gerçek faturalardaki düzen.
 *
 * @param {{faturaNo: string, kalemler: {kod: string, modelKodu?: string,
 *   ad: string, adet: number, birim: string, kdvTutari: string, tutar: string,
 *   seriler: string[]}[], araToplam: string, genelToplam: string}} veri
 */
export function efaturaSatirlari(veri) {
  const notlar = veri.kalemler
    .map((k, i) =>
      k.seriler.length
        ? `${i === 0 ? "Not: " : ""}${i + 1} Numarali satirdaki; "${k.modelKodu ?? k.kod}/100000${i + 1}" kodlu urun icin seriler: ${k.seriler.join("; ")}`
        : null,
    )
    .filter(Boolean);

  const kalemSatirlari = veri.kalemler.flatMap((k, i) => [
    String(i + 1),
    k.kod,
    k.modelKodu ?? k.kod,
    k.modelKodu ?? k.kod,
    k.ad,
    `${k.adet},00`,
    `${k.birim} TL`,
    "%20",
    `${k.kdvTutari} TL`,
    `${k.tutar} TL`,
  ]);

  return [
    "Vergi No:1111111111",
    "SAYIN",
    "ORNEK ALICI LTD. STI.",
    "E-Posta: ornek@example.com",
    "ORNEK TEDARIKCI BILGISAYAR",
    "MALZEMELERI TICARET",
    "ANONIM SIRKETI",
    "Ayazaga Mah.",
    "No: 21",
    "Tel: 02120000000",
    "Faks: 02120000001",
    "Vergi Dairesi: Buyuk Mukellefler",
    "Mersis No: 0000000000000011",
    "Vergi No : 2222222222",
    "Fatura No:",
    veri.faturaNo,
    "Fatura Tarihi:",
    veri.faturaTarihi,
    "Siparis No:",
    "0001234567",
    "Ara Toplam",
    veri.araToplam,
    "TL",
    "Genel Toplam",
    veri.genelToplam,
    "TL",
    ...notlar,
    "Odeme Sekli:",
    "Odeme Gunu Havale",
    "Vade Tarihi:",
    veri.vadeTarihi,
    "Sira",
    "No",
    "EAN Kodu",
    "Satici Urun",
    "Kodu",
    "Alici Urun",
    "Kodu",
    "Aciklama",
    "Adet",
    "Birim Fiyat",
    "KDV",
    "KDV Tutari",
    "Tutar",
    ...kalemSatirlari,
  ];
}
