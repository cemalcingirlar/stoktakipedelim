// Aynı barkodta birden çok cihaz olduğunda satış ve sevkiyatta seçim testi.
//
// Kullanıcının bildirdiği durum: seri numarası olmayan ürünlere elle numara
// veriliyor; aynı barkodtan biri satılınca sonraki okutmalar "daha önce
// satılmış" diyor ve stoktaki diğerleri satılamıyordu.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/barkod-secim";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
// Seri numarası olmayan ürün: üç cihaz da aynı barkodu taşıyor.
const BARKOD = `489${damga}0525`.slice(0, 13);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1500, height: 1100 }, locale: "tr-TR" });
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

/** Okutma kutusuna kod yazar, geri bildirim metnini döner. */
async function okut(kod) {
  await sayfa.fill("#okutmaKutusu", kod);
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1800);
  const bildirim = sayfa.locator('[role="status"], [role="alert"]').first();
  return ((await bildirim.textContent()) ?? "").replace(/\s+/g, " ").trim();
}

try {
  await giris("admin");

  // ----------- 0) Hazırlık: aynı barkodta 3 cihaz, elle verilmiş serilerle
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", BARKOD);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1200);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const metinler = kart.locator('input[type="text"], input:not([type])');
  await metinler.nth(1).fill("GAMA");
  await metinler.nth(2).fill("KULAKLIK");
  await kart.locator('input[inputmode="decimal"]').fill("1.000,00");
  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const i of [1, 2, 3]) {
    await imeiKutusu.fill(imei(i));
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(400);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `BRK-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
  console.log(`0) hazırlık: ${BARKOD} barkodunda 3 cihaz girildi`);

  // ------------------------- 1) SATIŞ: barkod okutunca seçim sorulmalı
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  const mesaj1 = await okut(BARKOD);
  kontrol(
    "barkod okutunca seçim listesi çıkıyor",
    (await sayfa.locator('[data-test="cihaz-secimi"]').count()) === 1,
    mesaj1.slice(0, 80),
  );
  const adaySayisi = await sayfa.locator('[data-test="secim-adayi"]').count();
  kontrol("üç cihaz da seçenek olarak listeleniyor", adaySayisi === 3, `${adaySayisi} aday`);

  const adayMetni = (await sayfa.locator('[data-test="cihaz-secimi"]').textContent()) ?? "";
  kontrol(
    "seçenekler seri numaralarını gösteriyor",
    adayMetni.includes(imei(1)) && adayMetni.includes(imei(2)) && adayMetni.includes(imei(3)),
    `${imei(1)} … bekleniyor`,
  );

  // 2. cihazı seç ve sat.
  await sayfa
    .locator('[data-test="secim-adayi"]')
    .filter({ hasText: imei(2) })
    .click();
  await sayfa.waitForTimeout(2000);
  const sepet = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("seçilen cihaz sepete eklendi", sepet.includes(imei(2)), imei(2));
  kontrol(
    "seçim listesi kapandı",
    (await sayfa.locator('[data-test="cihaz-secimi"]').count()) === 0,
  );

  await sayfa.locator('[data-test="sepet-fiyat"]').first().fill("2.000,00");
  await sayfa.fill("#yeniAd", `Barkod Musteri ${damga}`);
  await Promise.all([
    sayfa.waitForURL(/\/(cihazlar\/\d+|musteriler)/, { timeout: 30000 }),
    sayfa.click('button:has-text("Satışı Kaydet")'),
  ]);
  console.log(`   ${imei(2)} satıldı`);

  // ------- 2) Asıl hata: bir tanesi satılmışken barkod yine çalışmalı
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  const mesaj2 = await okut(BARKOD);
  kontrol(
    "satılmış cihaz varken 'daha önce satılmış' demiyor",
    !mesaj2.includes("daha önce satılmış"),
    mesaj2.slice(0, 80),
  );
  const kalanAday = await sayfa.locator('[data-test="secim-adayi"]').count();
  kontrol(
    "yalnız stoktaki iki cihaz listeleniyor",
    kalanAday === 2,
    `${kalanAday} aday (2 bekleniyor)`,
  );
  const kalanMetin = (await sayfa.locator('[data-test="cihaz-secimi"]').textContent()) ?? "";
  kontrol("satılan cihaz listede yok", !kalanMetin.includes(imei(2)), imei(2));

  // ----------------- 3) Sepetteki cihaz ikinci okutmada tekrar gelmemeli
  await sayfa
    .locator('[data-test="secim-adayi"]')
    .filter({ hasText: imei(1) })
    .click();
  await sayfa.waitForTimeout(2000);
  const mesaj3 = await okut(BARKOD);
  kontrol(
    "sepettekiler çıkarılınca tek cihaz kalıyor ve doğrudan ekleniyor",
    mesaj3.includes("eklendi"),
    mesaj3.slice(0, 80),
  );
  const sepetMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "iki cihaz da sepette",
    sepetMetni.includes(imei(1)) && sepetMetni.includes(imei(3)),
  );

  // --------------- 4) Hepsi tükendiğinde açıklayıcı mesaj
  const mesaj4 = await okut(BARKOD);
  kontrol(
    "stokta cihaz kalmayınca nedeni söyleniyor",
    mesaj4.includes("zaten listede") || mesaj4.includes("stokta cihaz yok"),
    mesaj4.slice(0, 90),
  );
  await sayfa.screenshot({ path: `${cikti}-satis.png`, fullPage: true });

  // --------------- 5) Seri numarası okutulunca soru sorulmamalı
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  const mesaj5 = await okut(imei(3));
  kontrol(
    "seri no okutunca doğrudan ekleniyor",
    mesaj5.includes("eklendi") &&
      (await sayfa.locator('[data-test="cihaz-secimi"]').count()) === 0,
    mesaj5.slice(0, 80),
  );

  // --------------- 6) Satılmış serinin kendisi okutulursa uyarı aynı kalmalı
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  const mesaj6 = await okut(imei(2));
  kontrol(
    "satılmış serinin kendisi okutulunca açıkça söyleniyor",
    mesaj6.includes("daha önce satılmış"),
    mesaj6.slice(0, 80),
  );
  kontrol(
    "satılmış seri okutulunca başka cihaza kaymıyor",
    (await sayfa.locator('[data-test="cihaz-secimi"]').count()) === 0,
  );

  // ------------------------------- 7) SEVKİYAT: aynı seçim orada da olmalı
  await sayfa.goto(`${hedef}/sevkiyat/yeni`, { waitUntil: "networkidle" });
  await sayfa.selectOption("#kaynak", { label: "1 Nolu Mağaza" });
  await sayfa.selectOption("#hedef", { label: "2 Nolu Mağaza" });
  await sayfa.waitForTimeout(500);
  const mesaj7 = await okut(BARKOD);
  kontrol(
    "sevkiyatta da seçim listesi çıkıyor",
    (await sayfa.locator('[data-test="cihaz-secimi"]').count()) === 1,
    mesaj7.slice(0, 80),
  );
  const sevkAday = await sayfa.locator('[data-test="secim-adayi"]').count();
  kontrol(
    "sevkiyatta stoktaki iki cihaz listeleniyor",
    sevkAday === 2,
    `${sevkAday} aday (2 bekleniyor)`,
  );

  await sayfa
    .locator('[data-test="secim-adayi"]')
    .filter({ hasText: imei(3) })
    .click();
  await sayfa.waitForTimeout(2000);
  const sevkListe = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("sevkiyat listesine seçilen cihaz eklendi", sevkListe.includes(imei(3)), imei(3));

  // Listedeki cihaz ikinci okutmada tekrar gelmemeli.
  const mesaj8 = await okut(BARKOD);
  kontrol(
    "sevkiyatta listedeki cihaz çıkarılıyor",
    mesaj8.includes("eklendi"),
    mesaj8.slice(0, 80),
  );
  const sevkSon = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "sevkiyatta iki cihaz da listede",
    sevkSon.includes(imei(1)) && sevkSon.includes(imei(3)),
  );

  await Promise.all([
    sayfa.waitForURL(/\/sevkiyat\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Sevkiyatı Gönder")'),
  ]);
  kontrol("sevkiyat açıldı", /\/sevkiyat\/\d+$/.test(sayfa.url()), sayfa.url());

  // ----------- 8) Sevkiyattaki cihaz satışta uygun görünmemeli
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  const mesaj9 = await okut(BARKOD);
  kontrol(
    "sevkiyattaki cihazlar satışa çıkmıyor",
    mesaj9.includes("sevkiyatta") || mesaj9.includes("stokta cihaz yok"),
    mesaj9.slice(0, 90),
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
