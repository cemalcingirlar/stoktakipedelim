// Şifre teyit alanı testi: eşleşmeyen şifre reddedilmeli, eşleşen kabul edilmeli.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/sifreteyit";
const SIFRE = "Stok2026!";
const YENI = `teyit${Date.now().toString().slice(-6)}`;
const YENI_SIFRE = "Yeni_Sifre_2026!";

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

async function giris(kullanici, sifre = SIFRE) {
  await sayfa.context().clearCookies();
  await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sayfa.fill("#kullaniciAdi", kullanici);
  await sayfa.fill("#sifre", sifre);
  await sayfa.click('button[type="submit"]');
  await sayfa.waitForURL("**/panel", { timeout: 15000 }).catch(() => {});
  return sayfa.url().includes("/panel");
}

function kart(kullaniciAdi) {
  return sayfa.locator("div.rounded-xl").filter({
    has: sayfa.locator(`input[name="kullaniciAdi"][value="${kullaniciAdi}"]`),
  }).first();
}

try {
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });

  // 1) yeni kullanıcı formunda teyit alanı var
  kontrol("yeni kullanıcı formunda şifre tekrar alanı var",
    (await sayfa.locator('input[name="sifreTekrar"]').count()) === 1);

  // 2) eşleşmeyen şifre reddedilir
  await sayfa.fill("#yeniKullaniciAdi", YENI);
  await sayfa.fill("#yeniAdSoyad", "Teyit Deneme");
  await sayfa.fill("#yeniSifre", YENI_SIFRE);
  await sayfa.fill("#yeniSifreTeyit", YENI_SIFRE + "X");
  await sayfa.selectOption("#yeniMagaza", { index: 1 });
  await sayfa.click('button:has-text("Kullanıcı Ekle")');
  await sayfa.waitForTimeout(1500);
  const uyari = (await sayfa.locator('[role="alert"]').allTextContents()).join(" ");
  kontrol("eşleşmeyen şifreyle kullanıcı eklenmedi",
    (await kart(YENI).count()) === 0 && uyari.includes("eşleşmiyor"), uyari.trim().slice(0, 70));

  // 3) eşleşen şifreyle eklenir
  await sayfa.fill("#yeniKullaniciAdi", YENI);
  await sayfa.fill("#yeniAdSoyad", "Teyit Deneme");
  await sayfa.fill("#yeniSifre", YENI_SIFRE);
  await sayfa.fill("#yeniSifreTeyit", YENI_SIFRE);
  await sayfa.selectOption("#yeniMagaza", { index: 1 });
  await sayfa.click('button:has-text("Kullanıcı Ekle")');
  await sayfa.waitForTimeout(1500);
  kontrol("eşleşen şifreyle kullanıcı eklendi", (await kart(YENI).count()) === 1, YENI);

  kontrol("yeni şifreyle giriş yapılabiliyor", await giris(YENI, YENI_SIFRE));

  // 4) şifre sıfırlamada teyit
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
  const k = kart(YENI);
  kontrol("sıfırlama formunda tekrar alanı var",
    (await k.locator('input[name="yeniSifreTekrar"]').count()) === 1);

  const BASKA = "Baska_Sifre_2026!";
  await k.locator('input[name="yeniSifre"]').fill(BASKA);
  await k.locator('input[name="yeniSifreTekrar"]').fill(BASKA + "Z");
  await k.locator('button:has-text("Şifreyi Sıfırla")').click();
  await sayfa.waitForTimeout(1500);
  const uyari2 = (await sayfa.locator('[role="alert"]').allTextContents()).join(" ");
  kontrol("eşleşmeyen sıfırlama reddedildi", uyari2.includes("eşleşmiyor"), uyari2.trim().slice(0, 70));
  kontrol("eski şifre hâlâ geçerli", await giris(YENI, YENI_SIFRE));

  // 5) eşleşen sıfırlama çalışır
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
  const k2 = kart(YENI);
  await k2.locator('input[name="yeniSifre"]').fill(BASKA);
  await k2.locator('input[name="yeniSifreTekrar"]').fill(BASKA);
  await k2.locator('button:has-text("Şifreyi Sıfırla")').click();
  await sayfa.waitForTimeout(1500);
  kontrol("yeni şifreyle giriş yapılabiliyor (sıfırlama sonrası)", await giris(YENI, BASKA));

  // 6) temizlik
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
  await kart(YENI).locator('button:has-text("Kullanıcıyı Sil")').click();
  await sayfa.waitForTimeout(1500);
  kontrol("deneme hesabı silindi", (await kart(YENI).count()) === 0);

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
