// Excel ile toplu stok yükleme uçtan uca testi.
// Şablonu indirir, kendi dosyasını üretir (biri kasten hatalı satır), yükler,
// önizlemeyi ve kaydı doğrular.
import { chromium } from "@playwright/test";
import ExcelJS from "exceljs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/iceaktar";
const SIFRE = "Stok2026!";

const damga = Date.now().toString().slice(-8);
const imei = (i) => `86${damga}${String(i).padStart(5, "0")}`.slice(0, 15);
const FATURA_NO = `EXC-${damga}`;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const baglam = await tarayici.newContext({
  viewport: { width: 1500, height: 1100 },
  locale: "tr-TR",
  acceptDownloads: true,
});
const sayfa = await baglam.newPage();
const hatalar = [];
sayfa.on("console", (m) => { if (m.type() === "error") hatalar.push(m.text()); });
sayfa.on("pageerror", (e) => hatalar.push(String(e)));

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

const klasor = await mkdtemp(join(tmpdir(), "iceaktar-"));

try {
  // 1) personel toplu yükleme sayfasına giremez
  await giris("personel2");
  await sayfa.goto(`${hedef}/cihazlar/ice-aktar`, { waitUntil: "networkidle" });
  kontrol("personel toplu yükleme sayfasına giremiyor", !sayfa.url().includes("ice-aktar"), sayfa.url());

  // 2) admin sayfayı görüyor, /cihazlar üzerinde bağlantı var
  await giris("admin");
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  const baglanti = await sayfa.locator('a[href="/cihazlar/ice-aktar"]').count();
  kontrol("cihazlar sayfasında toplu yükleme bağlantısı var", baglanti === 1, `${baglanti} bağlantı`);

  // 3) şablon indiriliyor ve okunabiliyor
  await sayfa.goto(`${hedef}/cihazlar/ice-aktar`, { waitUntil: "networkidle" });
  const [indirme] = await Promise.all([
    sayfa.waitForEvent("download", { timeout: 20000 }),
    sayfa.click('a:has-text("Şablonu İndir")'),
  ]);
  const sablonYolu = join(klasor, "sablon.xlsx");
  await indirme.saveAs(sablonYolu);
  const sablonKitap = new ExcelJS.Workbook();
  await sablonKitap.xlsx.readFile(sablonYolu);
  const sayfaAdlari = sablonKitap.worksheets.map((w) => w.name);
  kontrol("şablon iki sayfayla indi", sayfaAdlari.length === 2, sayfaAdlari.join(", "));

  // Şablonun ikinci sayfasından gerçek kategori adını al.
  const listeSayfasi = sablonKitap.getWorksheet("Kategori Listesi");
  let kategoriAdi = "";
  let altKategoriAdi = "";
  let seriZorunlu = false;
  listeSayfasi.eachRow((satir, no) => {
    if (no <= 3 || kategoriAdi) return; // 2 üst bilgi + 1 başlık satırı
    kategoriAdi = String(satir.getCell(1).value ?? "");
    altKategoriAdi = String(satir.getCell(2).value ?? "");
    seriZorunlu = String(satir.getCell(3).value ?? "") === "Evet";
  });
  kontrol("şablon gerçek kategori listesini taşıyor", kategoriAdi !== "", `${kategoriAdi} / ${altKategoriAdi} · seri=${seriZorunlu}`);

  // 4) test dosyası üret: 3 geçerli + 1 hatalı (olmayan kategori) satır
  const kitap = new ExcelJS.Workbook();
  const sf = kitap.addWorksheet("Cihazlar");
  sf.addRow([
    "Kategori", "Alt Kategori", "Marka", "Model", "Renk",
    "Kapasite", "Seri No (IMEI)", "Barkod", "Alış Fiyatı (TL)", "Not",
  ]);
  sf.addRow([kategoriAdi, altKategoriAdi, "Samsung", "Galaxy A55", "Siyah", "128 GB", imei(1), "", "12.500,50", "toplu"]);
  sf.addRow([kategoriAdi, altKategoriAdi, "Xiaomi", "Redmi Note 13", "Mavi", "256 GB", imei(2), "", 9750, ""]);
  sf.addRow([kategoriAdi, altKategoriAdi, "Apple", "iPhone 15", "Beyaz", "128 GB", imei(3), "", "45000", ""]);
  sf.addRow(["Olmayan Kategori", "", "Nokia", "3310", "", "", imei(4), "", "1000", ""]);
  const dosyaYolu = join(klasor, "yukleme.xlsx");
  await writeFile(dosyaYolu, Buffer.from(await kitap.xlsx.writeBuffer()));

  // 5) yükle ve önizlemeyi kontrol et
  await sayfa.setInputFiles("#dosya", dosyaYolu);
  await sayfa.click('button:has-text("Dosyayı Oku")');
  await sayfa.waitForSelector('h2:has-text("2. Okunan satırlar")', { timeout: 20000 });
  const ozet = (await sayfa.locator('h2:has-text("2. Okunan satırlar") + p').textContent()) ?? "";
  kontrol("3 geçerli satır okundu", ozet.includes("3 geçerli satır"), ozet.trim());
  kontrol("1 hatalı satır bildirildi", ozet.includes("1 hatalı satır"), ozet.trim());

  const hataMetni = (await sayfa.locator("ul li").first().textContent()) ?? "";
  kontrol("hata mesajı kategoriyi işaret ediyor", hataMetni.includes("Olmayan Kategori"), hataMetni.trim());

  // Türkçe para biçimi doğru okunmuş mu: 12.500,50 + 9.750 + 45.000 = 67.250,50
  const toplam = (await sayfa.locator('span:has-text("Toplam alış tutarı")').textContent()) ?? "";
  kontrol("Türkçe para biçimi doğru okundu", toplam.includes("67.250,50"), toplam.trim());

  // 6) fatura bilgilerini doldur ve kaydet
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", FATURA_NO);
  await sayfa.selectOption("#magazaId", { index: 1 });
  await sayfa.selectOption("#vadeGun", "45");
  await Promise.all([
    sayfa.waitForURL("**/faturalar/**", { timeout: 30000 }),
    sayfa.click('button:has-text("Cihazı Kaydet")'),
  ]);
  kontrol("kayıt sonrası faturaya yönlendirildi", sayfa.url().includes("/faturalar/"), sayfa.url());

  const faturaMetni = (await sayfa.locator("body").textContent()) ?? "";
  kontrol("fatura numarası doğru", faturaMetni.includes(FATURA_NO));
  kontrol("vade 45 gün işlendi", faturaMetni.includes("45"), "");

  // 7) cihazlar listesinde seri no ile bulunabiliyor
  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(2)}`, { waitUntil: "networkidle" });
  const listeMetni = (await sayfa.locator("body").textContent()) ?? "";
  kontrol("yüklenen cihaz seri no ile bulunuyor", listeMetni.includes("Redmi Note 13"), imei(2));

  // 8) aynı dosya ikinci kez yüklenince seri no çakışması yakalanmalı
  await sayfa.goto(`${hedef}/cihazlar/ice-aktar`, { waitUntil: "networkidle" });
  await sayfa.setInputFiles("#dosya", dosyaYolu);
  await sayfa.click('button:has-text("Dosyayı Oku")');
  await sayfa.waitForSelector('h2:has-text("2. Okunan satırlar")', { timeout: 20000 });
  const ikinciOzet = (await sayfa.locator('h2:has-text("2. Okunan satırlar") + p').textContent()) ?? "";
  kontrol("tekrar yüklemede çakışan seri no elendi", ikinciOzet.includes("0 geçerli satır"), ikinciOzet.trim());

  const cakismaMetni = (await sayfa.locator("ul").first().textContent()) ?? "";
  kontrol("çakışma mesajı 'zaten kayıtlı' diyor", cakismaMetni.includes("zaten kayıtlı"));

  await sayfa.screenshot({ path: `${cikti}-son.png`, fullPage: true });
} catch (hata) {
  kontrol("betik tamamlandı", false, String(hata).slice(0, 300));
  await sayfa.screenshot({ path: `${cikti}-hata.png`, fullPage: true }).catch(() => {});
} finally {
  await tarayici.close();
}

if (hatalar.length > 0) {
  console.log("\nTarayıcı konsol hataları:");
  for (const h of hatalar.slice(0, 10)) console.log(`  ${h}`);
}

const basarisiz = sonuclar.filter((s) => !s.gecti);
console.log(`\n${sonuclar.length - basarisiz.length}/${sonuclar.length} kontrol geçti.`);
process.exit(basarisiz.length === 0 && hatalar.length === 0 ? 0 : 1);
