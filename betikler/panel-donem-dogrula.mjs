// Dönem seçenekleri: panelde stoktan çıkanlar ve satış dökümü, satış
// ekranında son satışlar.
//
// Kullanıcının istediği: "bugün stoktan çıkanlar / dün stoktan çıkanlar /
// tarihle filtrelemeyle stoktan çıkanlar" ve satış dökümünde de "bu ay"
// yanında serbest tarih aralığı.
//
// Test iki satış kuruyor (biri bugüne, biri düne tarihli) ve her seçeneğin
// DOĞRU kaydı getirdiğini ölçüyor. Ayrıca iki şeye dikkat ediyor:
//   - Üstteki "Bugün Satılan" kartı listenin dönemine UYMAMALI; o her zaman
//     bugünü gösteriyor.
//   - Dönem düğmeleri diğer seçimleri (grafik ölçüsü gibi) düşürmemeli.
import { chromium } from "@playwright/test";
import { gunKaydir, gunMetni } from "./ortak-tarih.mjs";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/panel-donem";
const SIFRE = "Stok2026!";

const damga = Date.now().toString().slice(-8);
const imei = (i) => `35${damga}${String(i).padStart(5, "0")}`.slice(0, 15);
const BUGUN = gunMetni();
const DUN = gunKaydir(-1);
const MUSTERI = `Dönem Alıcı ${damga}`;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const baglam = await tarayici.newContext({
  viewport: { width: 1600, height: 1300 },
  locale: "tr-TR",
});
const sayfa = await baglam.newPage();
const konsolHatalari = [];
sayfa.on("console", (m) => {
  if (m.type() === "error") konsolHatalari.push(m.text());
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

async function panele(sorgu = "") {
  await sayfa.goto(`${hedef}/panel${sorgu}`, { waitUntil: "networkidle" });
  await sayfa.waitForTimeout(300);
}

/** Stoktan çıkanlar kartının gövde metni. */
async function cikisKarti() {
  const kart = sayfa
    .locator("section")
    .filter({ hasText: /Stoktan Çıkanlar/ })
    .first();
  return ((await kart.textContent()) ?? "").replace(/\s+/g, " ");
}

/** "Bugün Satılan" sayı kartındaki değer (panel-dokunus ile aynı yöntem). */
async function bugunSatilanDegeri() {
  const etiket = sayfa.getByText("Bugün Satılan", { exact: true }).first();
  const deger = etiket.locator("xpath=..").locator("div.text-2xl").first();
  return (await deger.textContent())?.trim() ?? "";
}

/** Tek cihazı okutup satar; cihaz detayının yolunu döner. */
async function sat(kod, fiyat) {
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutmaKutusu", kod);
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1200);
  await sayfa.locator('[data-test="sepet-fiyat"]').first().fill(fiyat);
  await sayfa.fill("#musteriSorgu", MUSTERI);
  await sayfa.locator('[data-test="musteri-ara"]').click();
  await sayfa.waitForTimeout(1500);
  const sec = sayfa.locator('[data-test="musteri-sec"]').first();
  if ((await sec.count()) > 0) await sec.click();
  else await sayfa.fill("#yeniAd", MUSTERI);
  await Promise.all([
    sayfa.waitForURL(/\/satislar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Satışı Kaydet")'),
  ]);
  await sayfa.locator('[data-test="satis-kalemi"] a[href^="/cihazlar/"]').first().click();
  await sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 20000 });
  return new URL(sayfa.url()).pathname;
}

try {
  await giris("admin");

  // ------------------------------------------------------ 0) üç cihaz gir
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `PD${damga}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1200);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(`PDMARKA${damga}`);
  await alanlar.nth(2).fill("FON P");
  await kart.locator('input[inputmode="decimal"]').fill("10.000,00");
  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const i of [1, 2, 3]) {
    await imeiKutusu.fill(imei(i));
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(300);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `PD-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);

  // 1 ve 3 bugüne, 2 düne tarihli satış. Bugünün adedi (2) dünden (1)
  // farklı: "Bugün Satılan" kartının dönemi izlemediği ancak böyle ölçülür.
  await sat(imei(1), "13.000,00");
  await sat(imei(3), "9.000,00");
  const dunkuYol = await sat(imei(2), "11.000,00");
  await sayfa.goto(`${hedef}${dunkuYol}`, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="satis-duzenle-ac"]').click();
  await sayfa.waitForTimeout(400);
  await sayfa.fill("#duzeltTarih", DUN);
  await sayfa.click('button:has-text("Değişiklikleri Kaydet")');
  await sayfa.waitForTimeout(2500);
  const dunkuDetay = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "hazırlık: ikinci satış düne alındı",
    dunkuDetay.includes(DUN.split("-").reverse().join(".")),
    DUN,
  );

  // ======================================= 1) Varsayılan: bugün çıkanlar
  await panele();
  const bugunKart = await cikisKarti();
  kontrol("varsayılan başlık 'Bugün Stoktan Çıkanlar'", bugunKart.includes("Bugün Stoktan Çıkanlar"), bugunKart.slice(0, 40));
  kontrol("bugünkü satışlar listede", bugunKart.includes(imei(1)) && bugunKart.includes(imei(3)));
  kontrol("dünkü satış bugün listesinde değil", !bugunKart.includes(imei(2)));
  kontrol("bugün toplamı iki cihaz", /2 cihaz/.test(bugunKart), (bugunKart.match(/\d+ cihaz/) ?? [""])[0]);
  kontrol("bugün cirosu iki satışın toplamı", bugunKart.includes("22.000,00"), "13.000 + 9.000");

  const secenekler = sayfa.locator('[data-test="cikis-donem-secici"] a');
  kontrol("çıkış listesinde üç dönem seçeneği var", (await secenekler.count()) === 3, `${await secenekler.count()}`);
  const secenekMetni = (await sayfa.locator('[data-test="cikis-donem-secici"]').textContent()) ?? "";
  for (const etiket of ["Bugün", "Dün", "Tarih Aralığı"]) {
    kontrol(`çıkış listesinde "${etiket}" var`, secenekMetni.includes(etiket));
  }

  // =============================================== 2) Dün stoktan çıkanlar
  await sayfa.locator('[data-test="cikis-donem-secici-dun"]').click();
  await sayfa.waitForURL(/cikisDonem=dun/, { timeout: 20000 });
  await sayfa.waitForTimeout(400);
  const dunKart = await cikisKarti();
  kontrol("başlık 'Dün Stoktan Çıkanlar' oluyor", dunKart.includes("Dün Stoktan Çıkanlar"), dunKart.slice(0, 40));
  kontrol("dünkü satış listede", dunKart.includes(imei(2)));
  kontrol("bugünkü satışlar dün listesinde değil", !dunKart.includes(imei(1)) && !dunKart.includes(imei(3)));
  kontrol("dün toplamı bir cihaz", /1 cihaz/.test(dunKart), (dunKart.match(/\d+ cihaz/) ?? [""])[0]);
  kontrol("dün cirosu dünkü satış tutarı", dunKart.includes("11.000,00"), dunKart.slice(0, 120));

  // Üstteki kart dönemi izlememeli: o her zaman bugünü söylüyor.
  // Liste düne bakarken bile üstteki kart BUGÜNÜ söylemeli: bugün 2, dün 1.
  kontrol(
    "'Bugün Satılan' kartı dönemden etkilenmiyor",
    (await bugunSatilanDegeri()) === "2",
    await bugunSatilanDegeri(),
  );

  // Başlık bağlantısı aynı aralığı cihaz listesine taşımalı.
  const dunBaslikBagi = await sayfa
    .locator('section a[href^="/cihazlar?durum=SATILDI"]')
    .first()
    .getAttribute("href");
  kontrol(
    "başlık bağlantısı dünün aralığını taşıyor",
    (dunBaslikBagi ?? "").includes(`satisBas=${DUN}`) &&
      (dunBaslikBagi ?? "").includes(`satisBit=${DUN}`),
    dunBaslikBagi ?? "",
  );

  // ============================================= 3) Serbest tarih aralığı
  await sayfa.locator('[data-test="cikis-donem-secici-aralik"]').click();
  await sayfa.waitForURL(/cikisDonem=aralik/, { timeout: 20000 });
  await sayfa.waitForTimeout(400);
  kontrol(
    "aralık seçilince tarih kutuları çıkıyor",
    (await sayfa.locator('[data-test="cikis-donem-secici-form"]').count()) === 1,
  );

  await sayfa.fill('[data-test="cikis-donem-secici-bas"]', DUN);
  await sayfa.fill('[data-test="cikis-donem-secici-bit"]', BUGUN);
  await Promise.all([
    sayfa.waitForURL(/cikisBas=/, { timeout: 20000 }),
    sayfa.locator('[data-test="cikis-donem-secici-uygula"]').click(),
  ]);
  await sayfa.waitForTimeout(400);
  const ikiGun = await cikisKarti();
  kontrol(
    "iki günlük aralıkta üç satış da listede",
    ikiGun.includes(imei(1)) && ikiGun.includes(imei(2)) && ikiGun.includes(imei(3)),
  );
  kontrol("iki günlük aralığın toplamı üç cihaz", /3 cihaz/.test(ikiGun), (ikiGun.match(/\d+ cihaz/) ?? [""])[0]);
  kontrol("aralık cirosu üç satışın toplamı", ikiGun.includes("33.000,00"), "13.000 + 11.000 + 9.000");
  kontrol("aralık başlıkta tarihlerle yazıyor", ikiGun.includes("Stoktan Çıkanlar —"), ikiGun.slice(0, 60));

  // Yalnız dünü kapsayan aralık bugünü getirmemeli.
  await panele(`?cikisDonem=aralik&cikisBas=${DUN}&cikisBit=${DUN}`);
  const yalnizDun = await cikisKarti();
  kontrol(
    "yalnız dünü kapsayan aralıkta bugünkü satışlar yok",
    !yalnizDun.includes(imei(1)) && !yalnizDun.includes(imei(3)) && yalnizDun.includes(imei(2)),
  );

  // Geçmişte kalan boş bir aralık "kayıt yok" demeli.
  await panele(`?cikisDonem=aralik&cikisBas=${gunKaydir(-40)}&cikisBit=${gunKaydir(-35)}`);
  kontrol(
    "satış olmayan aralıkta boş mesajı var",
    (await sayfa.locator('[data-test="cikis-bos"]').count()) === 1,
    ((await cikisKarti()) ?? "").slice(0, 80),
  );

  // Ters girilen aralık sessizce düzeltiliyor.
  await panele(`?cikisDonem=aralik&cikisBas=${BUGUN}&cikisBit=${DUN}`);
  const ters = await cikisKarti();
  kontrol("ters aralık düzeltiliyor", ters.includes(imei(1)) && ters.includes(imei(2)), ters.slice(0, 60));
  kontrol("ters aralıkta da üç cihaz sayılıyor", /3 cihaz/.test(ters), (ters.match(/\d+ cihaz/) ?? [""])[0]);

  // ================================ 4) Satış dökümünde ay ve tarih aralığı
  await panele("?satisDonem=ay#satislar");
  const ayDokumu = (await sayfa.locator('[data-test="personel-satis"]').textContent()) ?? "";
  // Ay başında dün önceki aya düşebiliyor: aynı aydaysa üç satış (33.000),
  // değilse yalnız bugünküler (22.000).
  kontrol(
    "bu ay dökümü bugünkü satışları kapsıyor",
    ayDokumu.includes("Sistem Yöneticisi") &&
      /33\.000,00|22\.000,00/.test(ayDokumu),
    ayDokumu.replace(/\s+/g, " ").slice(0, 100),
  );
  const ayBaslik = ((await sayfa.locator("h2").filter({ hasText: "Satış Dökümü" }).textContent()) ?? "").trim();
  kontrol("başlık 'bu ay' diyor", ayBaslik.includes("bu ay"), ayBaslik);

  await panele(`?satisDonem=aralik&satisBas=${DUN}&satisBit=${DUN}#satislar`);
  const aralikBaslik = ((await sayfa.locator("h2").filter({ hasText: "Satış Dökümü" }).textContent()) ?? "").trim();
  kontrol("satış dökümü başlığı aralığı yazıyor", /\d{2}\.\d{2}\.\d{4}/.test(aralikBaslik), aralikBaslik);
  const aralikDokum = (await sayfa.locator('[data-test="personel-satis"]').textContent()) ?? "";
  kontrol(
    "aralık dökümünde yalnız dünkü satış sayılıyor",
    aralikDokum.includes("11.000,00") && !aralikDokum.includes("13.000,00"),
    aralikDokum.replace(/\s+/g, " ").slice(0, 100),
  );

  // Dönem düğmesi diğer seçimleri düşürmemeli (grafik ölçüsü).
  await panele("?olcu=ciro&urunDonem=tum");
  await sayfa.locator('[data-test="satis-donem-secici-ay"]').click();
  await sayfa.waitForURL(/satisDonem=ay/, { timeout: 20000 });
  kontrol(
    "dönem değişince grafik ölçüsü korunuyor",
    sayfa.url().includes("olcu=ciro") && sayfa.url().includes("urunDonem=tum"),
    sayfa.url(),
  );

  // ============== 4b) Karttaki satır bağları: seri no, müşteri, sevk
  // Paneldeki satırdan cihazın hikâyesine ve müşteri kartına geçilebilmeli;
  // satışın fişi zaten başlıkta.
  await panele();
  const seriBag = sayfa.locator('[data-test="cikis-seri-baglantisi"]').first();
  kontrol("satırda seri no bağlantısı var", (await seriBag.count()) === 1);
  await seriBag.click();
  await sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 20000 });
  const cihazMetni = (await sayfa.locator("main").textContent()) ?? "";
  // Hangi satırın açıldığı sıraya bağlı; ölçüt, bugün satılan cihazlardan
  // birinin tarihçeli detay sayfasına gelmiş olmak.
  kontrol(
    "seri no cihazın tarihçesine götürdü",
    /Sevkiyat ve Hareket Tarihçesi/.test(cihazMetni) &&
      (cihazMetni.includes(imei(1)) || cihazMetni.includes(imei(3))),
    `${sayfa.url()} · ${cihazMetni.slice(0, 60).replace(/\s+/g, " ")}`,
  );

  await panele();
  const musteriBag = sayfa.locator('[data-test="cikis-musteri-baglantisi"]').first();
  kontrol("satırda müşteri bağlantısı var", (await musteriBag.count()) === 1);
  await musteriBag.click();
  await sayfa.waitForURL(/\/musteriler\/\d+$/, { timeout: 20000 });
  kontrol(
    "müşteri adı müşteri kartına götürdü",
    ((await sayfa.locator("main").textContent()) ?? "").includes(MUSTERI),
    sayfa.url(),
  );

  // ================== 5) Satış ekranındaki "Son Satışlar" kartı
  // Satış yaparken panele gidip dönmek gerekiyordu; aynı kart burada da.
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  const satisKart = async () =>
    ((await sayfa
      .locator("section")
      .filter({ hasText: /Son Satışlar/ })
      .first()
      .textContent()) ?? "").replace(/\s+/g, " ");

  const satisBugun = await satisKart();
  kontrol("satış ekranında son satışlar kartı var", satisBugun.includes("Son Satışlar"), satisBugun.slice(0, 40));
  kontrol("kart bugünkü satışları gösteriyor", satisBugun.includes(imei(1)) && satisBugun.includes(imei(3)));
  kontrol("dünkü satış bugün kartında yok", !satisBugun.includes(imei(2)));
  kontrol("kart özeti iki cihaz", /2 cihaz/.test(satisBugun), (satisBugun.match(/\d+ cihaz/) ?? [""])[0]);

  await sayfa.locator('[data-test="satis-cikis-secici-dun"]').click();
  await sayfa.waitForURL(/\/satis\?donem=dun/, { timeout: 20000 });
  await sayfa.waitForTimeout(300);
  const satisDun = await satisKart();
  kontrol("satış ekranında dün seçilebiliyor", satisDun.includes(imei(2)) && !satisDun.includes(imei(1)), satisDun.slice(0, 60));

  await sayfa.locator('[data-test="satis-cikis-secici-aralik"]').click();
  await sayfa.waitForURL(/donem=aralik/, { timeout: 20000 });
  await sayfa.fill('[data-test="satis-cikis-secici-bas"]', DUN);
  await sayfa.fill('[data-test="satis-cikis-secici-bit"]', BUGUN);
  await Promise.all([
    sayfa.waitForURL(/bas=/, { timeout: 20000 }),
    sayfa.locator('[data-test="satis-cikis-secici-uygula"]').click(),
  ]);
  await sayfa.waitForTimeout(300);
  const satisAralik = await satisKart();
  kontrol(
    "satış ekranında tarih aralığı çalışıyor",
    /3 cihaz/.test(satisAralik) && satisAralik.includes("33.000,00"),
    satisAralik.slice(0, 80),
  );
  // Okutma kutusu kartın altında kaybolmamalı: ekranın asıl işi satış.
  kontrol(
    "okutma kutusu hâlâ ekranda",
    (await sayfa.locator("#okutmaKutusu").count()) === 1,
  );

  await sayfa.screenshot({ path: `${cikti}-satis.png`, fullPage: true });
  await panele();
  await sayfa.screenshot({ path: `${cikti}-son.png`, fullPage: true });

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
