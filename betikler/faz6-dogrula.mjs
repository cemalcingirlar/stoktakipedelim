// Faz 6 testi: yedekleme ekranı, yetki, hata bildirimi ve cron ucu.
import { chromium } from "@playwright/test";

/** Tablodaki ilk satırın dördüncü hücresi; tablo boşsa çökmek yerine not döner.
 *  Bu okuma yalnız ekrana bilgi basmak için; boş veritabanında satır
 *  olmaması bir hata değil, betiği düşürmemeli. */
async function ilkSatirMetni(sayfa) {
  const hucre = sayfa.locator("tbody tr td:nth-child(4)").first();
  if ((await hucre.count()) === 0) return "(kayıt yok)";
  return ((await hucre.textContent()) ?? "").trim();
}

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

// Betik eskiden beklentileri saymıyordu: ✗ yazan bir kontrol bile çıkış
// kodunu bozmuyor, süit "geçti" görünüyordu. Yedek ucunun yetki kontrolü
// bu yüzden aylarca ✗ yazdığı halde fark edilmemişti.
const sonuclar = [];
function kontrol(ad, gecti, ek = "") {
  sonuclar.push({ ad, gecti, ek });
  console.log(`${gecti ? "✓" : "✗"} ${ad}${ek ? ` — ${ek}` : ""}`);
}

await giris("admin");

// 1) Ayarlar hub'ında yedekleme bağlantısı
await sayfa.goto(`${hedef}/ayarlar`, { waitUntil: "networkidle" });
const yedekKart = sayfa.locator('a[href="/ayarlar/yedekleme"]');
kontrol(
  "ayarlar hub'ında yedekleme kartı var",
  (await yedekKart.count()) > 0,
  (await yedekKart.textContent())?.replace(/\s+/g, " ").trim().slice(0, 90),
);

// 2) Yedekleme ekranı — yapılandırılmamış durum
await sayfa.goto(`${hedef}/ayarlar/yedekleme`, { waitUntil: "networkidle" });
const uyari = await sayfa.locator("text=Yedekleme kapalı").first().textContent().catch(() => null);
kontrol("yapılandırılmamış kurulumda uyarı çıkıyor", Boolean(uyari), uyari?.trim() ?? "(yok)");
const yontem = (await sayfa.locator("dt:has-text('Yöntem') + dd").textContent())?.trim() ?? "";
const cronRozeti = (await sayfa.locator("dt:has-text('Cron anahtarı') + dd").textContent())?.trim() ?? "";
kontrol("yöntem satırı dolu", yontem.length > 0, yontem);
kontrol("cron anahtarı durumu yazılı", cronRozeti.length > 0, cronRozeti);

// 3) Butonlar yapılandırma olmadan devre dışı
const yedekleBtn = sayfa.locator('button:has-text("Şimdi Yedekle")');
const sinaBtn = sayfa.locator('button:has-text("Bağlantıyı Sına")');
kontrol("yapılandırma yokken 'Şimdi Yedekle' kapalı", await yedekleBtn.isDisabled());
kontrol("yapılandırma yokken 'Bağlantıyı Sına' kapalı", await sinaBtn.isDisabled());

// 4) Başarısız denemeler geçmişte görünüyor mu (API testinden gelenler)
const gecmisSatir = await sayfa.locator("table tbody tr").count();
console.log("   yedek geçmişi satırı:", gecmisSatir);
const hataSayisi = (await sayfa.locator("dt:has-text('Başarısız deneme') + dd").textContent())?.trim() ?? "";
kontrol("başarısız deneme sayacı gösteriliyor", /\d/.test(hataSayisi), hataSayisi);

// 5) Kurulum adımları ekranda
const adimlar = await sayfa.locator("h3").allTextContents();
kontrol("kurulum adımları ekranda yazılı", adimlar.length >= 2, adimlar.join(" | ").slice(0, 120));
await sayfa.screenshot({ path: `${cikti}-yedekleme.png`, fullPage: true });

// 6) Log kaydı düşmüş mü
await sayfa.goto(`${hedef}/ayarlar/loglar?islem=YEDEK_AL`, { waitUntil: "networkidle" });
const logAdet = (await sayfa.locator("div.border-b", { hasText: "kayıt" }).first().textContent())?.trim() ?? "";
kontrol("yedekleme işlemi loglanıyor", /\d/.test(logAdet), `${logAdet} · ilk: ${await ilkSatirMetni(sayfa)}`);

// 7) Personel erişemez
await giris("personel1");
await sayfa.goto(`${hedef}/ayarlar/yedekleme`, { waitUntil: "networkidle" });
kontrol(
  "personel yedekleme ekranına giremiyor",
  sayfa.url().endsWith("/panel"),
  new URL(sayfa.url()).pathname,
);

// 8) Cron ucu oturum çerezi olmadan çalışmalı (proxy yönlendirmesi dışında)
const cevap = await sayfa.request.get(`${hedef}/api/yedek`);
kontrol(
  "sağlık ucu çerezsiz de cevap veriyor",
  cevap.status() === 200,
  `HTTP ${cevap.status()} · ${(await cevap.text()).slice(0, 50)}`,
);
const yetkisiz = await sayfa.request.post(`${hedef}/api/yedek`);
kontrol("anahtarsız yedek isteği reddediliyor", yetkisiz.status() === 401, `HTTP ${yetkisiz.status()}`);

// Yanlış anahtar da reddedilmeli.
const yanlis = await sayfa.request.post(`${hedef}/api/yedek`, {
  headers: { "X-Yedek-Anahtari": "yanlis-anahtar-123456" },
});
kontrol("yanlış anahtar reddediliyor", yanlis.status() === 401, `HTTP ${yanlis.status()}`);

// Anahtar sorgu parametresiyle KABUL EDİLMEMELİ: sorgu değerleri erişim
// kayıtlarına ve tarayıcı geçmişine düşer, sır olmaktan çıkar.
const anahtar = process.env.YEDEK_ANAHTARI ?? "";
const sorguyla = await sayfa.request.post(
  `${hedef}/api/yedek?anahtar=${encodeURIComponent(anahtar)}`,
);
// Sorgu değerleri erişim kayıtlarına ve tarayıcı geçmişine düşer; anahtar
// oradan kabul edilirse sır olmaktan çıkar.
kontrol(
  "anahtar sorgu parametresinden kabul edilmiyor",
  sorguyla.status() === 401,
  `HTTP ${sorguyla.status()}`,
);

// 9) Mobil
await giris("admin");
await sayfa.setViewportSize({ width: 390, height: 844 });
await sayfa.goto(`${hedef}/ayarlar/yedekleme`, { waitUntil: "networkidle" });
const tasma = await sayfa.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
kontrol("390px yedekleme ekranında yatay taşma yok", !tasma);

kontrol("tarayıcı konsolunda hata yok", hatalar.length === 0, hatalar.slice(0, 3).join(" | "));
await tarayici.close();

const gecen = sonuclar.filter((s) => s.gecti).length;
console.log(`\n${gecen}/${sonuclar.length} kontrol geçti`);
if (gecen !== sonuclar.length) process.exit(1);
