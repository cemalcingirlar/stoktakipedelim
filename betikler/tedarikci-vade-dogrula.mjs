// Fatura ekranında hızlı tedarikçi ekleme ve elle vade tarihi testi.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/tedarikcivade";
const SIFRE = "Stok2026!";

const damga = Date.now().toString().slice(-8);
const TEDARIKCI = `Deneme Tedarik ${damga}`;
const FATURA_NO = `VD-${damga}`;
const IMEI = `35${damga}0001`.slice(0, 15);

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1500, height: 1100 }, locale: "tr-TR" });
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

try {
  await giris("admin");
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });

  // 1) hızlı tedarikçi paneli
  const oncekiSecenek = await sayfa.locator("#tedarikciId option").count();
  await sayfa.click('button:has-text("+ Yeni tedarikçi")');
  kontrol("yeni tedarikçi paneli açılıyor",
    await sayfa.locator('input[placeholder="Tedarikçi adı *"]').isVisible());

  await sayfa.fill('input[placeholder="Tedarikçi adı *"]', TEDARIKCI);
  await sayfa.fill('input[placeholder="Telefon (isteğe bağlı)"]', "0212 555 11 22");
  await sayfa.click('button:has-text("Tedarikçiyi Ekle ve Seç")');
  await sayfa.waitForTimeout(2000);

  const sonrakiSecenek = await sayfa.locator("#tedarikciId option").count();
  kontrol("tedarikçi listeye eklendi", sonrakiSecenek === oncekiSecenek + 1,
    `${oncekiSecenek} → ${sonrakiSecenek}`);

  const seciliMetin = await sayfa.locator("#tedarikciId option:checked").textContent();
  kontrol("yeni tedarikçi otomatik seçildi", (seciliMetin ?? "").includes(damga), seciliMetin?.trim());

  // 2) elle vade tarihi
  await sayfa.fill("#faturaTarihi", "2026-03-01");
  await sayfa.selectOption("#vadeGun", "ozel");
  kontrol("özel tarih seçilince tarih kutusu çıkıyor",
    await sayfa.locator("#vadeTarihi").isVisible());

  const altSinir = await sayfa.locator("#vadeTarihi").getAttribute("min");
  kontrol("vade tarihi fatura tarihinden öncesine kapalı", altSinir === "2026-03-01", String(altSinir));

  await sayfa.fill("#vadeTarihi", "2026-04-07"); // 37 gün

  // 3) fatura satırı ve kayıt
  await sayfa.fill("#faturaNo", FATURA_NO);
  await sayfa.selectOption("#magazaId", { index: 1 });
  // Barkod okut, ürün bilgilerini doldur, IMEI'yi ekle.
  await sayfa.fill("#okutma", `VDBR${damga}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1200);

  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  const metinler = kart.locator('input[type="text"], input:not([type])');
  await metinler.nth(1).fill("Samsung");
  await metinler.nth(2).fill("Galaxy S24");
  await kart.locator('input[inputmode="decimal"]').fill("31.750,25");
  const imeiKutusu = kart.locator('input[id^="imei-"]');
  await imeiKutusu.fill(IMEI);
  await imeiKutusu.press("Enter");
  await sayfa.waitForTimeout(600);

  await sayfa.click('button:has-text("Faturayı Kaydet")');
  await sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }).catch(() => {});
  const kaydedildi = /\/faturalar\/\d+$/.test(sayfa.url());
  kontrol(
    "fatura kaydedildi",
    kaydedildi,
    kaydedildi ? sayfa.url() : (await sayfa.locator('[role="alert"]').allTextContents()).join(" | "),
  );

  const metin = (await sayfa.locator("body").textContent()) ?? "";
  kontrol("vade 37 gün olarak hesaplandı", metin.includes("37 gün"),
    metin.includes("37 gün") ? "37 gün" : metin.slice(0, 120).replace(/\s+/g, " "));
  kontrol("vade tarihi 07.04.2026 yazıyor", metin.includes("07.04.2026"));
  kontrol("yeni tedarikçi faturada görünüyor", metin.includes(TEDARIKCI));

  // 4) ayarlarda da kayıtlı olmalı
  await sayfa.goto(`${hedef}/ayarlar/tedarikciler`, { waitUntil: "networkidle" });
  const ayarMetni = (await sayfa.locator("body").textContent()) ?? "";
  kontrol("tedarikçi Ayarlar ekranında da var", ayarMetni.includes(TEDARIKCI));

  // 5) cihaz listesinde vade etiketi bozulmamalı
  await sayfa.goto(`${hedef}/cihazlar?ara=${IMEI}`, { waitUntil: "networkidle" });
  const listeMetni = (await sayfa.locator("body").textContent()) ?? "";
  kontrol("cihaz listesinde 37 gün etiketi görünüyor", listeMetni.includes("37 gün"));

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
