// Satış ekranında "Listeden Ürün Seç" testi.
//
// Bazı ürünü okutmak yerine adıyla bulmak daha kolay: aksesuarın barkodu
// silinmiş olabiliyor. Liste cihaz cihaz değil ürün ürün gösteriyor — aynı
// aksesuardan 20 adet varsa tek satır.
//
// Test "liste açılıyor mu" ile yetinmiyor: aramanın doğru ürünü bulduğu,
// aynı barkodtaki cihazların tek satırda toplandığı, seçince sepete gerçekten
// eklendiği, birden çok cihaz varken hangisinin satılacağının sorulduğu,
// sepettekilerin listeden düştüğü ve başka mağazanın ürününün hiç
// görünmediği tek tek sayılıyor.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/urun-listesi";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);

// Aranabilir, kendine özgü bir ad: başka test verisine karışmasın.
const AKSESUAR_MARKA = `LISTEMARKA${damga}`;
const AKSESUAR_MODEL = "POWERBANK 20000";
const TELEFON_MARKA = `LISTEFON${damga}`;
const TELEFON_MODEL = "SUPER 5G";
const BASKA_MAGAZA_MARKA = `GIZLIMARKA${damga}`;

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
 * Tek ürün kartlı alış faturası girer.
 *
 * `seriler` boşsa adet alanı kullanılır (seri no zorunlu olmayan kategori).
 */
async function faturaGir({ faturaNo, marka, model, kategori, altKategori, fiyat, seriler, adet, magaza }) {
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `LST${damga}${marka.slice(-4)}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1300);

  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: kategori });
  await kart.locator("select").nth(1).selectOption({ label: altKategori });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(marka);
  await alanlar.nth(2).fill(model);
  await kart.locator('input[inputmode="decimal"]').fill(fiyat);

  if (seriler && seriler.length > 0) {
    const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
    for (const no of seriler) {
      await imeiKutusu.fill(no);
      await imeiKutusu.press("Enter");
      await sayfa.waitForTimeout(400);
    }
  } else {
    // Seri no zorunlu olmayan kategoride IMEI kutusu yerine adet alanı çıkar.
    await kart.locator('input[id^="adet-"]').first().fill(String(adet));
    await sayfa.waitForTimeout(300);
  }

  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", faturaNo);
  await sayfa.selectOption("#magazaId", { label: magaza });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
}

/** Listeyi açıp arama yapar; sonuç satırlarını döner. */
async function listedeAra(sorgu) {
  if ((await sayfa.locator('[data-test="urun-sorgu"]').count()) === 0) {
    await sayfa.locator('[data-test="liste-ac"]').click();
    await sayfa.waitForTimeout(300);
  }
  await sayfa.fill('[data-test="urun-sorgu"]', sorgu);
  await sayfa.locator('[data-test="urun-ara"]').click();
  await sayfa.waitForTimeout(1500);
  return sayfa.locator('[data-test="urun-satiri"]');
}

const sepetSatiri = () => sayfa.locator('[data-test="sepet-satiri"]');

try {
  // =================================================== 0) Hazırlık
  await giris("admin");

  // Aynı barkodlu 3 aksesuar (seri numarasız) — tek satırda toplanmalı.
  await faturaGir({
    faturaNo: `LST-A-${damga}`,
    marka: AKSESUAR_MARKA,
    model: AKSESUAR_MODEL,
    kategori: "Aksesuar",
    altKategori: "Güç Grubu",
    fiyat: "900,00",
    adet: 3,
    magaza: "1 Nolu Mağaza",
  });

  // Seri numaralı 2 telefon — seçimde IMEI sorulmalı.
  await faturaGir({
    faturaNo: `LST-T-${damga}`,
    marka: TELEFON_MARKA,
    model: TELEFON_MODEL,
    kategori: "Cep Telefonu",
    altKategori: "Sıfır",
    fiyat: "20.000,00",
    seriler: [imei(1), imei(2)],
    magaza: "1 Nolu Mağaza",
  });

  // Başka mağazaya bir ürün: personel1 bunu listede görmemeli.
  await faturaGir({
    faturaNo: `LST-G-${damga}`,
    marka: BASKA_MAGAZA_MARKA,
    model: "GIZLI MODEL",
    kategori: "Aksesuar",
    altKategori: "Kılıf",
    fiyat: "100,00",
    adet: 2,
    magaza: "2 Nolu Mağaza",
  });
  kontrol("hazırlık: üç fatura girildi", true);

  // =================================================== 1) Liste açılıyor
  await giris("personel1");
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  kontrol(
    "satış ekranında 'Listeden Ürün Seç' düğmesi var",
    (await sayfa.locator('[data-test="liste-ac"]').count()) === 1,
  );
  kontrol(
    "liste başta kapalı",
    (await sayfa.locator('[data-test="urun-sorgu"]').count()) === 0,
  );

  await sayfa.locator('[data-test="liste-ac"]').click();
  await sayfa.waitForTimeout(400);
  kontrol(
    "düğme listeyi açıyor",
    (await sayfa.locator('[data-test="urun-sorgu"]').count()) === 1,
  );

  // ======================= 2) Aynı barkodtaki cihazlar tek satırda
  const aksesuarSatirlari = await listedeAra(AKSESUAR_MARKA);
  kontrol(
    "3 adet aksesuar tek satırda toplandı",
    (await aksesuarSatirlari.count()) === 1,
    `${await aksesuarSatirlari.count()} satır`,
  );
  const aksesuarMetni = ((await aksesuarSatirlari.first().textContent()) ?? "")
    .replace(/\s+/g, " ")
    .trim();
  kontrol("satırda ürün adı yazıyor", aksesuarMetni.includes(AKSESUAR_MODEL), aksesuarMetni.slice(0, 90));
  kontrol("satırda adet yazıyor", /3 adet/.test(aksesuarMetni), aksesuarMetni.slice(0, 90));
  kontrol("satırda alış fiyatı yazıyor", aksesuarMetni.includes("900,00"), aksesuarMetni.slice(0, 90));

  // ===================== 3) Başka mağazanın ürünü listede görünmemeli
  const gizliSatirlar = await listedeAra(BASKA_MAGAZA_MARKA);
  kontrol(
    "yetkili olunmayan mağazanın ürünü listede yok",
    (await gizliSatirlar.count()) === 0,
    `${await gizliSatirlar.count()} satır`,
  );
  kontrol(
    "sonuç yokken açıklama çıkıyor",
    (await sayfa.locator('[data-test="urun-sonuc-yok"]').count()) === 1,
  );

  // =========================== 4) Seçince sepete ekleniyor (tek tıkla)
  const tekrarAksesuar = await listedeAra(AKSESUAR_MARKA);
  await tekrarAksesuar.first().click();
  await sayfa.waitForTimeout(2000);
  kontrol(
    "listeden seçilen ürün sepete eklendi",
    (await sepetSatiri().count()) === 1,
    `${await sepetSatiri().count()} satır`,
  );
  const sepetMetni = ((await sayfa.locator('[data-test="satis-sepeti"]').textContent()) ?? "")
    .replace(/\s+/g, " ")
    .trim();
  kontrol("sepetteki cihaz doğru ürün", sepetMetni.includes(AKSESUAR_MODEL), sepetMetni.slice(0, 100));
  kontrol(
    "satış fiyatı alış fiyatıyla dolu geldi",
    (await sayfa.locator('[data-test="sepet-fiyat"]').first().inputValue()) === "900,00",
    await sayfa.locator('[data-test="sepet-fiyat"]').first().inputValue(),
  );

  // Sepete giren cihaz listedeki adetten düşmeli.
  const kalanAksesuar = await listedeAra(AKSESUAR_MARKA);
  const kalanMetin = ((await kalanAksesuar.first().textContent()) ?? "").replace(/\s+/g, " ");
  kontrol(
    "sepete eklenen cihaz listedeki adetten düştü",
    /2 adet/.test(kalanMetin),
    kalanMetin.slice(0, 90),
  );

  // ================ 5) Seri numaralı üründe hangi cihaz diye soruluyor
  const telefonSatirlari = await listedeAra(TELEFON_MARKA);
  kontrol(
    "seri numaralı ürün de tek satırda",
    (await telefonSatirlari.count()) === 1,
    `${await telefonSatirlari.count()} satır`,
  );
  await telefonSatirlari.first().click();
  await sayfa.waitForTimeout(2000);
  kontrol(
    "birden çok cihaz varken hangisi diye soruluyor",
    (await sayfa.locator('[data-test="cihaz-secimi"]').count()) === 1,
  );
  const secimMetni = ((await sayfa.locator('[data-test="cihaz-secimi"]').textContent()) ?? "")
    .replace(/\s+/g, " ")
    .trim();
  kontrol(
    "seçim listesinde IMEI'ler var",
    secimMetni.includes(imei(1)) && secimMetni.includes(imei(2)),
    secimMetni.slice(0, 120),
  );

  await sayfa.locator('[data-test="secim-adayi"]').first().click();
  await sayfa.waitForTimeout(2000);
  kontrol(
    "seçilen IMEI sepete eklendi",
    (await sepetSatiri().count()) === 2,
    `${await sepetSatiri().count()} satır`,
  );
  const ikiliSepet = (await sayfa.locator('[data-test="satis-sepeti"]').textContent()) ?? "";
  kontrol("sepette seçilen IMEI görünüyor", ikiliSepet.includes(imei(1)), imei(1));

  await sayfa.screenshot({ path: `${cikti}-liste.png`, fullPage: true });

  // ============================= 6) Okutma yolu hâlâ çalışıyor olmalı
  // Liste okutmanın yerine geçmiyor, yanına ekleniyor.
  await sayfa.fill("#okutmaKutusu", imei(2));
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1800);
  kontrol(
    "liste eklendikten sonra okutma da çalışıyor",
    (await sepetSatiri().count()) === 3,
    `${await sepetSatiri().count()} satır`,
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
