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
await kartiBul(kod).getByRole("button", { name: "Kaydet", exact: true }).click();
console.log("5) düzenleme:", await mesajiBekle('[role="status"]', kartiBul(kod)), "✓");

// --- Stoğu olan mağaza pasife alınamamalı
// Tohum veride stok yok; kuralı sınamak için 1 Nolu Mağaza'ya bir cihaz
// giriyoruz. Aksi halde mağaza stoksuz sayılır ve pasife alma başarılı olur.
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
await sayfa.fill("#okutma", "MAGTEST0001");
await sayfa.press("#okutma", "Enter");
await sayfa.waitForTimeout(1200);
const stokKarti = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
await stokKarti.locator("select").first().selectOption({ label: "Cep Telefonu" });
await stokKarti.locator("select").nth(1).selectOption({ index: 1 });
const stokMetinleri = stokKarti.locator('input[type="text"], input:not([type])');
await stokMetinleri.nth(1).fill("Test Marka");
await stokMetinleri.nth(2).fill("Test Model");
await stokKarti.locator('input[inputmode="decimal"]').fill("1.000,00");
const stokImei = sayfa.locator('input[id^="imei-"]').first();
await stokImei.fill(`35${Date.now()}`.slice(0, 15));
await stokImei.press("Enter");
await sayfa.waitForTimeout(600);
await sayfa.selectOption("#tedarikciId", { index: 1 });
await sayfa.fill("#faturaNo", `MAG-${Date.now()}`);
await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
await sayfa.click('button:has-text("Faturayı Kaydet")');
await sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }).catch(() => {});

await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
await kartiBul("M1").locator('input[name="aktif"]').uncheck();
await kartiBul("M1").getByRole("button", { name: "Kaydet", exact: true }).click();
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
