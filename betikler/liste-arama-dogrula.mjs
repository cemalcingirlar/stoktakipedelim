// Fatura ve sevkiyat listelerinde arama + sayfalama testi.
//
// İki liste de "son 100 kayıt" gösteriyordu; arama ve sayfalama yoktu. Ayda
// ~20 fatura giren bir dükkânda beş aydan eski fatura ekrandan ERİŞİLEMEZ
// hale geliyordu — kayıp değil ama bulunamaz, ki pratikte aynı şey. Sorun
// hız değil görünürlük (100 bin cihazla ölçüldü: liste 340 ms).
//
// Test, listeyi bir sayfadan taşıracak kadar fatura girip aramanın ve
// sayfalamanın gerçekten çalıştığını sayıyor.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/liste-arama";
const SIFRE = "Stok2026!";
const damga = Date.now().toString().slice(-6);
// Sayfa boyutu 50; 52 fatura ikinci sayfayı garantiliyor.
const FATURA_ADEDI = 52;
const ARANAN = `ARA${damga}`;

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

const satirSayisi = () => sayfa.locator("table tbody tr").count();

try {
  await giris("admin");

  // =============================== 0) Hazırlık: bir sayfadan fazla fatura
  // Faturalar doğrudan veritabanına yazılıyor: 52 faturayı ekrandan girmek
  // yarım saat sürerdi ve test edilen şey fatura girişi değil, listenin
  // kendisi. (Süit kendi yalıtılmış veritabanında koşuyor.)
  const { default: Database } = await import("better-sqlite3");
  const db = new Database((process.env.DATABASE_URL ?? "").replace(/^file:/, ""));
  const tedarikciId = db.prepare("SELECT id FROM Tedarikci LIMIT 1").get().id;
  const magazaId = db.prepare("SELECT id FROM Magaza ORDER BY kod LIMIT 1").get().id;
  const kullaniciId = db.prepare("SELECT id FROM Kullanici WHERE kullaniciAdi='admin'").get().id;
  const ekle = db.prepare(
    "INSERT INTO AlisFaturasi (faturaNo, tedarikciId, magazaId, olusturanId, faturaTarihi, vadeGun, vadeOdendi, iptalEdildi, createdAt) VALUES (?,?,?,?,?,0,0,0,?)",
  );
  const simdi = new Date();
  for (let i = 0; i < FATURA_ADEDI; i += 1) {
    const tarih = new Date(simdi.getTime() - i * 86_400_000).toISOString();
    // Yalnız biri aranan numarayı taşıyor: arama gerçekten süzüyor mu?
    const no = i === FATURA_ADEDI - 1 ? `${ARANAN}-TEK` : `FTR-${damga}-${i}`;
    ekle.run(no, tedarikciId, magazaId, kullaniciId, tarih, tarih);
  }
  const toplamFatura = db.prepare("SELECT COUNT(*) n FROM AlisFaturasi").get().n;
  db.close();
  kontrol("hazırlık: faturalar eklendi", toplamFatura >= FATURA_ADEDI, `${toplamFatura} fatura`);

  // =============================== 1) Fatura listesi sayfalanıyor
  await sayfa.goto(`${hedef}/faturalar`, { waitUntil: "networkidle" });
  const ilkSayfa = await satirSayisi();
  kontrol("ilk sayfa 50 kayıtla sınırlı", ilkSayfa === 50, `${ilkSayfa} satır`);
  const ozet = ((await sayfa.locator('[data-test="fatura-ozeti"]').textContent()) ?? "").trim();
  kontrol("özet toplam kayıt sayısını yazıyor", /\d+ kayıt/.test(ozet), ozet);
  kontrol(
    "sayfalama bağlantısı var",
    (await sayfa.locator('a[href*="sayfa=2"]').count()) >= 1,
  );

  await sayfa.goto(`${hedef}/faturalar?sayfa=2`, { waitUntil: "networkidle" });
  const ikinciSayfa = await satirSayisi();
  kontrol("ikinci sayfada kalan kayıtlar var", ikinciSayfa > 0, `${ikinciSayfa} satır`);

  // Sayfa numarası taşarsa boş ekran değil son sayfa gelmeli.
  await sayfa.goto(`${hedef}/faturalar?sayfa=999`, { waitUntil: "networkidle" });
  kontrol("taşan sayfa numarasında boş ekran yok", (await satirSayisi()) > 0, `${await satirSayisi()} satır`);

  // =============================== 2) Fatura araması
  await sayfa.goto(`${hedef}/faturalar`, { waitUntil: "networkidle" });
  await sayfa.fill('[data-test="fatura-ara"]', ARANAN);
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\?/, { timeout: 15000 }),
    sayfa.locator('form[action="/faturalar"] button[type="submit"]').click(),
  ]);
  const aramaSatir = await satirSayisi();
  kontrol("arama tek faturayı buluyor", aramaSatir === 1, `${aramaSatir} satır`);
  kontrol(
    "bulunan fatura doğru",
    ((await sayfa.locator("table tbody").textContent()) ?? "").includes(`${ARANAN}-TEK`),
  );

  // Tedarikçi adıyla da aranabilmeli.
  await sayfa.goto(`${hedef}/faturalar?ara=Vatan`, { waitUntil: "networkidle" });
  kontrol("tedarikçi adıyla arama çalışıyor", (await satirSayisi()) > 0, `${await satirSayisi()} satır`);

  // Sonuç yoksa açıklama çıkmalı.
  await sayfa.goto(`${hedef}/faturalar?ara=OLMAYANKAYIT999`, { waitUntil: "networkidle" });
  kontrol(
    "sonuç yokken açıklama çıkıyor",
    ((await sayfa.locator("main").textContent()) ?? "").includes("Aramanıza uyan fatura bulunamadı"),
  );

  // =============================== 3) Sevkiyat listesinde arama
  await sayfa.goto(`${hedef}/sevkiyat`, { waitUntil: "networkidle" });
  kontrol(
    "sevkiyat ekranında arama kutusu var",
    (await sayfa.locator('[data-test="sevkiyat-ara"]').count()) === 1,
  );
  const sevkOzet = ((await sayfa.locator('[data-test="sevkiyat-ozeti"]').textContent()) ?? "").trim();
  kontrol("sevkiyat özeti kayıt sayısını yazıyor", /kayıt/.test(sevkOzet), sevkOzet);
  await sayfa.goto(`${hedef}/sevkiyat?ara=OLMAYANSEVK`, { waitUntil: "networkidle" });
  kontrol("sevkiyat aramasında sonuç yoksa liste boş", (await satirSayisi()) === 0, `${await satirSayisi()} satır`);

  // =============================== 4) Mağaza kısıtı aramayla delinmiyor
  // Personel başka mağazanın faturasını arayarak da göremez.
  await giris("personel2");
  await sayfa.goto(`${hedef}/faturalar?ara=${ARANAN}`, { waitUntil: "networkidle" });
  const personelSatir = await satirSayisi();
  kontrol(
    "personel başka mağazanın faturasını aramayla göremiyor",
    personelSatir === 0,
    `${personelSatir} satır`,
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
