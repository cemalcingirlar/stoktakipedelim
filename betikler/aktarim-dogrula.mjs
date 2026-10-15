// Dükkân içi aktarım testi: aynı dükkân kodunu taşıyan iki mağaza arasında
// sevkiyat açmadan cihaz taşıma, geri alma, yetki ve dükkân sınırı kontrolleri.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const AKTARIM_NOTU = "vitrin degisimi";
const CIHAZ_NOTU = "nakit depo girisinde fiyat revize edildi";
const YENI_FIYAT = "6.250,00";
const cikti = process.env.CIKTI ?? "/tmp/aktarim";
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

function magazaKarti(kod) {
  return sayfa
    .locator("div.rounded-xl.border.bg-white")
    .filter({ has: sayfa.locator(`input[name="kod"][value="${kod}"]`) })
    .first();
}

/** Cihaz detay sayfasındaki "Bulunduğu Depo" değerini okur. */
async function depoOku() {
  const satir = sayfa.locator("div").filter({ hasText: /^Bulunduğu Depo/ }).last();
  return (await satir.locator("dd").first().textContent())?.trim() ?? "";
}

/**
 * Cihaz detayındaki künye satırının değerini okur.
 *
 * Sayfa metninde arama yapmak yetmiyor: düzeltme hareketinin açıklaması da
 * "5.000,00 → 6.250,00" yazdığı için kaydedilmemiş bir fiyat bile metinde
 * görünüyor. Değeri kendi alanından okumak gerekiyor.
 */
async function kunyeOku(etiket) {
  const satir = sayfa
    .locator("dt")
    .filter({ hasText: new RegExp(`^${etiket}$`) })
    .first();
  const dd = satir.locator("xpath=following-sibling::dd[1]");
  return ((await dd.first().textContent()) ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Aktarım ekranındaki okutma kutusuna kod yazar, geri bildirimi döner.
 * Paylaşılan OkutmaKutusu bileşeninin girdisi #okutmaKutusu; fatura
 * ekranındaki #okutma ayrı bir alan.
 */
async function aktar(kod) {
  await sayfa.fill("#okutmaKutusu", kod);
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1500);
  const bildirim = sayfa.locator('[role="status"], [role="alert"]').first();
  return (await bildirim.textContent())?.replace(/\s+/g, " ").trim() ?? "";
}

try {
  // ------------------------------------------- 0) Hazırlık: M1'e 2 cihaz gir
  await giris("admin");
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `AKT${damga}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1200);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const metinler = kart.locator('input[type="text"], input:not([type])');
  await metinler.nth(1).fill("Aktarım");
  await metinler.nth(2).fill("Test A1");
  await kart.locator('input[inputmode="decimal"]').fill("5.000,00");
  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const i of [1, 2]) {
    await imeiKutusu.fill(imei(i));
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(400);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `AKT-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
  console.log("0) hazırlık: 2 cihaz 1 Nolu Mağaza'ya girildi");

  // ------------------- 1) Dükkân kodu tanımlı değilken menü ve ekran kapalı
  await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  const menuYok = await sayfa.locator('header nav a[href="/aktarim"]').count();
  kontrol("dükkân kodu yokken menüde Aktarım çıkmıyor", menuYok === 0, `${menuYok} bağlantı`);

  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  kontrol(
    "ekran kurulum eksik diyor",
    (await sayfa.getByText("Önce dükkân grubu tanımlanmalı").count()) === 1,
  );
  kontrol(
    "yöneticiye ayarlar bağlantısı veriliyor",
    (await sayfa.locator('a[href="/ayarlar/magazalar"]').count()) >= 1,
  );

  // --------------------------- 2) M1 ve M2'ye aynı dükkân kodunu ver
  await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
  await magazaKarti("M1").locator('input[name="dukkanKodu"]').fill("deneme");
  await magazaKarti("M1").getByRole("button", { name: "Kaydet", exact: true }).click();
  await sayfa.waitForTimeout(1500);
  await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
  kontrol(
    "tek başına kalan dükkân kodu uyarı veriyor",
    (await magazaKarti("M1").getByText("Bu kodu taşıyan başka mağaza yok").count()) === 1,
  );

  await magazaKarti("M2").locator('input[name="dukkanKodu"]').fill("DENEME");
  await magazaKarti("M2").getByRole("button", { name: "Kaydet", exact: true }).click();
  await sayfa.waitForTimeout(1500);
  await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
  kontrol(
    "eşleşen mağaza gösteriliyor",
    (await magazaKarti("M1").getByText("Aynı dükkân: 2 Nolu Mağaza").count()) === 1,
  );
  kontrol(
    "küçük harf girilen kod büyüğe çevrildi",
    (await magazaKarti("M1").locator('input[name="dukkanKodu"]').inputValue()) === "DENEME",
  );

  // ------------------------------------------- 3) Geçersiz kod reddedilmeli
  await magazaKarti("M3").locator('input[name="dukkanKodu"]').fill("A B!");
  await magazaKarti("M3").getByRole("button", { name: "Kaydet", exact: true }).click();
  await sayfa.waitForTimeout(1200);
  const kodHatasi = await magazaKarti("M3").locator('[role="alert"]').first().textContent();
  kontrol(
    "geçersiz dükkân kodu reddedildi",
    Boolean(kodHatasi && kodHatasi.includes("yalnız harf, rakam ve tire")),
    (kodHatasi ?? "mesaj yok").trim(),
  );

  // ---------------------------------------- 4) Menü ve ekran artık açık
  await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  const menuVar = await sayfa.locator('header nav a[href="/aktarim"]').count();
  kontrol("menüde Aktarım çıktı", menuVar >= 1, `${menuVar} bağlantı`);

  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  const kaynakSecenek = await sayfa.locator("#kaynak option").allTextContents();
  kontrol(
    "kaynak listesinde yalnız eşleşen iki mağaza var",
    kaynakSecenek.length === 2,
    kaynakSecenek.join(", "),
  );
  kontrol(
    "tek hedef olduğu için hedef kutusu salt okunur",
    (await sayfa.locator("#hedef").evaluate((e) => e.tagName)) === "INPUT",
  );

  // --------------------------------------------- 5) Aktarım gerçekten taşıyor
  await sayfa.selectOption("#kaynak", { label: "1 Nolu Mağaza" });
  await sayfa.waitForTimeout(400);

  // Not alanı: okutmadan önce yazılır, okutulan cihazların tarihçesine geçer.
  const notAlani = sayfa.locator('[data-test="aktarim-notu"]');
  kontrol("aktarım ekranında not alanı var", (await notAlani.count()) === 1);
  await notAlani.fill(AKTARIM_NOTU);

  const mesaj1 = await aktar(imei(1));
  kontrol("cihaz aktarıldı", mesaj1.includes("aktarıldı"), mesaj1);

  // ------------------- 5b) Aktarılan satırda fiyat/not düzeltme (yönetici)
  const satir = sayfa.locator('[data-test="aktarilan-satir"]').first();
  kontrol(
    "aktarılan satırda alış fiyatı görünüyor",
    ((await satir.textContent()) ?? "").includes("5.000,00"),
    ((await satir.textContent()) ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
  );
  kontrol(
    "yöneticiye fiyat düzeltme bağlantısı çıkıyor",
    (await satir.locator('[data-test="fiyat-duzelt-ac"]').count()) === 1,
  );

  await satir.locator('[data-test="fiyat-duzelt-ac"]').click();
  await sayfa.waitForTimeout(300);
  kontrol(
    "düzeltme kutusu fiyatı hazır getiriyor",
    (await satir.locator('[data-test="fiyat-girdisi"]').inputValue()) === "5.000,00",
    await satir.locator('[data-test="fiyat-girdisi"]').inputValue(),
  );

  // Bozuk fiyat kaydedilmemeli.
  await satir.locator('[data-test="fiyat-girdisi"]').fill("abc");
  await satir.locator('[data-test="fiyat-kaydet"]').click();
  await sayfa.waitForTimeout(600);
  kontrol(
    "geçersiz fiyat reddedildi",
    (await satir.locator('[data-test="fiyat-hata"]').count()) === 1,
    ((await satir.locator('[data-test="fiyat-hata"]').textContent()) ?? "").trim(),
  );

  await satir.locator('[data-test="fiyat-girdisi"]').fill(YENI_FIYAT);
  await satir.locator('[data-test="fiyat-notu"]').fill(CIHAZ_NOTU);
  await satir.locator('[data-test="fiyat-kaydet"]').click();
  await sayfa.waitForTimeout(2000);
  kontrol(
    "fiyat kaydedildi bildirimi çıktı",
    (await satir.locator('[data-test="fiyat-basari"]').count()) === 1,
    ((await satir.locator('[data-test="fiyat-basari"]').textContent()) ?? "").trim(),
  );
  kontrol(
    "satırda yeni fiyat görünüyor",
    ((await satir.textContent()) ?? "").includes(YENI_FIYAT),
    ((await satir.textContent()) ?? "").replace(/\s+/g, " ").trim().slice(0, 140),
  );

  // Tam seri no girilince program doğrudan cihaz detayına yönlendiriyor.
  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(1)}`, { waitUntil: "networkidle" });
  kontrol(
    "tam seri no cihaz detayına götürdü",
    /\/cihazlar\/\d+$/.test(sayfa.url()),
    sayfa.url(),
  );
  const depo = await depoOku();
  kontrol("cihaz artık 2 Nolu Mağaza deposunda", depo === "2 Nolu Mağaza", depo);
  const detay = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("tarihçede mağaza içi aktarım yazıyor", detay.includes("Mağaza İçi Aktarım"));
  kontrol(
    "aktarım notu tarihçeye yazıldı",
    detay.includes(AKTARIM_NOTU),
    AKTARIM_NOTU,
  );
  kontrol(
    "hareket açıklaması iki mağazayı da içeriyor",
    detay.includes("1 Nolu Mağaza → 2 Nolu Mağaza"),
  );
  kontrol("sevkiyat kaydı açılmadı", !detay.includes("SVK-"));
  const kayitliFiyat = await kunyeOku("Alış Fiyatı");
  kontrol(
    "cihaz künyesinde revize edilen alış fiyatı duruyor",
    kayitliFiyat.includes(YENI_FIYAT),
    `${kayitliFiyat} (beklenen ${YENI_FIYAT})`,
  );
  kontrol("fiyat düzeltmesi tarihçeye Düzeltme olarak yazıldı", detay.includes("Düzeltme"));
  kontrol(
    "tarihçede eski → yeni fiyat yazıyor",
    detay.includes("5.000,00 → 6.250,00"),
  );
  kontrol("cihaz notu kaydedildi", detay.includes(CIHAZ_NOTU), CIHAZ_NOTU);

  await sayfa.goto(`${hedef}/sevkiyat`, { waitUntil: "networkidle" });
  const sevkiyatMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("sevkiyat listesi boş kaldı", !sevkiyatMetni.includes("SVK-"));

  // ------------------------------------------------------- 6) Geri alma
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  await sayfa.selectOption("#kaynak", { label: "1 Nolu Mağaza" });
  await sayfa.waitForTimeout(400);
  await aktar(imei(2));
  await sayfa.getByRole("button", { name: "Geri al" }).first().click();
  await sayfa.waitForTimeout(2000);
  kontrol(
    "geri alındı rozeti çıktı",
    (await sayfa.getByText("Geri alındı").count()) === 1,
  );
  await sayfa.screenshot({ path: `${cikti}-aktif.png`, fullPage: true });

  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(2)}`, { waitUntil: "networkidle" });
  const depo2 = await depoOku();
  kontrol("geri alınan cihaz 1 Nolu Mağaza'ya döndü", depo2 === "1 Nolu Mağaza", depo2);

  // --------------------------------- 7) Aynı dükkân olmayan hedef reddedilir
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  const hedefSecenekleri = await sayfa.locator("#hedef").evaluate((e) =>
    e.tagName === "SELECT" ? [...e.options].map((o) => o.textContent) : [e.value],
  );
  kontrol(
    "farklı dükkândaki mağaza hedef listesinde yok",
    !hedefSecenekleri.some((t) => (t ?? "").includes("3 Nolu")),
    hedefSecenekleri.join(", "),
  );

  // ------------------------- 8) İkinci kez okutma "zaten orada" demeli
  await sayfa.selectOption("#kaynak", { label: "1 Nolu Mağaza" });
  await sayfa.waitForTimeout(400);
  await aktar(imei(1)); // imei(1) şu an 2 Nolu Mağaza'da
  const mesaj2 = await aktar(imei(1));
  kontrol(
    "kaynakta olmayan cihaz reddedildi",
    mesaj2.includes("deposunda") || mesaj2.includes("zaten"),
    mesaj2,
  );

  // ------------------- 9) Tek mağazada yetkili personel ekranı göremez
  await giris("personel3"); // 3 Nolu Mağaza, dükkân kodu yok
  await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  kontrol(
    "yetkisiz personelin menüsünde Aktarım yok",
    (await sayfa.locator('header nav a[href="/aktarim"]').count()) === 0,
  );
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  kontrol(
    "yetkisiz personele kurulum mesajı çıkıyor",
    (await sayfa.getByText("Önce dükkân grubu tanımlanmalı").count()) === 1,
  );
  kontrol(
    "personele yöneticiye danış mesajı veriliyor",
    (await sayfa.getByText("Yöneticinizden").count()) === 1,
  );

  // ------------------ 10) Personel de fiyat düzeltebiliyor
  // Aktarımı fiilen yapan mağaza personeli; fiyat da onun girdiği bir bilgi.
  // personel1 yalnız 1 Nolu Mağaza'da yetkili, aktarım iki mağazada da yetki
  // istiyor — önce M2 yetkisini verelim.
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
  const m2Kutusu = magazaKarti("M2").locator(
    'label:has-text("1 Nolu Mağaza Personeli") input[name="yetkililer"]',
  );
  if (!(await m2Kutusu.isChecked())) await m2Kutusu.check();
  await magazaKarti("M2").getByRole("button", { name: "Yetkileri Kaydet" }).click();
  await sayfa.waitForTimeout(1500);

  await giris("personel1");
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  kontrol(
    "personel aktarım ekranını görebiliyor",
    (await sayfa.locator("#kaynak").count()) === 1,
  );
  await sayfa.selectOption("#kaynak", { label: "1 Nolu Mağaza" });
  await sayfa.waitForTimeout(400);
  const mesaj3 = await aktar(imei(2));
  kontrol("personel aktarım yapabiliyor", mesaj3.includes("aktarıldı"), mesaj3);

  const personelSatiri = sayfa.locator('[data-test="aktarilan-satir"]').first();
  kontrol(
    "personele de fiyat düzeltme bağlantısı çıkıyor",
    (await personelSatiri.locator('[data-test="fiyat-duzelt-ac"]').count()) === 1,
  );

  await personelSatiri.locator('[data-test="fiyat-duzelt-ac"]').click();
  await sayfa.waitForTimeout(300);
  await personelSatiri.locator('[data-test="fiyat-girdisi"]').fill("7.750,00");
  await personelSatiri.locator('[data-test="fiyat-kaydet"]').click();
  await sayfa.waitForTimeout(2000);
  kontrol(
    "personelin fiyat düzeltmesi kaydedildi",
    (await personelSatiri.locator('[data-test="fiyat-basari"]').count()) === 1,
    ((await personelSatiri.textContent()) ?? "").replace(/\s+/g, " ").slice(0, 120),
  );

  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(2)}`, { waitUntil: "networkidle" });
  const personelFiyati = await kunyeOku("Alış Fiyatı");
  kontrol(
    "personelin yazdığı fiyat künyeye işlendi",
    personelFiyati.includes("7.750,00"),
    `${personelFiyati} (beklenen 7.750,00)`,
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
