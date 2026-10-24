// Faz 2 uçtan uca testi: alış faturası girişi, cihaz listesi, filtre, IMEI arama, vade rengi.
//
// Betik eskiden yalnız ✓/✗ yazdırıyor, hiçbir beklenti tutmadığında da
// sıfır çıkış koduyla bitiyordu: bir kontrol aylarca ✗ yazıp "geçti"
// sayılabiliyordu. Artık her kontrol kontrol() ile sayılıyor ve bir tanesi
// bile tutmazsa betik düşüyor.
//
// Kullanım: betikler/e2e-kos.sh faz2
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

const sonuclar = [];
function kontrol(ad, gecti, ek = "") {
  sonuclar.push({ ad, gecti, ek });
  console.log(`${gecti ? "✓" : "✗"} ${ad}${ek ? ` — ${ek}` : ""}`);
}

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
kontrol("admin girişi yapıldı", sayfa.url().endsWith("/panel"), sayfa.url());

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
kontrol(
  "ürün/cihaz sayacı 2 ürün 2 cihaz gösteriyor",
  sayacMetni.includes("2 ürün") && sayacMetni.includes("2 cihaz"),
  sayacMetni.replace(/\s+/g, " ").trim(),
);

await sayfa.screenshot({ path: `${cikti}-fatura-formu.png`, fullPage: true });

await sayfa.click('button:has-text("Faturayı Kaydet")');
await sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 20000 });
kontrol(
  "fatura kaydedildi ve detayına gidildi",
  /\/faturalar\/\d+$/.test(new URL(sayfa.url()).pathname),
  new URL(sayfa.url()).pathname,
);
await sayfa.screenshot({ path: `${cikti}-fatura-detay.png`, fullPage: true });

// --- Aynı IMEI ikinci kez okutulamaz (okutma anında engellenir)
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
await sayfa.selectOption("#tedarikciId", { index: 1 });
await sayfa.fill("#faturaNo", `${faturaNo}-B`);
await sayfa.selectOption("#magazaId", { index: 1 });
const kartB = await urunEkle(barkod[0], "Samsung", "Galaxy A50", "1000", imei[0]);
const imeiSayisi = await kartB.locator("ul li").count();
const uyariMetni = (await sayfa.locator('[role="alert"]').allTextContents()).join(" ");
kontrol("tekrarlı IMEI listeye eklenmedi", imeiSayisi === 0, `${imeiSayisi} IMEI`);
kontrol(
  "tekrarlı IMEI için uyarı gösterildi",
  uyariMetni.trim().length > 0,
  uyariMetni.trim().slice(0, 80),
);

// --- Seri no zorunluluğu: IMEI okutulmayan ürün faturaya girmez
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
await sayfa.selectOption("#tedarikciId", { index: 1 });
await sayfa.fill("#faturaNo", `${faturaNo}-C`);
await sayfa.selectOption("#magazaId", { index: 1 });
const kartC = await urunEkle(`BR3${Date.now()}`.slice(0, 14), "Apple", "iPhone 15", "50000", null);
const kartUyarisi = (await kartC.locator("p.text-amber-800").textContent().catch(() => "")) ?? "";
kontrol(
  "IMEI'siz ürün için uyarı çıkıyor",
  kartUyarisi.includes("faturaya eklenmez"),
  kartUyarisi.trim() || "(yok)",
);
await sayfa.click('button:has-text("Faturayı Kaydet")');
await sayfa.waitForSelector('[role="alert"]', { timeout: 15000 });
const sunucuReddi = (await sayfa.textContent('[role="alert"] p'))?.trim() ?? "";
kontrol("IMEI'siz ürün sunucuda da reddediliyor", sunucuReddi.length > 0, sunucuReddi);

// --- Cihaz listesi
await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
const satirlar = await sayfa.locator("tbody tr").count();
const kirmiziSatir = await sayfa.locator("tbody tr.bg-red-50").count();
kontrol("cihaz listesinde satır var", satirlar >= 2, `${satirlar} satır`);
kontrol(
  "vadesi geçen iki cihaz kırmızı boyandı",
  kirmiziSatir >= 2,
  `${kirmiziSatir} kırmızı satır`,
);
const sonrakiToplam = await toplamAlisDegeri();
const artis = Number((sonrakiToplam - oncekiToplam).toFixed(2));
kontrol(
  "toplam alış değeri faturanın tutarı kadar arttı",
  artis === 22250.5,
  `${artis} TL (beklenen 22250.5)`,
);
await sayfa.screenshot({ path: `${cikti}-cihaz-listesi.png`, fullPage: true });

// --- IMEI araması doğrudan detaya gitmeli
await sayfa.fill("#ara", imei[0]);
await Promise.all([
  sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 20000 }),
  sayfa.click('button:has-text("Filtrele")'),
]);
kontrol(
  "IMEI araması doğrudan cihaz detayına gidiyor",
  /\/cihazlar\/\d+$/.test(new URL(sayfa.url()).pathname),
  new URL(sayfa.url()).pathname,
);
const tarihceAdedi = await sayfa.locator("ol li").count();
kontrol("cihazın hareket tarihçesi dolu", tarihceAdedi >= 1, `${tarihceAdedi} kayıt`);
await sayfa.screenshot({ path: `${cikti}-cihaz-detay.png`, fullPage: true });

// --- Türkçe karakter duyarsız arama
await sayfa.goto(`${hedef}/cihazlar?ara=GALAXY`, { waitUntil: "networkidle" });
const galaxySayisi = await sayfa.locator("tbody tr").count();
// Türkçe karakter ve büyük/küçük harf duyarsız arama: "GALAXY" iki cihazı
// da bulmalı (Galaxy A50 ve A51).
kontrol("büyük harfle 'GALAXY' araması cihazları buluyor", galaxySayisi >= 2, `${galaxySayisi} satır`);

// --- Durum + vade filtresi
await sayfa.goto(`${hedef}/cihazlar?durum=STOKTA&vade=gecen`, { waitUntil: "networkidle" });
const filtreliSayi = await sayfa.locator("tbody tr").count();
kontrol(
  "durum + vade filtresi birlikte çalışıyor",
  filtreliSayi >= 2,
  `${filtreliSayi} satır`,
);

// --- Personel giriş yapamaz
await giris("personel1");
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
kontrol(
  "personel alış faturası ekranına giremiyor",
  sayfa.url().endsWith("/panel"),
  new URL(sayfa.url()).pathname,
);
await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
const uyari = await sayfa.textContent("main span.text-xs").catch(() => null);
kontrol(
  "personele mağaza kısıtı yazısı gösteriliyor",
  Boolean(uyari && uyari.trim().length > 0),
  uyari?.trim() ?? "(yok)",
);

// --- Mobil
await sayfa.setViewportSize({ width: 390, height: 844 });
await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
const tasma = await sayfa.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
kontrol("390px genişlikte yatay taşma yok", !tasma);

kontrol("tarayıcı konsolunda hata yok", hatalar.length === 0, hatalar.slice(0, 3).join(" | "));
await tarayici.close();

const gecen = sonuclar.filter((s) => s.gecti).length;
console.log(`\n${gecen}/${sonuclar.length} kontrol geçti`);
if (gecen !== sonuclar.length) process.exit(1);
