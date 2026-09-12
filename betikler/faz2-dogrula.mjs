// Faz 2 uçtan uca testi: alış faturası girişi, cihaz listesi, filtre, IMEI arama, vade rengi.
// Kullanım: npm run dev  &&  node betikler/faz2-dogrula.mjs
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/faz2";
const SIFRE = "Stok2026!";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1600, height: 1000 }, locale: "tr-TR" });

const hatalar = [];
sayfa.on("console", (m) => { if (m.type() === "error") hatalar.push(m.text()); });
sayfa.on("pageerror", (e) => hatalar.push(String(e)));

async function giris(kullanici) {
  await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sayfa.fill("#kullaniciAdi", kullanici);
  await sayfa.fill("#sifre", SIFRE);
  await Promise.all([
    sayfa.waitForURL("**/panel", { timeout: 20000 }),
    sayfa.click('button[type="submit"]'),
  ]);
}

const imei = [`3510${Date.now()}`.slice(0, 15), `3520${Date.now() + 1}`.slice(0, 15)];

await giris("admin");
console.log("1) admin girişi ✓");

// --- Vadeli fatura: vadesi çoktan geçmiş bir tarih seçilir ki satır kırmızı olsun
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
const faturaNo = `TEST-${Date.now()}`;
await sayfa.selectOption("#tedarikciId", { index: 1 });
await sayfa.fill("#faturaNo", faturaNo);
await sayfa.fill("#faturaTarihi", "2026-01-15");   // 21 gün vade -> çoktan geçti
await sayfa.selectOption("#magazaId", { index: 1 });
await sayfa.selectOption("#vadeGun", "21");

// Barkod okutma ile iki satır
await sayfa.fill("#okutma", imei[0]);
await sayfa.press("#okutma", "Enter");
await sayfa.fill("#okutma", imei[1]);
await sayfa.press("#okutma", "Enter");
const satirSayisi = await sayfa.locator("text=/^\\d+\\. cihaz$/").count();
console.log("2) okutma ile satır sayısı:", satirSayisi, satirSayisi === 2 ? "✓" : "✗");

// Satırları doldur (kategori "Cep Telefonu" -> seri no zorunlu)
for (let i = 0; i < 2; i++) {
  const kart = sayfa.locator("form > section").nth(2).locator("> div").nth(i + 1);
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ label: "Sıfır" });
  const metinler = kart.locator('input[type="text"], input:not([type])');
  await metinler.nth(0).fill("Samsung");                 // marka
  await metinler.nth(1).fill(`Galaxy A${50 + i}`);       // model
  await metinler.nth(4).fill("Siyah");                   // renk
  await metinler.nth(5).fill("128 GB");                  // kapasite
  await kart.locator('input[inputmode="decimal"]').fill(i === 0 ? "12.500,50" : "9.750");
}
await sayfa.screenshot({ path: `${cikti}-fatura-formu.png`, fullPage: true });

await Promise.all([
  sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 20000 }),
  sayfa.click('button:has-text("Faturayı Kaydet")'),
]);
console.log("3) fatura kaydedildi ->", new URL(sayfa.url()).pathname, "✓");
await sayfa.screenshot({ path: `${cikti}-fatura-detay.png`, fullPage: true });

// --- Aynı IMEI ikinci kez girilmemeli
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
await sayfa.selectOption("#tedarikciId", { index: 1 });
await sayfa.fill("#faturaNo", `${faturaNo}-B`);
await sayfa.selectOption("#magazaId", { index: 1 });
await sayfa.fill("#okutma", imei[0]);
await sayfa.press("#okutma", "Enter");
const kart0 = sayfa.locator("form > section").nth(2).locator("> div").nth(1);
await kart0.locator("select").first().selectOption({ label: "Cep Telefonu" });
const m0 = kart0.locator('input[type="text"], input:not([type])');
await m0.nth(0).fill("Samsung");
await m0.nth(1).fill("Galaxy A50");
await kart0.locator('input[inputmode="decimal"]').fill("1000");
await sayfa.click('button:has-text("Faturayı Kaydet")');
await sayfa.waitForSelector('[role="alert"]', { timeout: 15000 });
console.log("4) tekrarlı IMEI reddi:", (await sayfa.textContent('[role="alert"] p'))?.trim(), "|",
  (await sayfa.textContent('[role="alert"] li'))?.trim());

// --- Seri no zorunluluğu
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
await sayfa.selectOption("#tedarikciId", { index: 1 });
await sayfa.fill("#faturaNo", `${faturaNo}-C`);
await sayfa.selectOption("#magazaId", { index: 1 });
const kartC = sayfa.locator("form > section").nth(2).locator("> div").nth(1);
await kartC.locator("select").first().selectOption({ label: "Cep Telefonu" });
const mC = kartC.locator('input[type="text"], input:not([type])');
await mC.nth(0).fill("Apple");
await mC.nth(1).fill("iPhone 15");
await kartC.locator('input[inputmode="decimal"]').fill("50000");
await sayfa.click('button:has-text("Faturayı Kaydet")');
await sayfa.waitForSelector('[role="alert"] li', { timeout: 15000 });
console.log("5) IMEI zorunluluğu:", (await sayfa.textContent('[role="alert"] li'))?.trim(), "✓");

// --- Cihaz listesi
await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
const satirlar = await sayfa.locator("tbody tr").count();
const kirmiziSatir = await sayfa.locator("tbody tr.bg-red-50").count();
console.log("6) liste satırı:", satirlar, "| vadesi geçen (kırmızı):", kirmiziSatir, kirmiziSatir >= 2 ? "✓" : "✗");
const seritMetni = (await sayfa.locator("text=Toplam alış değeri").textContent())?.replace(/\s+/g, " ").trim();
const beklenenToplam = "22.250,50 TL";
console.log("   üst şerit:", seritMetni, seritMetni?.includes(beklenenToplam) ? "✓" : `✗ (beklenen ${beklenenToplam})`);
await sayfa.screenshot({ path: `${cikti}-cihaz-listesi.png`, fullPage: true });

// --- IMEI araması doğrudan detaya gitmeli
await sayfa.fill("#ara", imei[0]);
await Promise.all([
  sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 20000 }),
  sayfa.click('button:has-text("Filtrele")'),
]);
console.log("7) IMEI araması ->", new URL(sayfa.url()).pathname, "✓");
console.log("   başlık:", (await sayfa.textContent("h1"))?.trim());
const tarihceAdedi = await sayfa.locator("ol li").count();
console.log("   hareket tarihçesi kaydı:", tarihceAdedi);
await sayfa.screenshot({ path: `${cikti}-cihaz-detay.png`, fullPage: true });

// --- Türkçe karakter duyarsız arama
await sayfa.goto(`${hedef}/cihazlar?ara=GALAXY`, { waitUntil: "networkidle" });
console.log("8) 'GALAXY' araması sonuç:", await sayfa.locator("tbody tr").count());

// --- Durum + vade filtresi
await sayfa.goto(`${hedef}/cihazlar?durum=STOKTA&vade=gecen`, { waitUntil: "networkidle" });
console.log("9) stokta + vadesi geçen:", await sayfa.locator("tbody tr").count());

// --- Personel giriş yapamaz
await giris("personel1");
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
console.log("10) personel /faturalar/yeni ->", new URL(sayfa.url()).pathname, sayfa.url().endsWith("/panel") ? "✓" : "✗");
await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
const uyari = await sayfa.textContent("main span.text-xs").catch(() => null);
console.log("    personel cihazlar uyarısı:", uyari?.trim());

// --- Mobil
await sayfa.setViewportSize({ width: 390, height: 844 });
await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
const tasma = await sayfa.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
console.log("11) 390px sayfa taşması:", tasma ? "✗ VAR" : "✓ yok");

console.log("konsol hataları:", hatalar.length ? hatalar : "yok");
await tarayici.close();
