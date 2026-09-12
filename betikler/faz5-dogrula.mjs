// Faz 5 testi: sütun seçici, Excel çıktıları, raporlar, log ekranı, kullanıcı yönetimi.
import { chromium } from "@playwright/test";
import { readFileSync, existsSync, rmSync } from "node:fs";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/faz5";
const SIFRE = "Stok2026!";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({
  viewport: { width: 1600, height: 1000 },
  locale: "tr-TR",
  acceptDownloads: true,
});
const hatalar = [];
sayfa.on("console", (m) => { if (m.type() === "error") hatalar.push(m.text()); });
sayfa.on("pageerror", (e) => hatalar.push(String(e)));

async function giris(kullanici, sifre = SIFRE) {
  await sayfa.context().clearCookies();
  await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sayfa.fill("#kullaniciAdi", kullanici);
  await sayfa.fill("#sifre", sifre);
  await Promise.all([sayfa.waitForURL("**/panel", { timeout: 20000 }), sayfa.click('button[type="submit"]')]);
}

async function indir(tiklama, ad) {
  const [dosya] = await Promise.all([
    sayfa.waitForEvent("download", { timeout: 30000 }),
    tiklama,
  ]);
  const yol = `${cikti}-${ad}.xlsx`;
  if (existsSync(yol)) rmSync(yol);
  await dosya.saveAs(yol);
  return { ad: dosya.suggestedFilename(), boyut: readFileSync(yol).length, yol };
}

await giris("admin");

// ------------------------------------------------- 1) Sütun seçici
await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
const baslangicSutun = await sayfa.locator("table thead th").count();
console.log("1) başlangıç sütun sayısı:", baslangicSutun);
await sayfa.click('button:has-text("Sütunlar")');
await sayfa.waitForSelector('input[name="sutun"]', { timeout: 10000 });
// Barkod ve Alt Kategori'yi aç, Genel Not'u kapat
await sayfa.locator('label:has-text("Barkod") input').check();
await sayfa.locator('label:has-text("Alt Kategori") input').check();
await sayfa.locator('label:has-text("Genel Not") input').uncheck();
await sayfa.click('button:has-text("Uygula")');
await sayfa.waitForTimeout(1500);
const yeniSutun = await sayfa.locator("table thead th").count();
const basliklar = await sayfa.locator("table thead th").allTextContents();
console.log("   yeni sütun sayısı:", yeniSutun, "| değişti:", yeniSutun !== baslangicSutun ? "✓" : "✗");
console.log("   başlıklar:", basliklar.join(" | "));
console.log("   Barkod eklendi:", basliklar.includes("Barkod") ? "✓" : "✗",
            "| Genel Not kaldırıldı:", !basliklar.includes("Genel Not") ? "✓" : "✗");
await sayfa.screenshot({ path: `${cikti}-sutun-secici.png`, fullPage: true });

// Seçim kalıcı mı — sayfayı yenile
await sayfa.reload({ waitUntil: "networkidle" });
const kaliciBasliklar = await sayfa.locator("table thead th").allTextContents();
console.log("2) yenileme sonrası kalıcı:", kaliciBasliklar.includes("Barkod") && !kaliciBasliklar.includes("Genel Not") ? "✓" : "✗");

// ------------------------------------------------- 3) Cihaz Excel (filtreli)
await sayfa.goto(`${hedef}/cihazlar?durum=STOKTA`, { waitUntil: "networkidle" });
const stoktaAdet = await sayfa.locator("tbody tr").count();
const cihazExcel = await indir(sayfa.click('a:has-text("Excel")'), "cihazlar");
console.log("3) cihaz Excel:", cihazExcel.ad, `${cihazExcel.boyut} bayt`, cihazExcel.boyut > 3000 ? "✓" : "✗");
console.log("   ekrandaki stokta satır:", stoktaAdet);

// ------------------------------------------------- 4) Raporlar
await sayfa.goto(`${hedef}/rapor`, { waitUntil: "networkidle" });
const kartlar = await sayfa.locator("main .grid").first().textContent();
console.log("4) rapor özet kartları:", kartlar?.replace(/\s+/g, " ").trim().slice(0, 140));
const tabloSayisi = await sayfa.locator("table").count();
console.log("   rapor tablosu sayısı:", tabloSayisi);
await sayfa.screenshot({ path: `${cikti}-raporlar.png`, fullPage: true });

const raporExcel = await indir(sayfa.click('a:has-text("Tümünü Excel")'), "rapor");
console.log("5) rapor Excel:", raporExcel.ad, `${raporExcel.boyut} bayt`, raporExcel.boyut > 5000 ? "✓" : "✗");

// Tarih aralığı filtresi
await sayfa.goto(`${hedef}/rapor?bas=2026-01-01&bit=2026-12-31`, { waitUntil: "networkidle" });
console.log("6) tarih aralığı:", (await sayfa.locator("form span").last().textContent())?.trim());

// ------------------------------------------------- 7) Log ekranı
await sayfa.goto(`${hedef}/ayarlar/loglar`, { waitUntil: "networkidle" });
const logSayisi = (await sayfa.locator("div.border-b", { hasText: "kayıt" }).first().textContent())?.trim();
console.log("7) log ekranı:", logSayisi);
await sayfa.selectOption("#islem", "SATIS_YAP");
await sayfa.click('button:has-text("Filtrele")');
await sayfa.waitForLoadState("networkidle");
const satisLog = (await sayfa.locator("div.border-b", { hasText: "kayıt" }).first().textContent())?.trim();
console.log("   satış filtresi:", satisLog, "| ilk kayıt:", (await sayfa.locator("tbody tr td:nth-child(4)").first().textContent())?.trim());
await sayfa.screenshot({ path: `${cikti}-loglar.png`, fullPage: true });

// ------------------------------------------------- 8) Kullanıcı yönetimi
await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
const kAdi = `test${Date.now() % 100000}`;
await sayfa.fill("#yeniKullaniciAdi", kAdi);
await sayfa.fill("#yeniAdSoyad", "Test Personeli");
await sayfa.selectOption("#yeniRol", "MAGAZA_PERSONELI");
await sayfa.selectOption("#yeniMagaza", { index: 1 });
await sayfa.fill("#yeniSifre", "TestSifre123");
await sayfa.click('button:has-text("Kullanıcı Ekle")');
await sayfa.locator(`input[value="${kAdi}"]`).first().waitFor({ timeout: 15000 });
console.log("8) kullanıcı eklendi:", kAdi, "✓");

// Mağazasız personel reddedilmeli
await sayfa.fill("#yeniKullaniciAdi", `${kAdi}b`);
await sayfa.fill("#yeniAdSoyad", "Mağazasız");
await sayfa.selectOption("#yeniRol", "MAGAZA_PERSONELI");
await sayfa.selectOption("#yeniMagaza", "");
await sayfa.fill("#yeniSifre", "TestSifre123");
await sayfa.click('button:has-text("Kullanıcı Ekle")');
const magazaUyari = sayfa.locator('[role="alert"]', { hasText: "mağazaya bağlanmalı" }).first();
await magazaUyari.waitFor({ timeout: 15000 });
console.log("9) mağazasız personel reddi:", (await magazaUyari.textContent())?.trim(), "✓");

// Kısa şifre reddedilmeli
await sayfa.fill("#yeniKullaniciAdi", `${kAdi}c`);
await sayfa.fill("#yeniAdSoyad", "Kısa Şifre");
await sayfa.selectOption("#yeniMagaza", { index: 1 });
await sayfa.fill("#yeniSifre", "123");
await sayfa.evaluate(() => document.querySelector("#yeniSifre").removeAttribute("minlength"));
await sayfa.click('button:has-text("Kullanıcı Ekle")');
const sifreUyari = sayfa.locator('[role="alert"]', { hasText: "en az 8" }).first();
await sifreUyari.waitFor({ timeout: 15000 });
console.log("10) kısa şifre reddi:", (await sifreUyari.textContent())?.trim(), "✓");
await sayfa.screenshot({ path: `${cikti}-kullanicilar.png`, fullPage: true });

// Yeni kullanıcı gerçekten giriş yapabilmeli
await giris(kAdi, "TestSifre123");
console.log("11) yeni kullanıcı girişi ->", new URL(sayfa.url()).pathname, "✓");
console.log("    menüde Ayarlar yok:", (await sayfa.locator("header nav a", { hasText: "Ayarlar" }).count()) === 0 ? "✓" : "✗");

// Personel log ve rapor Excel'e erişemez / erişebilir mi
await sayfa.goto(`${hedef}/ayarlar/loglar`, { waitUntil: "networkidle" });
console.log("12) personel /ayarlar/loglar ->", new URL(sayfa.url()).pathname, sayfa.url().endsWith("/panel") ? "✓" : "✗");

// ------------------------------------------------- 13) Pasife alma
await giris("admin");
await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
const kart = sayfa.locator("div.rounded-xl.border.bg-white.shadow-sm").filter({ has: sayfa.locator(`input[value="${kAdi}"]`) }).first();
await kart.locator('input[name="aktif"]').uncheck();
await kart.locator('button:has-text("Kaydet")').click();
await kart.locator('[role="status"]').first().waitFor({ timeout: 15000 });
console.log("13) kullanıcı pasife alındı:", (await kart.locator('[role="status"]').first().textContent())?.trim(), "✓");

// Pasif kullanıcı giriş yapamamalı
await sayfa.context().clearCookies();
await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
await sayfa.fill("#kullaniciAdi", kAdi);
await sayfa.fill("#sifre", "TestSifre123");
await sayfa.click('button[type="submit"]');
await sayfa.locator('p[role="alert"]').waitFor({ timeout: 15000 });
console.log("14) pasif kullanıcı girişi:", (await sayfa.textContent('p[role="alert"]'))?.trim(), "✓");

// ------------------------------------------------- 15) Mobil
await giris("admin");
await sayfa.setViewportSize({ width: 390, height: 844 });
for (const yol of ["/rapor", "/ayarlar/loglar", "/ayarlar/kullanicilar"]) {
  await sayfa.goto(`${hedef}${yol}`, { waitUntil: "networkidle" });
  const tasma = await sayfa.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log(`15) 390px ${yol}:`, tasma ? "✗ taşma" : "✓");
}

console.log("konsol hataları:", hatalar.length ? hatalar : "yok");
await tarayici.close();
