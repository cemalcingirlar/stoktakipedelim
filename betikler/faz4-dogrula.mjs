// Faz 4 testi: mağaza bazlı sayım, canlı sayaçlar, eksik/fazla tespiti, Excel raporu.
import { chromium } from "@playwright/test";
import { readFileSync, existsSync, rmSync } from "node:fs";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/faz4";
const SIFRE = "Stok2026!";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({
  viewport: { width: 1500, height: 1000 },
  locale: "tr-TR",
  acceptDownloads: true,
});
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
  await sayfa.waitForTimeout(500);
  return (await sayfa.locator('[role="status"]').first().textContent())?.trim();
}

async function sayaclar() {
  const metin = await sayfa.locator("div.grid").first().textContent();
  return metin?.replace(/\s+/g, " ").trim();
}

// ------------------------------------------------- Hazırlık: 3 Nolu Mağaza'ya 4 cihaz
await giris("admin");
const imei = Array.from({ length: 4 }, (_, i) => `35${i}${Date.now()}`.slice(0, 15));
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
await sayfa.selectOption("#tedarikciId", { index: 1 });
await sayfa.fill("#faturaNo", `SAYIM-${Date.now()}`);
await sayfa.selectOption("#magazaId", { label: "3 Nolu Mağaza" });
for (const kod of imei) {
  await sayfa.fill("#okutma", kod);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(200);
}
const kartlar = sayfa.locator("form > section").nth(2).locator("> div");
for (let i = 1; i <= 4; i++) {
  const kart = kartlar.nth(i);
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  const m = kart.locator('input[type="text"], input:not([type])');
  await m.nth(0).fill("Oppo");
  await m.nth(1).fill(`A${70 + i}`);
  await kart.locator('input[inputmode="decimal"]').fill("3.000");
}
await Promise.all([
  sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 20000 }),
  sayfa.click('button:has-text("Faturayı Kaydet")'),
]);
console.log("0) hazırlık: 4 cihaz 3 Nolu Mağaza'ya girildi ✓");

// ------------------------------------------------- 1) Sayım başlat
await giris("sorumlu3");
await sayfa.goto(`${hedef}/sayim`, { waitUntil: "networkidle" });
// Seçenek metni "3 Nolu Mağaza — N cihaz" biçiminde; value üzerinden seçiyoruz.
const magazaDeger = await sayfa.locator("#magazaId option", { hasText: "3 Nolu" }).first().getAttribute("value");
await sayfa.selectOption("#magazaId", magazaDeger);
await Promise.all([
  sayfa.waitForURL(/\/sayim\/\d+$/, { timeout: 20000 }),
  sayfa.click('button:has-text("Sayımı Başlat")'),
]);
const sayimUrl = sayfa.url();
console.log("1) sayım başlatıldı ->", new URL(sayimUrl).pathname, "✓");
console.log("   sayaçlar:", await sayaclar());

// ------------------------------------------------- 2) Aynı mağazaya ikinci sayım açılamaz
await sayfa.goto(`${hedef}/sayim`, { waitUntil: "networkidle" });
const secenekMetni = await sayfa.locator("#magazaId option", { hasText: "3 Nolu" }).textContent();
const devreDisi = await sayfa.locator("#magazaId option", { hasText: "3 Nolu" }).isDisabled();
console.log("2) ikinci sayım engeli:", secenekMetni?.trim(), "| devre dışı:", devreDisi ? "✓" : "✗");

// ------------------------------------------------- 3) Okutma senaryoları
await sayfa.goto(sayimUrl, { waitUntil: "networkidle" });
console.log("3) stokta bulundu:", await okut(imei[0]));
console.log("   tekrar okutma:", await okut(imei[0]));
console.log("   ikinci cihaz:", await okut(imei[1]));
console.log("   sayaçlar:", await sayaclar());
console.log("   kayıtsız kod:", await okut("999888777666555"));
await sayfa.screenshot({ path: `${cikti}-sayim-ekrani.png`, fullPage: true });

// Başka mağazanın cihazını okut (1 Nolu Mağaza'daki bir cihazın IMEI'sini bul)
await sayfa.goto(`${hedef}/cihazlar?durum=STOKTA&magaza=1`, { waitUntil: "networkidle" });
const baskaImei = (await sayfa.locator("tbody tr td:nth-child(4)").first().textContent())?.trim();
await sayfa.goto(sayimUrl, { waitUntil: "networkidle" });
if (baskaImei && baskaImei !== "—") {
  console.log("   başka mağaza cihazı:", await okut(baskaImei));
} else {
  console.log("   başka mağaza cihazı: (1 Nolu Mağaza'da stok yok, atlandı)");
}
console.log("   sayaçlar:", await sayaclar());

// ------------------------------------------------- 4) Başka mağaza kullanıcısı sayamaz
await giris("sorumlu2");
await sayfa.goto(sayimUrl, { waitUntil: "networkidle" });
console.log("4) 2 Nolu kullanıcı okutma kutusu:", (await sayfa.locator("#okutmaKutusu").count()) === 0 ? "✓ yok" : "✗ var");
console.log("   uyarı:", (await sayfa.locator("text=yalnızca").first().textContent())?.replace(/\s+/g, " ").trim());

// ------------------------------------------------- 5) Sayımı kapat
await giris("sorumlu3");
await sayfa.goto(sayimUrl, { waitUntil: "networkidle" });
await sayfa.click('button:has-text("Sayımı Kapat")');
await sayfa.locator("text=Tamamlandı").first().waitFor({ timeout: 15000 });
await sayfa.waitForTimeout(800);
console.log("5) sayım kapatıldı, özet:", await sayaclar());
const eksikBasligi = await sayfa.locator("h2", { hasText: "Eksikler" }).textContent();
const fazlaBasligi = await sayfa.locator("h2", { hasText: "Fazlalar" }).textContent();
console.log("   ", eksikBasligi?.trim(), "|", fazlaBasligi?.trim());
await sayfa.screenshot({ path: `${cikti}-sayim-raporu.png`, fullPage: true });

// Kapatılmış sayımda okutma yapılamaz
console.log("6) kapalı sayımda okutma kutusu:", (await sayfa.locator("#okutmaKutusu").count()) === 0 ? "✓ yok" : "✗ var");

// ------------------------------------------------- 7) Excel raporu
const indirme = await Promise.all([
  sayfa.waitForEvent("download", { timeout: 20000 }),
  sayfa.click('a:has-text("Excel")'),
]);
const dosya = indirme[0];
const yol = `${cikti}-rapor.xlsx`;
if (existsSync(yol)) rmSync(yol);
await dosya.saveAs(yol);
const boyut = readFileSync(yol).length;
console.log("7) Excel indirildi:", dosya.suggestedFilename(), `${boyut} bayt`, boyut > 3000 ? "✓" : "✗");

// ------------------------------------------------- 8) Mobil
await sayfa.setViewportSize({ width: 390, height: 844 });
for (const yolAdi of ["/sayim", new URL(sayimUrl).pathname]) {
  await sayfa.goto(`${hedef}${yolAdi}`, { waitUntil: "networkidle" });
  const tasma = await sayfa.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log(`8) 390px ${yolAdi}:`, tasma ? "✗ taşma" : "✓");
}

console.log("konsol hataları:", hatalar.length ? hatalar : "yok");
await tarayici.close();
