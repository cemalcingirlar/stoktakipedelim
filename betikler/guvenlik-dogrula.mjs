// Güvenlik denetimi: tarayıcı başlıkları ve oturum geçerliliği.
//
// İki açık kapatıldı:
//
// 1. Güvenlik başlıkları hiç yoktu. Sayfa bir başka sitenin çerçevesine
//    alınabiliyor (tıklama hırsızlığı), tarayıcı içerik türünü tahmin
//    edebiliyor, adres yabancı sitelere referrer olarak sızabiliyordu.
//
// 2. Şifre değişse bile eski oturumlar çalışmaya devam ediyordu. Hesabı ele
//    geçirilen kullanıcının şifresini sıfırlamak saldırganı dışarı atmıyordu;
//    oysa sıfırlamanın tek amacı buydu.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/guvenlik";
const SIFRE = "Stok2026!";
const YENI_SIFRE = "DefterTuruncu91";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);

const sonuclar = [];
function kontrol(ad, gecti, ek = "") {
  sonuclar.push({ ad, gecti, ek });
  console.log(`${gecti ? "✓" : "✗"} ${ad}${ek ? ` — ${ek}` : ""}`);
}

/** Her kullanıcı kendi tarayıcı bağlamında: çerezler karışmasın. */
async function oturumAc(kullanici, sifre = SIFRE) {
  const baglam = await tarayici.newContext({ locale: "tr-TR" });
  const sayfa = await baglam.newPage();
  await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sayfa.fill("#kullaniciAdi", kullanici);
  await sayfa.fill("#sifre", sifre);
  await sayfa.click('button[type="submit"]');
  await sayfa.waitForTimeout(2000);
  return { baglam, sayfa };
}

try {
  // ========================= 1) Güvenlik başlıkları
  const { baglam: adminBaglam, sayfa: admin } = await oturumAc("admin");
  const yanit = await admin.goto(`${hedef}/panel`, { waitUntil: "domcontentloaded" });
  const basliklar = yanit?.headers() ?? {};

  kontrol(
    "X-Frame-Options gönderiliyor (çerçeveye alınamaz)",
    basliklar["x-frame-options"] === "DENY",
    basliklar["x-frame-options"] ?? "(yok)",
  );
  kontrol(
    "X-Content-Type-Options: nosniff",
    basliklar["x-content-type-options"] === "nosniff",
    basliklar["x-content-type-options"] ?? "(yok)",
  );
  kontrol(
    "Referrer-Policy adres sızdırmıyor",
    (basliklar["referrer-policy"] ?? "").includes("strict-origin"),
    basliklar["referrer-policy"] ?? "(yok)",
  );
  const izin = basliklar["permissions-policy"] ?? "";
  kontrol("Permissions-Policy mikrofon ve konumu kapatıyor", /microphone=\(\)/.test(izin) && /geolocation=\(\)/.test(izin), izin);
  // Barkod okuma kamerayı kullanıyor: kapatılmamalı.
  kontrol("Permissions-Policy kamerayı kendi sitemize açık bırakıyor", /camera=\(self\)/.test(izin), izin);

  const csp = basliklar["content-security-policy"] ?? "";
  kontrol("CSP gönderiliyor", csp.length > 0, csp.slice(0, 80));
  kontrol("CSP dış kaynak yüklemeyi kısıtlıyor", /default-src 'self'/.test(csp), csp.slice(0, 60));
  kontrol("CSP çerçevelenmeyi engelliyor", /frame-ancestors 'none'/.test(csp));
  kontrol("CSP eklenti/nesne yüklemeyi kapatıyor", /object-src 'none'/.test(csp));
  kontrol("CSP form gönderimini kendi sitemize kısıtlıyor", /form-action 'self'/.test(csp));

  // Giriş ekranı gibi oturumsuz sayfalarda da başlıklar olmalı.
  const girisYanit = await admin.goto(`${hedef}/giris`, { waitUntil: "domcontentloaded" });
  kontrol(
    "başlıklar giriş ekranında da var",
    (girisYanit?.headers() ?? {})["x-frame-options"] === "DENY",
  );

  // ========================= 2) Şifre değişince eski oturum düşüyor
  const { baglam: personelBaglam, sayfa: personel } = await oturumAc("personel1");
  await personel.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  kontrol("personel oturumu açıldı", personel.url().endsWith("/panel"), personel.url());

  // Üçüncü bir kullanıcı: şifresi değişmeyenin oturumu etkilenmemeli.
  const { baglam: digerBaglam, sayfa: diger } = await oturumAc("personel2");
  kontrol("ikinci personelin oturumu açıldı", diger.url().endsWith("/panel"), diger.url());

  // Yönetici personel1'in şifresini sıfırlıyor.
  await admin.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
  const kart = admin
    .locator("div.rounded-xl.border.bg-white")
    .filter({ has: admin.locator('input[value="personel1"]') })
    .first();
  await kart.locator('input[name="yeniSifre"]').fill(YENI_SIFRE);
  await kart.locator('input[name="yeniSifreTekrar"]').fill(YENI_SIFRE);
  await kart.locator('button:has-text("Şifreyi Sıfırla")').click();
  await admin.waitForTimeout(2500);
  const sifirlamaSonucu = ((await kart.locator('[role="status"]').first().textContent()) ?? "").trim();
  kontrol("şifre sıfırlandı", sifirlamaSonucu.length > 0, sifirlamaSonucu);

  // ESKİ oturum artık çalışmamalı.
  await personel.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  kontrol(
    "şifresi değişen kullanıcının eski oturumu düştü",
    personel.url().includes("/giris"),
    personel.url(),
  );

  // Şifresi değişmeyen kullanıcı etkilenmemeli.
  await diger.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  kontrol(
    "diğer kullanıcıların oturumu etkilenmedi",
    diger.url().includes("/cihazlar"),
    diger.url(),
  );

  // Yöneticinin kendi oturumu da ayakta kalmalı.
  await admin.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  kontrol("yöneticinin oturumu ayakta", admin.url().endsWith("/panel"), admin.url());

  // Yeni şifreyle giriş çalışmalı, eskisiyle çalışmamalı.
  const { baglam: yeniBaglam, sayfa: yeni } = await oturumAc("personel1", YENI_SIFRE);
  kontrol("yeni şifreyle giriş yapılabiliyor", yeni.url().endsWith("/panel"), yeni.url());
  await yeniBaglam.close();

  const { baglam: eskiBaglam, sayfa: eski } = await oturumAc("personel1", SIFRE);
  kontrol("eski şifre artık çalışmıyor", !eski.url().endsWith("/panel"), eski.url());
  await eskiBaglam.close();

  // ========================= 3) Kullanıcı kendi şifresini değiştirebiliyor
  const { baglam: kendiBaglam, sayfa: kendi } = await oturumAc("personel2");
  kontrol(
    "üst menüde şifre bağlantısı var",
    (await kendi.locator('[data-test="sifre-baglantisi"]').count()) >= 1,
  );
  await kendi.goto(`${hedef}/sifre`, { waitUntil: "networkidle" });
  kontrol("şifre değiştirme ekranı açılıyor", (await kendi.locator('[data-test="sifre-formu"]').count()) === 1);

  // Yanlış mevcut şifre reddedilmeli: açık bırakılmış ekranda hesap
  // ele geçirilmesin.
  await kendi.fill("#mevcutSifre", "YanlisSifre123");
  await kendi.fill("#yeniSifre", "KalemYesil88");
  await kendi.fill("#yeniSifreTekrar", "KalemYesil88");
  await kendi.locator('[data-test="sifre-formu"] button[type="submit"]').click();
  await kendi.waitForTimeout(2000);
  kontrol(
    "yanlış mevcut şifre reddediliyor",
    /Mevcut şifreniz hatalı/.test(((await kendi.locator('[data-test="sifre-hata"]').textContent()) ?? "")),
    ((await kendi.locator('[data-test="sifre-hata"]').textContent()) ?? "").trim(),
  );

  // Zayıf yeni şifre de reddedilmeli: politika burada da geçerli.
  await kendi.fill("#mevcutSifre", SIFRE);
  await kendi.fill("#yeniSifre", "personel2abc");
  await kendi.fill("#yeniSifreTekrar", "personel2abc");
  await kendi.locator('[data-test="sifre-formu"] button[type="submit"]').click();
  await kendi.waitForTimeout(2000);
  kontrol(
    "kendi kullanıcı adını içeren şifre reddediliyor",
    /kullanıcı adı/.test(((await kendi.locator('[data-test="sifre-hata"]').textContent()) ?? "")),
    ((await kendi.locator('[data-test="sifre-hata"]').textContent()) ?? "").trim(),
  );

  // Doğru bilgilerle değişim çalışmalı ve KENDİ oturumu düşmemeli.
  const KENDI_YENI = "KalemYesil88Defter";
  await kendi.fill("#mevcutSifre", SIFRE);
  await kendi.fill("#yeniSifre", KENDI_YENI);
  await kendi.fill("#yeniSifreTekrar", KENDI_YENI);
  await kendi.locator('[data-test="sifre-formu"] button[type="submit"]').click();
  await kendi.waitForTimeout(2500);
  kontrol(
    "şifre değiştirildi",
    (await kendi.locator('[data-test="sifre-basari"]').count()) === 1,
    ((await kendi.locator('[data-test="sifre-basari"]').textContent()) ?? "").trim(),
  );
  await kendi.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  kontrol(
    "şifresini değiştiren kullanıcının kendi oturumu devam ediyor",
    kendi.url().includes("/cihazlar"),
    kendi.url(),
  );

  // Aynı kullanıcının BAŞKA cihazdaki oturumu düşmeli.
  const { baglam: baskaCihaz, sayfa: baska } = await oturumAc("personel2", SIFRE);
  kontrol("eski şifreyle yeni giriş yapılamıyor", !baska.url().endsWith("/panel"), baska.url());
  await baskaCihaz.close();

  const { baglam: yeniCihaz, sayfa: yeniGiris } = await oturumAc("personel2", KENDI_YENI);
  kontrol("yeni şifreyle giriş yapılabiliyor", yeniGiris.url().endsWith("/panel"), yeniGiris.url());
  await yeniCihaz.close();
  await kendiBaglam.close();

  await admin.screenshot({ path: `${cikti}-son.png`, fullPage: true });
  await adminBaglam.close();
  await personelBaglam.close();
  await digerBaglam.close();
} catch (hata) {
  kontrol("betik tamamlandı", false, String(hata).slice(0, 300));
} finally {
  await tarayici.close();
}

const gecen = sonuclar.filter((s) => s.gecti).length;
console.log(`\n${gecen}/${sonuclar.length} kontrol geçti`);
if (gecen !== sonuclar.length) process.exit(1);
