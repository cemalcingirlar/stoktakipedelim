// Faz 4 testi: mağaza bazlı sayım, canlı sayaçlar, eksik/fazla tespiti, Excel raporu.
import { chromium } from "@playwright/test";
import { readFileSync, existsSync, rmSync } from "node:fs";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/faz4";
const SIFRE = "Stok2026!";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({
  viewport: { width: 1500, height: 1000 },
  locale: "tr-TR",
  acceptDownloads: true,
});
const hatalar = [];
sayfa.on("console", (m) => {
  // Yetkisiz kullanıcı sayıma girmeye çalışırken bilerek 404 alıyor;
  // tarayıcının bunu konsola yazması hata değil.
  if (m.type() === "error" && !/status of 404/.test(m.text())) hatalar.push(m.text());
});
sayfa.on("pageerror", (e) => hatalar.push(String(e)));

async function giris(kullanici) {
  await sayfa.context().clearCookies();
  await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sayfa.fill("#kullaniciAdi", kullanici);
  await sayfa.fill("#sifre", SIFRE);
  await Promise.all([sayfa.waitForURL("**/panel"), sayfa.click('button[type="submit"]')]);
}

async function okut(kod) {
  await sayfa.fill("#okutmaKutusu", kod);
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.locator('[role="status"]').first().waitFor({ state: "visible", timeout: 15000 });
  await sayfa.waitForTimeout(500);
  return (await sayfa.locator('[role="status"]').first().textContent())?.trim();
}

// Betik eskiden beklentileri saymıyordu: ✗ yazan bir kontrol bile çıkış
// kodunu bozmuyor, süit "geçti" görünüyordu.
const sonuclar = [];
function kontrol(ad, gecti, ek = "") {
  sonuclar.push({ ad, gecti, ek });
  console.log(`${gecti ? "✓" : "✗"} ${ad}${ek ? ` — ${ek}` : ""}`);
}

async function sayaclar() {
  const metin = await sayfa.locator("div.grid").first().textContent();
  return metin?.replace(/\s+/g, " ").trim();
}

// ------------------------------------------------- Hazırlık: 3 Nolu Mağaza'ya 4 cihaz
await giris("admin");
const imei = Array.from({ length: 4 }, (_, i) => `35${i}${Date.now()}`.slice(0, 15));
// Fatura girişi artık barkod temelli: tek barkod bir ürün kartı açar, IMEI'ler
// o kartın altına arka arkaya okutulur. Eski sürüm her IMEI için ayrı kart
// bekliyordu.
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
await sayfa.fill("#okutma", "FAZ4BARKOD01");
await sayfa.press("#okutma", "Enter");
await sayfa.waitForTimeout(1200);
const urunKarti = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
await urunKarti.locator("select").first().selectOption({ label: "Cep Telefonu" });
await urunKarti.locator("select").nth(1).selectOption({ index: 1 });
const alanlar = urunKarti.locator('input[type="text"], input:not([type])');
await alanlar.nth(1).fill("Oppo");
await alanlar.nth(2).fill("A74");
await urunKarti.locator('input[inputmode="decimal"]').fill("3.000,00");

const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
for (const kod of imei) {
  await imeiKutusu.fill(kod);
  await imeiKutusu.press("Enter");
  await sayfa.waitForTimeout(300);
}

await sayfa.selectOption("#tedarikciId", { index: 1 });
await sayfa.fill("#faturaNo", `SAYIM-${Date.now()}`);
await sayfa.selectOption("#magazaId", { label: "3 Nolu Mağaza" });
await Promise.all([
  sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
  sayfa.click('button:has-text("Faturayı Kaydet")'),
]);
kontrol(
  "hazırlık: 4 cihaz 3 Nolu Mağaza'ya girildi",
  /\/faturalar\/\d+$/.test(sayfa.url()),
  sayfa.url(),
);

// ------------------------------------------------- 1) Sayım başlat
await giris("sorumlu3");
await sayfa.goto(`${hedef}/sayim`, { waitUntil: "networkidle" });
// Mağaza seçimi açılır liste değil onay kutusu listesi: bir sayım birden çok
// mağazayı kapsayabildiği için tek seçimli kutu yetmiyordu.
const magazaKutulari = sayfa.locator('[data-test="sayim-magaza-secimi"]');
let secildi = false;
for (let i = 0; i < (await magazaKutulari.count()); i += 1) {
  const etiket = magazaKutulari.nth(i);
  if (((await etiket.textContent()) ?? "").includes("3 Nolu")) {
    // Kullanıcının kendi mağazası zaten işaretli geliyor; işaretliyken
    // check() çağırmak gereksiz ve kararsız davranıyor.
    const kutu = etiket.locator('input[type="checkbox"]');
    if (!(await kutu.isChecked())) await kutu.check();
    secildi = true;
    break;
  }
}
kontrol("sayım ekranında 3 Nolu Mağaza seçilebiliyor", secildi);
if (!secildi) throw new Error("3 Nolu Mağaza sayım ekranında bulunamadı");
await Promise.all([
  sayfa.waitForURL(/\/sayim\/\d+$/, { timeout: 20000 }),
  sayfa.click('button:has-text("Sayımı Başlat")'),
]);
const sayimUrl = sayfa.url();
kontrol(
  "sayım başlatıldı",
  /\/sayim\/\d+$/.test(new URL(sayimUrl).pathname),
  new URL(sayimUrl).pathname,
);
const ilkSayaclar = (await sayaclar()) ?? "";
// Sayım 4 cihazla açılıyor; hiçbiri henüz okutulmadı.
kontrol("sayım beklenen cihaz sayısıyla açıldı", /4/.test(ilkSayaclar), ilkSayaclar);

// ------------------------------------------------- 2) Aynı mağazaya ikinci sayım açılamaz
await sayfa.goto(`${hedef}/sayim`, { waitUntil: "networkidle" });
// Mağaza seçimi açılır liste değil onay kutusu listesi; devam eden sayımı
// olan mağazanın kutusu kapalı geliyor.
const ikinciKutular = sayfa.locator('[data-test="sayim-magaza-secimi"]');
let secenekMetni = "(bulunamadı)";
let devreDisi = false;
for (let i = 0; i < (await ikinciKutular.count()); i += 1) {
  const etiket = ikinciKutular.nth(i);
  const metin = ((await etiket.textContent()) ?? "").replace(/\s+/g, " ").trim();
  if (metin.includes("3 Nolu")) {
    secenekMetni = metin;
    devreDisi = await etiket.locator('input[type="checkbox"]').isDisabled();
    break;
  }
}
kontrol(
  "devam eden sayımı olan mağaza ikinci kez seçilemiyor",
  devreDisi,
  secenekMetni,
);

// ------------------------------------------------- 3) Okutma senaryoları
await sayfa.goto(sayimUrl, { waitUntil: "networkidle" });
const ilkOkutma = await okut(imei[0]);
kontrol("stoktaki cihaz sayımda bulundu", /bulundu|sayıldı/i.test(ilkOkutma ?? ""), ilkOkutma);
const tekrarOkutma = await okut(imei[0]);
kontrol(
  "aynı cihaz iki kez sayılmıyor",
  /tekrar sayılmadı|zaten/i.test(tekrarOkutma ?? ""),
  tekrarOkutma,
);
const ikinciOkutma = await okut(imei[1]);
kontrol("ikinci cihaz da sayıldı", /bulundu|sayıldı/i.test(ikinciOkutma ?? ""), ikinciOkutma);
const okutmaSonrasi = (await sayaclar()) ?? "";
kontrol("sayaçlar iki okutmayı gösteriyor", /2/.test(okutmaSonrasi), okutmaSonrasi);
const kayitsizKod = await okut("999888777666555");
kontrol(
  "kayıtsız kod sayımda reddediliyor",
  /bulunamadı|kayıtlı değil|fazla/i.test(kayitsizKod ?? ""),
  kayitsizKod,
);
await sayfa.screenshot({ path: `${cikti}-sayim-ekrani.png`, fullPage: true });

// Başka mağazanın cihazını okut (1 Nolu Mağaza'daki bir cihazın IMEI'sini bul)
await sayfa.goto(`${hedef}/cihazlar?durum=STOKTA&magaza=1`, { waitUntil: "networkidle" });
// Liste boş olabilir (bu süit yalnız 3 Nolu Mağaza'ya cihaz giriyor);
// aşağıdaki koşul zaten bunu karşılıyor, okuma da çökmemeli.
const baskaHucre = sayfa.locator("tbody tr td:nth-child(4)").first();
const baskaImei =
  (await baskaHucre.count()) > 0 ? ((await baskaHucre.textContent()) ?? "").trim() : "";
await sayfa.goto(sayimUrl, { waitUntil: "networkidle" });
if (baskaImei && baskaImei !== "—") {
  const baskaMesaj = await okut(baskaImei);
  kontrol(
    "başka mağazanın cihazı fazlalık sayılıyor",
    /fazla|başka/i.test(baskaMesaj ?? ""),
    baskaMesaj,
  );
} else {
  console.log("   başka mağaza cihazı: (1 Nolu Mağaza'da stok yok, atlandı)");
}

// ------------------------------------------------- 4) Başka mağaza kullanıcısı sayamaz
await giris("sorumlu2");
await sayfa.goto(sayimUrl, { waitUntil: "networkidle" });
kontrol(
  "başka mağaza sorumlusuna okutma kutusu verilmiyor",
  (await sayfa.locator("#okutmaKutusu").count()) === 0,
);
// Mağaza görünürlüğü eklendikten sonra yetkisiz kullanıcı uyarı metni yerine
// "kayıt bulunamadı" ekranını görüyor; ikisini de kabul edip ne görüldüğünü
// yazıyoruz.
{
  const govde = ((await sayfa.locator("main").textContent()) ?? "").replace(/\s+/g, " ").trim();
  const bulunamadi = (await sayfa.locator('[data-test="bulunamadi-ekrani"]').count()) > 0;
  kontrol(
    "yetkisiz kullanıcı sayıma erişemiyor",
    bulunamadi || /yalnızca/i.test(govde),
    bulunamadi ? "bulunamadı ekranı" : govde.slice(0, 80),
  );
}

// ------------------------------------------------- 5) Sayımı kapat
await giris("sorumlu3");
await sayfa.goto(sayimUrl, { waitUntil: "networkidle" });
await sayfa.click('button:has-text("Sayımı Kapat")');
await sayfa.locator("text=Tamamlandı").first().waitFor({ timeout: 15000 });
await sayfa.waitForTimeout(800);
const kapanisOzeti = (await sayaclar()) ?? "";
kontrol("sayım kapatıldı", /Tamamlandı/.test((await sayfa.locator("main").textContent()) ?? ""), kapanisOzeti);
const eksikBasligi = (await sayfa.locator("h2", { hasText: "Eksikler" }).textContent())?.trim() ?? "";
const fazlaBasligi = (await sayfa.locator("h2", { hasText: "Fazlalar" }).textContent())?.trim() ?? "";
// 4 cihazın 2'si okutuldu: kapanışta 2 eksik çıkmalı.
kontrol("okutulmayan cihazlar eksik olarak raporlandı", /2/.test(eksikBasligi), eksikBasligi);
kontrol("fazlalar bölümü raporda var", fazlaBasligi.length > 0, fazlaBasligi);
await sayfa.screenshot({ path: `${cikti}-sayim-raporu.png`, fullPage: true });

// Kapatılmış sayımda okutma yapılamaz
kontrol(
  "kapalı sayımda okutma yapılamıyor",
  (await sayfa.locator("#okutmaKutusu").count()) === 0,
);

// ------------------------------------------------- 7) Excel raporu
const indirme = await Promise.all([
  sayfa.waitForEvent("download", { timeout: 20000 }),
  sayfa.click('a:has-text("Excel")'),
]);
const dosya = indirme[0];
const yol = `${cikti}-rapor.xlsx`;
if (existsSync(yol)) rmSync(yol);
await dosya.saveAs(yol);
const boyut = readFileSync(yol).length;
kontrol(
  "sayım raporu Excel olarak iniyor",
  boyut > 3000,
  `${dosya.suggestedFilename()} · ${boyut} bayt`,
);

// ------------------------------------------------- 8) Mobil
await sayfa.setViewportSize({ width: 390, height: 844 });
for (const yolAdi of ["/sayim", new URL(sayimUrl).pathname]) {
  await sayfa.goto(`${hedef}${yolAdi}`, { waitUntil: "networkidle" });
  const tasma = await sayfa.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  kontrol(`390px ${yolAdi} ekranında yatay taşma yok`, !tasma);
}

kontrol("tarayıcı konsolunda hata yok", hatalar.length === 0, hatalar.slice(0, 3).join(" | "));
await tarayici.close();

const gecen = sonuclar.filter((s) => s.gecti).length;
console.log(`\n${gecen}/${sonuclar.length} kontrol geçti`);
if (gecen !== sonuclar.length) process.exit(1);
