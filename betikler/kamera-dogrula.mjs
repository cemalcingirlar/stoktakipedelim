// Kamera ile okuma testi.
// Chromium'a sahte kamera verilir; görüntüdeki kodun uygulamaya işlendiği doğrulanır.
//
// Sahte görüntü betikler/kamera-test-goruntusu.mjs ile üretilir. @zxing'in JS sürümü
// yalnız QR üretebildiği için test görüntüsü QR; okuma tarafı CODE_128 ve EAN
// dahil tüm biçimleri destekliyor, o kısım kütüphanenin kendi kapsamında.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/kamera";
const SIFRE = "Stok2026!";

const damga = Date.now().toString().slice(-8);
const IMEI = `35${damga}00001`.slice(0, 15);
const BARKOD = `KAM${damga}`;

const klasor = await mkdtemp(join(tmpdir(), "kamera-"));
const imeiVideo = join(klasor, "imei.y4m");
execFileSync("node", ["betikler/kamera-test-goruntusu.mjs", IMEI, imeiVideo], { stdio: "inherit" });

const tarayici = await chromium.launch({
  ...(process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {}),
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-video-capture=${imeiVideo}`,
  ],
});
const baglam = await tarayici.newContext({
  viewport: { width: 420, height: 880 },   // telefon boyutu
  locale: "tr-TR",
  permissions: ["camera"],
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

try {
  await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sayfa.fill("#kullaniciAdi", "admin");
  await sayfa.fill("#sifre", SIFRE);
  await Promise.all([sayfa.waitForURL("**/panel"), sayfa.click('button[type="submit"]')]);

  // --- Fatura ekranı: barkod kutusunda kamera düğmesi
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  kontrol("barkod kutusunda kamera düğmesi var",
    (await sayfa.locator('button:has-text("📷 Kamera")').count()) >= 1);

  // Ürün kartını elle aç (barkodu klavyeden yazarak), IMEI'yi kamerayla okut.
  await sayfa.fill("#okutma", BARKOD);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1500);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill("Samsung");
  await alanlar.nth(2).fill("Galaxy A55");
  await kart.locator('input[inputmode="decimal"]').fill("10.000");

  kontrol("ürün kartında kamera düğmesi var",
    (await kart.locator('button:has-text("📷 Kamera")').count()) === 1);

  await kart.locator('button:has-text("📷 Kamera")').click();
  await sayfa.waitForSelector('[role="dialog"]', { timeout: 15000 });
  kontrol("kamera penceresi açıldı", await sayfa.locator('[role="dialog"]').isVisible());

  // Çözümleyici indirilip görüntüyü okuyana kadar bekle.
  await sayfa.waitForFunction(
    () => document.querySelectorAll('[role="dialog"] ul li').length > 0,
    undefined,
    { timeout: 40000 },
  ).catch(() => {});
  const okunanlar = await sayfa.locator('[role="dialog"] ul li').allTextContents();
  kontrol("kamera koddu okudu", okunanlar.some((t) => t.trim() === IMEI),
    okunanlar.map((t) => t.trim()).join(", ") || "(okunmadı)");

  await sayfa.locator('[role="dialog"] button:has-text("Kapat")').click();
  await sayfa.waitForTimeout(500);
  kontrol("kamera penceresi kapandı", (await sayfa.locator('[role="dialog"]').count()) === 0);

  const rozetler = await kart.locator("ul li").allTextContents();
  kontrol("okunan IMEI ürün kartına eklendi", rozetler.some((t) => t.includes(IMEI)),
    rozetler.join(" | ") || "(boş)");

  // --- Sayım ekranındaki paylaşılan okutma kutusunda da kamera olmalı
  await sayfa.goto(`${hedef}/sayim`, { waitUntil: "networkidle" });
  const acikSayim = sayfa.locator('a:has-text("Sayıma Git")').first();
  if (await acikSayim.count()) {
    await acikSayim.click();
    await sayfa.waitForTimeout(1500);
    kontrol("sayım ekranında kamera düğmesi var",
      (await sayfa.locator('button:has-text("📷 Kamera")').count()) === 1);
  } else {
    kontrol("sayım ekranı kontrolü", true, "açık sayım yok, atlandı");
  }

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
