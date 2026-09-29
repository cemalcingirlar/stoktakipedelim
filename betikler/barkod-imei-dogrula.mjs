// Barkod bazlı ürün girişi ve çoklu IMEI okutma testi.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/barkodimei";
const SIFRE = "Stok2026!";

const damga = Date.now().toString().slice(-8);
const BARKOD = `BRK${damga}`;
const imei = (i) => `35${damga}${String(i).padStart(5, "0")}`.slice(0, 15);

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1500, height: 1200 }, locale: "tr-TR" });
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

async function barkodOkut(kod) {
  await sayfa.fill("#okutma", kod);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1200);
}

async function imeiOkut(kartIndex, kod) {
  const kutu = sayfa.locator('input[id^="imei-"]').nth(kartIndex);
  await kutu.fill(kod);
  await kutu.press("Enter");
  await sayfa.waitForTimeout(500);
}

async function faturaDoldurVeKaydet(faturaNo) {
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", faturaNo);
  await sayfa.selectOption("#magazaId", { index: 1 });
  await sayfa.click('button:has-text("Faturayı Kaydet")');
  await sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }).catch(() => {});
}

try {
  await giris("admin");
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });

  // 1) okutma kutusu barkoda göre etiketlenmiş
  const etiket = (await sayfa.locator('label[for="okutma"]').textContent()) ?? "";
  kontrol("okutma kutusu 'Barkod Okut' diyor", etiket.trim() === "Barkod Okut", etiket.trim());

  // 2) yeni barkod → boş ürün kartı açılır, odak IMEI kutusuna gider
  await barkodOkut(BARKOD);
  kontrol("barkod okutunca ürün kartı açıldı",
    (await sayfa.locator('input[id^="imei-"]').count()) === 1);
  const odakId = await sayfa.evaluate(() => document.activeElement?.id ?? "");
  kontrol("odak IMEI kutusuna geçti", odakId.startsWith("imei-"), odakId);

  // 3) tek barkod altında arka arkaya IMEI okutma
  // Kartlar bölümün ilk çocuğu değil (başlık satırı var); sınıfa göre seçiyoruz.
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const metinler = kart.locator('input[type="text"], input:not([type])');
  await metinler.nth(1).fill("Samsung");   // 0 = barkod
  await metinler.nth(2).fill("Galaxy A55");
  await kart.locator('input[inputmode="decimal"]').fill("12.500,00");

  for (let i = 1; i <= 5; i++) await imeiOkut(0, imei(i));
  const rozetSayisi = await kart.locator("ul li").count();
  kontrol("tek barkoda 5 IMEI okutuldu", rozetSayisi === 5, `${rozetSayisi} rozet`);

  const baslik = (await sayfa.locator('h2:has-text("Cihazlar")').textContent()) ?? "";
  kontrol("sayaç 1 ürün · 5 cihaz diyor", baslik.includes("1 ürün") && baslik.includes("5 cihaz"),
    baslik.replace(/\s+/g, " ").trim());

  // 4) aynı IMEI ikinci kez okutulamaz
  await imeiOkut(0, imei(3));
  const tekrar = await kart.locator("ul li").count();
  kontrol("aynı IMEI ikinci kez eklenmedi", tekrar === 5, `${tekrar} rozet`);

  // 5) aynı barkod tekrar okutulunca yeni kart açılmaz
  await barkodOkut(BARKOD);
  kontrol("aynı barkod ikinci kart açmadı",
    (await sayfa.locator('input[id^="imei-"]').count()) === 1);

  // 6) kaydet
  await faturaDoldurVeKaydet(`BK-${damga}`);
  const kaydedildi = /\/faturalar\/\d+$/.test(sayfa.url());
  kontrol("fatura kaydedildi", kaydedildi,
    kaydedildi ? sayfa.url() : (await sayfa.locator('[role="alert"]').allTextContents()).join(" | "));

  const faturaMetni = (await sayfa.locator("body").textContent()) ?? "";
  kontrol("faturada 5 cihaz var", faturaMetni.includes(imei(1)) && faturaMetni.includes(imei(5)));

  // 7) ikinci faturada aynı barkod → bilgiler otomatik gelmeli
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await barkodOkut(BARKOD);
  const kart2 = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  const metinler2 = kart2.locator('input[type="text"], input:not([type])');
  const marka = await metinler2.nth(1).inputValue();
  const model = await metinler2.nth(2).inputValue();
  const fiyat = await kart2.locator('input[inputmode="decimal"]').inputValue();
  kontrol("marka otomatik geldi", marka === "Samsung", marka);
  kontrol("model otomatik geldi", model === "Galaxy A55", model);
  kontrol("son alış fiyatı otomatik geldi", fiyat === "12.500,00", fiyat);
  const kategoriDeger = await kart2.locator("select").first().inputValue();
  kontrol("kategori otomatik seçildi", kategoriDeger !== "", kategoriDeger);

  const bilgiNotu = (await kart2.locator("p").first().textContent()) ?? "";
  kontrol("nereden geldiği yazıyor", bilgiNotu.includes("girişten alındı"), bilgiNotu.trim());

  // 8) sistemde kayıtlı IMEI okutma anında reddedilmeli
  await imeiOkut(0, imei(2));
  const uyari = (await sayfa.locator('[role="alert"]').allTextContents()).join(" ");
  kontrol("kayıtlı IMEI okutma anında uyarıyor", uyari.includes("sistemde kayıtlı"), uyari.trim().slice(0, 90));
  kontrol("kayıtlı IMEI listeye eklenmedi", (await kart2.locator("ul li").count()) === 0);

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
