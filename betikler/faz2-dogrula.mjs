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
const faturaNo = `TEST-${Date.now()}`;

// Üst şerit toplamı veritabanındaki tüm cihazları kapsar; sabit bir değer
// beklemek yerine bu faturanın toplamı kadar arttığını doğruluyoruz.
async function toplamAlisDegeri() {
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  const metin = (await sayfa.locator("text=Toplam alış değeri").textContent()) ?? "";
  const sayi = metin.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(sayi) || 0;
}
const oncekiToplam = await toplamAlisDegeri();
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
await sayfa.selectOption("#tedarikciId", { index: 1 });
await sayfa.fill("#faturaNo", faturaNo);
await sayfa.fill("#faturaTarihi", "2026-01-15");   // 21 gün vade -> çoktan geçti
await sayfa.selectOption("#magazaId", { index: 1 });
await sayfa.selectOption("#vadeGun", "21");

// Barkod okut, ürün bilgilerini doldur, IMEI'leri arka arkaya okut.
// Fiyat ürün kartı başına olduğundan iki farklı fiyat için iki barkod kullanılır.
const barkod = [`BR1${Date.now()}`.slice(0, 14), `BR2${Date.now()}`.slice(0, 14)];

async function urunEkle(kod, marka, model, fiyat, seriNo) {
  await sayfa.fill("#okutma", kod);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1200);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").last();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ label: "Sıfır" });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(marka);
  await alanlar.nth(2).fill(model);
  await kart.locator('input[inputmode="decimal"]').fill(fiyat);
  if (seriNo) {
    const imeiKutusu = kart.locator('input[id^="imei-"]');
    await imeiKutusu.fill(seriNo);
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(600);
  }
  return kart;
}

await urunEkle(barkod[0], "Samsung", "Galaxy A50", "12.500,50", imei[0]);
await urunEkle(barkod[1], "Samsung", "Galaxy A51", "9.750", imei[1]);

const sayacMetni = (await sayfa.locator('h2:has-text("Cihazlar")').textContent()) ?? "";
console.log("2) ürün/cihaz sayacı:", sayacMetni.replace(/\s+/g, " ").trim(),
  sayacMetni.includes("2 ürün") && sayacMetni.includes("2 cihaz") ? "✓" : "✗");

await sayfa.screenshot({ path: `${cikti}-fatura-formu.png`, fullPage: true });

await sayfa.click('button:has-text("Faturayı Kaydet")');
await sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 20000 });
console.log("3) fatura kaydedildi ->", new URL(sayfa.url()).pathname, "✓");
await sayfa.screenshot({ path: `${cikti}-fatura-detay.png`, fullPage: true });

// --- Aynı IMEI ikinci kez okutulamaz (okutma anında engellenir)
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
await sayfa.selectOption("#tedarikciId", { index: 1 });
await sayfa.fill("#faturaNo", `${faturaNo}-B`);
await sayfa.selectOption("#magazaId", { index: 1 });
const kartB = await urunEkle(barkod[0], "Samsung", "Galaxy A50", "1000", imei[0]);
const imeiSayisi = await kartB.locator("ul li").count();
const uyariMetni = (await sayfa.locator('[role="alert"]').allTextContents()).join(" ");
console.log("4) tekrarlı IMEI reddi:", imeiSayisi === 0 ? "✓ eklenmedi" : "✗ eklendi",
  "|", uyariMetni.trim().slice(0, 80));

// --- Seri no zorunluluğu: IMEI okutulmayan ürün faturaya girmez
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
await sayfa.selectOption("#tedarikciId", { index: 1 });
await sayfa.fill("#faturaNo", `${faturaNo}-C`);
await sayfa.selectOption("#magazaId", { index: 1 });
const kartC = await urunEkle(`BR3${Date.now()}`.slice(0, 14), "Apple", "iPhone 15", "50000", null);
const kartUyarisi = (await kartC.locator("p.text-amber-800").textContent().catch(() => "")) ?? "";
console.log("5) IMEI'siz ürün uyarısı:", kartUyarisi.trim() || "(yok)",
  kartUyarisi.includes("faturaya eklenmez") ? "✓" : "✗");
await sayfa.click('button:has-text("Faturayı Kaydet")');
await sayfa.waitForSelector('[role="alert"]', { timeout: 15000 });
console.log("   sunucu reddi:", (await sayfa.textContent('[role="alert"] p'))?.trim(), "✓");

// --- Cihaz listesi
await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
const satirlar = await sayfa.locator("tbody tr").count();
const kirmiziSatir = await sayfa.locator("tbody tr.bg-red-50").count();
console.log("6) liste satırı:", satirlar, "| vadesi geçen (kırmızı):", kirmiziSatir, kirmiziSatir >= 2 ? "✓" : "✗");
const sonrakiToplam = await toplamAlisDegeri();
const artis = Number((sonrakiToplam - oncekiToplam).toFixed(2));
console.log("   toplam alış değeri artışı:", artis, "TL", artis === 22250.5 ? "✓" : "✗ (beklenen 22250.5)");
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
