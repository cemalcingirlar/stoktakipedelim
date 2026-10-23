// Üst "Ara" kutusunun aynı barkodu paylaşan cihazları listelemesi testi.
//
// Kutuya tam bir kod girildiğinde ekran doğrudan cihaz detayına atlıyordu.
// Kısayol seri numarası için yazılmıştı: bir IMEI bir cihaz demek. Aynı
// barkodu paylaşan aksesuarlarda ise rastgele birine atlıyor, kullanıcı
// aradığı listeyi hiç göremiyordu — barkodu alttaki sütun filtresine yazmak
// çalışıyor, üstteki arama kutusuna yazmak çalışmıyordu.
//
// Test iki yönlü: çoklu eşleşme LİSTELENİYOR, tek eşleşme hâlâ detaya
// ATLIYOR. Yalnız birincisi kontrol edilse kısayolu tamamen kaldırmak da
// testi geçerdi; günlük okutma akışı buna bağlı.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/ara-coklu-barkod";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);

// Paylaşılan barkod: 3 aksesuar aynı koda sahip (kullanıcının bildirdiği hâl).
const PAYLASILAN = `690${damga}0001`;
// Tek cihazda kalan barkod: kısayol bunda bozulmamalı.
const TEKIL = `690${damga}0002`;
const IMEI = `35${damga}000001`.slice(0, 15);
// İki ayrı depoya dağılmış, aynı barkodlu 3 cihaz (bildirilen ekrandaki hâl).
const DAGINIK = `690${damga}0003`;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1600, height: 1100 }, locale: "tr-TR" });
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

/** Listedeki cihaz sayısı — başlıktaki "N cihaz". Boş listede 0. */
async function cihazSayisi() {
  const kutu = sayfa.locator("text=/^\\d+ cihaz/").first();
  if ((await kutu.count()) === 0) return 0;
  const metin = (await kutu.textContent()) ?? "";
  return Number((metin.match(/(\d+)/) ?? [0, "0"])[1]);
}

/** Aksesuar faturası: adet kadar cihaz, hepsi aynı barkodla. */
async function aksesuarGir({ barkod, faturaNo, adet, marka, model, magaza = "1 Nolu Mağaza" }) {
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", barkod);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1400);

  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Aksesuar" });
  await kart.locator("select").nth(1).selectOption({ label: "Kulaklık" });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(marka);
  await alanlar.nth(2).fill(model);
  await kart.locator('input[inputmode="decimal"]').fill("500,00");
  await kart.locator('input[id^="adet-"]').first().fill(String(adet));
  await sayfa.waitForTimeout(300);

  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", faturaNo);
  await sayfa.selectOption("#magazaId", { label: magaza });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
}

/** Seri numaralı telefon faturası. */
async function telefonGir({ faturaNo, imei, marka, model }) {
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `ARA${damga}TEL`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1400);

  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(marka);
  await alanlar.nth(2).fill(model);
  await kart.locator('input[inputmode="decimal"]').fill("30.000,00");
  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  await imeiKutusu.fill(imei);
  await imeiKutusu.press("Enter");
  await sayfa.waitForTimeout(400);

  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", faturaNo);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
}

/** Tablodaki herhangi bir sütunun değerleri. */
async function sutunDegerleri(baslik) {
  const basliklar = await sayfa.locator("thead tr").first().locator("th").allTextContents();
  const i = basliklar.findIndex((b) => b.replace(/[⇅▲▼\s]/g, "") === baslik);
  if (i < 0) throw new Error(`${baslik} sütunu yok: ${basliklar.join(", ")}`);
  return await sayfa.locator("tbody tr").evaluateAll(
    (satirlar, k) =>
      satirlar
        .map((s) => s.querySelectorAll("td")[k]?.textContent?.trim() ?? "")
        .filter((t) => t !== ""),
    i,
  );
}

/** Üst arama kutusuna yazıp Enter'a basar; sonra bulunduğu URL'yi döner. */
async function araKutusunaYaz(sorgu) {
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  await sayfa.fill("#ara", sorgu);
  await sayfa.press("#ara", "Enter");
  await sayfa.waitForTimeout(2000);
  return sayfa.url();
}

/** Barkod sütununu açar (varsayılan kapalı). */
async function barkodSutunuAc() {
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  await sayfa.locator('button:has-text("Sütunlar")').click();
  await sayfa.waitForTimeout(400);
  const kutu = sayfa.locator('input[name="sutun"][value="barkod"]');
  if (!(await kutu.isChecked())) await kutu.check();
  await sayfa.locator('button:has-text("Uygula")').click();
  await sayfa.waitForTimeout(2000);
}

/** Tablodaki barkod sütununun değerleri. */
async function barkodlar() {
  const basliklar = await sayfa.locator("thead tr").first().locator("th").allTextContents();
  const i = basliklar.findIndex((b) => b.replace(/[⇅▲▼\s]/g, "") === "Barkod");
  if (i < 0) throw new Error(`Barkod sütunu yok: ${basliklar.join(", ")}`);
  return await sayfa.locator("tbody tr").evaluateAll(
    (satirlar, k) =>
      satirlar
        .map((s) => s.querySelectorAll("td")[k]?.textContent?.trim() ?? "")
        .filter((t) => t !== ""),
    i,
  );
}

try {
  await giris("admin");

  // ------------------------------------------------- 0) Hazırlık
  await aksesuarGir({
    faturaNo: `ARA-P-${damga}`,
    barkod: PAYLASILAN,
    adet: 3,
    marka: `ARAMARKA${damga}`,
    model: "KULAKLIK COK",
  });
  await aksesuarGir({
    faturaNo: `ARA-T-${damga}`,
    barkod: TEKIL,
    adet: 1,
    marka: `ARAMARKA${damga}`,
    model: "KULAKLIK TEK",
  });
  await telefonGir({
    faturaNo: `ARA-I-${damga}`,
    imei: IMEI,
    marka: `ARATEL${damga}`,
    model: "FON 1",
  });
  console.log(`0) hazırlık: ${PAYLASILAN} barkodlu 3 aksesuar, ${TEKIL} barkodlu 1 aksesuar, ${IMEI} IMEI'li 1 telefon`);

  await barkodSutunuAc();

  // ------------------- 1) HATA: paylaşılan barkod arama kutusunda listelenir
  const paylasilanUrl = await araKutusunaYaz(PAYLASILAN);
  kontrol(
    "paylaşılan barkod detaya ATLAMIYOR",
    !/\/cihazlar\/\d+/.test(paylasilanUrl),
    paylasilanUrl,
  );
  const paylasilanSayi = await cihazSayisi();
  kontrol(
    "paylaşılan barkod 3 cihazın hepsini listeliyor",
    paylasilanSayi === 3,
    `${paylasilanSayi} cihaz (3 bekleniyor)`,
  );
  const listelenen = await barkodlar();
  kontrol(
    "listelenen satırların hepsi aranan barkod",
    listelenen.length === 3 && listelenen.every((b) => b === PAYLASILAN),
    [...new Set(listelenen)].join(", ") || "(boş)",
  );
  await sayfa.screenshot({ path: `${cikti}-paylasilan.png`, fullPage: true });

  // --------------- 2) Sütun filtresi aynı sonucu veriyor (iki yol da aynı)
  await sayfa.goto(`${hedef}/cihazlar?barkod=${PAYLASILAN}`, { waitUntil: "networkidle" });
  await sayfa.waitForTimeout(1200);
  const sutunSayi = await cihazSayisi();
  kontrol(
    "sütun filtresi ile arama kutusu aynı adedi veriyor",
    sutunSayi === paylasilanSayi && sutunSayi === 3,
    `sütun ${sutunSayi} / arama ${paylasilanSayi}`,
  );

  // ------------------- 3) KORUNAN KOLAYLIK: tek eşleşme hâlâ detaya atlıyor
  const imeiUrl = await araKutusunaYaz(IMEI);
  kontrol("tek IMEI doğrudan cihaz detayına atlıyor", /\/cihazlar\/\d+/.test(imeiUrl), imeiUrl);
  const imeiBaslik = (await sayfa.locator("body").textContent()) ?? "";
  kontrol("atlanan detay aranan cihaz", imeiBaslik.includes(IMEI), IMEI);

  const tekilUrl = await araKutusunaYaz(TEKIL);
  kontrol(
    "tek cihazda kalan barkod da detaya atlıyor",
    /\/cihazlar\/\d+/.test(tekilUrl),
    tekilUrl,
  );
  const tekilGovde = (await sayfa.locator("body").textContent()) ?? "";
  kontrol("atlanan detay tekil barkodlu cihaz", tekilGovde.includes("KULAKLIK TEK"), tekilUrl);

  // ------------------------------- 4) Eşleşmeyen kod boş liste, hata değil
  const yokUrl = await araKutusunaYaz("999999999999999");
  kontrol("eşleşmeyen kod listede kalıyor", !/\/cihazlar\/\d+/.test(yokUrl), yokUrl);
  kontrol("eşleşmeyen kod sıfır cihaz veriyor", (await cihazSayisi()) === 0);

  // --------- 5) Mağaza görünürlüğü: yetkisiz kullanıcı ne atlıyor ne görüyor
  // Cihazlar 1 Nolu Mağaza'da; personel2 ikinci mağazada.
  await giris("personel2");
  const yabanciUrl = await araKutusunaYaz(PAYLASILAN);
  kontrol(
    "yetkisiz kullanıcı başka mağazanın cihazına atlamıyor",
    !/\/cihazlar\/\d+/.test(yabanciUrl),
    yabanciUrl,
  );
  const yabanciSayi = await cihazSayisi();
  kontrol(
    "yetkisiz kullanıcı başka mağazanın cihazlarını görmüyor",
    yabanciSayi === 0,
    `${yabanciSayi} cihaz (0 bekleniyor)`,
  );
  const yabanciTekil = await araKutusunaYaz(TEKIL);
  kontrol(
    "yetkisiz kullanıcı tekil barkodlu cihaza da atlamıyor",
    !/\/cihazlar\/\d+/.test(yabanciTekil),
    yabanciTekil,
  );

  // ------------- 6) Yetkili kullanıcı: kapsam daraltması listeyi engellemiyor
  await giris("personel1");
  const yetkiliUrl = await araKutusunaYaz(PAYLASILAN);
  kontrol(
    "yetkili kullanıcıda da liste geliyor (atlamıyor)",
    !/\/cihazlar\/\d+/.test(yetkiliUrl),
    yetkiliUrl,
  );
  const yetkiliSayi = await cihazSayisi();
  kontrol(
    "yetkili kullanıcı 3 cihazın hepsini görüyor",
    yetkiliSayi === 3,
    `${yetkiliSayi} cihaz (3 bekleniyor)`,
  );
  const yetkiliImei = await araKutusunaYaz(IMEI);
  kontrol(
    "yetkili kullanıcıda tek IMEI kısayolu çalışıyor",
    /\/cihazlar\/\d+/.test(yetkiliImei),
    yetkiliImei,
  );
  await sayfa.screenshot({ path: `${cikti}-yetkili.png`, fullPage: true });

  // ---- 7) Kullanıcının ekranındaki koşullar: Durum=Stokta + iki ayrı depo
  // Bildirilen ekranda "Stokta" seçili ve cihazlar farklı depolara dağılmış
  // (M1 REAL ANA DEPO, OPTİMUM AVM...). Kısayol kararı durum/depo
  // filtrelerine bakmadan verildiği için bu birleşim ayrıca sayılıyor.
  await giris("admin");
  await aksesuarGir({
    faturaNo: `ARA-D-${damga}`,
    barkod: DAGINIK,
    adet: 2,
    marka: `ARAMARKA${damga}`,
    model: "KULAKLIK DEPO A",
    magaza: "1 Nolu Mağaza",
  });
  await aksesuarGir({
    faturaNo: `ARA-D2-${damga}`,
    barkod: DAGINIK,
    adet: 1,
    marka: `ARAMARKA${damga}`,
    model: "KULAKLIK DEPO B",
    magaza: "2 Nolu Mağaza",
  });

  await sayfa.goto(`${hedef}/cihazlar?durum=STOKTA&ara=${DAGINIK}`, {
    waitUntil: "networkidle",
  });
  await sayfa.waitForTimeout(1500);
  kontrol(
    "Durum=Stokta etkinken çoklu barkod detaya atlamıyor",
    !/\/cihazlar\/\d+/.test(sayfa.url()),
    sayfa.url(),
  );
  const daginikSayi = await cihazSayisi();
  kontrol(
    "iki ayrı depodaki 3 cihazın hepsi listeleniyor",
    daginikSayi === 3,
    `${daginikSayi} cihaz (3 bekleniyor)`,
  );
  const depolar = await sutunDegerleri("Depo");
  kontrol(
    "liste iki depoyu birden kapsıyor",
    new Set(depolar).size === 2,
    [...new Set(depolar)].join(", ") || "(boş)",
  );
  await sayfa.screenshot({ path: `${cikti}-daginik.png`, fullPage: true });

  kontrol("konsolda hata yok", hatalar.length === 0, hatalar.slice(0, 3).join(" | "));
} catch (e) {
  kontrol("betik tamamlandı", false, String(e));
  await sayfa.screenshot({ path: `${cikti}-cokme.png`, fullPage: true }).catch(() => {});
} finally {
  await tarayici.close();
  const basarisiz = sonuclar.filter((s) => !s.gecti);
  console.log(`\n${sonuclar.length - basarisiz.length}/${sonuclar.length} kontrol geçti`);
  if (basarisiz.length > 0) {
    console.log("Başarısız kontroller:");
    for (const s of basarisiz) console.log(`  ✗ ${s.ad}${s.ek ? ` — ${s.ek}` : ""}`);
  }
  process.exit(basarisiz.length === 0 ? 0 : 1);
}
