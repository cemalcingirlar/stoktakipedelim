// Kategori ve tedarikçi yönetimi testi.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/ayarlar";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1440, height: 1000 }, locale: "tr-TR" });
const hatalar = [];

/** Kategori/tedarikçi kartını, içindeki ad girdisinin değerinden bulur. */
function kartiBul(ad) {
  return sayfa
    .locator("div.rounded-xl.border.bg-white.shadow-sm")
    .filter({ has: sayfa.locator(`input[value="${ad}"]`) })
    .first();
}

/** Bir uyarı/başarı mesajının (istenirse belirli bir kart içinde) dolmasını bekler. */
async function mesajiBekle(secici, kapsam = sayfa) {
  const hedef = kapsam.locator(secici).first();
  await hedef.waitFor({ state: "visible", timeout: 15000 });
  await sayfa.waitForFunction(
    () => true,
    undefined,
    { timeout: 1000 },
  ).catch(() => {});
  return (await hedef.textContent())?.trim();
}
sayfa.on("console", (m) => { if (m.type() === "error") hatalar.push(m.text()); });
sayfa.on("pageerror", (e) => hatalar.push(String(e)));

await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
await sayfa.fill("#kullaniciAdi", "admin");
await sayfa.fill("#sifre", "Stok2026!");
await Promise.all([sayfa.waitForURL("**/panel"), sayfa.click('button[type="submit"]')]);

// --- Kategori ekleme
await sayfa.goto(`${hedef}/ayarlar/kategoriler`, { waitUntil: "networkidle" });
const yeniAd = `Test Kategori ${Date.now() % 100000}`;
await sayfa.fill("#yeniKategoriAd", yeniAd);
await sayfa.check('input[name="seriNoZorunlu"]');
await sayfa.click('button:has-text("Ekle")');
await sayfa.waitForSelector(`text=${yeniAd}`, { timeout: 15000 });
console.log("1) kategori eklendi:", yeniAd, "✓");

// --- Aynı isimle tekrar eklenememeli
await sayfa.fill("#yeniKategoriAd", yeniAd);
await sayfa.click('button:has-text("Ekle")');
console.log("2) tekrarlı kategori reddi:", await mesajiBekle('[role="alert"]'), "✓");

// --- Alt kategori ekleme (yeni kategorinin kartında)
const kart = kartiBul(yeniAd);
await kart.locator('input[placeholder="Yeni alt kategori"]').fill("Test Alt");
await kart.locator('button:has-text("+ Alt Kategori")').click();
await sayfa.waitForSelector("text=Test Alt", { timeout: 15000 });
console.log("3) alt kategori eklendi ✓");

// --- Fatura ekranında yeni kategori görünmeli
// Kategori seçicisi ürün kartının içinde; kart ancak barkod okutunca açılıyor.
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
await sayfa.fill("#okutma", "KATTEST0001");
await sayfa.press("#okutma", "Enter");
await sayfa.waitForTimeout(1200);
const urunKarti = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
const secenekler = await urunKarti.locator("select").first().locator("option").allTextContents();
console.log("4) fatura ekranı kategorileri:", secenekler.filter(Boolean).join(", "));
console.log("   yeni kategori listede:", secenekler.some((s) => s.includes(yeniAd)) ? "✓" : "✗");

// --- Kategori silme (cihazı yok, gerçekten silinmeli)
await sayfa.goto(`${hedef}/ayarlar/kategoriler`, { waitUntil: "networkidle" });
// Cihazı olmayan kategori gerçekten silinir; kartın kaybolması geri bildirimdir.
await kartiBul(yeniAd).locator('button:has-text("Kategoriyi Sil")').click();
await kartiBul(yeniAd).waitFor({ state: "detached", timeout: 15000 });
console.log("5) cihazsız kategori silindi (kart kayboldu) ✓");

// --- Cihazı olan kategori silinmemeli, pasife alınmalı
// Önce "Cep Telefonu" kategorisine bir cihaz girelim; aksi halde kategori
// cihazsız sayılır ve pasife alınmak yerine gerçekten silinir.
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
await sayfa.fill("#okutma", "KATCIHAZ001");
await sayfa.press("#okutma", "Enter");
await sayfa.waitForTimeout(1200);
const cihazKarti = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
await cihazKarti.locator("select").first().selectOption({ label: "Cep Telefonu" });
await cihazKarti.locator("select").nth(1).selectOption({ index: 1 });
const cihazMetinleri = cihazKarti.locator('input[type="text"], input:not([type])');
await cihazMetinleri.nth(1).fill("Test Marka");
await cihazMetinleri.nth(2).fill("Test Model");
await cihazKarti.locator('input[inputmode="decimal"]').fill("1.000,00");
const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
await imeiKutusu.fill(`35${Date.now()}`.slice(0, 15));
await imeiKutusu.press("Enter");
await sayfa.waitForTimeout(600);
await sayfa.selectOption("#tedarikciId", { index: 1 });
await sayfa.fill("#faturaNo", `KAT-${Date.now()}`);
await sayfa.selectOption("#magazaId", { index: 1 });
await sayfa.click('button:has-text("Faturayı Kaydet")');
await sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }).catch(() => {});

await sayfa.goto(`${hedef}/ayarlar/kategoriler`, { waitUntil: "networkidle" });
await kartiBul("Cep Telefonu").locator('button:has-text("Kategoriyi Sil")').click();
console.log("6) cihazlı kategori:", await mesajiBekle('[role="status"]', kartiBul("Cep Telefonu")));
await sayfa.waitForFunction(
  () => {
    const k = [...document.querySelectorAll('input[name="aktif"]')];
    const hedef = k.find((e) => e.form?.querySelector('input[value="Cep Telefonu"]'));
    return hedef ? !hedef.checked : false;
  },
  undefined,
  { timeout: 10000 },
).then(() => console.log("   onay kutusu pasife döndü ✓"))
 .catch(() => console.log("   onay kutusu pasife döndü ✗"));
// geri aktif et
await kartiBul("Cep Telefonu").locator('input[name="aktif"]').check();
await kartiBul("Cep Telefonu").getByRole("button", { name: "Kaydet", exact: true }).click();
await sayfa.waitForTimeout(2000);
const geriAktif = await kartiBul("Cep Telefonu").locator('input[name="aktif"]').isChecked();
console.log("   tekrar aktif edildi:", geriAktif ? "✓" : "✗");
await sayfa.screenshot({ path: `${cikti}-kategoriler.png`, fullPage: true });

// --- Tedarikçi ekleme
await sayfa.goto(`${hedef}/ayarlar/tedarikciler`, { waitUntil: "networkidle" });
const tedAd = `Test Tedarikçi ${Date.now() % 100000}`;
await sayfa.fill("#yeniAd", tedAd);
await sayfa.fill("#yeniTelefon", "0212 555 00 00");
await sayfa.click('button:has-text("Tedarikçi Ekle")');
await sayfa.waitForSelector(`input[value="${tedAd}"]`, { timeout: 15000 });
console.log("7) tedarikçi eklendi:", tedAd, "✓");
await sayfa.screenshot({ path: `${cikti}-tedarikciler.png`, fullPage: true });

// --- Personel ayarlara giremez
await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
await sayfa.context().clearCookies();
await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
await sayfa.fill("#kullaniciAdi", "sorumlu1");
await sayfa.fill("#sifre", "Stok2026!");
await Promise.all([sayfa.waitForURL("**/panel"), sayfa.click('button[type="submit"]')]);
await sayfa.goto(`${hedef}/ayarlar/kategoriler`, { waitUntil: "networkidle" });
console.log("8) sorumlu /ayarlar/kategoriler ->", new URL(sayfa.url()).pathname, sayfa.url().endsWith("/panel") ? "✓" : "✗");

console.log("konsol hataları:", hatalar.length ? hatalar : "yok");
await tarayici.close();
