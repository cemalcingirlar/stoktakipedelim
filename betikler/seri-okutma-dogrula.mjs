// Arka arkaya (seri) cihaz okutma testi: imleç okutma kutusunda kalmalı.
//
// Barkod okuyucu bir klavye gibi tuş tuş yazar. Odak kutuda değilse yazdığı
// karakterler hiçbir yere gitmez ve operatör her cihazdan sonra elle tıklamak
// zorunda kalır. Okutma sürerken kutu `disabled` olduğu için tarayıcı odağı
// bırakıyordu ve geri veren yoktu.
//
// Bu yüzden testte bilerek `fill()` KULLANILMIYOR: fill odağı kendisi verdiği
// için odak kaybını gizler — hatanın bugüne kadar fark edilmemesinin sebebi de
// buydu. Gerçek okuyucu gibi `keyboard.type()` ile yazıyoruz; odak kutuda
// değilse cihaz hiç eklenmez ve test düşer.
//
// Kapsam: Sayım ve Satış ekranları. İkisi de Sevkiyat, Sevkiyat Kabul ve
// Mağaza İçi Aktarım ile aynı OkutmaKutusu bileşenini kullanıyor.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/seri-okutma";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
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

const odak = () => sayfa.evaluate(() => document.activeElement?.id ?? "");

/** Gerçek barkod okuyucu gibi: hiçbir yere tıklamadan, klavyeden yaz ve Enter. */
async function klavyedenOkut(kod) {
  await sayfa.keyboard.type(kod);
  await sayfa.keyboard.press("Enter");
  await sayfa.waitForTimeout(1300);
}

/** Üç cihazlık bir fatura girer; cihazlar 1 Nolu Mağaza'ya düşer. */
async function cihazlariGir() {
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `SER${damga}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1200);

  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill("Samsung");
  await alanlar.nth(2).fill("Galaxy S24");
  await kart.locator('input[inputmode="decimal"]').fill("20.000,00");

  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const i of [1, 2, 3]) {
    await imeiKutusu.fill(imei(i));
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(400);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `SER-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
}

try {
  await giris("admin");
  await cihazlariGir();

  // =================================================== 1) SAYIM EKRANI
  await giris("sorumlu1");
  await sayfa.goto(`${hedef}/sayim`, { waitUntil: "networkidle" });
  const magazaDeger = await sayfa
    .locator("#magazaId option", { hasText: "1 Nolu" })
    .first()
    .getAttribute("value");
  await sayfa.selectOption("#magazaId", magazaDeger);
  await Promise.all([
    sayfa.waitForURL(/\/sayim\/\d+$/, { timeout: 20000 }),
    sayfa.click('button:has-text("Sayımı Başlat")'),
  ]);
  const sayimUrl = sayfa.url();
  kontrol("sayım başlatıldı", /\/sayim\/\d+$/.test(sayimUrl), new URL(sayimUrl).pathname);

  kontrol("sayım: açılışta imleç okutma kutusunda", (await odak()) === "okutmaKutusu", await odak());

  /** Sayım ekranındaki "Okutulan" sayacı. */
  async function okutulanSayisi() {
    const metin = (await sayfa.locator("div.grid").first().textContent()) ?? "";
    return Number((metin.replace(/\s+/g, " ").match(/Okutulan\s*(\d+)/) ?? [0, "-1"])[1]);
  }

  await klavyedenOkut(imei(1));
  kontrol(
    "sayım: 1. cihaz klavyeden okutuldu (tıklamadan)",
    (await okutulanSayisi()) === 1,
    `okutulan ${await okutulanSayisi()}`,
  );
  kontrol(
    "sayım: okutmadan sonra imleç kutuda kaldı",
    (await odak()) === "okutmaKutusu",
    await odak(),
  );

  await klavyedenOkut(imei(2));
  kontrol(
    "sayım: 2. cihaz da tıklamadan okutuldu",
    (await okutulanSayisi()) === 2,
    `okutulan ${await okutulanSayisi()}`,
  );
  kontrol(
    "sayım: ikinci okutmadan sonra da imleç kutuda",
    (await odak()) === "okutmaKutusu",
    await odak(),
  );

  // Hata döndüren okutma da odağı düşürmemeli: operatör yanlış kod okutunca
  // da elle tıklamak zorunda kalmamalı.
  await klavyedenOkut("999888777666555");
  kontrol(
    "sayım: kayıtsız kod okutulunca da imleç kutuda",
    (await odak()) === "okutmaKutusu",
    await odak(),
  );
  const fazlaMetni = (await sayfa.locator("div.grid").first().textContent()) ?? "";
  kontrol(
    "sayım: kayıtsız kod fazla listesine düştü",
    /Fazla\s*1/.test(fazlaMetni.replace(/\s+/g, " ")),
    fazlaMetni.replace(/\s+/g, " ").trim(),
  );

  await sayfa.screenshot({ path: `${cikti}-sayim.png`, fullPage: true });

  // Sayımı kapat ki cihazlar satış testinde kullanılabilsin.
  await sayfa.click('button:has-text("Sayımı Kapat")');
  await sayfa.waitForTimeout(1500);

  // =================================================== 2) SATIŞ EKRANI
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  kontrol("satış: açılışta imleç okutma kutusunda", (await odak()) === "okutmaKutusu", await odak());

  // Sepet bir tablo değil, liste: her cihaz bir <li data-test="sepet-satiri">.
  const sepetSatiri = () => sayfa.locator('[data-test="sepet-satiri"]');

  await klavyedenOkut(imei(1));
  kontrol(
    "satış: 1. cihaz klavyeden sepete eklendi (tıklamadan)",
    (await sepetSatiri().count()) === 1,
    `${await sepetSatiri().count()} satır`,
  );
  kontrol(
    "satış: okutmadan sonra imleç kutuda kaldı",
    (await odak()) === "okutmaKutusu",
    await odak(),
  );

  await klavyedenOkut(imei(2));
  kontrol(
    "satış: 2. cihaz da tıklamadan sepete eklendi",
    (await sepetSatiri().count()) === 2,
    `${await sepetSatiri().count()} satır`,
  );
  kontrol(
    "satış: ikinci okutmadan sonra da imleç kutuda",
    (await odak()) === "okutmaKutusu",
    await odak(),
  );

  // Aynı cihazı tekrar okutmak uyarı verir; uyarıdan sonra da odak kalmalı.
  await klavyedenOkut(imei(2));
  kontrol(
    "satış: uyarıdan sonra da imleç kutuda",
    (await odak()) === "okutmaKutusu",
    await odak(),
  );
  kontrol(
    "satış: tekrar okutma sepete ikinci kez eklemedi",
    (await sepetSatiri().count()) === 2,
    `${await sepetSatiri().count()} satır`,
  );

  await sayfa.screenshot({ path: `${cikti}-satis.png`, fullPage: true });

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
