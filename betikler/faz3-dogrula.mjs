// Faz 3 uçtan uca testi: çift onaylı sevkiyat (tam kabul, kısmi kabul, red, geri çekme) ve satış.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/faz3";
const SIFRE = "Stok2026!";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1500, height: 1000 }, locale: "tr-TR" });
const hatalar = [];
sayfa.on("console", (m) => {
  // Test bilerek 404 bir sayfaya gidiyor (ilgisiz mağaza sevkiyatı
  // göremiyor); tarayıcının bunu konsola yazması hata değil.
  if (m.type() === "error" && !/status of 404/.test(m.text())) hatalar.push(m.text());
});
sayfa.on("pageerror", (e) => hatalar.push(String(e)));

// Betik eskiden hiçbir beklentiyi saymıyordu: bir kontrol ✗ yazsa bile
// çıkış kodu 0 kalıyor, süit "geçti" görünüyordu.
/** Cihaz listesindeki kayıt sayısı — başlıktaki "N cihaz"; boş listede 0. */
async function cihazSayisi() {
  const kutu = sayfa.locator("text=/^\\d+ cihaz/").first();
  if ((await kutu.count()) === 0) return 0;
  const metin = (await kutu.textContent()) ?? "";
  return Number((metin.match(/(\d+)/) ?? [0, "0"])[1]);
}

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
  await sayfa.locator('[role="status"]').first().waitFor({ state: "visible", timeout: 15000 });
  await sayfa.waitForTimeout(400);
  return (await sayfa.locator('[role="status"]').first().textContent())?.trim();
}

// ---------------------------------------------------------------- Hazırlık
// Admin 1 Nolu Mağaza'ya 3 cihazlık vadesiz fatura girer.
await giris("admin");
// Sıra numarası başa konur; sondaki slice onu kesmesin diye.
const imei = Array.from({ length: 3 }, (_, i) => `86${i}${Date.now()}`.slice(0, 15));
await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
await sayfa.selectOption("#tedarikciId", { index: 1 });
await sayfa.fill("#faturaNo", `FAZ3-${Date.now()}`);
await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
// Tek barkod okutulur, üç IMEI arka arkaya o ürünün altına eklenir.
await sayfa.fill("#okutma", `FAZ3BR${Date.now()}`.slice(0, 14));
await sayfa.press("#okutma", "Enter");
await sayfa.waitForTimeout(1200);
const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
const alanlar = kart.locator('input[type="text"], input:not([type])');
await alanlar.nth(1).fill("Xiaomi");
await alanlar.nth(2).fill("Redmi 11");
await kart.locator('input[inputmode="decimal"]').fill("5.000");
for (const kod of imei) {
  const imeiKutusu = kart.locator('input[id^="imei-"]');
  await imeiKutusu.fill(kod);
  await imeiKutusu.press("Enter");
  await sayfa.waitForTimeout(500);
}
await sayfa.click('button:has-text("Faturayı Kaydet")');
await sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 20000 });
kontrol("hazırlık: 3 cihaz 1 Nolu Mağaza'ya girildi", /\/faturalar\/\d+$/.test(sayfa.url()), sayfa.url());

// ------------------------------------------------- 1) Sevkiyat gönderimi
await giris("sorumlu1");
await sayfa.goto(`${hedef}/sevkiyat/yeni`, { waitUntil: "networkidle" });
await sayfa.selectOption("#hedef", { label: "2 Nolu Mağaza" });
for (const kod of imei) {
  const mesaj = await okut(kod);
  kontrol(`cihaz sevkiyata eklendi (${kod.slice(-5)})`, /eklendi|listeye/i.test(mesaj ?? ""), mesaj);
}
// Aynı cihazı tekrar okut
const tekrarMesaji = await okut(imei[0]);
kontrol("aynı cihaz ikinci kez eklenmiyor", /zaten/i.test(tekrarMesaji ?? ""), tekrarMesaji);
// Sistemde olmayan kod
const kayitsizMesaj = await okut("000000000000000");
kontrol("kayıtsız kod reddediliyor", /bulunamadı|kayıtlı değil/i.test(kayitsizMesaj ?? ""), kayitsizMesaj);
await sayfa.screenshot({ path: `${cikti}-sevkiyat-formu.png`, fullPage: true });

await Promise.all([
  sayfa.waitForURL(/\/sevkiyat\/\d+$/, { timeout: 20000 }),
  sayfa.click('button:has-text("Sevkiyatı Gönder")'),
]);
const sevkUrl = sayfa.url();
kontrol(
  "sevkiyat gönderildi",
  /\/sevkiyat\/\d+$/.test(new URL(sevkUrl).pathname),
  new URL(sevkUrl).pathname,
);
const bekliyorRozeti = await sayfa
  .locator("span", { hasText: "Onay Bekliyor" })
  .first()
  .textContent()
  .catch(() => null);
kontrol("sevkiyat onay bekliyor durumunda", Boolean(bekliyorRozeti), bekliyorRozeti?.trim() ?? "(yok)");

// Cihazlar artık transferde olmalı
await sayfa.goto(`${hedef}/cihazlar?durum=TRANSFERDE`, { waitUntil: "networkidle" });
const transferdeki = await cihazSayisi();
kontrol("üç cihaz da transferde", transferdeki === 3, `${transferdeki} cihaz (beklenen 3)`);

// ------------------------------------------- 2) Yanlış mağaza kabul edemez
// Mağaza bazlı görünürlükten sonra ilgisiz mağaza bu sevkiyatı hiç görmüyor:
// eskiden sayfayı açıp "yalnızca ... kabul edebilir" uyarısını alıyordu, artık
// sayfa 404. Kabul edemediğinin daha güçlü kanıtı bu.
await giris("sorumlu3");
const ilgisizYanit = await sayfa.goto(sevkUrl, { waitUntil: "networkidle" });
kontrol(
  "ilgisiz mağaza sevkiyatı hiç göremiyor (404)",
  ilgisizYanit?.status() === 404,
  `HTTP ${ilgisizYanit?.status()}`,
);
kontrol(
  "ilgisiz mağazaya okutma kutusu verilmiyor",
  (await sayfa.locator("#okutmaKutusu").count()) === 0,
);

// ------------------------------------------------- 3) Kısmi kabul
await giris("sorumlu2");
await sayfa.goto(sevkUrl, { waitUntil: "networkidle" });
kontrol(
  "hedef mağaza kabul ekranını açabiliyor",
  (await sayfa.locator("#okutmaKutusu").count()) === 1,
  sayfa.url(),
);
const kabulMesaji = await okut(imei[0]);
kontrol("kabul ekranında cihaz okutuldu", /kabul edildi/i.test(kabulMesaji ?? ""), kabulMesaji);
const kabulTekrar = await okut(imei[0]);
kontrol("kabulde aynı cihaz iki kez sayılmıyor", /zaten/i.test(kabulTekrar ?? ""), kabulTekrar);
await sayfa.waitForTimeout(600);
await sayfa.screenshot({ path: `${cikti}-kabul-ekrani.png`, fullPage: true });

await sayfa.click('button:has-text("Kabulü Tamamla")');
await sayfa.locator('[role="status"]', { hasText: "cihaz alındı" }).first().waitFor({ timeout: 15000 });
const kismiMesaj = (await sayfa.locator('[role="status"]', { hasText: "cihaz alındı" }).first().textContent())?.trim() ?? "";
kontrol("kısmi kabul tamamlandı", /1 cihaz alındı/.test(kismiMesaj), kismiMesaj);

// ------------------------------------------------- 4) Kalanları reddet
await sayfa.reload({ waitUntil: "networkidle" });
await sayfa.click('button:has-text("Okutulmayanları Reddet")');
await sayfa.fill("#redNedeni", "Paketten çıkmadı");
await sayfa.click('button:has-text("Reddet ve Geri Gönder")');
const redBildirimi = sayfa.locator("text=Kısmi kabul:").first();
await redBildirimi.waitFor({ timeout: 15000 });
const redMesaji = (await redBildirimi.textContent())?.replace(/\s+/g, " ").trim() ?? "";
kontrol("okutulmayanlar reddedildi", redMesaji.includes("Kısmi kabul"), redMesaji);

// Dağılımı doğrula: 1 cihaz 2 Nolu'da, 2 cihaz 1 Nolu'da, hiçbiri transferde değil.
// Reddedilenler 1 Nolu'ya döndüğü için sorumlu2 onları artık göremiyor; dağılımı
// her mağazayı gören yönetici sayıyor.
await giris("admin");
await sayfa.goto(`${hedef}/cihazlar?durum=TRANSFERDE`, { waitUntil: "networkidle" });
// Boş listede tablo "kayıt yok" satırı basıyor; satır saymak 0 yerine 1
// verir. Sayı başlıktaki "N cihaz"tan okunuyor.
const kalanTransfer = await cihazSayisi();
kontrol("transferde cihaz kalmadı", kalanTransfer === 0, `${kalanTransfer} cihaz`);
// Dağılım: kabul edilen cihaz 2 Nolu'da, reddedilen ikisi 1 Nolu'da.
const depolar = [];
for (const kod of imei) {
  await sayfa.goto(`${hedef}/cihazlar?ara=${kod}`, { waitUntil: "networkidle" });
  const depo = (await sayfa.locator("dt:has-text('Bulunduğu Depo') + dd").textContent())?.trim() ?? "";
  depolar.push(depo);
}
kontrol("kabul edilen cihaz hedef mağazaya geçti", depolar[0].includes("2 Nolu"), depolar[0]);
kontrol(
  "reddedilen cihazlar kaynak mağazaya döndü",
  depolar[1].includes("1 Nolu") && depolar[2].includes("1 Nolu"),
  depolar.slice(1).join(" | "),
);

// ------------------------------------------------- 5) Satış
await giris("personel2");
await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
// 1 Nolu Mağaza'da kalan cihazı okutmayı dene (başka mağaza -> reddedilmeli)
const baskaMagazaMesaji = await okut(imei[1]);
kontrol(
  "personel başka mağazanın cihazını satamıyor",
  /yetkili olmadığınız|yetkiniz|bulunamadı/i.test(baskaMagazaMesaji ?? ""),
  baskaMagazaMesaji,
);
// 2 Nolu Mağaza'ya gelen cihazı sat
const kendiMesaji = await okut(imei[0]);
kontrol("kendi mağazasının cihazı sepete eklendi", /eklendi/i.test(kendiMesaji ?? ""), kendiMesaji);
// Satış fiyatı artık cihaz başına: sepetteki ilk satırın kutusu.
await sayfa.locator('[data-test="sepet-fiyat"]').first().fill("7.500,50");
await sayfa.selectOption("#odemeTipi", "KREDI_KARTI");
await sayfa.fill("#yeniAd", "Ayşe Yılmaz");
await sayfa.fill("#yeniTelefon", "0532 111 22 33");
await sayfa.waitForTimeout(300);
const karMetni = (await sayfa.locator("text=Kâr").first().locator("xpath=following-sibling::div").textContent().catch(() => null));
console.log("   ekranda kâr:", karMetni?.trim() ?? "(okunamadı)");
await sayfa.screenshot({ path: `${cikti}-satis-formu.png`, fullPage: true });
await Promise.all([
  sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 20000 }),
  sayfa.click('button:has-text("Satışı Kaydet")'),
]);
kontrol(
  "satış kaydedildi ve cihaz detayına gidildi",
  /\/cihazlar\/\d+$/.test(new URL(sayfa.url()).pathname),
  new URL(sayfa.url()).pathname,
);
const kar = (await sayfa.locator("dt:has-text('Kâr') + dd").textContent())?.trim() ?? "";
const musteri = (await sayfa.locator("dt:has-text('Müşteri') + dd").first().textContent())?.trim() ?? "";
// 7.500,50 satış − 5.000,00 alış = 2.500,50 kâr.
kontrol("satış kârı doğru hesaplandı", kar.includes("2.500,50"), kar);
kontrol("satış müşteriye bağlandı", musteri.includes("Ayşe Yılmaz"), musteri);
const tarihce = await sayfa.locator("ol li").count();
kontrol(
  "tarihçede giriş + sevk + kabul + satış var",
  tarihce >= 4,
  `${tarihce} kayıt`,
);
await sayfa.screenshot({ path: `${cikti}-cihaz-tarihce.png`, fullPage: true });

// Aynı cihaz ikinci kez satılamaz
await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
const tekrarSatis = await okut(imei[0]);
kontrol(
  "satılmış cihaz tekrar satılamıyor",
  /satıl|stokta değil|bulunamadı/i.test(tekrarSatis ?? ""),
  tekrarSatis,
);

// ------------------------------------------------- 6) Müşteri kaydı
await sayfa.goto(`${hedef}/musteriler?ara=Ayşe`, { waitUntil: "networkidle" });
const musteriAdi = (await sayfa.locator("li .font-medium").first().textContent())?.trim() ?? "";
kontrol("müşteri adıyla bulunuyor", musteriAdi.includes("Ayşe"), musteriAdi);
await sayfa.screenshot({ path: `${cikti}-musteriler.png`, fullPage: true });

// ------------------------------------------------- 7) Geri çekme
await giris("sorumlu1");
await sayfa.goto(`${hedef}/sevkiyat/yeni`, { waitUntil: "networkidle" });
await sayfa.selectOption("#hedef", { label: "3 Nolu Mağaza" });
await okut(imei[1]);
await Promise.all([
  sayfa.waitForURL(/\/sevkiyat\/\d+$/, { timeout: 20000 }),
  sayfa.click('button:has-text("Sevkiyatı Gönder")'),
]);
await sayfa.click('button:has-text("Sevkiyatı Geri Çek")');
// İşlem sonrası buton kaybolur; kalıcı bildirim sunucudan gelir.
const iptalBildirimi = sayfa.locator("text=gönderen tarafından geri çekildi").first();
await iptalBildirimi.waitFor({ timeout: 15000 });
const geriCekme = (await iptalBildirimi.textContent())?.replace(/\s+/g, " ").trim() ?? "";
kontrol("sevkiyat geri çekilebiliyor", geriCekme.includes("geri çekildi"), geriCekme);
await sayfa.goto(`${hedef}/cihazlar?ara=${imei[1]}`, { waitUntil: "networkidle" });
const donenDepo = (await sayfa.locator("dt:has-text('Bulunduğu Depo') + dd").textContent())?.trim() ?? "";
kontrol("geri çekilen cihaz kaynak mağazaya döndü", donenDepo.includes("1 Nolu"), donenDepo);

// ------------------------------------------------- 8) Mobil
await sayfa.setViewportSize({ width: 390, height: 844 });
for (const yol of ["/sevkiyat", "/satis", "/musteriler"]) {
  await sayfa.goto(`${hedef}${yol}`, { waitUntil: "networkidle" });
  const tasma = await sayfa.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  kontrol(`390px ${yol} ekranında yatay taşma yok`, !tasma);
}

kontrol("tarayıcı konsolunda hata yok", hatalar.length === 0, hatalar.slice(0, 3).join(" | "));
await tarayici.close();

const gecen = sonuclar.filter((s) => s.gecti).length;
console.log(`\n${gecen}/${sonuclar.length} kontrol geçti`);
if (gecen !== sonuclar.length) process.exit(1);
