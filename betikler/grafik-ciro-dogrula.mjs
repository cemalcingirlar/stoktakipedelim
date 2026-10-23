// Panel grafiğinin ciro ölçüsü testi.
//
// Grafik yalnız adet gösteriyordu: 2000 adetlik toplu giriş tek başına ekranı
// kaplıyor, asıl merak edilen "ne kadar para girdi, ne kadar para çıktı"
// görünmüyordu. Ölçü değiştirildiğinde iki çubuk birden paraya dönüyor —
// giriş alış tutarını, satış ciroyu gösteriyor. Tek eksende iki birim
// gösterilemediği için yalnız satış çubuğunu paraya çevirmek yanlış olurdu.
//
// Test rakamları tek tek doğruluyor: çubuk değerleri girilen alış ve satış
// tutarlarına eşit mi, ölçek doğru ölçüden mi kuruluyor, dönem değiştirince
// ölçü korunuyor mu ve mağaza kısıtı ciroya da uygulanıyor mu.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/grafik-ciro";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);
const MUSTERI = `CIRO MUSTERI ${damga}`;

// Bilinen rakamlar: 3 cihaz 1.000,00'dan girildi; biri 1.750,00'a satıldı.
const ALIS_TL = "1.000,00";
const ALIS_KURUS = 100000;
const SATIS_TL = "1.750,00";
const SATIS_KURUS = 175000;
const ADET = 3;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1600, height: 1200 }, locale: "tr-TR" });
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

async function giris(kullanici) {
  await sayfa.context().clearCookies();
  await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sayfa.fill("#kullaniciAdi", kullanici);
  await sayfa.fill("#sifre", SIFRE);
  await Promise.all([sayfa.waitForURL("**/panel"), sayfa.click('button[type="submit"]')]);
}

/** Grafikteki tüm çubukların data-deger toplamı. */
async function cubukToplami(tur) {
  const degerler = await sayfa
    .locator(`[data-test="grafik-${tur}"]`)
    .evaluateAll((ler) => ler.map((e) => Number(e.getAttribute("data-deger") ?? 0)));
  return degerler.reduce((t, d) => t + d, 0);
}

async function panele(olcu, donem = "1a") {
  await sayfa.goto(`${hedef}/panel?donem=${donem}&satisDonem=7g&olcu=${olcu}#grafik`, {
    waitUntil: "networkidle",
  });
  await sayfa.waitForTimeout(1200);
}

try {
  await giris("admin");

  // ------------------------------------------------- 0) Hazırlık: 3 cihaz
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `CIRO${damga}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1400);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(`CIROMARKA${damga}`);
  await alanlar.nth(2).fill("FON CIRO");
  await kart.locator('input[inputmode="decimal"]').fill(ALIS_TL);
  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (let i = 1; i <= ADET; i++) {
    await imeiKutusu.fill(imei(i));
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(350);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `CIRO-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);

  // Birini sat.
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutmaKutusu", imei(1));
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1200);
  await sayfa.locator('[data-test="sepet-fiyat"]').first().fill(SATIS_TL);
  await sayfa.fill("#musteriSorgu", MUSTERI);
  await sayfa.locator('[data-test="musteri-ara"]').click();
  await sayfa.waitForTimeout(1500);
  const secButonu = sayfa.locator('[data-test="musteri-sec"]').first();
  if ((await secButonu.count()) > 0) {
    await secButonu.click();
    await sayfa.waitForTimeout(300);
  } else {
    await sayfa.fill("#yeniAd", MUSTERI);
  }
  await Promise.all([
    sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Satışı Kaydet")'),
  ]);
  console.log(`0) hazırlık: ${ADET} cihaz ${ALIS_TL} alış, 1 cihaz ${SATIS_TL} satış`);

  // ------------------------------------------------- 1) Varsayılan: adet
  await panele("adet");
  const baslikAdet = (await sayfa.locator("#grafik").textContent()) ?? "";
  kontrol("varsayılan ölçü adet", baslikAdet.includes("Giriş ve Satış"), "başlık");
  kontrol(
    "ölçü seçici ekranda",
    (await sayfa.locator('[data-test="olcu-secici"]').count()) === 1,
  );

  const girisAdet = await cubukToplami("giris");
  const satisAdet = await cubukToplami("satis");
  kontrol("adet ölçüsünde giriş çubukları adedi veriyor", girisAdet === ADET, `${girisAdet} (${ADET} bekleniyor)`);
  kontrol("adet ölçüsünde satış çubukları adedi veriyor", satisAdet === 1, `${satisAdet} (1 bekleniyor)`);

  // ------------------------------------------------- 2) Ciro ölçüsü
  await panele("ciro");
  const baslikCiro = (await sayfa.locator("#grafik").textContent()) ?? "";
  kontrol("ciro ölçüsünde başlık değişiyor", baslikCiro.includes("Alış ve Ciro"), "başlık");
  kontrol("ciro ölçüsünde çubuk adı 'Alış Tutarı'", baslikCiro.includes("Alış Tutarı"));
  kontrol("ciro ölçüsünde çubuk adı 'Ciro'", /Ciro/.test(baslikCiro));

  const girisKurus = await cubukToplami("giris");
  const ciroKurus = await cubukToplami("satis");
  kontrol(
    "giriş çubukları alış tutarını veriyor",
    girisKurus === ADET * ALIS_KURUS,
    `${girisKurus} kuruş (${ADET * ALIS_KURUS} bekleniyor)`,
  );
  kontrol(
    "satış çubukları ciroyu veriyor",
    ciroKurus === SATIS_KURUS,
    `${ciroKurus} kuruş (${SATIS_KURUS} bekleniyor)`,
  );
  kontrol(
    "ciro adetten farklı bir rakam (ölçü gerçekten değişti)",
    girisKurus !== girisAdet && ciroKurus !== satisAdet,
    `adet ${girisAdet}/${satisAdet} · ciro ${girisKurus}/${ciroKurus}`,
  );

  const enYuksek = (await sayfa.locator('[data-test="grafik-en-yuksek"]').textContent()) ?? "";
  kontrol("en yüksek değer para olarak yazılıyor", /₺|TL/.test(enYuksek), enYuksek.trim());
  await sayfa.screenshot({ path: `${cikti}-ciro.png`, fullPage: true });

  // ------------------------------- 3) Ölçek seçilen ölçüden kuruluyor
  // Ciroda en yüksek sütun alış tarafı (3.000,00) olmalı; satış 1.750,00.
  // Yüzdeler karışırsa çubuk taşar ya da görünmez olur.
  const yuzdeler = await sayfa
    .locator('[data-test="grafik-giris"], [data-test="grafik-satis"]')
    .evaluateAll((ler) => ler.map((e) => parseFloat(e.style.height)));
  kontrol(
    "hiçbir çubuk %100'ü aşmıyor",
    yuzdeler.every((y) => y <= 100),
    `en yüksek %${Math.max(...yuzdeler).toFixed(1)}`,
  );
  kontrol("en az bir çubuk %100'e oturuyor", yuzdeler.some((y) => y > 99), "ölçek en yükseğe göre");

  // ------------------------------- 4) Dönem değişince ölçü korunuyor
  await panele("ciro");
  await sayfa.locator('[data-test="donem-secici"] a:has-text("1 Hafta")').click();
  await sayfa.waitForTimeout(1500);
  kontrol("dönem değişince ölçü korunuyor", sayfa.url().includes("olcu=ciro"), sayfa.url());
  const haftaBaslik = (await sayfa.locator("#grafik").textContent()) ?? "";
  kontrol("dönem değişince başlık ciro kalıyor", haftaBaslik.includes("Alış ve Ciro"));

  // ------------------------------- 5) Adete geri dönülebiliyor
  await sayfa.locator('[data-test="olcu-adet"]').click();
  await sayfa.waitForTimeout(1500);
  kontrol("adete geri dönülüyor", sayfa.url().includes("olcu=adet"), sayfa.url());
  const geriBaslik = (await sayfa.locator("#grafik").textContent()) ?? "";
  kontrol("adete dönünce başlık eski hâline geliyor", geriBaslik.includes("Giriş ve Satış"));

  // ------------------------------- 6) Mağaza kısıtı ciroya da uygulanıyor
  // Cihazlar 1 Nolu Mağaza'da; personel2 ikinci mağazada.
  await giris("personel2");
  await panele("ciro");
  const yabanciGiris = await cubukToplami("giris");
  const yabanciCiro = await cubukToplami("satis");
  kontrol(
    "yetkisiz kullanıcı başka mağazanın alış tutarını görmüyor",
    yabanciGiris === 0,
    `${yabanciGiris} kuruş (0 bekleniyor)`,
  );
  kontrol(
    "yetkisiz kullanıcı başka mağazanın cirosunu görmüyor",
    yabanciCiro === 0,
    `${yabanciCiro} kuruş (0 bekleniyor)`,
  );

  await giris("personel1");
  await panele("ciro");
  const yetkiliCiro = await cubukToplami("satis");
  kontrol(
    "yetkili kullanıcı kendi mağazasının cirosunu görüyor",
    yetkiliCiro === SATIS_KURUS,
    `${yetkiliCiro} kuruş (${SATIS_KURUS} bekleniyor)`,
  );
  await sayfa.screenshot({ path: `${cikti}-yetkili.png`, fullPage: true });

  kontrol("konsolda hata yok", hatalar.length === 0, hatalar.slice(0, 3).join(" | "));
} catch (e) {
  kontrol("betik tamamlandı", false, String(e));
  await sayfa.screenshot({ path: `${cikti}-cokme.png`, fullPage: true }).catch(() => {});
} finally {
  await tarayici.close();
  const basarisiz = sonuclar.filter((s) => !s.gecti);
  console.log(`\n${sonuclar.length - basarisiz.length}/${sonuclar.length} kontrol geçti`);
  if (basarisiz.length > 0) {
    console.log("Başarısız kontroller:");
    for (const s of basarisiz) console.log(`  ✗ ${s.ad}${s.ek ? ` — ${s.ek}` : ""}`);
  }
  process.exit(basarisiz.length === 0 ? 0 : 1);
}
