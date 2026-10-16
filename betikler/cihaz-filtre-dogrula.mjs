// Cihazlar ekranındaki sütun filtreleri ve sıralama testi.
//
// Filtrenin "çalışıyor görünmesi" yetmiyor: doğru satırları eleyip doğru
// satırları bıraktığı, adedin değiştiği ve sıralamanın gerçekten sırayı
// değiştirdiği tek tek sayılıyor.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/cihaz-filtre";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1700, height: 1100 }, locale: "tr-TR" });
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

/** Listedeki cihaz sayısı — başlıktaki "N cihaz". */
async function cihazSayisi() {
  const metin = (await sayfa.locator("text=/^\\d+ cihaz/").first().textContent()) ?? "";
  return Number((metin.match(/(\d+)/) ?? [0, "0"])[1]);
}

/** Başlıkları karşılaştırmak için: sıralama okları ve boşluklar atılıyor. */
function basligiSadelestir(metin) {
  return metin.replace(/[⇅▲▼\s]/g, "");
}

/** Tablodaki satırların belirli bir sütun metni. */
async function sutunDegerleri(baslik) {
  const basliklar = await sayfa.locator("thead tr").first().locator("th").allTextContents();
  const aranan = basligiSadelestir(baslik);
  const indeks = basliklar.findIndex((b) => basligiSadelestir(b) === aranan);
  if (indeks < 0) throw new Error(`"${baslik}" sütunu bulunamadı: ${basliklar.join(", ")}`);
  return (
    await sayfa.locator("tbody tr").evaluateAll(
      (satirlar, i) =>
        satirlar
          .map((s) => s.querySelectorAll("td")[i]?.textContent?.trim() ?? "")
          .filter((t) => t !== ""),
      indeks,
    )
  );
}

/** İki marka ve iki tedarikçiyle fatura girer. */
async function faturaGir({ faturaNo, marka, model, fiyat, imeiler, tedarikciIndeks }) {
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `FLT${damga}${marka.slice(0, 3)}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1200);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const metinler = kart.locator('input[type="text"], input:not([type])');
  await metinler.nth(1).fill(marka);
  await metinler.nth(2).fill(model);
  await kart.locator('input[inputmode="decimal"]').fill(fiyat);
  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const no of imeiler) {
    await imeiKutusu.fill(no);
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(350);
  }
  await sayfa.selectOption("#tedarikciId", { index: tedarikciIndeks });
  await sayfa.fill("#faturaNo", faturaNo);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
}

try {
  await giris("admin");

  // ------------------------------------------------- 0) Hazırlık: 5 cihaz
  // 3 adet ALFA (10.000), 2 adet ZETA (30.000) — farklı tedarikçilerden.
  await faturaGir({
    faturaNo: `FLT-A-${damga}`,
    marka: "ALFAMARKA",
    model: "FON 10",
    fiyat: "10.000,00",
    imeiler: [imei(1), imei(2), imei(3)],
    tedarikciIndeks: 1,
  });
  await faturaGir({
    faturaNo: `FLT-Z-${damga}`,
    marka: "ZETAMARKA",
    model: "FON 90 PRO",
    fiyat: "30.000,00",
    imeiler: [imei(4), imei(5)],
    tedarikciIndeks: 2,
  });
  // Üçüncü marka kasıtlı olarak "en ucuz ama alfabetik olarak en sonda":
  // fiyat sıralaması yanlışlıkla model/marka adına bağlanırsa kontrol düşsün.
  await faturaGir({
    faturaNo: `FLT-Y-${damga}`,
    marka: "YYYMARKA",
    model: "ZZZ FON",
    fiyat: "5.000,00",
    imeiler: [imei(6)],
    tedarikciIndeks: 1,
  });
  console.log("0) hazırlık: 3 ALFAMARKA + 2 ZETAMARKA + 1 YYYMARKA girildi");

  // ----------------- 1) Marka ve Barkod sütunlarını aç (varsayılan kapalı)
  // Filtre sütuna bağlı: sütun gizliyse filtresi de yok, Excel'deki gibi.
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  await sayfa.locator('button:has-text("Sütunlar")').click();
  await sayfa.waitForTimeout(400);
  for (const anahtar of ["marka", "barkod"]) {
    const kutu = sayfa.locator(`input[name="sutun"][value="${anahtar}"]`);
    if (!(await kutu.isChecked())) await kutu.check();
  }
  await sayfa.locator('button:has-text("Uygula")').click();
  await sayfa.waitForTimeout(2000);

  const basliklar = await sayfa.locator("thead tr").first().locator("th").allTextContents();
  kontrol(
    "marka ve barkod sütunları açıldı",
    basliklar.some((b) => b.includes("Marka")) && basliklar.some((b) => b.includes("Barkod")),
    basliklar.map(basligiSadelestir).join(", "),
  );

  // ------------------------------------------------- 2) Filtre satırı var
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  kontrol("tabloda filtre satırı var", (await sayfa.locator('[data-test="filtre-satiri"]').count()) === 1);
  kontrol("marka filtresi açılır liste", (await sayfa.locator('[data-test="filtre-marka"]').count()) === 1);
  kontrol("barkod filtresi var", (await sayfa.locator('[data-test="filtre-barkod"]').count()) === 1);
  kontrol("seri no filtresi var", (await sayfa.locator('[data-test="filtre-seriNo"]').count()) === 1);

  const markaSecenekleri = await sayfa.locator('[data-test="filtre-marka"] option').allTextContents();
  kontrol(
    "marka listesi stoktaki markaları içeriyor",
    markaSecenekleri.includes("ALFAMARKA") && markaSecenekleri.includes("ZETAMARKA"),
    markaSecenekleri.join(", "),
  );

  const tumu = await cihazSayisi();
  kontrol("filtresiz listede tüm cihazlar var", tumu === 6, `${tumu} cihaz (6 bekleniyor)`);

  // ------------------------------------------------- 3) Markaya göre süz
  await sayfa.selectOption('[data-test="filtre-marka"]', "ALFAMARKA");
  await sayfa.waitForTimeout(1500);
  const alfaSayisi = await cihazSayisi();
  kontrol("marka filtresi adedi daralttı", alfaSayisi === 3, `${alfaSayisi} cihaz (3 bekleniyor)`);

  const markalar = await sutunDegerleri("Marka");
  kontrol(
    "listede yalnız seçilen marka var",
    markalar.length > 0 && markalar.every((m) => m === "ALFAMARKA"),
    [...new Set(markalar)].join(", "),
  );
  kontrol("marka filtresi URL'ye yazıldı", sayfa.url().includes("marka=ALFAMARKA"), sayfa.url());
  kontrol(
    "temizle düğmesi çıktı",
    (await sayfa.locator('[data-test="sutun-filtrelerini-temizle"]').count()) === 1,
  );
  await sayfa.screenshot({ path: `${cikti}-marka.png`, fullPage: true });

  // ------------------------------------------------- 4) Barkoda göre süz
  await sayfa.locator('[data-test="sutun-filtrelerini-temizle"]').click();
  await sayfa.waitForTimeout(1200);
  kontrol("temizle filtreyi kaldırdı", (await cihazSayisi()) === tumu, `${await cihazSayisi()}`);

  await sayfa.fill('[data-test="filtre-seriNo"]', imei(4));
  await sayfa.waitForTimeout(1600);
  const seriSayisi = await cihazSayisi();
  kontrol("seri no filtresi tek cihaza indirdi", seriSayisi === 1, `${seriSayisi} cihaz`);
  const seriler = await sutunDegerleri("Seri No / IMEI");
  kontrol("doğru cihaz kaldı", seriler[0] === imei(4), `${seriler[0]} (${imei(4)} bekleniyor)`);

  // -------------------------------------- 5) Bulunamayan değer boş liste
  await sayfa.fill('[data-test="filtre-seriNo"]', "999999999999999");
  await sayfa.waitForTimeout(1600);
  kontrol("eşleşmeyen filtre sıfır cihaz veriyor", (await cihazSayisi()) === 0);
  kontrol(
    "boş listede filtre satırı duruyor",
    (await sayfa.locator('[data-test="filtre-seriNo"]').count()) === 1,
    "kullanıcı filtreyi gevşetebilmeli",
  );
  kontrol(
    "boş listede yol gösteren mesaj var",
    ((await sayfa.locator("tbody").textContent()) ?? "").includes("gevşetebilirsiniz"),
  );

  // ------------------------------------------- 6) Fiyat aralığı filtresi
  await sayfa.goto(`${hedef}/cihazlar?alisMin=20.000,00`, { waitUntil: "networkidle" });
  const pahaliSayisi = await cihazSayisi();
  kontrol(
    "alt sınır ucuz cihazları eledi",
    pahaliSayisi === 2,
    `${pahaliSayisi} cihaz (2 ZETAMARKA bekleniyor)`,
  );
  const pahaliMarkalar = await sutunDegerleri("Marka");
  kontrol(
    "kalanlar pahalı marka",
    pahaliMarkalar.every((m) => m === "ZETAMARKA"),
    [...new Set(pahaliMarkalar)].join(", "),
  );

  await sayfa.goto(`${hedef}/cihazlar?alisMax=20.000,00`, { waitUntil: "networkidle" });
  kontrol(
    "üst sınır pahalı cihazları eledi",
    (await cihazSayisi()) === 4,
    `${await cihazSayisi()} cihaz (3 ALFA + 1 YYY bekleniyor)`,
  );

  // ------------------------------------------------------- 7) Sıralama
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  kontrol(
    "marka başlığı tıklanabilir",
    (await sayfa.locator('[data-test="sirala-marka"]').count()) === 1,
  );

  await sayfa.locator('[data-test="sirala-marka"]').click();
  await sayfa.waitForTimeout(1200);
  const artan = await sutunDegerleri("Marka");
  kontrol(
    "artan sıralama markaları A→Z dizdi",
    artan.length > 1 && artan[0] <= artan[artan.length - 1],
    `${artan[0]} … ${artan[artan.length - 1]}`,
  );
  kontrol("artan sıralama URL'ye yazıldı", sayfa.url().includes("yon=artan"), sayfa.url());

  await sayfa.locator('[data-test="sirala-marka"]').click();
  await sayfa.waitForTimeout(1200);
  const azalan = await sutunDegerleri("Marka");
  kontrol(
    "ikinci tıklama sırayı tersine çevirdi",
    azalan.length > 1 && azalan[0] >= azalan[azalan.length - 1],
    `${azalan[0]} … ${azalan[azalan.length - 1]}`,
  );
  kontrol(
    "tersine çevirme gerçekten değişti",
    artan[0] !== azalan[0],
    `artan ${artan[0]} / azalan ${azalan[0]}`,
  );

  await sayfa.locator('[data-test="sirala-marka"]').click();
  await sayfa.waitForTimeout(1200);
  kontrol(
    "üçüncü tıklama sıralamayı kaldırdı",
    !sayfa.url().includes("sirala=marka"),
    sayfa.url(),
  );

  // Fiyata göre sıralama gerçekten sayısal mı? (metin sıralaması olsaydı
  // "9.000,00" > "30.000,00" çıkardı)
  await sayfa.goto(`${hedef}/cihazlar?sirala=alisFiyati&yon=azalan`, { waitUntil: "networkidle" });
  const fiyatlar = (await sutunDegerleri("Alış Fiyatı")).map((f) =>
    Number(f.replace(/[^\d]/g, "")),
  );
  kontrol(
    "fiyat sıralaması sayısal",
    fiyatlar.length > 1 && fiyatlar.every((f, i) => i === 0 || fiyatlar[i - 1] >= f),
    fiyatlar.slice(0, 6).join(" ≥ "),
  );
  const fiyataGoreMarkalar = await sutunDegerleri("Marka");
  kontrol(
    "fiyat sıralaması marka adına bağlı değil",
    // En ucuz cihaz (YYYMARKA) azalan sıralamada en sonda olmalı; marka adına
    // göre sıralansaydı en başa gelirdi.
    fiyataGoreMarkalar[fiyataGoreMarkalar.length - 1] === "YYYMARKA",
    fiyataGoreMarkalar.join(" > "),
  );

  // --------------------------------- 8) Filtre + sıralama birlikte duruyor
  await sayfa.goto(`${hedef}/cihazlar?marka=ALFAMARKA&sirala=alisFiyati&yon=artan`, {
    waitUntil: "networkidle",
  });
  kontrol("filtre ve sıralama birlikte uygulanıyor", (await cihazSayisi()) === 3);
  kontrol(
    "sıralama değişince filtre korunuyor",
    await (async () => {
      await sayfa.locator('[data-test="sirala-barkod"]').click();
      await sayfa.waitForTimeout(1200);
      return sayfa.url().includes("marka=ALFAMARKA");
    })(),
    sayfa.url(),
  );

  // -------------------------------------- 9) Excel çıktısı filtreyi alıyor
  await sayfa.goto(`${hedef}/cihazlar?marka=ZETAMARKA`, { waitUntil: "networkidle" });
  const excelBaglantisi = await sayfa.locator('a:has-text("Excel\'e Aktar")').getAttribute("href");
  kontrol(
    "Excel bağlantısı sütun filtresini taşıyor",
    (excelBaglantisi ?? "").includes("marka=ZETAMARKA"),
    excelBaglantisi ?? "yok",
  );

  // --------------- 10) Künye düzeltme: tek cihaz ve barkodun tamamı
  // Kullanıcı istedi: marka/kategori listeden değiştirilsin, barkod seçilince
  // "bu barkoddaki hepsine uygulansın mı" diye sorulsun.
  await sayfa.goto(`${hedef}/cihazlar?marka=ALFAMARKA`, { waitUntil: "networkidle" });
  const alfaAdedi = await cihazSayisi();
  kontrol("düzeltme öncesi 3 ALFAMARKA cihaz var", alfaAdedi === 3, `${alfaAdedi}`);

  const markaHucresi = sayfa.locator('[data-test="kunye-duzelt-ac"]').first();
  kontrol("marka hücresi tıklanabilir", (await markaHucresi.count()) === 1);
  await markaHucresi.click();
  await sayfa.waitForTimeout(400);
  kontrol("künye düzenleme açıldı", (await sayfa.locator('[data-test="kunye-duzenleme"]').count()) === 1);

  // Değişiklik yokken kaydet kapalı olmalı.
  kontrol(
    "değişiklik yokken kaydet kapalı",
    await sayfa.locator('[data-test="kunye-kaydet"]').isDisabled(),
  );

  await sayfa.fill('[data-test="kunye-marka"]', "ALFA DUZELTILMIS");
  await sayfa.waitForTimeout(200);
  await sayfa.locator('[data-test="kunye-kaydet"]').click();
  await sayfa.waitForTimeout(600);

  const soru = (await sayfa.locator('[data-test="kapsam-sorusu"]').textContent()) ?? "";
  kontrol(
    "barkodtaki cihaz sayısı soruluyor",
    soru.includes("3 cihaz var") && soru.includes("hepsine uygulansın mı"),
    soru.replace(/\s+/g, " ").trim().slice(0, 90),
  );

  // Önce "yalnız bu cihaz": diğer ikisi eski markada kalmalı.
  await sayfa.locator('[data-test="kapsam-tek"]').click();
  await sayfa.waitForTimeout(2500);

  await sayfa.goto(`${hedef}/cihazlar?marka=ALFAMARKA`, { waitUntil: "networkidle" });
  const tekSonrasi = await cihazSayisi();
  kontrol(
    "yalnız bu cihaz seçilince tek cihaz değişti",
    tekSonrasi === 2,
    `${tekSonrasi} cihaz kaldı (2 bekleniyor)`,
  );

  await sayfa.goto(`${hedef}/cihazlar?marka=ALFA DUZELTILMIS`, { waitUntil: "networkidle" });
  kontrol("düzeltilen cihaz yeni markada görünüyor", (await cihazSayisi()) === 1);

  // Şimdi kalan ikisinde "hepsi": barkodun tamamı değişmeli.
  await sayfa.goto(`${hedef}/cihazlar?marka=ALFAMARKA`, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="kunye-duzelt-ac"]').first().click();
  await sayfa.waitForTimeout(400);
  await sayfa.fill('[data-test="kunye-marka"]', "ALFA TOPLU");
  await sayfa.waitForTimeout(200);
  await sayfa.locator('[data-test="kunye-kaydet"]').click();
  await sayfa.waitForTimeout(600);
  await sayfa.locator('[data-test="kapsam-barkod"]').click();
  await sayfa.waitForTimeout(2500);

  await sayfa.goto(`${hedef}/cihazlar?marka=ALFA TOPLU`, { waitUntil: "networkidle" });
  const topluSonrasi = await cihazSayisi();
  kontrol(
    "hepsi seçilince barkodun tamamı değişti",
    topluSonrasi === 3,
    `${topluSonrasi} cihaz (3 bekleniyor)`,
  );
  await sayfa.goto(`${hedef}/cihazlar?marka=ALFAMARKA`, { waitUntil: "networkidle" });
  kontrol("eski markada cihaz kalmadı", (await cihazSayisi()) === 0, `${await cihazSayisi()}`);

  // Kapsam gerçekten BARKOD: daha önce tek tek düzeltilen cihaz da aynı
  // barkodu taşıdığı için toplu işleme dahil oldu, eski adı kalmadı.
  await sayfa.goto(`${hedef}/cihazlar?marka=ALFA DUZELTILMIS`, { waitUntil: "networkidle" });
  kontrol(
    "tek tek düzeltilmiş cihaz da barkod kapsamına girdi",
    (await cihazSayisi()) === 0,
    `${await cihazSayisi()} cihaz (0 bekleniyor)`,
  );

  // Kategori de değiştirilebilmeli ve tarihçeye yazılmalı.
  await sayfa.goto(`${hedef}/cihazlar?marka=ALFA TOPLU`, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="kunye-duzelt-ac"]').first().click();
  await sayfa.waitForTimeout(400);
  const kategoriSecenekleri = await sayfa.locator('[data-test="kunye-kategori"] option').count();
  kontrol("kategori listesi dolu geliyor", kategoriSecenekleri >= 2, `${kategoriSecenekleri} seçenek`);
  await sayfa.selectOption('[data-test="kunye-kategori"]', { label: "Aksesuar" });
  await sayfa.waitForTimeout(200);
  await sayfa.locator('[data-test="kunye-kaydet"]').click();
  await sayfa.waitForTimeout(600);
  await sayfa.locator('[data-test="kapsam-barkod"]').click();
  await sayfa.waitForTimeout(2500);

  await sayfa.goto(`${hedef}/cihazlar?kategori=`, { waitUntil: "networkidle" });
  await sayfa.goto(`${hedef}/cihazlar?marka=ALFA TOPLU`, { waitUntil: "networkidle" });
  const kunyeKategorileri = await sutunDegerleri("Kategori");
  kontrol(
    "kategori değişikliği tüm barkoda işledi",
    kunyeKategorileri.length === 3 && kunyeKategorileri.every((k) => k === "Aksesuar"),
    [...new Set(kunyeKategorileri)].join(", "),
  );

  // Değişiklik cihazın tarihçesine düzeltme olarak yazılmalı.
  const kunyeSerileri = await sutunDegerleri("Seri No / IMEI");
  await sayfa.goto(`${hedef}/cihazlar?ara=${kunyeSerileri[0]}`, { waitUntil: "networkidle" });
  const tarihce = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "künye düzeltmesi tarihçeye yazıldı",
    tarihce.includes("Kategori") && tarihce.includes("Aksesuar"),
    tarihce.replace(/\s+/g, " ").slice(0, 100),
  );

  // Personel künyeyi düzeltememeli.
  await giris("personel1");
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  kontrol(
    "personelde künye düzeltme açılmıyor",
    (await sayfa.locator('[data-test="kunye-duzelt-ac"]').count()) === 0,
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
