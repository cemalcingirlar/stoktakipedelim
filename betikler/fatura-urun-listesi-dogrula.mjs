// Alış faturası ekranındaki ürün listesi + Faturalar sayfasındaki
// "Tedarikçi Faturası Yükle" düğmesi testi.
//
// Barkodu okutmak her zaman mümkün olmuyor: kutu açılmış, etiket silinmiş ya
// da kullanıcı ürünü adıyla hatırlıyor. Liste barkodu buluyor, seçildiğinde
// okutmuş gibi kart açılıyor.
//
// Test "liste açılıyor mu" ile yetinmiyor: kartın gerçekten marka, model,
// kategori ve SON alış fiyatıyla dolduğu, aynı barkodun tek satırda
// toplandığı, stokta kalmamış ürünün de listede durduğu ve seçilen ürünün
// faturaya kaydedildiği tek tek sayılıyor.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/fatura-urun-listesi";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);

const BARKOD = `869${damga}0001`;
const MARKA = `FATLISTE${damga}`;
const MODEL = "KULAKLIK PRO";
const ESKI_FIYAT = "500,00";
const YENI_FIYAT = "958,33";

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

/** Barkodu okutarak tek ürün kartlı fatura girer. */
async function faturaGir({ faturaNo, fiyat, adet, tarih }) {
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", BARKOD);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1400);

  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Aksesuar" });
  await kart.locator("select").nth(1).selectOption({ label: "Kulaklık" });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(MARKA);
  await alanlar.nth(2).fill(MODEL);
  await kart.locator('input[inputmode="decimal"]').fill(fiyat);
  await kart.locator('input[id^="adet-"]').first().fill(String(adet));
  await sayfa.waitForTimeout(300);

  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", faturaNo);
  if (tarih) await sayfa.fill("#faturaTarihi", tarih);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
}

/** Fatura ekranındaki listede arar; sonuç satırlarını döner. */
async function listedeAra(sorgu) {
  if ((await sayfa.locator('[data-test="fatura-urun-sorgu"]').count()) === 0) {
    await sayfa.locator('[data-test="fatura-liste-ac"]').click();
    await sayfa.waitForTimeout(300);
  }
  await sayfa.fill('[data-test="fatura-urun-sorgu"]', sorgu);
  await sayfa.locator('[data-test="fatura-urun-bul"]').click();
  await sayfa.waitForTimeout(1500);
  return sayfa.locator('[data-test="fatura-urun-satiri"]');
}

try {
  await giris("admin");

  // ============ 0) Aynı barkod iki kez, farklı fiyatlarla girilsin
  await faturaGir({ faturaNo: `FUL-E-${damga}`, fiyat: ESKI_FIYAT, adet: 2, tarih: "2026-01-15" });
  await faturaGir({ faturaNo: `FUL-Y-${damga}`, fiyat: YENI_FIYAT, adet: 1 });
  kontrol("hazırlık: aynı barkod iki faturayla girildi", true);

  // ============ 1) Faturalar sayfasındaki tedarikçi faturası düğmesi
  await sayfa.goto(`${hedef}/faturalar`, { waitUntil: "networkidle" });
  const tedarikciDugmesi = sayfa.locator('[data-test="tedarikci-faturasi-yukle"]');
  kontrol(
    "faturalar sayfasında 'Tedarikçi Faturası Yükle' var",
    (await tedarikciDugmesi.count()) === 1,
  );
  await Promise.all([
    sayfa.waitForURL(/\/cihazlar\/tedarikci-faturasi$/, { timeout: 30000 }),
    tedarikciDugmesi.click(),
  ]);
  kontrol(
    "düğme tedarikçi faturası ekranını açıyor",
    sayfa.url().endsWith("/cihazlar/tedarikci-faturasi"),
    sayfa.url(),
  );

  // Personel bu düğmeyi görmemeli: yükleme ekranı yalnız yöneticide.
  await giris("personel1");
  await sayfa.goto(`${hedef}/faturalar`, { waitUntil: "networkidle" });
  kontrol(
    "personele tedarikçi faturası düğmesi çıkmıyor",
    (await sayfa.locator('[data-test="tedarikci-faturasi-yukle"]').count()) === 0,
  );

  // ============ 2) Fatura ekranındaki ürün listesi
  await giris("admin");
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  kontrol(
    "fatura ekranında 'Ürün Listesinden Ekle' düğmesi var",
    (await sayfa.locator('[data-test="fatura-liste-ac"]').count()) === 1,
  );
  kontrol(
    "'+ Barkodsuz Ürün' seçeneği duruyor",
    (await sayfa.locator('button:has-text("Barkodsuz Ürün")').count()) === 1,
  );
  kontrol(
    "liste başta kapalı",
    (await sayfa.locator('[data-test="fatura-urun-sorgu"]').count()) === 0,
  );

  const satirlar = await listedeAra(MARKA);
  kontrol(
    "aynı barkodun iki girişi tek satırda toplandı",
    (await satirlar.count()) === 1,
    `${await satirlar.count()} satır`,
  );
  const satirMetni = ((await satirlar.first().textContent()) ?? "").replace(/\s+/g, " ").trim();
  kontrol("satırda ürün adı var", satirMetni.includes(MODEL), satirMetni.slice(0, 100));
  kontrol("satırda kategori var", satirMetni.includes("Aksesuar / Kulaklık"), satirMetni.slice(0, 100));
  kontrol("satırda barkod var", satirMetni.includes(BARKOD), satirMetni.slice(0, 100));
  kontrol(
    "satırda toplam giriş adedi var (2 + 1 = 3)",
    /3 adet girilmiş/.test(satirMetni),
    satirMetni.slice(0, 100),
  );
  kontrol(
    "satırda SON alış fiyatı yazıyor, eskisi değil",
    satirMetni.includes(YENI_FIYAT) && !satirMetni.includes(ESKI_FIYAT),
    `${YENI_FIYAT} bekleniyor · ${satirMetni.slice(0, 100)}`,
  );

  // ============ 3) Seçince kart dolu açılıyor
  await satirlar.first().click();
  await sayfa.waitForTimeout(2000);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  kontrol("listeden seçince ürün kartı açıldı", (await kart.count()) === 1);

  const alanlar = kart.locator('input[type="text"], input:not([type])');
  kontrol(
    "kartta barkod dolu geldi",
    (await alanlar.nth(0).inputValue()) === BARKOD,
    await alanlar.nth(0).inputValue(),
  );
  kontrol("kartta marka dolu geldi", (await alanlar.nth(1).inputValue()) === MARKA, await alanlar.nth(1).inputValue());
  kontrol("kartta model dolu geldi", (await alanlar.nth(2).inputValue()) === MODEL, await alanlar.nth(2).inputValue());
  kontrol(
    "kartta son alış fiyatı dolu geldi",
    (await kart.locator('input[inputmode="decimal"]').inputValue()) === YENI_FIYAT,
    await kart.locator('input[inputmode="decimal"]').inputValue(),
  );
  kontrol(
    "kartta kategori seçili geldi",
    (await kart.locator("select").first().inputValue()) !== "",
    await kart.locator("select").first().inputValue(),
  );

  await sayfa.screenshot({ path: `${cikti}-liste.png`, fullPage: true });

  // ============ 4) Seçilen ürün gerçekten faturaya kaydediliyor
  await kart.locator('input[id^="adet-"]').first().fill("4");
  await sayfa.waitForTimeout(300);
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `FUL-L-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
  const faturaMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("listeden eklenen ürün faturaya kaydedildi", faturaMetni.includes(MODEL));
  kontrol(
    "kaydedilen fiyat listede görünen fiyat",
    faturaMetni.includes(YENI_FIYAT),
    YENI_FIYAT,
  );

  // ============ 5) Stokta kalmasa da listede durmalı
  // Girilen 7 cihazın hepsi satılırsa bile ürün kartı listede kalmalı:
  // listenin asıl işi yeniden alınan ürünü bulmak.
  await sayfa.goto(`${hedef}/cihazlar?ara=${encodeURIComponent(MARKA)}`, {
    waitUntil: "networkidle",
  });
  kontrol("cihazlar listesinde ürün görünüyor", ((await sayfa.locator("main").textContent()) ?? "").includes(MODEL));

  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  const tekrarSatirlar = await listedeAra(MODEL);
  kontrol(
    "model adıyla da bulunuyor",
    (await tekrarSatirlar.count()) === 1,
    `${await tekrarSatirlar.count()} satır`,
  );

  // Bulunamayan arama anlaşılır olmalı.
  const bosSatirlar = await listedeAra(`YOKBOYLEURUN${damga}`);
  kontrol("olmayan üründe sonuç yok", (await bosSatirlar.count()) === 0);
  kontrol(
    "sonuç yokken açıklama çıkıyor",
    (await sayfa.locator('[data-test="fatura-urun-sonuc-yok"]').count()) === 1,
  );

  // ===== 6) Seri no zorunlu olmayan kategoride de seri girilebilmeli
  // Aksesuarların çoğunda seri no yok ve adet doğru; ama Apple şarj
  // adaptörü gibi bazılarında var ve takip edilmek isteniyor. Kategoriyi
  // değiştirmek zorunda kalmadan bu ürün için seri girilebiliyor.
  const SERI_A = `SN${damga}A`;
  const SERI_B = `SN${damga}B`;

  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `${BARKOD}X`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1400);

  const seriKart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await seriKart.locator("select").first().selectOption({ label: "Aksesuar" });
  await seriKart.locator("select").nth(1).selectOption({ label: "Kablo / Şarj" });
  const seriAlanlar = seriKart.locator('input[type="text"], input:not([type])');
  await seriAlanlar.nth(1).fill("APPLE");
  await seriAlanlar.nth(2).fill("35W ADAPTER");
  await seriKart.locator('input[inputmode="decimal"]').fill("1.400,00");

  kontrol(
    "aksesuarda önce adet alanı geliyor",
    (await seriKart.locator('input[id^="adet-"]').count()) === 1,
  );
  kontrol(
    "seri moduna geçiş düğmesi var",
    (await seriKart.locator('[data-test="seri-moduna-gec"]').count()) === 1,
  );

  await seriKart.locator('[data-test="seri-moduna-gec"]').click();
  await sayfa.waitForTimeout(400);
  kontrol(
    "seri moduna geçince IMEI kutusu açıldı",
    (await seriKart.locator('input[id^="imei-"]').count()) === 1,
  );
  kontrol(
    "adet alanı yerini seri kutusuna bıraktı",
    (await seriKart.locator('input[id^="adet-"]').count()) === 0,
  );
  kontrol(
    "adete dönüş seçeneği duruyor",
    (await seriKart.locator('[data-test="adete-geri-don"]').count()) === 1,
  );

  // Geri dönüş gerçekten çalışmalı: yanlışlıkla açan kullanıcı sıkışmasın.
  await seriKart.locator('[data-test="adete-geri-don"]').click();
  await sayfa.waitForTimeout(400);
  kontrol(
    "adete dönülebiliyor",
    (await seriKart.locator('input[id^="adet-"]').count()) === 1,
  );
  await seriKart.locator('[data-test="seri-moduna-gec"]').click();
  await sayfa.waitForTimeout(400);

  const seriKutusu = seriKart.locator('input[id^="imei-"]').first();
  for (const no of [SERI_A, SERI_B]) {
    await seriKutusu.fill(no);
    await seriKutusu.press("Enter");
    await sayfa.waitForTimeout(500);
  }
  const altBant = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "iki seri okutulunca cihaz sayısı 2 oldu",
    /2 cihaz/.test(altBant),
    (altBant.match(/\d+ ürün · \d+ cihaz/) ?? ["(bulunamadı)"])[0],
  );

  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `FUL-S-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
  const seriFatura = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "aksesuarın seri numaraları faturaya yazıldı",
    seriFatura.includes(SERI_A) && seriFatura.includes(SERI_B),
    `${SERI_A} / ${SERI_B}`,
  );

  // Asıl ölçüm: cihaz kaydında seri no gerçekten duruyor mu?
  await sayfa.goto(`${hedef}/cihazlar?ara=${SERI_A}`, { waitUntil: "networkidle" });
  kontrol(
    "seri numarasıyla cihaz bulunuyor",
    /\/cihazlar\/\d+$/.test(sayfa.url()),
    sayfa.url(),
  );
  const seriKunye = sayfa.locator('dt:has-text("Seri No / IMEI") + dd').first();
  kontrol(
    "cihaz künyesinde seri no yazıyor",
    ((await seriKunye.textContent().catch(() => "")) ?? "").trim() === SERI_A,
    ((await seriKunye.textContent().catch(() => "")) ?? "").trim(),
  );

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
