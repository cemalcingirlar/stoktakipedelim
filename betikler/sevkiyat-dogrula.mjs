// Sevkiyat sistemi uçtan uca testi.
//
// Bildirilen hata: tüm cihazlar okutulduğunda kabul paneli kayboluyor,
// "Kabulü Tamamla" düğmesine basılamıyor, sevkiyat sonsuza kadar "Onay
// Bekliyor"da kalıyor ve ekranda yanlışlıkla "yalnızca hedef mağaza
// kullanıcıları kabul edebilir" uyarısı çıkıyordu.
//
// Kapsam: gönderme, tek tek okutma, hepsi okutulunca panelin durması, kabulün
// tamamlanması, bekleyen listelerinden düşmesi, kısmi kabul, ek yetkili
// kullanıcının kabul edebilmesi ve yetkisiz kullanıcının edememesi.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/sevkiyat";
const SIFRE = "Stok2026!";

const damga = Date.now().toString().slice(-8);
const imei = (i) => `37${damga}${String(i).padStart(5, "0")}`.slice(0, 15);

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const baglam = await tarayici.newContext({ viewport: { width: 1500, height: 1200 }, locale: "tr-TR" });
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
  await Promise.all([sayfa.waitForURL("**/panel"), sayfa.click('button[type="submit"]')]);
}

async function okut(kod) {
  await sayfa.fill("#okutmaKutusu", kod);
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1100);
}

/** Üç cihazlık bir fatura girer; cihazlar 1 Nolu Mağaza'ya düşer. */
async function cihazlariGir(ek) {
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `SVK${damga}${ek}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1200);

  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill("Samsung");
  await alanlar.nth(2).fill("Galaxy A55");
  await kart.locator('input[inputmode="decimal"]').fill("10.000,00");

  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const i of ek) {
    await imeiKutusu.fill(imei(i));
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(400);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `SVK-${damga}-${ek.join("")}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
}

/** Verilen cihazları 1 Nolu Mağaza'dan 2 Nolu Mağaza'ya sevk eder. */
async function sevkEt(kodlar, hedefMagaza = "2 Nolu Mağaza") {
  await sayfa.goto(`${hedef}/sevkiyat/yeni`, { waitUntil: "networkidle" });
  await sayfa.selectOption("#hedef", { label: hedefMagaza });
  for (const kod of kodlar) await okut(kod);
  await Promise.all([
    sayfa.waitForURL(/\/sevkiyat\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Sevkiyatı Gönder")'),
  ]);
  return sayfa.url();
}

try {
  // ------------------------------------------------ hazırlık
  await giris("admin");
  await cihazlariGir([1, 2, 3]);

  // ------------------------------------------------ 1) gönderme
  const sevkiyatYolu = await sevkEt([imei(1), imei(2)]);
  kontrol("sevkiyat oluşturuldu", /\/sevkiyat\/\d+$/.test(sevkiyatYolu), sevkiyatYolu);

  const ilkDurum = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("durum 'Onay Bekliyor'", /Onay Bekliyor/.test(ilkDurum));

  // Gönderen mağazanın kullanıcısı kabul edemez, uyarı görmeli.
  await giris("personel1");
  await sayfa.goto(sevkiyatYolu, { waitUntil: "networkidle" });
  const gonderenGorunum = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "gönderen mağaza kullanıcısına kabul paneli çıkmıyor",
    /yalnızca/.test(gonderenGorunum) && (await sayfa.locator("#okutmaKutusu").count()) === 0,
  );

  // ------------------------------------------------ 2) hedef mağaza kabul
  await giris("personel2");
  await sayfa.goto(sevkiyatYolu, { waitUntil: "networkidle" });
  kontrol(
    "hedef mağaza kullanıcısına kabul paneli çıkıyor",
    (await sayfa.locator("#okutmaKutusu").count()) === 1,
  );
  kontrol(
    "yetkili kullanıcıya yanlış uyarı gösterilmiyor",
    !/yalnızca .* kullanıcıları kabul edebilir/.test(
      (await sayfa.locator("main").textContent()) ?? "",
    ),
  );

  // İmleç okutma kutusunda olmalı (barkod okuyucu doğrudan yazabilsin).
  const odakli = await sayfa.evaluate(() => document.activeElement?.id ?? "");
  kontrol("imleç okutma kutusunda", odakli === "okutmaKutusu", odakli || "(odak yok)");

  // Cihazları tek tek okut.
  await okut(imei(1));
  await okut(imei(2));

  const okutmaSonrasi = (await sayfa.locator("main").textContent()) ?? "";
  const kabulRozeti = (await sayfa.locator('[data-test="kabul-rozeti"]').textContent()) ?? "";
  kontrol("iki cihaz da okutuldu", kabulRozeti.trim() === "2 kabul", kabulRozeti.trim());

  // ---- ASIL HATA: hepsi okutulunca panel kaybolmamalı
  kontrol(
    "hepsi okutulunca kabul paneli duruyor",
    (await sayfa.locator('button:has-text("Kabulü Tamamla")').count()) === 1,
  );
  kontrol(
    "hepsi okutulunca yanlış uyarı çıkmıyor",
    !/yalnızca .* kullanıcıları kabul edebilir/.test(okutmaSonrasi),
  );

  // ------------------------------------------------ 3) kabulü tamamla
  await sayfa.click('button:has-text("Kabulü Tamamla")');
  await sayfa.waitForTimeout(2500);
  const kabulSonrasi = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("kabul sonrası durum 'Kabul'", /Kabul Edildi|Kabul\b/.test(kabulSonrasi));
  kontrol("artık 'Onay Bekliyor' yazmıyor", !/Onay Bekliyor/.test(kabulSonrasi));
  kontrol("kabul eden kaydedildi", /2 Nolu Mağaza Personeli/.test(kabulSonrasi));

  // ------------------------------------------------ 4) bekleyen listelerinden düştü
  await sayfa.goto(`${hedef}/sevkiyat`, { waitUntil: "networkidle" });
  const listeMetni = (await sayfa.locator("main").textContent()) ?? "";
  const bekleyenBasligi = listeMetni.match(/Onayınızı Bekleyenler \((\d+)\)/);
  kontrol(
    "kabul edilen sevkiyat 'Onayınızı Bekleyenler'de yok",
    bekleyenBasligi === null || bekleyenBasligi[1] === "0",
    bekleyenBasligi?.[0] ?? "başlık yok",
  );

  await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  const panelMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("panelde bekleyen sevkiyat sayısı 0", /Bekleyen Sevkiyat0|Bekleyen Sevkiyat\s*0/.test(panelMetni.replace(/\s+/g, "")) || /Onay bekleyen sevkiyat yok/.test(panelMetni));

  // ------------------------------------------------ 5) cihazlar hedef depoda
  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(1)}`, { waitUntil: "networkidle" });
  const cihazMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("cihaz hedef mağazaya geçti", /2 Nolu Mağaza/.test(cihazMetni), imei(1));
  kontrol("cihaz stokta", /Stokta/.test(cihazMetni));

  // ------------------------------------------------ 6) kısmi kabul
  await giris("admin");
  await cihazlariGir([4, 5]);
  const kismiYolu = await sevkEt([imei(4), imei(5)]);

  await giris("personel2");
  await sayfa.goto(kismiYolu, { waitUntil: "networkidle" });
  await okut(imei(4)); // yalnız biri okutuluyor
  await sayfa.click('button:has-text("Kabulü Tamamla")');
  await sayfa.waitForTimeout(2500);
  const kismiMetin = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("eksik okutmada kısmi kabul oluyor", /Kısmi/.test(kismiMetin), "");
  kontrol(
    "kısmi kabulde panel açık kalıyor",
    (await sayfa.locator("#okutmaKutusu").count()) === 1,
    "kalan cihaz sonra okutulabilmeli",
  );

  // Kalanı da okutup tamamla.
  await okut(imei(5));
  await sayfa.click('button:has-text("Kabulü Tamamla")');
  await sayfa.waitForTimeout(2500);
  const tamamMetin = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("kalan cihaz sonradan kabul edilebiliyor", !/Kısmi/.test(tamamMetin), "");

  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(5)}`, { waitUntil: "networkidle" });
  const besinci = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("ikinci turda kabul edilen cihaz da hedefte", /2 Nolu Mağaza/.test(besinci), imei(5));

  // ------------------------------------------------ 7) ek yetkili kullanıcı
  // Ana mağazası 2 Nolu olan personel2'ye 3 Nolu için ek yetki veriyoruz;
  // ek yetki ana mağaza kadar geçerli olmalı, 3 Nolu'ya gelen sevkiyatı
  // kabul edebilmeli.
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
  const m3Kart = sayfa
    .locator("div.rounded-xl.border.bg-white")
    .filter({ has: sayfa.locator('input[value="3 Nolu Mağaza"]') })
    .first();
  const yetkiForm = m3Kart.locator("form").filter({ hasText: "Yetkileri Kaydet" }).first();
  await yetkiForm
    .locator('label:has-text("2 Nolu Mağaza Personeli") input[name="yetkililer"]')
    .check();
  await yetkiForm.getByRole("button", { name: "Yetkileri Kaydet" }).click();
  await sayfa.waitForTimeout(1800);
  const yetkiSonucu = (await yetkiForm.locator('[role="status"]').textContent()) ?? "";
  kontrol("3 Nolu için ek yetki verildi", /yetki|kaydedildi/i.test(yetkiSonucu), yetkiSonucu.trim());

  await cihazlariGir([6]);
  const ekYolu = await sevkEt([imei(6)], "3 Nolu Mağaza");

  await giris("personel2");
  await sayfa.goto(ekYolu, { waitUntil: "networkidle" });
  kontrol(
    "ek yetkili kullanıcı kabul paneli görüyor",
    (await sayfa.locator("#okutmaKutusu").count()) === 1,
    "ana mağazası 2 Nolu, ek yetkisi 3 Nolu",
  );
  kontrol(
    "ek yetkiliye 'yalnızca o mağaza kabul edebilir' denmiyor",
    !/yalnızca .* kullanıcıları kabul edebilir/.test(
      (await sayfa.locator("main").textContent()) ?? "",
    ),
  );

  await okut(imei(6));
  await sayfa.click('button:has-text("Kabulü Tamamla")');
  await sayfa.waitForTimeout(2500);
  const ekSonuc = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("ek yetkili kullanıcı sevkiyatı kabul edebildi", !/Onay Bekliyor/.test(ekSonuc));

  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(6)}`, { waitUntil: "networkidle" });
  const ekCihaz = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("ek yetkili kabulünde cihaz hedefe geçti", /3 Nolu Mağaza/.test(ekCihaz), imei(6));

  // ------------------------------------------------ 8) yetkisiz kullanıcı
  await giris("personel1"); // ana mağazası 1 Nolu, 3 Nolu'da yetkisi yok
  await sayfa.goto(ekYolu, { waitUntil: "networkidle" });
  kontrol(
    "yetkisiz kullanıcı kabul paneli göremiyor",
    (await sayfa.locator("#okutmaKutusu").count()) === 0,
  );

  await sayfa.screenshot({ path: `${cikti}-son.png`, fullPage: true });
} catch (hata) {
  kontrol("betik tamamlandı", false, String(hata).slice(0, 300));
  await sayfa.screenshot({ path: `${cikti}-hata.png`, fullPage: true }).catch(() => {});
} finally {
  await tarayici.close();
}

if (konsolHatalari.length > 0) {
  console.log("\nTarayıcı konsol hataları:");
  for (const h of konsolHatalari.slice(0, 10)) console.log(`  ${h}`);
}

const basarisiz = sonuclar.filter((s) => !s.gecti);
console.log(`\n${sonuclar.length - basarisiz.length}/${sonuclar.length} kontrol geçti.`);
process.exit(basarisiz.length === 0 && konsolHatalari.length === 0 ? 0 : 1);
