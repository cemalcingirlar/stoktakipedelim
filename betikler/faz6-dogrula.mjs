// Faz 6 testi: yedekleme ekranı, yetki, hata bildirimi ve cron ucu.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/faz6";
const SIFRE = "Stok2026!";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1500, height: 1100 }, locale: "tr-TR" });
const hatalar = [];
sayfa.on("console", (m) => { if (m.type() === "error") hatalar.push(m.text()); });
sayfa.on("pageerror", (e) => hatalar.push(String(e)));

async function giris(kullanici) {
  await sayfa.context().clearCookies();
  await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sayfa.fill("#kullaniciAdi", kullanici);
  await sayfa.fill("#sifre", SIFRE);
  await Promise.all([sayfa.waitForURL("**/panel", { timeout: 20000 }), sayfa.click('button[type="submit"]')]);
}

await giris("admin");

// 1) Ayarlar hub'ında yedekleme bağlantısı
await sayfa.goto(`${hedef}/ayarlar`, { waitUntil: "networkidle" });
const yedekKart = sayfa.locator('a[href="/ayarlar/yedekleme"]');
console.log("1) ayarlar hub'ında yedekleme kartı:", (await yedekKart.count()) > 0 ? "✓" : "✗");
console.log("   kart metni:", (await yedekKart.textContent())?.replace(/\s+/g, " ").trim());

// 2) Yedekleme ekranı — yapılandırılmamış durum
await sayfa.goto(`${hedef}/ayarlar/yedekleme`, { waitUntil: "networkidle" });
const uyari = await sayfa.locator("text=Yedekleme kapalı").first().textContent().catch(() => null);
console.log("2) yapılandırma uyarısı:", uyari ? "✓ var" : "✗ yok");
const yontem = await sayfa.locator("dt:has-text('Yöntem') + dd").textContent();
const cronRozeti = await sayfa.locator("dt:has-text('Cron anahtarı') + dd").textContent();
console.log("   yöntem:", yontem?.trim(), "| cron anahtarı:", cronRozeti?.trim());

// 3) Butonlar yapılandırma olmadan devre dışı
const yedekleBtn = sayfa.locator('button:has-text("Şimdi Yedekle")');
const sinaBtn = sayfa.locator('button:has-text("Bağlantıyı Sına")');
console.log("3) 'Şimdi Yedekle' devre dışı:", (await yedekleBtn.isDisabled()) ? "✓" : "✗");
console.log("   'Bağlantıyı Sına' devre dışı:", (await sinaBtn.isDisabled()) ? "✓" : "✗");

// 4) Başarısız denemeler geçmişte görünüyor mu (API testinden gelenler)
const gecmisSatir = await sayfa.locator("table tbody tr").count();
console.log("4) yedek geçmişi satırı:", gecmisSatir);
if (gecmisSatir > 0) {
  const ilk = await sayfa.locator("table tbody tr").first().textContent();
  console.log("   son kayıt:", ilk?.replace(/\s+/g, " ").trim().slice(0, 120));
}
const hataSayisi = await sayfa.locator("dt:has-text('Başarısız deneme') + dd").textContent();
console.log("   başarısız deneme sayacı:", hataSayisi?.trim());

// 5) Kurulum adımları ekranda
const adimlar = await sayfa.locator("h3").allTextContents();
console.log("5) kurulum adımları:", adimlar.join(" | "));
await sayfa.screenshot({ path: `${cikti}-yedekleme.png`, fullPage: true });

// 6) Log kaydı düşmüş mü
await sayfa.goto(`${hedef}/ayarlar/loglar?islem=YEDEK_AL`, { waitUntil: "networkidle" });
const logAdet = (await sayfa.locator("div.border-b", { hasText: "kayıt" }).first().textContent())?.trim();
console.log("6) yedekleme logu:", logAdet, "| ilk:", (await sayfa.locator("tbody tr td:nth-child(4)").first().textContent())?.trim().slice(0, 90));

// 7) Personel erişemez
await giris("personel1");
await sayfa.goto(`${hedef}/ayarlar/yedekleme`, { waitUntil: "networkidle" });
console.log("7) personel /ayarlar/yedekleme ->", new URL(sayfa.url()).pathname, sayfa.url().endsWith("/panel") ? "✓" : "✗");

// 8) Cron ucu oturum çerezi olmadan çalışmalı (proxy yönlendirmesi dışında)
const cevap = await sayfa.request.get(`${hedef}/api/yedek`);
console.log("8) /api/yedek GET (çerezsiz):", cevap.status(), (await cevap.text()).slice(0, 60),
  cevap.status() === 200 ? "✓" : "✗");
const yetkisiz = await sayfa.request.post(`${hedef}/api/yedek`);
console.log("   anahtarsız POST:", yetkisiz.status(), yetkisiz.status() === 401 ? "✓" : "✗");

// 9) Mobil
await giris("admin");
await sayfa.setViewportSize({ width: 390, height: 844 });
await sayfa.goto(`${hedef}/ayarlar/yedekleme`, { waitUntil: "networkidle" });
const tasma = await sayfa.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
console.log("9) 390px /ayarlar/yedekleme:", tasma ? "✗ taşma" : "✓");

console.log("konsol hataları:", hatalar.length ? hatalar : "yok");
await tarayici.close();
