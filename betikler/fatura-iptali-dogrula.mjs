// Yanlış girilmiş alış faturasının iptali testi.
//
// Fatura iptal edilemiyordu: yanlış girilen bir fatura hem stok değerini hem
// tedarikçi borcunu kalıcı olarak bozuyordu.
//
// Test "iptal düğmesi çalışıyor" ile yetinmiyor: faturanın bütün cihazlarının
// iptal olduğu, tutarın VADE raporundan düştüğü, fatura numarasının serbest
// kalıp aynı numarayla yeniden girilebildiği ve satılmış cihazı olan
// faturanın iptal EDİLEMEDİĞİ tek tek sayılıyor.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/fatura-iptali";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);
const FATURA_NO = `FIP-${damga}`;
const FATURA_NO_2 = `FIP2-${damga}`;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1500, height: 1100 }, locale: "tr-TR" });
const hatalar = [];
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

/** Vadeli fatura girer; fatura detay adresini döner. */
async function faturaGir({ faturaNo, imeiler, marka }) {
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `FIP${damga}${marka.slice(-3)}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1400);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(marka);
  await alanlar.nth(2).fill("FON F");
  await kart.locator('input[inputmode="decimal"]').fill("2.000,00");
  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const no of imeiler) {
    await imeiKutusu.fill(no);
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(320);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", faturaNo);
  // Vadeli: iptalin borç raporundan düştüğünü ölçebilmek için.
  const vade = sayfa.locator("#vadeGun");
  if ((await vade.count()) > 0) await vade.selectOption("21").catch(() => {});
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
  return sayfa.url();
}

/** Rapor ekranındaki vade listesinde bu fatura numarası geçiyor mu? */
async function vadedeGorunuyorMu(no) {
  await sayfa.goto(`${hedef}/rapor`, { waitUntil: "networkidle" });
  const govde = ((await sayfa.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
  return govde.includes(no);
}

try {
  await giris("admin");

  // ---------------------------------------------- 0) İki fatura
  const faturaUrl = await faturaGir({
    faturaNo: FATURA_NO,
    imeiler: [imei(1), imei(2)],
    marka: `FIPMARKA${damga}`,
  });
  const satilacakUrl = await faturaGir({
    faturaNo: FATURA_NO_2,
    imeiler: [imei(5)],
    marka: `FIPSAT${damga}`,
  });
  console.log(`0) hazırlık: ${FATURA_NO} (2 cihaz) ve ${FATURA_NO_2} (1 cihaz)`);

  kontrol("vadeli fatura raporda görünüyor", await vadedeGorunuyorMu(FATURA_NO), FATURA_NO);

  // ---------------------------------------------- 1) İptal bölümü
  await sayfa.goto(faturaUrl, { waitUntil: "networkidle" });
  kontrol(
    "yöneticide fatura iptali var",
    (await sayfa.locator('[data-test="fatura-iptal-ac"]').count()) === 1,
  );

  // ---------------------------------------------- 2) Gerekçeyle iptal
  await sayfa.locator('[data-test="fatura-iptal-ac"]').click();
  await sayfa.waitForTimeout(300);
  await sayfa.fill("#faturaGerekce", "Fatura iki kez girilmis");
  await sayfa.click('button:has-text("Evet, Faturayı İptal Et")');
  await sayfa.waitForTimeout(2200);

  await sayfa.goto(faturaUrl, { waitUntil: "networkidle" });
  const detay = ((await sayfa.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
  kontrol("fatura iptal edilmiş görünüyor", detay.includes("iptal edildi"), detay.slice(0, 70));
  kontrol("gerekçe duruyor", detay.includes("Fatura iki kez girilmis"));
  const iptalliKalem = (detay.match(/İptal Edildi/g) ?? []).length;
  kontrol("faturadaki iki cihaz da iptal", iptalliKalem >= 2, `${iptalliKalem} iptal rozeti`);
  await sayfa.screenshot({ path: `${cikti}-fatura.png`, fullPage: true });

  // ------------------------------- 3) Vade raporundan düştü
  const vadedeVar = await vadedeGorunuyorMu(FATURA_NO);
  kontrol("iptal edilen fatura vade raporundan düştü", !vadedeVar, FATURA_NO);

  // ------------------------------- 4) Listede iptal rozeti
  await sayfa.goto(`${hedef}/faturalar`, { waitUntil: "networkidle" });
  kontrol(
    "faturalar listesinde iptal rozeti var",
    (await sayfa.locator('[data-test="fatura-iptal-rozeti"]').count()) >= 1,
  );

  // ------------------------------- 5) Numara serbest kaldı
  const yeniUrl = await faturaGir({
    faturaNo: FATURA_NO,
    imeiler: [imei(7)],
    marka: `FIPYENI${damga}`,
  });
  kontrol(
    "aynı numarayla yeni fatura girilebiliyor",
    /\/faturalar\/\d+$/.test(yeniUrl) && yeniUrl !== faturaUrl,
    yeniUrl,
  );

  // ------------------------------- 6) Satılmış cihazlı fatura iptal edilemez
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutmaKutusu", imei(5));
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1200);
  await sayfa.locator('[data-test="sepet-fiyat"]').first().fill("2.500,00");
  await sayfa.fill("#musteriSorgu", `FIP MUSTERI ${damga}`);
  await sayfa.locator('[data-test="musteri-ara"]').click();
  await sayfa.waitForTimeout(1500);
  const sec = sayfa.locator('[data-test="musteri-sec"]').first();
  if ((await sec.count()) > 0) await sec.click();
  else await sayfa.fill("#yeniAd", `FIP MUSTERI ${damga}`);
  await Promise.all([
    sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Satışı Kaydet")'),
  ]);

  await sayfa.goto(satilacakUrl, { waitUntil: "networkidle" });
  kontrol(
    "satılmış cihazlı faturada iptal düğmesi yok",
    (await sayfa.locator('[data-test="fatura-iptal-ac"]').count()) === 0,
  );
  const engel = await sayfa.locator('[data-test="fatura-iptal-engeli"]').textContent().catch(() => "");
  kontrol(
    "sebebi yazıyor",
    /satılmış/i.test(engel ?? ""),
    (engel ?? "").trim().slice(0, 70),
  );

  // ------------------------------- 7) Personel iptal edemez
  await giris("personel1");
  await sayfa.goto(faturaUrl, { waitUntil: "networkidle" });
  kontrol(
    "personelde fatura iptali yok",
    (await sayfa.locator('[data-test="fatura-iptal-ac"]').count()) === 0,
  );

  kontrol("sayfa hatası yok", hatalar.length === 0, hatalar.slice(0, 2).join(" | "));
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
