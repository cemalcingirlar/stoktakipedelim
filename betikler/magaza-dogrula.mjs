// Mağaza yönetimi testi: ekleme, kod tekilliği, düzenleme, stok koruması, silme.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/magaza";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1440, height: 1000 }, locale: "tr-TR" });
const hatalar = [];
sayfa.on("console", (m) => { if (m.type() === "error") hatalar.push(m.text()); });
sayfa.on("pageerror", (e) => hatalar.push(String(e)));

function kartiBul(kod) {
  return sayfa
    .locator("div.rounded-xl.border.bg-white.shadow-sm")
    .filter({ has: sayfa.locator(`input[name="kod"][value="${kod}"]`) })
    .first();
}

async function mesajiBekle(secici, kapsam = sayfa) {
  const hedefEl = kapsam.locator(secici).first();
  await hedefEl.waitFor({ state: "visible", timeout: 15000 });
  return (await hedefEl.textContent())?.trim();
}

/** Mesajın beklenen metni içermesini bekler; ardışık gönderimlerde eski mesajı okumayı önler. */
async function metniBekle(secici, parca, kapsam = sayfa) {
  const hedefEl = kapsam.locator(secici).filter({ hasText: parca }).first();
  await hedefEl.waitFor({ state: "visible", timeout: 15000 });
  return (await hedefEl.textContent())?.trim();
}

async function giris(kullanici) {
  await sayfa.context().clearCookies();
  await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sayfa.fill("#kullaniciAdi", kullanici);
  await sayfa.fill("#sifre", "Stok2026!");
  await Promise.all([sayfa.waitForURL("**/panel"), sayfa.click('button[type="submit"]')]);
}

await giris("admin");

// --- Yeni mağaza ekleme (küçük harf girip büyüğe çevrildiğini de doğrula)
await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
const kod = `T${Date.now() % 10000}`;
const ad = `Test Mağaza ${kod}`;
await sayfa.fill("#yeniKod", kod.toLowerCase());
await sayfa.fill("#yeniAd", ad);
await sayfa.fill("#yeniTelefon", "0212 111 22 33");
await sayfa.click('button:has-text("Mağaza Ekle")');
await kartiBul(kod).waitFor({ state: "visible", timeout: 15000 });
console.log("1) mağaza eklendi:", kod, "(küçük harf girildi, büyüğe çevrildi ✓)");
console.log("   kullanıcı uyarısı:", (await kartiBul(kod).locator("text=sevkiyat kabulü").textContent())?.trim());

// --- Aynı kod ikinci kez eklenememeli
await sayfa.fill("#yeniKod", kod);
await sayfa.fill("#yeniAd", "Başka Ad");
await sayfa.click('button:has-text("Mağaza Ekle")');
console.log("2) tekrarlı kod reddi:", await metniBekle('[role="alert"]', "zaten var"), "✓");

// --- Geçersiz kod
await sayfa.fill("#yeniKod", "AB CD!");
await sayfa.fill("#yeniAd", "Geçersiz");
await sayfa.click('button:has-text("Mağaza Ekle")');
console.log("3) geçersiz kod reddi:", await metniBekle('[role="alert"]', "yalnız harf"), "✓");

// --- Yeni mağaza her yerde görünmeli
await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
const depoCipleri = await sayfa.locator("a", { hasText: ad }).count();
console.log("4) cihaz listesi depo filtresinde:", depoCipleri > 0 ? "✓" : "✗");
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
const depoSecenek = await sayfa.locator("#magazaId option").allTextContents();
console.log("   fatura ekranı depoları:", depoSecenek.filter(Boolean).join(", "));
await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
console.log("   panelde mağaza kartı:", (await sayfa.locator("a", { hasText: ad }).count()) > 0 ? "✓" : "✗");

// --- Düzenleme
await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
await kartiBul(kod).locator('input[name="ad"]').fill(`${ad} Şube`);
await kartiBul(kod).locator('button:has-text("Kaydet")').click();
console.log("5) düzenleme:", await mesajiBekle('[role="status"]', kartiBul(kod)), "✓");

// --- Stoğu olan mağaza pasife alınamamalı (1 Nolu Mağaza'da cihaz var)
await kartiBul("M1").locator('input[name="aktif"]').uncheck();
await kartiBul("M1").locator('button:has-text("Kaydet")').click();
console.log("6) stoklu mağazayı pasife alma:", await mesajiBekle('[role="alert"]', kartiBul("M1")), "✓");

// --- Stoğu olan mağaza silinememeli
await kartiBul("M1").locator('button:has-text("Mağazayı Sil")').click();
console.log("7) stoklu mağazayı silme:", await mesajiBekle('[role="alert"]', kartiBul("M1")), "✓");

// --- Boş mağaza silinebilmeli
await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
await kartiBul(kod).locator('button:has-text("Mağazayı Sil")').click();
await kartiBul(kod).waitFor({ state: "detached", timeout: 15000 });
console.log("8) boş mağaza silindi (kart kayboldu) ✓");
await sayfa.screenshot({ path: `${cikti}-magazalar.png`, fullPage: true });

// --- Personel erişememeli
await giris("personel1");
await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
console.log("9) personel /ayarlar/magazalar ->", new URL(sayfa.url()).pathname, sayfa.url().endsWith("/panel") ? "✓" : "✗");

console.log("konsol hataları:", hatalar.length ? hatalar : "yok");
await tarayici.close();
