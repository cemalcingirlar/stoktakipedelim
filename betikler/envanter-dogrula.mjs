// Envanter dökümü ile stok yükleme uçtan uca testi.
//
// Gerçek "Seri/Lot Envanter Raporu" biçiminde bir .xlsx üretir (üstte rapor
// başlıkları, altta ara toplam satırı, kasten hatalı satırlar), yükler,
// önizlemeyi doğrular, kaydeder ve cihazların doğru mağazaya yazıldığını
// listeden kontrol eder.
import { chromium } from "@playwright/test";
import ExcelJS from "exceljs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/envanter";
const SIFRE = "Stok2026!";

const damga = Date.now().toString().slice(-8);
const imei = (i) => `87${damga}${String(i).padStart(5, "0")}`.slice(0, 15);

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const baglam = await tarayici.newContext({
  viewport: { width: 1500, height: 1200 },
  locale: "tr-TR",
  acceptDownloads: true,
});
const sayfa = await baglam.newPage();
const konsolHatalari = [];
sayfa.on("console", (m) => {
  if (m.type() === "error") konsolHatalari.push(m.text());
});
sayfa.on("pageerror", (e) => konsolHatalari.push(String(e)));

const sonuclar = [];
function kontrol(ad, gecti, ek = "") {
  sonuclar.push({ ad, gecti, ek });
  console.log(`${gecti ? "✓" : "✗"} ${ad}${ek ? ` — ${ek}` : ""}`);
}

async function giris(kullanici) {
  await sayfa.context().clearCookies();
  await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sayfa.fill("#kullaniciAdi", kullanici);
  await sayfa.fill("#sifre", SIFRE);
  await Promise.all([sayfa.waitForURL("**/panel"), sayfa.click('button[type="submit"]')]);
}

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

const klasor = await mkdtemp(join(tmpdir(), "envanter-"));

try {
  // ------------------------------------------------ 1) yetki
  await giris("personel2");
  await sayfa.goto(`${hedef}/cihazlar/envanter`, { waitUntil: "networkidle" });
  kontrol(
    "personel envanter yükleme sayfasına giremiyor",
    !sayfa.url().includes("/cihazlar/envanter"),
    sayfa.url(),
  );

  // ------------------------------------------------ 2) admin ekranı ve bağlantılar
  await giris("admin");
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  const baglantiSayisi = await sayfa.locator('a[href="/cihazlar/envanter"]').count();
  kontrol(
    "cihazlar sayfasında envanter dökümü bağlantısı var",
    baglantiSayisi === 1,
    `${baglantiSayisi} bağlantı`,
  );

  await sayfa.goto(`${hedef}/cihazlar/envanter`, { waitUntil: "networkidle" });
  kontrol("admin envanter sayfasını görüyor", sayfa.url().includes("/cihazlar/envanter"));

  // Ekrandaki mağaza listesinden gerçek mağaza adlarını al: döküm bu adlarla
  // yazılacak, böylece eşleme gerçek veriyle sınanıyor.
  const magazaRozetleri = await sayfa
    .locator('h2:has-text("Dökümdeki ambar adı") + div span')
    .allTextContents();
  const magazaAdlari = magazaRozetleri
    .map((m) => m.replace(/\s*\([^)]*\)\s*$/, "").trim())
    .filter(Boolean);
  kontrol(
    "ekran mağaza adlarını listeliyor",
    magazaAdlari.length >= 2,
    magazaAdlari.slice(0, 4).join(" | "),
  );

  const magazaA = magazaAdlari[0];
  const magazaB = magazaAdlari[1] ?? magazaAdlari[0];

  // Seri no zorunlu kategoriyi seç — dökümdeki cihazlar seri/lot takipli.
  const kategoriSecenekleri = await sayfa.locator("#kategoriId option").allTextContents();
  const seriZorunluSecenek = kategoriSecenekleri.find((s) => s.includes("seri no zorunlu"));
  kontrol(
    "kategori listesinde seri no zorunluluğu görünüyor",
    Boolean(seriZorunluSecenek),
    seriZorunluSecenek ?? kategoriSecenekleri.join(" | "),
  );
  await sayfa.selectOption("#kategoriId", { label: seriZorunluSecenek });

  // ------------------------------------------------ 3) döküm dosyasını üret
  const kitap = new ExcelJS.Workbook();
  const sf = kitap.addWorksheet("Envanter");
  // Rapor çıktısı gibi: üstte serbest başlıklar, sonra sütun adları.
  sf.addRow(["EFEM İLETİŞİM"]);
  sf.addRow(["Seri/Lot Envanter Raporu"]);
  sf.addRow(["Tarih aralığı: 01.10.2026 - 13.10.2026"]);
  sf.addRow([]);
  sf.addRow(BASLIK);

  // Geçerli: metin biçiminde Türkçe tutar
  sf.addRow(["TEL-001", "SAMSUNG GALAXY A55 128GB", magazaA, "01", imei(1), "Siyah", 1, "AD", "12.500,50", "12.500,50"]);
  // Geçerli: sayı hücresi (Excel'in kendi sayı biçimi)
  sf.addRow(["TEL-002", "XIAOMI REDMI NOTE 13", magazaA, "01", imei(2), "Mavi", 1, "AD", 2097.5, 2097.5]);
  // Geçerli: ikinci mağaza
  sf.addRow(["TEL-003", "APPLE IPHONE 15 128GB", magazaB, "02", imei(3), "", 1, "AD", "45.000,00", "45.000,00"]);
  // Hatalı: tanınmayan ambar
  sf.addRow(["TEL-004", "NOKIA 3310", "BİLİNMEYEN ŞUBE", "99", imei(4), "", 1, "AD", "1.000,00", "1.000,00"]);
  // Hatalı: miktar 1'den büyük
  sf.addRow(["TEL-005", "OPPO A78", magazaA, "01", imei(5), "", 3, "AD", "7.000,00", "21.000,00"]);
  // Hatalı: seri no boş (seri no zorunlu kategori)
  sf.addRow(["TEL-006", "VESTEL VENUS", magazaA, "01", "", "", 1, "AD", "3.000,00", "3.000,00"]);
  // Onay bekleyen: gerçek seri numarası olmayan ürünlere verilmiş sıra numarası
  sf.addRow(["AKS-1", "KILIF SILIKON", magazaA, "01", "26546", "Siyah", 1, "AD", "250,00", "250,00"]);
  sf.addRow(["AKS-2", "KILIF DERI", magazaA, "01", "26546", "Kahve", 1, "AD", "250,00", "250,00"]);
  // Atlanmalı: ara toplam satırı
  sf.addRow(["", "", "", "", "", "", 9, "AD", "", "99.999,00"]);

  const dosyaYolu = join(klasor, "envanter.xlsx");
  await writeFile(dosyaYolu, Buffer.from(await kitap.xlsx.writeBuffer()));

  // ------------------------------------------------ 4) önizleme
  await sayfa.setInputFiles("#dosya", dosyaYolu);
  await sayfa.click('button:has-text("Dosyayı Oku")');
  await sayfa.waitForSelector('h2:has-text("2. Önizleme")', { timeout: 25000 });

  const ozetMetni = (await sayfa.locator('h2:has-text("2. Önizleme") + p').textContent()) ?? "";
  kontrol("3 geçerli satır okundu", ozetMetni.includes("3 geçerli satır"), ozetMetni.trim());
  kontrol("3 hatalı satır bildirildi", ozetMetni.includes("3 hatalı satır"), ozetMetni.trim());
  // 12.500,50 + 2.097,50 + 45.000,00 = 59.598,00
  kontrol(
    "metin ve sayı hücreli tutarlar doğru toplandı",
    ozetMetni.includes("59.598,00"),
    ozetMetni.trim(),
  );

  const hataListesi = await sayfa.locator('[data-test="satir-hatalari"] li').allTextContents();
  const hataMetni = hataListesi.join(" | ");
  kontrol("tanınmayan ambar hatası var", /BİLİNMEYEN ŞUBE/.test(hataMetni), hataMetni.slice(0, 160));
  kontrol("miktar 1'den büyük satır elendi", /tek cihaz tutuyor/.test(hataMetni));
  kontrol("boş seri no yakalandı", /seri no \(IMEI\) zorunlu/.test(hataMetni));
  kontrol("ara toplam satırı hata üretmedi", hataListesi.length === 3, `${hataListesi.length} hata`);

  const ambarUyarisi = (await sayfa.locator("text=hiçbir mağazaya denk gelmedi").count()) > 0;
  kontrol("eşleşmeyen ambar uyarısı gösteriliyor", ambarUyarisi);

  // --------------------------------------------- tekrar eden numara onayı
  const onayKutusu = sayfa.locator('[data-test="tekrar-onayi"]');
  kontrol("tekrar eden numara için onay kutusu çıktı", (await onayKutusu.count()) === 1);

  const onayMetni = (await onayKutusu.textContent()) ?? "";
  kontrol(
    "onay kutusu etkilenen satır sayısını söylüyor",
    onayMetni.includes("2 satırda tekrar eden numara"),
    onayMetni.slice(0, 80).trim(),
  );
  kontrol("onay kutusu tekrar eden numarayı gösteriyor", onayMetni.includes("26546"));
  kontrol(
    "onay kutusu ne olacağını açıklıyor",
    onayMetni.includes("seri numarası olarak yazılmaz"),
  );

  // Tekrar eden numaralı satırlar onaysız yüklenmemeli; hata listesinde de
  // olmamalı (hata değil, onay konusu).
  const onaysizHatalar = await sayfa
    .locator('[data-test="satir-hatalari"] li')
    .allTextContents();
  kontrol(
    "tekrar eden numara hata listesine düşmüyor",
    !onaysizHatalar.join(" ").includes("26546"),
  );

  const onaysizOzet = (await sayfa.locator('h2:has-text("2. Önizleme") + p').textContent()) ?? "";
  kontrol(
    "onay verilmeden tekrar eden satırlar sayılmıyor",
    onaysizOzet.includes("3 geçerli satır"),
    onaysizOzet.trim(),
  );

  // Onayla: dosya aynı formla yeniden okunuyor, kullanıcı dosyayı tekrar
  // seçmek zorunda kalmamalı.
  await sayfa.click('button:has-text("Onaylıyorum")');
  await sayfa.waitForSelector("text=seri numarasız olarak yüklenecek", { timeout: 25000 });

  const onayliOzet = (await sayfa.locator('h2:has-text("2. Önizleme") + p').textContent()) ?? "";
  kontrol(
    "onaydan sonra 5 geçerli satır var",
    onayliOzet.includes("5 geçerli satır"),
    onayliOzet.trim(),
  );
  kontrol(
    "onaydan sonra 2 cihaz seri numarasız işaretli",
    onayliOzet.includes("2 cihaz seri numarasız"),
    onayliOzet.trim(),
  );
  // 59.598,00 + 250,00 + 250,00
  kontrol(
    "onaylanan satırların tutarı toplama eklendi",
    onayliOzet.includes("60.098,00"),
    onayliOzet.trim(),
  );
  kontrol(
    "onay kutusu kayboldu",
    (await sayfa.locator('[data-test="tekrar-onayi"]').count()) === 0,
  );

  const onayliTablo = (await sayfa.locator("table tbody").textContent()) ?? "";
  kontrol("tabloda numara parantez içinde gösteriliyor", onayliTablo.includes("(26546)"));

  const magazaOzeti = (await sayfa.locator('[data-test="magaza-ozeti"]').textContent()) ?? "";
  kontrol("mağaza özeti ilk mağazayı sayıyor", magazaOzeti.includes(magazaA), magazaOzeti.trim());
  if (magazaB !== magazaA) {
    kontrol("mağaza özeti ikinci mağazayı sayıyor", magazaOzeti.includes(magazaB), magazaOzeti.trim());
  }

  const onizlemeSatirlari = await sayfa.locator("table tbody tr").count();
  kontrol("onaydan sonra tabloda 5 satır var", onizlemeSatirlari === 5, `${onizlemeSatirlari} satır`);

  const ilkSatir = (await sayfa.locator("table tbody tr").first().textContent()) ?? "";
  kontrol(
    "marka ve model açıklamadan ayrıldı",
    ilkSatir.includes("SAMSUNG") && ilkSatir.includes("GALAXY A55"),
    ilkSatir.trim(),
  );

  // Önizleme kayıt oluşturmamalı.
  await sayfa
    .goto(`${hedef}/cihazlar?ara=${imei(2)}`, { waitUntil: "networkidle" })
    .catch(() => {});
  const onizlemeSonrasi = (await sayfa.locator("body").textContent()) ?? "";
  kontrol(
    "önizleme veritabanına yazmıyor",
    !onizlemeSonrasi.includes("REDMI NOTE 13"),
    imei(2),
  );

  // ------------------------------------------------ 5) kaydet
  await sayfa.goto(`${hedef}/cihazlar/envanter`, { waitUntil: "networkidle" });
  await sayfa.selectOption("#kategoriId", { label: seriZorunluSecenek });
  await sayfa.setInputFiles("#dosya", dosyaYolu);
  await sayfa.click('button:has-text("Dosyayı Oku")');
  await sayfa.waitForSelector('h2:has-text("3. Stoğa aktar")', { timeout: 25000 });
  await sayfa.click('button:has-text("Onaylıyorum")');
  await sayfa.waitForSelector("text=seri numarasız olarak yüklenecek", { timeout: 25000 });

  await sayfa.click('button:has-text("Cihazı Stoğa Aktar")');
  // Sayfa kabuğundaki "Nasıl çalışır" başlığı kalıyor; başarı bölümünü adıyla
  // hedefliyoruz, yoksa ilk h2 yanlış başlığı yakalar.
  const basariBasligi = sayfa.locator('h2:has-text("cihaz stoğa eklendi")');
  await basariBasligi.waitFor({ timeout: 40000 });
  const basariMetni = (await basariBasligi.textContent()) ?? "";
  kontrol("5 cihaz eklendi mesajı", basariMetni.includes("5 cihaz"), basariMetni.trim());

  // ------------------------------------------------ 6) kayıtlar doğru mu
  // Tam seri no ile arama doğrudan cihaz detayına yönleniyor.
  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(1)}`, { waitUntil: "networkidle" });
  const cihazMetni = (await sayfa.locator("body").textContent()) ?? "";
  kontrol(
    "cihaz detay sayfası açıldı ve mağazası doğru",
    cihazMetni.includes(magazaA),
    sayfa.url(),
  );
  kontrol("alış fiyatı doğru yazıldı", cihazMetni.includes("12.500,50"));
  kontrol("marka/model doğru yazıldı", cihazMetni.includes("SAMSUNG"), "");
  kontrol("giriş hareketi oluştu", /Giriş|GIRIS/i.test(cihazMetni));

  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(3)}`, { waitUntil: "networkidle" });
  const ikinciCihaz = (await sayfa.locator("body").textContent()) ?? "";
  kontrol(
    "ikinci mağazanın cihazı o mağazaya yazıldı",
    ikinciCihaz.includes(magazaB),
    magazaB,
  );

  // Seri numarasız yüklenen cihazlar numaradan bulunabilmeli (numara nota yazıldı).
  await sayfa.goto(`${hedef}/cihazlar?ara=26546`, { waitUntil: "networkidle" });
  const numaraAramasi = await sayfa.locator("table tbody tr").count();
  kontrol(
    "seri numarasız cihazlar dosyadaki numaradan bulunuyor",
    numaraAramasi === 2,
    `${numaraAramasi} satır`,
  );

  const numaraMetni = (await sayfa.locator("table tbody").textContent()) ?? "";
  kontrol(
    "iki ayrı cihaz olarak eklendiler",
    numaraMetni.includes("KILIF") && numaraMetni.includes("SILIKON"),
    numaraMetni.slice(0, 120).trim(),
  );

  // Fatura oluşmamalı: döküm devir girişi.
  await sayfa.goto(`${hedef}/faturalar`, { waitUntil: "networkidle" });
  const faturaMetni = (await sayfa.locator("body").textContent()) ?? "";
  kontrol(
    "döküm için alış faturası oluşmadı",
    !faturaMetni.includes("envanter.xlsx"),
    "",
  );

  // ------------------------------------------------ 7) ikinci yükleme çakışmalı
  await sayfa.goto(`${hedef}/cihazlar/envanter`, { waitUntil: "networkidle" });
  await sayfa.selectOption("#kategoriId", { label: seriZorunluSecenek });
  await sayfa.setInputFiles("#dosya", dosyaYolu);
  await sayfa.click('button:has-text("Dosyayı Oku")');
  await sayfa.waitForSelector('h2:has-text("2. Önizleme")', { timeout: 25000 });
  const ikinciOzet = (await sayfa.locator('h2:has-text("2. Önizleme") + p').textContent()) ?? "";
  kontrol(
    "tekrar yüklemede çakışan seri nolar elendi",
    ikinciOzet.includes("0 geçerli satır"),
    ikinciOzet.trim(),
  );
  const ikinciHatalar = (
    await sayfa.locator('[data-test="satir-hatalari"]').textContent()
  ) ?? "";
  kontrol("çakışma mesajı 'zaten kayıtlı' diyor", ikinciHatalar.includes("zaten kayıtlı"));

  // ------------------------------------------------ 8) şablon ekranı dökümü tanıyor
  await sayfa.goto(`${hedef}/cihazlar/ice-aktar`, { waitUntil: "networkidle" });
  await sayfa.setInputFiles("#dosya", dosyaYolu);
  await sayfa.click('button:has-text("Dosyayı Oku")');
  await sayfa.waitForSelector('[role="alert"], h2:has-text("2. Okunan satırlar")', {
    timeout: 25000,
  });
  const yonlendirme = (await sayfa.locator("body").textContent()) ?? "";
  kontrol(
    "şablon ekranı dökümü tanıyıp doğru ekrana yönlendiriyor",
    yonlendirme.includes("/cihazlar/envanter"),
    yonlendirme.includes("envanter dökümü") ? "mesaj verildi" : "",
  );

  await sayfa.screenshot({ path: `${cikti}-son.png`, fullPage: true });
} catch (hata) {
  kontrol("betik tamamlandı", false, String(hata).slice(0, 300));
  await sayfa.screenshot({ path: `${cikti}-hata.png`, fullPage: true }).catch(() => {});
} finally {
  await tarayici.close();
}

if (konsolHatalari.length > 0) {
  console.log("\nTarayıcı konsol hataları:");
  for (const h of konsolHatalari.slice(0, 10)) console.log(`  ${h}`);
}

const basarisiz = sonuclar.filter((s) => !s.gecti);
console.log(`\n${sonuclar.length - basarisiz.length}/${sonuclar.length} kontrol geçti.`);
process.exit(basarisiz.length === 0 && konsolHatalari.length === 0 ? 0 : 1);
