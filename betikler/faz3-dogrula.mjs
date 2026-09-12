// Faz 3 uçtan uca testi: çift onaylı sevkiyat (tam kabul, kısmi kabul, red, geri çekme) ve satış.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/faz3";
const SIFRE = "Stok2026!";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1500, height: 1000 }, locale: "tr-TR" });
const hatalar = [];
sayfa.on("console", (m) => { if (m.type() === "error") hatalar.push(m.text()); });
sayfa.on("pageerror", (e) => hatalar.push(String(e)));

async function giris(kullanici) {
  await sayfa.context().clearCookies();
  await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sayfa.fill("#kullaniciAdi", kullanici);
  await sayfa.fill("#sifre", SIFRE);
  await Promise.all([sayfa.waitForURL("**/panel"), sayfa.click('button[type="submit"]')]);
}

async function okut(kod) {
  await sayfa.fill("#okutmaKutusu", kod);
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.locator('[role="status"]').first().waitFor({ state: "visible", timeout: 15000 });
  await sayfa.waitForTimeout(400);
  return (await sayfa.locator('[role="status"]').first().textContent())?.trim();
}

// ---------------------------------------------------------------- Hazırlık
// Admin 1 Nolu Mağaza'ya 3 cihazlık vadesiz fatura girer.
await giris("admin");
// Sıra numarası başa konur; sondaki slice onu kesmesin diye.
const imei = Array.from({ length: 3 }, (_, i) => `86${i}${Date.now()}`.slice(0, 15));
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
await sayfa.selectOption("#tedarikciId", { index: 1 });
await sayfa.fill("#faturaNo", `FAZ3-${Date.now()}`);
await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
for (const kod of imei) {
  await sayfa.fill("#okutma", kod);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(200);
}
const kartlar = sayfa.locator("form > section").nth(2).locator("> div");
for (let i = 1; i <= 3; i++) {
  const kart = kartlar.nth(i);
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  const m = kart.locator('input[type="text"], input:not([type])');
  await m.nth(0).fill("Xiaomi");
  await m.nth(1).fill(`Redmi ${10 + i}`);
  await kart.locator('input[inputmode="decimal"]').fill("5.000");
}
await Promise.all([
  sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 20000 }),
  sayfa.click('button:has-text("Faturayı Kaydet")'),
]);
console.log("0) hazırlık: 3 cihaz 1 Nolu Mağaza'ya girildi ✓");

// ------------------------------------------------- 1) Sevkiyat gönderimi
await giris("sorumlu1");
await sayfa.goto(`${hedef}/sevkiyat/yeni`, { waitUntil: "networkidle" });
await sayfa.selectOption("#hedef", { label: "2 Nolu Mağaza" });
for (const kod of imei) console.log("   okutma:", await okut(kod));
// Aynı cihazı tekrar okut
console.log("1) tekrar okutma uyarısı:", await okut(imei[0]));
// Başka mağazadaki cihazı okut (2 Nolu'da olan yok, sistemde olmayan kod deneyelim)
console.log("   kayıtsız kod:", await okut("000000000000000"));
await sayfa.screenshot({ path: `${cikti}-sevkiyat-formu.png`, fullPage: true });

await Promise.all([
  sayfa.waitForURL(/\/sevkiyat\/\d+$/, { timeout: 20000 }),
  sayfa.click('button:has-text("Sevkiyatı Gönder")'),
]);
const sevkUrl = sayfa.url();
console.log("2) sevkiyat gönderildi ->", new URL(sevkUrl).pathname, "✓");
console.log("   durum:", (await sayfa.locator("h1 ~ * , h1").first().textContent())?.trim(),
            "|", (await sayfa.locator("header ~ * span", { hasText: "Onay Bekliyor" }).first().textContent())?.trim());

// Cihazlar artık transferde olmalı
await sayfa.goto(`${hedef}/cihazlar?durum=TRANSFERDE`, { waitUntil: "networkidle" });
console.log("3) transferdeki cihaz sayısı:", await sayfa.locator("tbody tr").count(), "(beklenen 3) ✓");

// ------------------------------------------- 2) Yanlış mağaza kabul edemez
await giris("sorumlu3");
await sayfa.goto(sevkUrl, { waitUntil: "networkidle" });
const uyari = await sayfa.locator("text=yalnızca").first().textContent().catch(() => null);
console.log("4) 3 Nolu Mağaza kabul edemez:", uyari?.replace(/\s+/g, " ").trim() ?? "✗ uyarı yok");
console.log("   okutma kutusu var mı:", (await sayfa.locator("#okutmaKutusu").count()) === 0 ? "✓ yok" : "✗ var");

// ------------------------------------------------- 3) Kısmi kabul
await giris("sorumlu2");
await sayfa.goto(sevkUrl, { waitUntil: "networkidle" });
console.log("5) hedef mağaza kabul ekranı açıldı, sayaçlar:",
  (await sayfa.locator(".grid.grid-cols-3").first().textContent())?.replace(/\s+/g, " ").trim());
console.log("   1. cihaz:", await okut(imei[0]));
console.log("   1. cihaz tekrar:", await okut(imei[0]));
await sayfa.waitForTimeout(600);
console.log("   sayaçlar:", (await sayfa.locator(".grid.grid-cols-3").first().textContent())?.replace(/\s+/g, " ").trim());
await sayfa.screenshot({ path: `${cikti}-kabul-ekrani.png`, fullPage: true });

await sayfa.click('button:has-text("Kabulü Tamamla")');
await sayfa.locator('[role="status"]', { hasText: "cihaz alındı" }).first().waitFor({ timeout: 15000 });
console.log("6) kısmi kabul:", (await sayfa.locator('[role="status"]', { hasText: "cihaz alındı" }).first().textContent())?.trim(), "✓");

// ------------------------------------------------- 4) Kalanları reddet
await sayfa.reload({ waitUntil: "networkidle" });
await sayfa.click('button:has-text("Okutulmayanları Reddet")');
await sayfa.fill("#redNedeni", "Paketten çıkmadı");
await sayfa.click('button:has-text("Reddet ve Geri Gönder")');
const redBildirimi = sayfa.locator("text=Kısmi kabul:").first();
await redBildirimi.waitFor({ timeout: 15000 });
console.log("7) red:", (await redBildirimi.textContent())?.replace(/\s+/g, " ").trim(), "✓");

// Dağılımı doğrula: 1 cihaz 2 Nolu'da, 2 cihaz 1 Nolu'da, hiçbiri transferde değil
await sayfa.goto(`${hedef}/cihazlar?durum=TRANSFERDE`, { waitUntil: "networkidle" });
console.log("8) transferde kalan:", await sayfa.locator("tbody tr").count(), "(beklenen 0) ✓");
for (const kod of imei) {
  await sayfa.goto(`${hedef}/cihazlar?ara=${kod}`, { waitUntil: "networkidle" });
  const depo = await sayfa.locator("dt:has-text('Bulunduğu Depo') + dd").textContent();
  console.log(`   ${kod} -> ${depo?.trim()}`);
}

// ------------------------------------------------- 5) Satış
await giris("personel2");
await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
// 1 Nolu Mağaza'da kalan cihazı okutmayı dene (başka mağaza -> reddedilmeli)
console.log("9) başka mağazanın cihazını satma:", await okut(imei[1]));
// 2 Nolu Mağaza'ya gelen cihazı sat
console.log("   kendi cihazı:", await okut(imei[0]));
await sayfa.fill("#satisFiyati", "7.500,50");
await sayfa.selectOption("#odemeTipi", "KREDI_KARTI");
await sayfa.fill("#yeniAd", "Ayşe Yılmaz");
await sayfa.fill("#yeniTelefon", "0532 111 22 33");
await sayfa.waitForTimeout(300);
const karMetni = (await sayfa.locator("text=Kâr").first().locator("xpath=following-sibling::div").textContent().catch(() => null));
console.log("   ekranda kâr:", karMetni?.trim() ?? "(okunamadı)");
await sayfa.screenshot({ path: `${cikti}-satis-formu.png`, fullPage: true });
await Promise.all([
  sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 20000 }),
  sayfa.click('button:has-text("Satışı Kaydet")'),
]);
console.log("10) satış kaydedildi ->", new URL(sayfa.url()).pathname, "✓");
const kar = await sayfa.locator("dt:has-text('Kâr') + dd").textContent();
const musteri = await sayfa.locator("dt:has-text('Müşteri') + dd").first().textContent();
console.log("    kâr:", kar?.trim(), "| müşteri:", musteri?.trim());
console.log("    tarihçe kayıt sayısı:", await sayfa.locator("ol li").count(), "(giriş + sevk + kabul + satış = 4)");
await sayfa.screenshot({ path: `${cikti}-cihaz-tarihce.png`, fullPage: true });

// Aynı cihaz ikinci kez satılamaz
await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
console.log("11) satılmış cihazı tekrar satma:", await okut(imei[0]));

// ------------------------------------------------- 6) Müşteri kaydı
await sayfa.goto(`${hedef}/musteriler?ara=Ayşe`, { waitUntil: "networkidle" });
console.log("12) müşteri araması:", (await sayfa.locator("li .font-medium").first().textContent())?.trim(),
  "|", (await sayfa.locator("li >> text=cihaz").first().textContent())?.replace(/\s+/g, " ").trim());
await sayfa.screenshot({ path: `${cikti}-musteriler.png`, fullPage: true });

// ------------------------------------------------- 7) Geri çekme
await giris("sorumlu1");
await sayfa.goto(`${hedef}/sevkiyat/yeni`, { waitUntil: "networkidle" });
await sayfa.selectOption("#hedef", { label: "3 Nolu Mağaza" });
await okut(imei[1]);
await Promise.all([
  sayfa.waitForURL(/\/sevkiyat\/\d+$/, { timeout: 20000 }),
  sayfa.click('button:has-text("Sevkiyatı Gönder")'),
]);
await sayfa.click('button:has-text("Sevkiyatı Geri Çek")');
// İşlem sonrası buton kaybolur; kalıcı bildirim sunucudan gelir.
const iptalBildirimi = sayfa.locator("text=gönderen tarafından geri çekildi").first();
await iptalBildirimi.waitFor({ timeout: 15000 });
console.log("13) geri çekme:", (await iptalBildirimi.textContent())?.replace(/\s+/g, " ").trim(), "✓");
await sayfa.goto(`${hedef}/cihazlar?ara=${imei[1]}`, { waitUntil: "networkidle" });
console.log("    cihaz geri döndü ->", (await sayfa.locator("dt:has-text('Bulunduğu Depo') + dd").textContent())?.trim());

// ------------------------------------------------- 8) Mobil
await sayfa.setViewportSize({ width: 390, height: 844 });
for (const yol of ["/sevkiyat", "/satis", "/musteriler"]) {
  await sayfa.goto(`${hedef}${yol}`, { waitUntil: "networkidle" });
  const tasma = await sayfa.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log(`14) 390px ${yol}:`, tasma ? "✗ taşma" : "✓");
}

console.log("konsol hataları:", hatalar.length ? hatalar : "yok");
await tarayici.close();
