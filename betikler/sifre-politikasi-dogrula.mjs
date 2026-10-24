// Şifre politikası testi.
//
// Eski kural tek satırdı: en az 8 karakter. "12345678" da geçerliydi,
// kullanıcının kendi adı da. Dükkânda şifreler bir kez konup yıllarca
// kullanıldığı için zayıf şifre kalıcı bir açık demek.
//
// Yeni kural karmaşıklık dayatmıyor (büyük harf + sembol zorunluluğu insanları
// "Sifre1!" gibi tahmin edilebilir kalıplara itiyor): en az 10 karakter, harf
// + rakam, yaygın şifrelerin ve kişinin adının reddi.
//
// Testin iki ayağı var: zayıf şifreler GERÇEKTEN reddediliyor mu, ve mevcut
// kullanıcılar bundan etkileniyor mu (etkilenmemeli — kural yalnız yeni şifre
// konarken işliyor, kimsenin oturumu kapanmıyor).
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/sifre-politikasi";
const SIFRE = "Stok2026!"; // tohum şifresi — 9 karakter, yeni kurala UYMUYOR

const damga = Date.now().toString().slice(-6);
const KULLANICI = `sifre${damga}`;
const AD_SOYAD = "Kerem Aydın";
const GECERLI_SIFRE = "KasaMavi7Defter";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({
  viewport: { width: 1500, height: 1200 },
  locale: "tr-TR",
});
const hatalar = [];
sayfa.on("console", (m) => {
  if (m.type() === "error") hatalar.push(m.text());
});
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
  await sayfa.waitForTimeout(2000);
}

function kart(kullaniciAdi) {
  return sayfa
    .locator("div.rounded-xl.border.bg-white")
    .filter({ has: sayfa.locator(`input[value="${kullaniciAdi}"]`) })
    .first();
}

/**
 * Kullanıcı ekleme formunu verilen şifreyle gönderir, sunucunun cevabını
 * döner. Tarayıcı doğrulaması kapatılıyor: sınanmak istenen SUNUCU kuralı.
 */
async function sifreDene(sifre, kullaniciAdi = KULLANICI, adSoyad = AD_SOYAD) {
  await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
  await sayfa.fill("#yeniKullaniciAdi", kullaniciAdi);
  await sayfa.fill("#yeniAdSoyad", adSoyad);
  await sayfa.selectOption("#yeniRol", "MAGAZA_PERSONELI");
  await sayfa.selectOption("#yeniMagaza", { index: 1 });
  await sayfa.fill("#yeniSifre", sifre);
  await sayfa.fill("#yeniSifreTeyit", sifre);
  await sayfa.evaluate(() => {
    for (const kimlik of ["#yeniSifre", "#yeniSifreTeyit"]) {
      document.querySelector(kimlik)?.removeAttribute("minlength");
    }
  });
  await sayfa.click('button:has-text("Kullanıcı Ekle")');
  await sayfa.waitForTimeout(1800);
  const uyari = sayfa.locator('[role="alert"]').first();
  return (await uyari.count()) > 0 ? ((await uyari.textContent()) ?? "").trim() : "";
}

try {
  await giris("admin");

  // =========================== 1) Kurallar formda yazılı
  await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
  const kuralMetni = (
    (await sayfa.locator('[data-test="sifre-kurallari"]').first().textContent()) ?? ""
  ).trim();
  kontrol("şifre kuralları formda yazılı", kuralMetni.length > 0, kuralMetni);
  kontrol("kural metni asgari uzunluğu söylüyor", /10/.test(kuralMetni), kuralMetni);

  // =========================== 2) Zayıf şifreler reddediliyor
  const kisa = await sifreDene("Kisa1234");
  kontrol("8 karakterlik şifre reddediliyor", /en az 10/.test(kisa), kisa);

  const rakamsiz = await sifreDene("kalemkutusu");
  kontrol("rakamsız şifre reddediliyor", /rakam/.test(rakamsiz), rakamsiz);

  const harfsiz = await sifreDene("9348761250");
  kontrol("harfsiz şifre reddediliyor", /harf/.test(harfsiz), harfsiz);

  const yaygin = await sifreDene("password123");
  kontrol("yaygın şifre reddediliyor", /yaygın/.test(yaygin), yaygin);

  const dizi = await sifreDene("kedi12345x");
  kontrol("sıralı dizi içeren şifre reddediliyor", /sıralı/.test(dizi), dizi);

  const kullaniciAdiyla = await sifreDene(`${KULLANICI}2026`);
  kontrol(
    "kullanıcı adını içeren şifre reddediliyor",
    /kullanıcı adı/.test(kullaniciAdiyla),
    kullaniciAdiyla,
  );

  const adiyla = await sifreDene("Aydin2026kasa");
  kontrol("kişinin soyadını içeren şifre reddediliyor", /adını/.test(adiyla), adiyla);

  // Hiçbiri kaydedilmemiş olmalı: reddedilen her deneme kullanıcıyı da
  // oluşturmamalı.
  kontrol(
    "reddedilen denemelerden kullanıcı oluşmadı",
    (await kart(KULLANICI).count()) === 0,
  );

  // =========================== 3) Kurala uyan şifre kabul ediliyor
  const temiz = await sifreDene(GECERLI_SIFRE);
  kontrol("kurallara uyan şifre kabul ediliyor", temiz === "", temiz || "(hata yok)");
  kontrol("kullanıcı gerçekten oluştu", (await kart(KULLANICI).count()) === 1, KULLANICI);

  await giris(KULLANICI, GECERLI_SIFRE);
  kontrol(
    "yeni kullanıcı kendi şifresiyle giriş yapabiliyor",
    sayfa.url().endsWith("/panel"),
    sayfa.url(),
  );

  // ============ 4) Mevcut kullanıcılar etkilenmiyor (asıl mesele bu)
  // Tohum şifresi 9 karakter: yeni kurala uymuyor. Buna rağmen mevcut
  // kullanıcılar giriş yapabilmeli — kural yalnız yeni şifre konarken işliyor.
  await giris("personel1");
  kontrol(
    "kurala uymayan ESKİ şifreyle giriş hâlâ çalışıyor",
    sayfa.url().endsWith("/panel"),
    `${SIFRE} (${SIFRE.length} karakter)`,
  );

  // =========================== 5) Şifre sıfırlama da kurala tabi
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
  const hedefKart = kart(KULLANICI);
  await hedefKart.locator('input[name="yeniSifre"]').fill("12345678");
  await hedefKart.locator('input[name="yeniSifreTekrar"]').fill("12345678");
  await hedefKart.evaluate((el) => {
    for (const giris of el.querySelectorAll("input[minlength]")) {
      giris.removeAttribute("minlength");
    }
  });
  await hedefKart.locator('button:has-text("Şifreyi Sıfırla")').click();
  await sayfa.waitForTimeout(1800);
  const sifirlamaHatasi = ((await hedefKart.locator('[role="alert"]').first().textContent()) ?? "").trim();
  kontrol(
    "şifre sıfırlamada da zayıf şifre reddediliyor",
    /en az 10|yaygın|rakam|harf/.test(sifirlamaHatasi),
    sifirlamaHatasi,
  );

  // Sıfırlama kişinin adını da reddetmeli: kuralın aynısı burada da işliyor.
  await hedefKart.locator('input[name="yeniSifre"]').fill("Kerem2026Kasa");
  await hedefKart.locator('input[name="yeniSifreTekrar"]').fill("Kerem2026Kasa");
  await hedefKart.locator('button:has-text("Şifreyi Sıfırla")').click();
  await sayfa.waitForTimeout(1800);
  const adHatasi = ((await hedefKart.locator('[role="alert"]').first().textContent()) ?? "").trim();
  kontrol("sıfırlamada kişinin adı da reddediliyor", /adını/.test(adHatasi), adHatasi);

  // Geçerli bir şifreyle sıfırlama çalışmalı ve o şifreyle giriş yapılmalı.
  const YENI = "DefterYesil42Kutu";
  await hedefKart.locator('input[name="yeniSifre"]').fill(YENI);
  await hedefKart.locator('input[name="yeniSifreTekrar"]').fill(YENI);
  await hedefKart.locator('button:has-text("Şifreyi Sıfırla")').click();
  await sayfa.waitForTimeout(2000);
  const basari = ((await hedefKart.locator('[role="status"]').first().textContent()) ?? "").trim();
  kontrol("kurala uyan şifreyle sıfırlama çalışıyor", basari.length > 0, basari);

  await giris(KULLANICI, YENI);
  kontrol(
    "sıfırlanan şifreyle giriş yapılabiliyor",
    sayfa.url().endsWith("/panel"),
    sayfa.url(),
  );

  await sayfa.screenshot({ path: `${cikti}-son.png`, fullPage: true });
  kontrol("tarayıcı konsolunda hata yok", hatalar.length === 0, hatalar.slice(0, 3).join(" | "));
} catch (hata) {
  kontrol("betik tamamlandı", false, String(hata).slice(0, 300));
  await sayfa.screenshot({ path: `${cikti}-hata.png`, fullPage: true }).catch(() => {});
} finally {
  await tarayici.close();
}

const gecen = sonuclar.filter((s) => s.gecti).length;
console.log(`\n${gecen}/${sonuclar.length} kontrol geçti`);
if (gecen !== sonuclar.length) process.exit(1);
