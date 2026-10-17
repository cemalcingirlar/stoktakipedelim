// Cihaz detay ekranından künye (kategori / marka / model) düzeltme testi.
//
// Yanlış kaydedilen bir ürünü düzeltmek için alış faturasına gitmek
// gerekmiyor: cihazın kendi ekranından düzeltiliyor ve aynı barkodu taşıyan
// bütün cihazlara uygulanabiliyor.
//
// Test "ekranda düğme var mı" ile yetinmiyor: değişikliğin veritabanına
// gerçekten yazıldığı, kapsamın (yalnız bu cihaz / hepsi) gerçekten
// ayrıştığı ve aramanın yeni isimle çalıştığı tek tek sayılıyor.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/kunye-duzenleme";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);
const BARKOD = `869${damga}0001`;

const ESKI_MARKA = `YANLISMARKA${damga}`;
const ESKI_MODEL = "YANLIS MODEL";
const YENI_MARKA = `DOGRUMARKA${damga}`;
const YENI_MODEL = "DOGRU MODEL";

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
 * Künye kartındaki bir satırın değerini okur.
 *
 * Sayfanın gövdesinde metin aramak yetmez: aynı metin tarihçede ya da
 * başlıkta da geçebilir, alan yazılmamışken test geçerdi.
 */
async function kunyeOku(etiket) {
  const dd = sayfa.locator(`dt:has-text("${etiket}") + dd`).first();
  return ((await dd.textContent()) ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Listedeki cihaz adedi — başlıktaki "N cihaz".
 *
 * `tbody tr` saymak yanıltıcı: sonuç yokken "cihaz bulunamadı" satırı da bir
 * <tr>, yani boş liste 1 satır gibi görünüyor.
 */
async function cihazSayisi() {
  const metin = (await sayfa.locator("text=/^\\d+ cihaz/").first().textContent()) ?? "";
  return Number((metin.match(/(\d+)/) ?? [0, "0"])[1]);
}

/** Bir IMEI'nin cihaz kimliğini bulur (arama tam eşleşmede detaya atlar). */
async function cihazIdBul(seriNo) {
  await sayfa.goto(`${hedef}/cihazlar?ara=${seriNo}`, { waitUntil: "networkidle" });
  const eslesme = sayfa.url().match(/\/cihazlar\/(\d+)$/);
  return eslesme ? Number(eslesme[1]) : null;
}

/** Künye düzenleyiciyi açar ve verilen alanları doldurur. */
async function duzenlemeyiAc({ marka, model, kategori, altKategori }) {
  await sayfa.locator('[data-test="kunye-duzelt-ac"]').first().click();
  await sayfa.locator('[data-test="kunye-duzenleme"]').waitFor({ timeout: 10000 });
  if (marka !== undefined) await sayfa.locator('[data-test="kunye-marka"]').fill(marka);
  if (model !== undefined) await sayfa.locator('[data-test="kunye-model"]').fill(model);
  if (kategori !== undefined) {
    await sayfa.locator('[data-test="kunye-kategori"]').selectOption({ label: kategori });
  }
  if (altKategori !== undefined) {
    await sayfa.locator('[data-test="kunye-alt-kategori"]').selectOption({ label: altKategori });
  }
}

try {
  // =================================================== 0) Hazırlık
  // Tek ürün kartı altında 3 cihaz: hepsi aynı barkodu taşıyor.
  await giris("admin");
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", BARKOD);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1300);

  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ label: "Sıfır" });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(ESKI_MARKA);
  await alanlar.nth(2).fill(ESKI_MODEL);
  await kart.locator('input[inputmode="decimal"]').fill("1.665,81");

  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const i of [1, 2, 3]) {
    await imeiKutusu.fill(imei(i));
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(400);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `KUN-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
  kontrol("hazırlık: aynı barkodlu 3 cihaz girildi", /\/faturalar\/\d+$/.test(sayfa.url()));

  const cihaz1 = await cihazIdBul(imei(1));
  const cihaz2 = await cihazIdBul(imei(2));
  kontrol("hazırlık: cihaz kimlikleri bulundu", Boolean(cihaz1 && cihaz2), `#${cihaz1} #${cihaz2}`);

  // =================================================== 1) Düğme yerinde mi
  await sayfa.goto(`${hedef}/cihazlar/${cihaz1}`, { waitUntil: "networkidle" });
  kontrol(
    "künye kartında 'Düzenle' düğmesi var",
    (await sayfa.locator('[data-test="kunye-duzelt-ac"]').count()) === 1,
  );
  kontrol("başlangıçta eski kategori yazıyor", (await kunyeOku("Kategori")) === "Cep Telefonu / Sıfır",
    await kunyeOku("Kategori"));
  kontrol(
    "başlangıçta eski marka/model yazıyor",
    (await kunyeOku("Marka / Model")) === `${ESKI_MARKA} ${ESKI_MODEL}`,
    await kunyeOku("Marka / Model"),
  );

  // ==================================== 2) Yalnız bu cihaz (kapsam: TEK)
  await duzenlemeyiAc({
    marka: YENI_MARKA,
    model: YENI_MODEL,
    kategori: "Aksesuar",
    altKategori: "Kulaklık",
  });
  await sayfa.locator('[data-test="kunye-kaydet"]').click();

  // Barkodda 3 cihaz olduğu için kapsam sorulmalı.
  await sayfa.locator('[data-test="kapsam-sorusu"]').waitFor({ timeout: 10000 });
  const soruMetni = ((await sayfa.locator('[data-test="kapsam-sorusu"]').textContent()) ?? "")
    .replace(/\s+/g, " ")
    .trim();
  kontrol(
    "kapsam soruluyor ve doğru adedi söylüyor",
    soruMetni.includes(BARKOD) && soruMetni.includes("3 cihaz"),
    soruMetni.slice(0, 90),
  );

  await sayfa.locator('[data-test="kapsam-tek"]').click();
  await sayfa.waitForTimeout(2500);

  kontrol(
    "tek kapsamda bu cihazın kategorisi değişti",
    (await kunyeOku("Kategori")) === "Aksesuar / Kulaklık",
    await kunyeOku("Kategori"),
  );
  kontrol(
    "tek kapsamda bu cihazın marka/modeli değişti",
    (await kunyeOku("Marka / Model")) === `${YENI_MARKA} ${YENI_MODEL}`,
    await kunyeOku("Marka / Model"),
  );

  // Diğer cihaz dokunulmamış olmalı — kapsam gerçekten ayrışıyor mu?
  await sayfa.goto(`${hedef}/cihazlar/${cihaz2}`, { waitUntil: "networkidle" });
  kontrol(
    "aynı barkoddaki diğer cihaz değişmedi",
    (await kunyeOku("Marka / Model")) === `${ESKI_MARKA} ${ESKI_MODEL}` &&
      (await kunyeOku("Kategori")) === "Cep Telefonu / Sıfır",
    `${await kunyeOku("Marka / Model")} · ${await kunyeOku("Kategori")}`,
  );

  // ================================== 3) Hepsine uygula (kapsam: BARKOD)
  await duzenlemeyiAc({
    marka: YENI_MARKA,
    model: YENI_MODEL,
    kategori: "Aksesuar",
    altKategori: "Kulaklık",
  });
  await sayfa.locator('[data-test="kunye-kaydet"]').click();
  await sayfa.locator('[data-test="kapsam-sorusu"]').waitFor({ timeout: 10000 });
  await sayfa.locator('[data-test="kapsam-barkod"]').click();
  await sayfa.waitForTimeout(2500);

  kontrol(
    "barkod kapsamında bu cihaz değişti",
    (await kunyeOku("Marka / Model")) === `${YENI_MARKA} ${YENI_MODEL}`,
    await kunyeOku("Marka / Model"),
  );

  // 3. cihaz hiç elle düzenlenmedi; yalnız barkod kapsamıyla değişmiş olmalı.
  const cihaz3 = await cihazIdBul(imei(3));
  await sayfa.goto(`${hedef}/cihazlar/${cihaz3}`, { waitUntil: "networkidle" });
  kontrol(
    "elle dokunulmayan 3. cihaz da barkod kapsamıyla değişti",
    (await kunyeOku("Marka / Model")) === `${YENI_MARKA} ${YENI_MODEL}` &&
      (await kunyeOku("Kategori")) === "Aksesuar / Kulaklık",
    `${await kunyeOku("Marka / Model")} · ${await kunyeOku("Kategori")}`,
  );

  // Düzeltme tarihçeye yazılmalı: sonradan kimin ne değiştirdiği okunabilsin.
  const tarihce = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "düzeltme cihaz tarihçesine işlendi",
    tarihce.includes("Düzeltme") && tarihce.includes(ESKI_MARKA),
    tarihce.includes("Düzeltme") ? "tarihçede var" : "tarihçede yok",
  );

  // ===================================== 4) Arama yeni isimle çalışıyor mu
  await sayfa.goto(`${hedef}/cihazlar?ara=${encodeURIComponent(YENI_MARKA)}`, {
    waitUntil: "networkidle",
  });
  const bulunan = await cihazSayisi();
  kontrol("yeni marka ile arama 3 cihazı buluyor", bulunan === 3, `${bulunan} cihaz`);

  await sayfa.goto(`${hedef}/cihazlar?ara=${encodeURIComponent(ESKI_MARKA)}`, {
    waitUntil: "networkidle",
  });
  const eskiBulunan = await cihazSayisi();
  kontrol("eski marka ile arama artık cihaz bulmuyor", eskiBulunan === 0, `${eskiBulunan} cihaz`);

  await sayfa.screenshot({ path: `${cikti}-detay.png`, fullPage: true });

  // ============================ 5) Yönetici olmayan düzenleyemez
  await giris("personel1");
  await sayfa.goto(`${hedef}/cihazlar/${cihaz1}`, { waitUntil: "networkidle" });
  kontrol(
    "personele 'Düzenle' düğmesi çıkmıyor",
    (await sayfa.locator('[data-test="kunye-duzelt-ac"]').count()) === 0,
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
