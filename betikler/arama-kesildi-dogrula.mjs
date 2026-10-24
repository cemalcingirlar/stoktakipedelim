// Arama sonucu sınıra dayandığında uyarı çıkıyor mu?
//
// Ürün araması iki yerde sessizce kesiliyordu: veritabanından en çok 500
// cihaz çekiliyor, sonra gruplanan ürünlerden ilk 30'u gösteriliyordu.
// Ekranda bunu söyleyen hiçbir şey yoktu. Satıcı 30 satır görüp aradığını
// bulamayınca müşteriye "yok" diyordu — oysa stokta vardı.
//
// Test, 35 ayrı modeli toplu yüklemeyle girip üç ekranda da (satış, mağaza
// içi aktarım, alış faturası geçmiş ürünleri) uyarının çıktığını; sonuç az
// olduğunda ise çıkmadığını sayıyor. Uyarının yanlışlıkla her aramada
// görünmesi de en az kesilmenin gizlenmesi kadar kötü olurdu.
import { chromium } from "@playwright/test";
import ExcelJS from "exceljs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/arama-kesildi";
const SIFRE = "Stok2026!";

const damga = Date.now().toString().slice(-8);
const imei = (i) => `87${damga}${String(i).padStart(5, "0")}`.slice(0, 15);
// Fatura ekranındaki geçmiş ürün araması yalnız barkodlu kayıtları getiriyor.
const barkod = (i) => `47${damga}${String(i).padStart(3, "0")}`;

// Sınırın üstünde kalacak kadar ayrı model: 35 > 30.
const COK_MARKA = `COKMARKA${damga}`;
const COK_ADET = 35;
// Sınırın çok altında kalacak ikinci bir marka: uyarı burada çıkmamalı.
const AZ_MARKA = `AZMARKA${damga}`;
const AZ_ADET = 2;
const FATURA_NO = `KES-${damga}`;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const baglam = await tarayici.newContext({
  viewport: { width: 1500, height: 1200 },
  locale: "tr-TR",
  acceptDownloads: true,
});
const sayfa = await baglam.newPage();
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

const uyari = () => sayfa.locator('[data-test="arama-kesildi"]');

function magazaKarti(kod) {
  return sayfa
    .locator("div.rounded-xl.border.bg-white")
    .filter({ has: sayfa.locator(`input[name="kod"][value="${kod}"]`) })
    .first();
}

/** Aktarım ekranı iki mağazanın aynı dükkân kodunu taşımasını şart koşuyor. */
async function dukkanKodlariniVer() {
  await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
  for (const kod of ["M1", "M2"]) {
    await magazaKarti(kod).locator('input[name="dukkanKodu"]').fill("KESIK");
    await magazaKarti(kod).getByRole("button", { name: "Kaydet", exact: true }).click();
    await sayfa.waitForTimeout(1500);
    await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
  }
}
const klasor = await mkdtemp(join(tmpdir(), "arama-kesildi-"));

try {
  // ======================================= 0) 37 ayrı modeli toplu yükle
  await giris("admin");
  await sayfa.goto(`${hedef}/cihazlar/ice-aktar`, { waitUntil: "networkidle" });

  // Şablonun kategori listesinden gerçek bir kategori al; sabit yazmak
  // tohum verisi değişince testi sahte biçimde düşürürdü.
  const [indirme] = await Promise.all([
    sayfa.waitForEvent("download", { timeout: 20000 }),
    sayfa.click('a:has-text("Şablonu İndir")'),
  ]);
  const sablonYolu = join(klasor, "sablon.xlsx");
  await indirme.saveAs(sablonYolu);
  const sablonKitap = new ExcelJS.Workbook();
  await sablonKitap.xlsx.readFile(sablonYolu);
  let kategoriAdi = "";
  let altKategoriAdi = "";
  sablonKitap.getWorksheet("Kategori Listesi").eachRow((satir, no) => {
    if (no <= 3 || kategoriAdi) return; // 2 üst bilgi + 1 başlık satırı
    kategoriAdi = String(satir.getCell(1).value ?? "");
    altKategoriAdi = String(satir.getCell(2).value ?? "");
  });
  kontrol("şablondan kategori alındı", kategoriAdi !== "", `${kategoriAdi} / ${altKategoriAdi}`);

  const kitap = new ExcelJS.Workbook();
  const sf = kitap.addWorksheet("Cihazlar");
  sf.addRow([
    "Kategori", "Alt Kategori", "Marka", "Model", "Renk",
    "Kapasite", "Seri No (IMEI)", "Barkod", "Alış Fiyatı (TL)", "Not",
  ]);
  for (let i = 1; i <= COK_ADET; i += 1) {
    sf.addRow([
      kategoriAdi, altKategoriAdi, COK_MARKA, `MODEL ${String(i).padStart(2, "0")}`,
      "Siyah", "128 GB", imei(i), barkod(i), "10.000,00", "",
    ]);
  }
  for (let i = 1; i <= AZ_ADET; i += 1) {
    sf.addRow([
      kategoriAdi, altKategoriAdi, AZ_MARKA, `AZ MODEL ${i}`,
      "Beyaz", "128 GB", imei(90 + i), barkod(90 + i), "5.000,00", "",
    ]);
  }
  const dosyaYolu = join(klasor, "yukleme.xlsx");
  await writeFile(dosyaYolu, Buffer.from(await kitap.xlsx.writeBuffer()));

  await sayfa.setInputFiles("#dosya", dosyaYolu);
  await sayfa.click('button:has-text("Dosyayı Oku")');
  await sayfa.waitForSelector('h2:has-text("2. Okunan satırlar")', { timeout: 30000 });
  const ozet = (await sayfa.locator('h2:has-text("2. Okunan satırlar") + p').textContent()) ?? "";
  kontrol(
    `${COK_ADET + AZ_ADET} satır okundu`,
    ozet.includes(`${COK_ADET + AZ_ADET} geçerli satır`),
    ozet.trim(),
  );

  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", FATURA_NO);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL("**/faturalar/**", { timeout: 60000 }),
    sayfa.click('button:has-text("Cihazı Kaydet")'),
  ]);
  kontrol("cihazlar kaydedildi", sayfa.url().includes("/faturalar/"), sayfa.url());

  // ============================================= 1) Satış ekranı
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="liste-ac"]').click();
  await sayfa.waitForTimeout(400);

  await sayfa.fill('[data-test="urun-sorgu"]', AZ_MARKA);
  await sayfa.locator('[data-test="urun-ara"]').click();
  await sayfa.waitForTimeout(2000);
  const azSatir = await sayfa.locator('[data-test="urun-satiri"]').count();
  kontrol("satış: az sonuçta beklenen satır sayısı", azSatir === AZ_ADET, `${azSatir} satır`);
  kontrol("satış: az sonuçta uyarı YOK", (await uyari().count()) === 0);

  await sayfa.fill('[data-test="urun-sorgu"]', COK_MARKA);
  await sayfa.locator('[data-test="urun-ara"]').click();
  await sayfa.waitForTimeout(2500);
  const cokSatir = await sayfa.locator('[data-test="urun-satiri"]').count();
  kontrol("satış: sonuç 30 satırda kesildi", cokSatir === 30, `${cokSatir} satır`);
  kontrol("satış: kesilince uyarı çıkıyor", (await uyari().count()) === 1);
  const uyariMetni = ((await uyari().textContent()) ?? "").replace(/\s+/g, " ").trim();
  kontrol("satış: uyarı kaç ürün gösterildiğini söylüyor", /30/.test(uyariMetni), uyariMetni);
  kontrol("satış: uyarı ne yapılacağını söylüyor", /daralt/i.test(uyariMetni), uyariMetni);
  kontrol(
    "satış: uyarı sonuç listesinin içinde",
    (await sayfa.locator('[data-test="urun-listesi"] [data-test="arama-kesildi"]').count()) === 1,
  );
  await sayfa.screenshot({ path: `${cikti}-satis.png`, fullPage: true });

  // Uyarı kalıcı olmamalı: arama daralınca kaybolmalı.
  await sayfa.fill('[data-test="urun-sorgu"]', AZ_MARKA);
  await sayfa.locator('[data-test="urun-ara"]').click();
  await sayfa.waitForTimeout(2000);
  kontrol("satış: arama daralınca uyarı kayboluyor", (await uyari().count()) === 0);

  // ======================================= 2) Mağaza içi aktarım ekranı
  await dukkanKodlariniVer();
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  kontrol(
    "aktarım ekranı açıldı",
    (await sayfa.locator("#kaynak").count()) === 1,
    (await sayfa.locator("#kaynak option").allTextContents()).join(", "),
  );
  await sayfa.selectOption("#kaynak", { label: "1 Nolu Mağaza" });
  await sayfa.waitForTimeout(500);
  await sayfa.locator('[data-test="aktarim-liste-ac"]').click();
  await sayfa.waitForTimeout(400);

  await sayfa.fill('[data-test="aktarim-urun-sorgu"]', AZ_MARKA);
  await sayfa.locator('[data-test="aktarim-urun-bul"]').click();
  await sayfa.waitForTimeout(2000);
  kontrol(
    "aktarım: az sonuçta beklenen satır sayısı",
    (await sayfa.locator('[data-test="aktarim-urun-satiri"]').count()) === AZ_ADET,
    `${await sayfa.locator('[data-test="aktarim-urun-satiri"]').count()} satır`,
  );
  kontrol("aktarım: az sonuçta uyarı YOK", (await uyari().count()) === 0);

  await sayfa.fill('[data-test="aktarim-urun-sorgu"]', COK_MARKA);
  await sayfa.locator('[data-test="aktarim-urun-bul"]').click();
  await sayfa.waitForTimeout(2500);
  const aktarimSatir = await sayfa.locator('[data-test="aktarim-urun-satiri"]').count();
  kontrol("aktarım: sonuç 30 satırda kesildi", aktarimSatir === 30, `${aktarimSatir} satır`);
  kontrol("aktarım: kesilince uyarı çıkıyor", (await uyari().count()) === 1);

  // ======================== 3) Alış faturasında geçmiş ürün araması
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="fatura-liste-ac"]').click();
  await sayfa.waitForTimeout(400);

  await sayfa.fill('[data-test="fatura-urun-sorgu"]', AZ_MARKA);
  await sayfa.locator('[data-test="fatura-urun-bul"]').click();
  await sayfa.waitForTimeout(2000);
  kontrol(
    "fatura: az sonuçta beklenen satır sayısı",
    (await sayfa.locator('[data-test="fatura-urun-satiri"]').count()) === AZ_ADET,
    `${await sayfa.locator('[data-test="fatura-urun-satiri"]').count()} satır`,
  );
  kontrol("fatura: az sonuçta uyarı YOK", (await uyari().count()) === 0);

  await sayfa.fill('[data-test="fatura-urun-sorgu"]', COK_MARKA);
  await sayfa.locator('[data-test="fatura-urun-bul"]').click();
  await sayfa.waitForTimeout(2500);
  const faturaSatir = await sayfa.locator('[data-test="fatura-urun-satiri"]').count();
  kontrol("fatura: sonuç 30 satırda kesildi", faturaSatir === 30, `${faturaSatir} satır`);
  kontrol("fatura: kesilince uyarı çıkıyor", (await uyari().count()) === 1);
  await sayfa.screenshot({ path: `${cikti}-fatura.png`, fullPage: true });

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
