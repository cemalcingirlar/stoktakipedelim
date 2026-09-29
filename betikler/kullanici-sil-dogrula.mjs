// Kullanıcı silme uçtan uca testi:
// geçmişi olmayan hesap silinir, işlem kaydı olan hesap silinmeyip pasife alınır.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/kullanicisil";
const SIFRE = "Stok2026!";
const YENI = `deneme${Date.now().toString().slice(-6)}`;

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
  await Promise.all([sayfa.waitForURL("**/panel"), sayfa.click('button[type="submit"]')]);
}

function kart(kullaniciAdi) {
  return sayfa.locator("div.rounded-xl").filter({
    has: sayfa.locator(`input[name="kullaniciAdi"][value="${kullaniciAdi}"]`),
  }).first();
}

try {
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });

  // 1) kendi hesabında silme düğmesi olmamalı
  const kendiSil = await kart("admin").locator('button:has-text("Kullanıcıyı Sil")').count();
  kontrol("kendi hesabında silme düğmesi yok", kendiSil === 0, `${kendiSil} düğme`);

  // 2) geçmişi olmayan yeni kullanıcı oluştur
  await sayfa.fill("#yeniKullaniciAdi", YENI);
  await sayfa.fill("#yeniAdSoyad", "Silinecek Deneme");
  await sayfa.fill("#yeniSifre", SIFRE);
  await sayfa.selectOption("#yeniMagaza", { index: 1 });
  await sayfa.click('button:has-text("Kullanıcı Ekle")');
  await sayfa.waitForTimeout(1500);
  kontrol("yeni kullanıcı eklendi", (await kart(YENI).count()) === 1, YENI);

  // 3) giriş yapsın — log oluşsun, ama işlem kaydı oluşmasın
  await giris(YENI);
  kontrol("yeni kullanıcı giriş yapabiliyor", sayfa.url().includes("/panel"), sayfa.url());

  // 4) admin bu hesabı silsin — loglar silmeyi engellememeli
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
  await kart(YENI).locator('button:has-text("Kullanıcıyı Sil")').click();
  await sayfa.waitForTimeout(1800);
  kontrol("geçmişi olmayan hesap silindi", (await kart(YENI).count()) === 0);

  // 5) silinen hesapla giriş yapılamamalı
  await sayfa.context().clearCookies();
  await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sayfa.fill("#kullaniciAdi", YENI);
  await sayfa.fill("#sifre", SIFRE);
  await sayfa.click('button[type="submit"]');
  await sayfa.waitForTimeout(1500);
  kontrol("silinen hesapla giriş yapılamıyor", !sayfa.url().includes("/panel"), sayfa.url());

  // 6) işlem kaydı olan hesap silinmeyip pasife alınmalı
  // sorumlu1 fatura, sevkiyat ve sayım kayıtlarına sahip; geçmişi olan hesabı temsil eder.
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
  await kart("sorumlu1").locator('button:has-text("Kullanıcıyı Sil")').click();
  await sayfa.waitForTimeout(1800);
  const halaVar = (await kart("sorumlu1").count()) === 1;
  const rozetler = await kart("sorumlu1").locator("span").allTextContents();
  const pasif = rozetler.some((t) => t.trim() === "Pasif");
  kontrol("işlem kaydı olan hesap silinmedi", halaVar, halaVar ? "kayıt duruyor" : "silindi!");
  kontrol("işlem kaydı olan hesap pasife alındı", pasif, rozetler.slice(0, 3).join(" | "));

  // 7) temizlik: personel1 tekrar aktif
  if (pasif) {
    await kart("sorumlu1").locator('input[name="aktif"]').check();
    await kart("sorumlu1").locator('button:has-text("Kaydet")').click();
    await sayfa.waitForTimeout(1500);
    const geriRozet = await kart("sorumlu1").locator("span").allTextContents();
    kontrol("hesap tekrar aktif edilebiliyor", geriRozet.some((t) => t.trim() === "Aktif"));
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
