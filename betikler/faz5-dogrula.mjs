// Faz 5 testi: sütun seçici, Excel çıktıları, raporlar, log ekranı, kullanıcı yönetimi.
import { chromium } from "@playwright/test";
import { readFileSync, existsSync, rmSync } from "node:fs";

/** Tablodaki ilk satırın dördüncü hücresi; tablo boşsa çökmek yerine not döner.
 *  Bu okuma yalnız ekrana bilgi basmak için; boş veritabanında satır
 *  olmaması bir hata değil, betiği düşürmemeli. */
async function ilkSatirMetni(sayfa) {
  const hucre = sayfa.locator("tbody tr td:nth-child(4)").first();
  if ((await hucre.count()) === 0) return "(kayıt yok)";
  return ((await hucre.textContent()) ?? "").trim();
}

// Betik eskiden beklentileri saymıyordu: ✗ yazan bir kontrol bile çıkış
// kodunu bozmuyor, süit "geçti" görünüyordu.
const sonuclar = [];
function kontrol(ad, gecti, ek = "") {
  sonuclar.push({ ad, gecti, ek });
  console.log(`${gecti ? "✓" : "✗"} ${ad}${ek ? ` — ${ek}` : ""}`);
}

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/faz5";
const SIFRE = "Stok2026!";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({
  viewport: { width: 1600, height: 1000 },
  locale: "tr-TR",
  acceptDownloads: true,
});
const hatalar = [];
sayfa.on("console", (m) => { if (m.type() === "error") hatalar.push(m.text()); });
sayfa.on("pageerror", (e) => hatalar.push(String(e)));

async function giris(kullanici, sifre = SIFRE) {
  await sayfa.context().clearCookies();
  await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sayfa.fill("#kullaniciAdi", kullanici);
  await sayfa.fill("#sifre", sifre);
  await Promise.all([sayfa.waitForURL("**/panel", { timeout: 20000 }), sayfa.click('button[type="submit"]')]);
}

async function indir(tiklama, ad) {
  const [dosya] = await Promise.all([
    sayfa.waitForEvent("download", { timeout: 30000 }),
    tiklama,
  ]);
  const yol = `${cikti}-${ad}.xlsx`;
  if (existsSync(yol)) rmSync(yol);
  await dosya.saveAs(yol);
  return { ad: dosya.suggestedFilename(), boyut: readFileSync(yol).length, yol };
}

await giris("admin");

// ------------------------------------------------- 1) Sütun seçici
await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
const baslangicSutun = await sayfa.locator("table thead th").count();
kontrol("cihaz listesi sütunlarla açılıyor", baslangicSutun > 0, `${baslangicSutun} sütun`);
await sayfa.click('button:has-text("Sütunlar")');
await sayfa.waitForSelector('input[name="sutun"]', { timeout: 10000 });
// Barkod ve Alt Kategori'yi aç, Genel Not'u kapat
await sayfa.locator('label:has-text("Barkod") input').check();
await sayfa.locator('label:has-text("Alt Kategori") input').check();
await sayfa.locator('label:has-text("Genel Not") input').uncheck();
await sayfa.click('button:has-text("Uygula")');
await sayfa.waitForTimeout(1500);
const yeniSutun = await sayfa.locator("table thead th").count();
const basliklar = await sayfa.locator("table thead th").allTextContents();
kontrol(
  "sütun seçimi tabloyu değiştiriyor",
  yeniSutun !== baslangicSutun,
  `${baslangicSutun} → ${yeniSutun}`,
);
// Başlıklara sıralama işareti (⇅) ekleniyor, bu yüzden tam eşitlik değil
// içerme bakılıyor.
const basliklardaVar = (ad) => basliklar.some((b) => b.includes(ad));
kontrol("seçilen Barkod sütunu eklendi", basliklardaVar("Barkod"), basliklar.join(" | ").slice(0, 160));
kontrol("kaldırılan Genel Not sütunu gitti", !basliklardaVar("Genel Not"));
await sayfa.screenshot({ path: `${cikti}-sutun-secici.png`, fullPage: true });

// Seçim kalıcı mı — sayfayı yenile
await sayfa.reload({ waitUntil: "networkidle" });
const kaliciBasliklar = await sayfa.locator("table thead th").allTextContents();
kontrol(
  "sütun seçimi sayfa yenilenince korunuyor",
  kaliciBasliklar.some((b) => b.includes("Barkod")) &&
    !kaliciBasliklar.some((b) => b.includes("Genel Not")),
  kaliciBasliklar.join(" | ").slice(0, 160),
);

// ------------------------------------------------- 3) Cihaz Excel (filtreli)
await sayfa.goto(`${hedef}/cihazlar?durum=STOKTA`, { waitUntil: "networkidle" });
const stoktaAdet = await sayfa.locator("tbody tr").count();
const cihazExcel = await indir(sayfa.click('a:has-text("Excel")'), "cihazlar");
kontrol(
  "cihaz listesi Excel olarak iniyor",
  cihazExcel.boyut > 3000,
  `${cihazExcel.ad} · ${cihazExcel.boyut} bayt`,
);
kontrol("stokta filtresi ekranda cihaz gösteriyor", stoktaAdet >= 1, `${stoktaAdet} satır`);

// ------------------------------------------------- 4) Raporlar
await sayfa.goto(`${hedef}/rapor`, { waitUntil: "networkidle" });
const kartlar = await sayfa.locator("main .grid").first().textContent();
kontrol(
  "rapor özet kartları dolu geliyor",
  (kartlar ?? "").trim().length > 0,
  kartlar?.replace(/\s+/g, " ").trim().slice(0, 100),
);
const tabloSayisi = await sayfa.locator("table").count();
kontrol("rapor ekranında tablolar var", tabloSayisi >= 1, `${tabloSayisi} tablo`);
await sayfa.screenshot({ path: `${cikti}-raporlar.png`, fullPage: true });

const raporExcel = await indir(sayfa.click('a:has-text("Tümünü Excel")'), "rapor");
kontrol(
  "rapor Excel olarak iniyor",
  raporExcel.boyut > 5000,
  `${raporExcel.ad} · ${raporExcel.boyut} bayt`,
);

// Tarih aralığı filtresi
await sayfa.goto(`${hedef}/rapor?bas=2026-01-01&bit=2026-12-31`, { waitUntil: "networkidle" });
const aralikMetni = (await sayfa.locator("form span").last().textContent())?.trim() ?? "";
kontrol("rapor tarih aralığı uygulandı", aralikMetni.length > 0, aralikMetni);

// ------------------------------------------------- 7) Log ekranı
await sayfa.goto(`${hedef}/ayarlar/loglar`, { waitUntil: "networkidle" });
const logSayisi = (await sayfa.locator("div.border-b", { hasText: "kayıt" }).first().textContent())?.trim();
kontrol("log ekranı kayıt sayısı gösteriyor", /\d/.test(logSayisi ?? ""), logSayisi ?? "(yok)");
await sayfa.selectOption("#islem", "SATIS_YAP");
await sayfa.click('button:has-text("Filtrele")');
await sayfa.waitForLoadState("networkidle");
const satisLog = (await sayfa.locator("div.border-b", { hasText: "kayıt" }).first().textContent())?.trim();
kontrol("log ekranı işleme göre filtreleniyor", /\d/.test(satisLog ?? ""), `${satisLog} · ilk: ${await ilkSatirMetni(sayfa)}`);
await sayfa.screenshot({ path: `${cikti}-loglar.png`, fullPage: true });

// ------------------------------------------------- 8) Kullanıcı yönetimi
await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
const kAdi = `test${Date.now() % 100000}`;
await sayfa.fill("#yeniKullaniciAdi", kAdi);
await sayfa.fill("#yeniAdSoyad", "Test Personeli");
await sayfa.selectOption("#yeniRol", "MAGAZA_PERSONELI");
await sayfa.selectOption("#yeniMagaza", { index: 1 });
await sayfa.fill("#yeniSifre", "TestSifre123");
// Form şifre teyidi de istiyor; sonradan eklendi.
await sayfa.fill("#yeniSifreTeyit", "TestSifre123");
await sayfa.click('button:has-text("Kullanıcı Ekle")');
await sayfa.locator(`input[value="${kAdi}"]`).first().waitFor({ timeout: 15000 });
kontrol(
  "yeni kullanıcı eklendi",
  (await sayfa.locator(`input[value="${kAdi}"]`).count()) >= 1,
  kAdi,
);

// Mağazasız personel reddedilmeli
await sayfa.fill("#yeniKullaniciAdi", `${kAdi}b`);
await sayfa.fill("#yeniAdSoyad", "Mağazasız");
await sayfa.selectOption("#yeniRol", "MAGAZA_PERSONELI");
await sayfa.selectOption("#yeniMagaza", "");
await sayfa.fill("#yeniSifre", "TestSifre123");
// Form şifre teyidi de istiyor; sonradan eklendi.
await sayfa.fill("#yeniSifreTeyit", "TestSifre123");
await sayfa.click('button:has-text("Kullanıcı Ekle")');
const magazaUyari = sayfa.locator('[role="alert"]', { hasText: "mağazaya bağlanmalı" }).first();
await magazaUyari.waitFor({ timeout: 15000 });
const magazaMesaji = (await magazaUyari.textContent())?.trim() ?? "";
kontrol("mağazasız personel reddediliyor", magazaMesaji.includes("mağazaya bağlanmalı"), magazaMesaji);

// Kısa şifre reddedilmeli
await sayfa.fill("#yeniKullaniciAdi", `${kAdi}c`);
await sayfa.fill("#yeniAdSoyad", "Kısa Şifre");
await sayfa.selectOption("#yeniMagaza", { index: 1 });
await sayfa.fill("#yeniSifre", "123");
// Form şifre teyidi de istiyor; sonradan eklendi.
await sayfa.fill("#yeniSifreTeyit", "123");
// Sunucu tarafı kontrolünü görebilmek için tarayıcı doğrulaması devre dışı.
// Teyit alanı sonradan eklendi; minlength yalnız şifreden kaldırılınca
// gönderim teyit alanında takılıyor ve sunucu mesajı hiç çıkmıyordu.
await sayfa.evaluate(() => {
  for (const kimlik of ["#yeniSifre", "#yeniSifreTeyit"]) {
    document.querySelector(kimlik)?.removeAttribute("minlength");
  }
});
await sayfa.click('button:has-text("Kullanıcı Ekle")');
const sifreUyari = sayfa.locator('[role="alert"]', { hasText: "en az 8" }).first();
await sifreUyari.waitFor({ timeout: 15000 });
const sifreMesaji = (await sifreUyari.textContent())?.trim() ?? "";
kontrol("kısa şifre sunucuda reddediliyor", /en az 8/.test(sifreMesaji), sifreMesaji);
await sayfa.screenshot({ path: `${cikti}-kullanicilar.png`, fullPage: true });

// Yeni kullanıcı gerçekten giriş yapabilmeli
await giris(kAdi, "TestSifre123");
kontrol(
  "yeni kullanıcı giriş yapabiliyor",
  sayfa.url().endsWith("/panel"),
  new URL(sayfa.url()).pathname,
);
kontrol(
  "personele menüde Ayarlar gösterilmiyor",
  (await sayfa.locator("header nav a", { hasText: "Ayarlar" }).count()) === 0,
);

// Personel log ve rapor Excel'e erişemez / erişebilir mi
await sayfa.goto(`${hedef}/ayarlar/loglar`, { waitUntil: "networkidle" });
kontrol(
  "personel log ekranına giremiyor",
  sayfa.url().endsWith("/panel"),
  new URL(sayfa.url()).pathname,
);

// ------------------------------------------------- 13) Pasife alma
await giris("admin");
await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
const kart = sayfa.locator("div.rounded-xl.border.bg-white.shadow-sm").filter({ has: sayfa.locator(`input[value="${kAdi}"]`) }).first();
await kart.locator('input[name="aktif"]').uncheck();
await kart.locator('button:has-text("Kaydet")').click();
await kart.locator('[role="status"]').first().waitFor({ timeout: 15000 });
const pasifMesaji = (await kart.locator('[role="status"]').first().textContent())?.trim() ?? "";
kontrol("kullanıcı pasife alınabiliyor", pasifMesaji.length > 0, pasifMesaji);

// Pasif kullanıcı giriş yapamamalı
await sayfa.context().clearCookies();
await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
await sayfa.fill("#kullaniciAdi", kAdi);
await sayfa.fill("#sifre", "TestSifre123");
await sayfa.click('button[type="submit"]');
await sayfa.locator('p[role="alert"]').waitFor({ timeout: 15000 });
const pasifGiris = (await sayfa.textContent('p[role="alert"]'))?.trim() ?? "";
kontrol("pasif kullanıcı giriş yapamıyor", pasifGiris.length > 0 && !sayfa.url().endsWith("/panel"), pasifGiris);

// ------------------------------------------------- 15) Mobil
await giris("admin");
await sayfa.setViewportSize({ width: 390, height: 844 });
for (const yol of ["/rapor", "/ayarlar/loglar", "/ayarlar/kullanicilar"]) {
  await sayfa.goto(`${hedef}${yol}`, { waitUntil: "networkidle" });
  const tasma = await sayfa.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  kontrol(`390px ${yol} ekranında yatay taşma yok`, !tasma);
}

kontrol("tarayıcı konsolunda hata yok", hatalar.length === 0, hatalar.slice(0, 3).join(" | "));
await tarayici.close();

const gecen = sonuclar.filter((s) => s.gecti).length;
console.log(`\n${gecen}/${sonuclar.length} kontrol geçti`);
if (gecen !== sonuclar.length) process.exit(1);
