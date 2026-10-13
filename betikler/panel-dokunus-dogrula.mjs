// Firma adı ayarı, panelde bugün satılanlar ve vadesi geçen cihaz adedi testi.
// Ayrıca toplu yüklemede .csv ve HTML tablosu (.xls adıyla) kabul kontrolü.
import { chromium } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/panel";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1500, height: 1200 }, locale: "tr-TR" });
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

/**
 * Paneldeki sayı kartının tamamını (etiket + değer + alt bilgi) okur.
 * Etiketin kendisi küçük bir div; kart ana öğesi onun üst öğesi.
 */
async function kartOku(etiket) {
  const etiketKutusu = sayfa.getByText(etiket, { exact: true }).first();
  const kart = etiketKutusu.locator("xpath=..");
  return (await kart.textContent())?.replace(/\s+/g, " ").trim() ?? "";
}

/**
 * Yalnız büyük sayıyı okur. Kartın tamamını okumak değeri alt bilgiye
 * yapıştırıyor (1 + "13.000,00 TL ciro" → "113.000,00").
 */
async function kartDegeri(etiket) {
  const etiketKutusu = sayfa.getByText(etiket, { exact: true }).first();
  const deger = etiketKutusu.locator("xpath=..").locator("div.text-2xl").first();
  return (await deger.textContent())?.trim() ?? "";
}

/** Başlığına göre panel bölümünün metnini verir. */
async function bolumMetni(baslik) {
  const bolum = sayfa.locator("section").filter({ hasText: baslik }).first();
  return (await bolum.textContent())?.replace(/\s+/g, " ").trim() ?? "";
}

try {
  const klasor = await mkdtemp(join(tmpdir(), "panel-"));

  // ------------------------------------------------------- 1) Firma adı
  await giris("admin");
  const ilkAd = (await sayfa.locator("header").first().textContent()) ?? "";
  kontrol("üst menüde tohum firma adı görünüyor", ilkAd.includes("ABC"), ilkAd.slice(0, 40));

  await sayfa.goto(`${hedef}/ayarlar`, { waitUntil: "networkidle" });
  kontrol("ayarlarda firma adı alanı var", (await sayfa.locator("#firmaAdi").count()) === 1);
  kontrol(
    "alan mevcut değerle dolu geliyor",
    (await sayfa.locator("#firmaAdi").inputValue()).includes("ABC"),
  );

  await sayfa.fill("#firmaAdi", "A");
  await sayfa.locator("form").filter({ has: sayfa.locator("#firmaAdi") }).locator("button").click();
  await sayfa.waitForTimeout(1200);
  const kisaHata = await sayfa.locator('[role="alert"]').first().textContent();
  kontrol(
    "çok kısa ad reddedildi",
    Boolean(kisaHata && kisaHata.includes("en az 2")),
    (kisaHata ?? "mesaj yok").trim(),
  );

  await sayfa.fill("#firmaAdi", "EFEM İLETİŞİM");
  await sayfa.locator("form").filter({ has: sayfa.locator("#firmaAdi") }).locator("button").click();
  await sayfa.waitForTimeout(1500);
  const basari = await sayfa.locator('[role="status"]').first().textContent();
  kontrol(
    "yeni ad kaydedildi",
    Boolean(basari && basari.includes("EFEM")),
    (basari ?? "mesaj yok").trim(),
  );

  await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  const yeniAd = (await sayfa.locator("header").first().textContent()) ?? "";
  kontrol(
    "üst menüde yeni ad görünüyor",
    yeniAd.includes("EFEM İLETİŞİM") && !yeniAd.includes("ABC"),
    yeniAd.slice(0, 40),
  );

  // --------------------------------- 2) Bugün satış yokken panel ne diyor
  kontrol(
    "satış yokken 'bugün satış yok' yazıyor",
    (await sayfa.getByText("Bugün henüz satış yapılmadı.").count()) === 1,
  );
  kontrol("Bugün Satılan kartı 0 gösteriyor", (await kartDegeri("Bugün Satılan")) === "0");

  // ---------------------------------------- 3) Cihaz gir, birini sat
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `PNL${damga}`);
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
  for (const i of [1, 2]) {
    await imeiKutusu.fill(imei(i));
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(400);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `PNL-${damga}`);
  // Vadeyi geçmiş bir tarihe çekmek için vade seçeneğini kullanmıyoruz; vadesi
  // geçen kontrolünü ayrı faturayla yapacağız.
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);

  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutmaKutusu", imei(1));
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1500);
  await sayfa.locator('input[inputmode="decimal"]').first().fill("13.000,00");
  // Satış müşteri olmadan kaydedilemiyor; yeni müşteri adı yazıyoruz.
  await sayfa.fill("#yeniAd", "Panel Deneme Müşteri");
  await sayfa.click('button:has-text("Satışı Kaydet")');
  await sayfa.waitForTimeout(2500);

  // ------------------------------- 4) Panelde bugün satılanlar görünüyor
  await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  const bugunDeger = await kartDegeri("Bugün Satılan");
  kontrol("Bugün Satılan kartı 1 gösteriyor", bugunDeger === "1", bugunDeger);
  const bugunKart = await kartOku("Bugün Satılan");
  kontrol("kartta ciro yazıyor", bugunKart.includes("13.000,00"), bugunKart.slice(0, 70));

  const sayfaMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("liste başlığı 'Bugün Stoktan Çıkanlar'", sayfaMetni.includes("Bugün Stoktan Çıkanlar"));

  // Kontroller bölüme sabitlenmeli: ikinci cihaz "Son Hareketler" listesinde
  // giriş kaydı olarak görünüyor, sayfa metninde geçmesi doğal.
  const bugunBolum = await bolumMetni("Bugün Stoktan Çıkanlar");
  kontrol(
    "satılan cihaz listede",
    bugunBolum.includes("Galaxy A55") && bugunBolum.includes(imei(1)),
  );
  kontrol("kâr hesabı görünüyor", bugunBolum.includes("3.000,00"), "13.000 − 10.000");
  kontrol(
    "satılmayan cihaz listede değil",
    !bugunBolum.includes(imei(2)),
    "ikinci cihaz hâlâ stokta",
  );
  kontrol(
    "vadesi geçen faturalar kartı kaldırıldı",
    !sayfaMetni.includes("Vadesi Geçen Faturalar"),
  );

  // ------------------------- 5) Vadesi geçen kartı cihaz adedi gösteriyor
  const vadeKart = await kartOku("Vadesi Geçen");
  kontrol(
    "vade kartı cihaz adedi diyor",
    vadeKart.includes("cihaz") || vadeKart.includes("gecikmiş cihaz yok"),
    vadeKart.slice(0, 70),
  );
  kontrol(
    "vade kartı faturadan söz etmiyor",
    !vadeKart.includes("fatura"),
    vadeKart.slice(0, 70),
  );
  const vadeBaglanti = await sayfa.locator('a[href="/cihazlar?vade=gecen"]').count();
  kontrol("vade kartı cihaz listesine bağlanıyor", vadeBaglanti === 1);

  await sayfa.screenshot({ path: `${cikti}-panel.png`, fullPage: true });

  // ------------------------------------- 6) CSV ile toplu yükleme
  const csv = [
    "Kategori;Alt Kategori;Marka;Model;Renk;Kapasite;Seri No (IMEI);Barkod;Alış Fiyatı (TL);Not",
    `Cep Telefonu;Sıfır;Oppo;A78;Siyah;128 GB;${imei(10)};;7.250,50;csv`,
    `Cep Telefonu;Sıfır;Vivo;Y36;Mavi;256 GB;${imei(11)};;6.100,00;csv`,
  ].join("\r\n");
  const csvYolu = join(klasor, "yukleme.csv");
  await writeFile(csvYolu, csv, "utf8");

  await sayfa.goto(`${hedef}/cihazlar/ice-aktar`, { waitUntil: "networkidle" });
  await sayfa.setInputFiles("#dosya", csvYolu);
  await sayfa.click('button:has-text("Dosyayı Oku")');
  await sayfa.waitForTimeout(2500);
  const csvOzet = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "CSV okundu ve 2 satır çıktı",
    csvOzet.includes("2 geçerli satır"),
    (csvOzet.match(/\d+ geçerli satır/) ?? ["bulunamadı"])[0],
  );
  kontrol("CSV'de Türkçe para biçimi doğru okundu", csvOzet.includes("13.350,50"), "7.250,50 + 6.100,00");

  // ------------------------- 7) .xls adıyla gelen HTML tablosu okunabiliyor
  const html = `<html><body><table>
    <tr><th>Kategori</th><th>Marka</th><th>Model</th><th>Seri No (IMEI)</th><th>Alış Fiyatı (TL)</th></tr>
    <tr><td>Cep Telefonu</td><td>Realme</td><td>C55</td><td>${imei(12)}</td><td>5.400,00</td></tr>
  </table></body></html>`;
  const htmlYolu = join(klasor, "portal-cikti.xls");
  await writeFile(htmlYolu, html, "utf8");

  await sayfa.goto(`${hedef}/cihazlar/ice-aktar`, { waitUntil: "networkidle" });
  await sayfa.setInputFiles("#dosya", htmlYolu);
  await sayfa.click('button:has-text("Dosyayı Oku")');
  await sayfa.waitForTimeout(2500);
  const htmlOzet = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    ".xls adıyla gelen HTML tablosu okundu",
    htmlOzet.includes("1 geçerli satır"),
    (htmlOzet.match(/\d+ geçerli satır/) ?? ["bulunamadı"])[0],
  );

  // ------------------------- 8) Gerçek .xls ve PDF ne yapılacağını söylüyor
  const olePdf = [
    { ad: "eski.xls", bayt: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]), bekle: "Farklı Kaydet" },
    { ad: "fatura.pdf", bayt: Buffer.from("%PDF-1.7\n%aaaa\n"), bekle: "PDF" },
  ];
  for (const { ad, bayt, bekle } of olePdf) {
    const yol = join(klasor, ad);
    await writeFile(yol, bayt);
    await sayfa.goto(`${hedef}/cihazlar/ice-aktar`, { waitUntil: "networkidle" });
    await sayfa.setInputFiles("#dosya", yol);
    await sayfa.click('button:has-text("Dosyayı Oku")');
    await sayfa.waitForTimeout(2000);
    const metin = (await sayfa.locator("main").textContent()) ?? "";
    kontrol(`${ad} için yol gösteren mesaj çıktı`, metin.includes(bekle), bekle);
  }

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
