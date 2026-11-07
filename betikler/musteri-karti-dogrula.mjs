// Listelerden satışa ve müşteri kartına giden yollar.
//
// Kullanıcının istediği üç şey:
//   1. Cihaz listesinde SERİ NUMARASINA tıklayınca, satılmışsa satışına
//      (fişine) gitmek; satılmamışsa cihaz detayına.
//   2. Aynı listede ALICI'ya tıklayınca satışın fişine gitmek.
//   3. Müşteri listesinde ADA tıklayınca o müşterinin bugüne kadar aldığı
//      bütün ürünleri tarihleriyle görmek.
//
// Müşteri listesi artık müşteri başına yalnız son birkaç cihazı gösteriyor
// (sayfa uygulamanın en ağırıydı); tamamı müşteri kartında. Bu yüzden
// listedeki "N cihaz" sayısı kısaltılmış listeden değil ayrı bir toplama
// sorgusundan geliyor — test o sayının gerçek adet olduğunu da ölçüyor.
import { chromium } from "@playwright/test";
import { gunMetni } from "./ortak-tarih.mjs";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/musteri-karti";
const SIFRE = "Stok2026!";

const damga = Date.now().toString().slice(-8);
const imei = (i) => `35${damga}${String(i).padStart(5, "0")}`.slice(0, 15);
const MUSTERI = `Kart Müşteri ${damga}`;
const SATILAN = [1, 2, 3, 4, 5, 6];

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const baglam = await tarayici.newContext({
  viewport: { width: 1600, height: 1200 },
  locale: "tr-TR",
});
const sayfa = await baglam.newPage();
const konsolHatalari = [];
sayfa.on("console", (m) => {
  // Görünürlük sınamasında bilerek 404'e gidiliyor.
  if (m.type() === "error" && !/status of 404/.test(m.text())) {
    konsolHatalari.push(m.text());
  }
});
sayfa.on("pageerror", (e) => konsolHatalari.push(String(e)));

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
  await Promise.all([
    sayfa.waitForURL("**/panel"),
    sayfa.click('button[type="submit"]'),
  ]);
}

/** Cihaz listesini tek cihaza inmeden açar (IMEI araması detaya atlıyor). */
async function cihazListesi(durum) {
  await sayfa.goto(`${hedef}/cihazlar?ara=KARTM${damga}&durum=${durum}`, {
    waitUntil: "networkidle",
  });
}

try {
  await giris("admin");

  // -------------------------------------------------- 0) yedi cihaz gir
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `MK${damga}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1200);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(`KARTM${damga}`);
  await alanlar.nth(2).fill("FON M");
  await kart.locator('input[inputmode="decimal"]').fill("5.000,00");
  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const i of [...SATILAN, 7]) {
    await imeiKutusu.fill(imei(i));
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(300);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `MK-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);

  // Altısı tek satışta aynı müşteriye; biri stokta kalıyor.
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  for (const i of SATILAN) {
    await sayfa.fill("#okutmaKutusu", imei(i));
    await sayfa.press("#okutmaKutusu", "Enter");
    await sayfa.waitForTimeout(900);
  }
  const fiyatlar = sayfa.locator('[data-test="sepet-fiyat"]');
  kontrol("hazırlık: altı cihaz sepette", (await fiyatlar.count()) === 6, `${await fiyatlar.count()}`);
  for (let i = 0; i < 6; i += 1) await fiyatlar.nth(i).fill("7.500,00");
  await sayfa.fill("#yeniAd", MUSTERI);
  await sayfa.fill("#yeniTelefon", `544${damga}`);
  await Promise.all([
    sayfa.waitForURL(/\/satislar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Cihazı Sat")'),
  ]);
  const kartYolu = new URL(sayfa.url()).pathname;
  const satisNo = ((await sayfa.locator("h1").first().textContent()) ?? "").trim();
  kontrol("hazırlık: satış kartı açıldı", /^SAT-\d{8}-\d{3}$/.test(satisNo), satisNo);

  // ============ 1) Cihaz listesinde seri numarası satışa götürüyor
  await cihazListesi("SATILDI");
  const seriBag = sayfa.locator('[data-test="seri-satis-baglantisi"]').first();
  kontrol("satılmış cihazın seri numarası bağlantı", (await seriBag.count()) > 0);
  const seriHedef = await seriBag.getAttribute("href");
  kontrol("seri numarası satış kartına gidiyor", seriHedef === kartYolu, `${seriHedef}`);
  await seriBag.click();
  await sayfa.waitForURL(/\/satislar\/\d+$/, { timeout: 20000 });
  const acilanKart = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "açılan fişte altı cihaz ve müşteri var",
    (await sayfa.locator('[data-test="satis-kalemi"]').count()) === 6 &&
      acilanKart.includes(MUSTERI),
  );

  // Stoktaki cihazın seri numarası cihaz detayına gitmeli.
  await cihazListesi("STOKTA");
  const stokSeri = sayfa.locator('[data-test="seri-cihaz-baglantisi"]').first();
  kontrol("stoktaki cihazın seri numarası cihaz detayına bağlı", (await stokSeri.count()) > 0);
  await stokSeri.click();
  await sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 20000 });
  const stokDetay = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("açılan cihaz stoktaki cihaz", stokDetay.includes(imei(7)), imei(7));

  // ==================== 2) Alıcıya tıklayınca satışın fişi açılıyor
  await cihazListesi("SATILDI");
  const aliciBag = sayfa.locator('[data-test="alici-satis-baglantisi"]').first();
  kontrol("alıcı adı bağlantı", (await aliciBag.count()) > 0);
  kontrol(
    "alıcı satış fişine gidiyor",
    (await aliciBag.getAttribute("href")) === kartYolu,
    `${await aliciBag.getAttribute("href")}`,
  );
  await aliciBag.click();
  await sayfa.waitForURL(/\/satislar\/\d+$/, { timeout: 20000 });
  kontrol("alıcıdan fişe geçildi", new URL(sayfa.url()).pathname === kartYolu, sayfa.url());

  // =============== 3) Müşteri listesinde ad müşteri kartına götürüyor
  await sayfa.goto(`${hedef}/musteriler?ara=${encodeURIComponent(MUSTERI)}`, {
    waitUntil: "networkidle",
  });
  const listeMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("listede gerçek cihaz adedi yazıyor", /6 cihaz/.test(listeMetni), (listeMetni.match(/\d+ cihaz/) ?? [""])[0]);
  kontrol(
    "listede toplam tutar gerçek toplam",
    listeMetni.includes("45.000,00"),
    "6 × 7.500,00",
  );
  kontrol(
    "listede kısaltılan cihazlar için 'tümünü gör' var",
    (await sayfa.locator('[data-test="musteri-tumu"]').count()) === 1,
  );

  const adBag = sayfa.locator('[data-test="musteri-karti-baglantisi"]').first();
  kontrol("müşteri adı bağlantı", (await adBag.count()) > 0);
  await adBag.click();
  await sayfa.waitForURL(/\/musteriler\/\d+$/, { timeout: 20000 });
  const musteriKartYolu = new URL(sayfa.url()).pathname;

  const alimSayisi = await sayfa.locator('[data-test="musteri-alimi"]').count();
  kontrol("müşteri kartında bütün alımlar listeli", alimSayisi === 6, `${alimSayisi} satır`);

  const alimTablosu = (await sayfa.locator('[data-test="musteri-alimlari"]').textContent()) ?? "";
  kontrol(
    "her cihazın seri numarası kartta",
    SATILAN.every((i) => alimTablosu.includes(imei(i))),
  );
  // Kapsayıcı UTC'de, uygulama Europe/Istanbul'da: gün hesabı uygulamanın
  // dilimine göre yapılmalı, yoksa gece yarısından sonra sahte düşüş olur.
  const bugun = gunMetni().split("-").reverse().join(".");
  kontrol("alımların tarihi yazıyor", alimTablosu.includes(bugun), bugun);
  kontrol("alım satırı satış fişine bağlı", alimTablosu.includes(satisNo), satisNo);
  const alimToplami = (await sayfa.locator('[data-test="musteri-alim-toplami"]').textContent()) ?? "";
  kontrol("kart toplamı doğru", alimToplami.includes("45.000,00"), alimToplami.trim());

  const kartGovde = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("kartta müşteri adı ve telefonu var", kartGovde.includes(MUSTERI) && kartGovde.includes(`544${damga}`));
  kontrol("kartta ilk ve son alış var", /İlk Alış/.test(kartGovde) && /Son Alış/.test(kartGovde));

  // Karttaki fiş bağlantısı çalışmalı.
  await sayfa.locator('[data-test="alim-satis-karti"]').first().click();
  await sayfa.waitForURL(/\/satislar\/\d+$/, { timeout: 20000 });
  kontrol("müşteri kartından fişe geçildi", new URL(sayfa.url()).pathname === kartYolu, sayfa.url());

  await sayfa.goto(`${hedef}${musteriKartYolu}`, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="musteri-alimi"] a[href^="/cihazlar/"]').first().click();
  await sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 20000 });
  kontrol("müşteri kartından cihaza geçildi", /\/cihazlar\/\d+$/.test(sayfa.url()), sayfa.url());

  await sayfa.goto(`${hedef}${musteriKartYolu}`, { waitUntil: "networkidle" });
  await sayfa.screenshot({ path: `${cikti}-kart.png`, fullPage: true });

  // ================= 4) Görünürlük: başka mağazanın satışları gizli
  // Müşteri kaydı mağazalar arasında ortak, ama ne aldığı o mağazanın
  // satış dökümü.
  await giris("personel2");
  await sayfa.goto(`${hedef}${musteriKartYolu}`, { waitUntil: "networkidle" });
  const yabanciKart = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "başka mağazanın personeli alımları görmüyor",
    !yabanciKart.includes(imei(1)),
    yabanciKart.replace(/\s+/g, " ").slice(0, 90),
  );
  kontrol(
    "müşteri kaydının kendisi görünüyor",
    yabanciKart.includes(MUSTERI),
    "kayıt ortak, alımlar mağazaya özel",
  );

  kontrol(
    "tarayıcı konsolunda hata yok",
    konsolHatalari.length === 0,
    konsolHatalari.slice(0, 2).join(" | "),
  );
} catch (hata) {
  kontrol("betik tamamlandı", false, String(hata).slice(0, 300));
  await sayfa.screenshot({ path: `${cikti}-hata.png`, fullPage: true }).catch(() => {});
} finally {
  await tarayici.close();
}

const basarisiz = sonuclar.filter((s) => !s.gecti);
console.log(`\n${sonuclar.length - basarisiz.length}/${sonuclar.length} kontrol geçti.`);
process.exit(basarisiz.length === 0 ? 0 : 1);
