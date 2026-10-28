// Adetle izlenen ürünlerde sevk ve kabul.
//
// Aksesuarların bir kısmı adet bazlı tutuluyor: aynı barkodtan 20 şarj aleti
// birbirinin tıpatıp aynısı, hangisinin sevk edildiği hiç fark etmiyor.
// Eskiden bu ürünlerde:
//   - sevk oluştururken barkod okutunca "hangisi?" diye 20 tıpatıp aynı satır
//     listeleniyor ve her adet için tek tek tıklamak gerekiyordu,
//   - kabulde her adedi ayrı ayrı okutmak gerekiyordu.
// 40 kalemlik bir sevkiyatta bu, iki ekranda da yüzlerce tıklama demekti.
//
// Artık iki ekran da adet soruyor. Seri numaralı cihazlarda (telefon) eski
// davranış sürüyor: hangi IMEI'nin taşındığı kayıt altında kalmalı.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/adetli-sevk";
const SIFRE = "Stok2026!";
const damga = Date.now().toString().slice(-8);

const ADET = 20;
const BARKOD = `880${damga}`;
const AKSESUAR = "EP-T2510N TYPE C(25W) BLACK";
const IMEI = `35${damga}12345`.slice(0, 15);

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({
  viewport: { width: 1500, height: 1200 },
  locale: "tr-TR",
});
const konsolHatalari = [];
sayfa.on("console", (m) => {
  if (m.type() === "error") konsolHatalari.push(m.text());
});
sayfa.on("pageerror", (e) => konsolHatalari.push(String(e)));

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
  await Promise.all([
    sayfa.waitForURL("**/panel"),
    sayfa.click('button[type="submit"]'),
  ]);
}

async function okut(kod) {
  await sayfa.fill("#okutmaKutusu", kod);
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(900);
  const kutu = sayfa.locator('[data-test="okutma-geri-bildirim"]');
  if ((await kutu.count()) > 0) return ((await kutu.first().textContent()) ?? "").trim();
  return "";
}

const adetPaneli = () => sayfa.locator('[data-test="adet-secimi"]');
const listeSatiri = () => sayfa.locator("table tbody tr").count();

/** Adet panelinde sayı yazıp ekler. */
async function adetEkle(sayi) {
  await sayfa.fill('[data-test="adet-girdisi"]', String(sayi));
  await sayfa.click('[data-test="adet-ekle"]');
  await sayfa.waitForTimeout(1200);
  const not = sayfa.locator('[data-test="adet-sonucu"]');
  return (await not.count()) > 0 ? ((await not.textContent()) ?? "").trim() : "";
}

try {
  // ======================================= 0) Hazırlık
  // 20 seri numarasız aksesuar + 1 seri numaralı telefon, hepsi 1 Nolu
  // Mağaza'da stokta. Ekrandan girmek saatler sürerdi; test edilen şey stok
  // girişi değil, sevk ve kabul ekranları. (Süit kendi veritabanında koşuyor.)
  const { default: Database } = await import("better-sqlite3");
  const db = new Database((process.env.DATABASE_URL ?? "").replace(/^file:/, ""));
  const magazalar = db.prepare("SELECT id, kod, ad FROM Magaza ORDER BY kod").all();
  const kaynak = magazalar[0];
  const hedefMagaza = magazalar[1];
  const kullaniciAdi = (m) => `sorumlu${m.kod.replace("M", "")}`;
  const kategoriId = db.prepare("SELECT id FROM Kategori ORDER BY sira LIMIT 1").get().id;
  const simdi = new Date().toISOString();

  const ekle = db.prepare(
    `INSERT INTO StokKalemi
       (magazaId, kategoriId, marka, model, seriNo, barkod, alisFiyatiKurus,
        durum, girisTarihi, aramaMetni, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,'STOKTA',?,?,?,?)`,
  );
  db.transaction(() => {
    for (let i = 0; i < ADET; i += 1) {
      ekle.run(
        kaynak.id, kategoriId, "SAMSUNG", AKSESUAR, null, BARKOD, 50_000,
        simdi, `samsung ${AKSESUAR} ${BARKOD}`.toLowerCase(), simdi, simdi,
      );
    }
    // Seri numaralı cihaz: adet yolu buna uygulanmamalı.
    ekle.run(
      kaynak.id, kategoriId, "SAMSUNG", "Galaxy A55", IMEI, null, 1_000_000,
      simdi, `samsung galaxy a55 ${IMEI}`.toLowerCase(), simdi, simdi,
    );
  })();
  db.close();
  kontrol("hazırlık: 20 aksesuar + 1 telefon girildi", true, `barkod ${BARKOD}`);

  // ======================================= 1) Sevkte adet soruluyor
  await giris(kullaniciAdi(kaynak));
  await sayfa.goto(`${hedef}/sevkiyat/yeni`, { waitUntil: "networkidle" });
  await sayfa.selectOption("#hedef", { label: hedefMagaza.ad });

  const ilkOkutma = await okut(BARKOD);
  kontrol(
    "adetli üründe seçim listesi yerine adet soruluyor",
    (await adetPaneli().count()) === 1 && (await sayfa.locator('[data-test="cihaz-secimi"]').count()) === 0,
    ilkOkutma,
  );
  const mevcut = ((await sayfa.locator('[data-test="adet-mevcut"]').textContent()) ?? "").trim();
  kontrol("mevcut adet doğru yazıyor", mevcut === String(ADET), mevcut);

  // ======================================= 2) İstenen adet listeye giriyor
  const sekiz = await adetEkle(8);
  kontrol("8 adet tek seferde eklendi", (await listeSatiri()) === 8, `${await listeSatiri()} satır`);
  kontrol("sonuç notu adedi yazıyor", /8 adet sevkiyata eklendi/.test(sekiz), sekiz);
  kontrol("adet paneli kapandı", (await adetPaneli().count()) === 0);

  // ======================================= 3) Kalan adet doğru sayılıyor
  // Listeye alınanlar bir daha sayılmamalı: 20'den 8 gitti, 12 kaldı.
  await okut(BARKOD);
  const kalan = ((await sayfa.locator('[data-test="adet-mevcut"]').textContent()) ?? "").trim();
  kontrol("kalan adet listeye alınanları düşüyor", kalan === String(ADET - 8), kalan);

  // ======================================= 4) Mevcuttan fazlası istenirse
  const fazla = await adetEkle(50);
  kontrol(
    "mevcuttan fazlası istenince kalan kadarı ekleniyor",
    (await listeSatiri()) === ADET,
    `${await listeSatiri()} satır`,
  );
  kontrol(
    "fark kullanıcıya söyleniyor",
    /50 adet istendi ama 12 adet kaldı/.test(fazla),
    fazla,
  );

  // ======================================= 5) Seri numaralı cihaz adetsiz
  const telefon = await okut(IMEI);
  kontrol(
    "seri numaralı cihazda adet sorulmuyor",
    (await adetPaneli().count()) === 0,
    telefon,
  );
  kontrol(
    "telefon doğrudan listeye girdi",
    (await listeSatiri()) === ADET + 1,
    `${await listeSatiri()} satır`,
  );

  // ======================================= 6) Sevkiyat gönderiliyor
  await Promise.all([
    sayfa.waitForURL(/\/sevkiyat\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Sevkiyatı Gönder")'),
  ]);
  const sevkiyatUrl = sayfa.url();
  kontrol("sevkiyat oluştu", /\/sevkiyat\/\d+$/.test(new URL(sevkiyatUrl).pathname), new URL(sevkiyatUrl).pathname);

  // ======================================= 7) Kabulde adetle kabul
  await giris(kullaniciAdi(hedefMagaza));
  await sayfa.goto(sevkiyatUrl, { waitUntil: "networkidle" });

  const sayac = async (ad) =>
    Number(((await sayfa.locator(`[data-test="sayac-${ad}"]`).textContent()) ?? "").trim());
  kontrol("kabulde 21 cihaz bekliyor", (await sayac("bekleyen")) === ADET + 1, String(await sayac("bekleyen")));

  // Önce bir parti: kutudan 5 adet çıktı.
  await sayfa.fill('[data-test="kabul-adedi"]', "5");
  const besKabul = await okut(BARKOD);
  kontrol("5 adet tek okutmada kabul edildi", (await sayac("okutulan")) === 5, String(await sayac("okutulan")));
  kontrol("kabul mesajı adedi yazıyor", /5 adet kabul edildi/.test(besKabul), besKabul);

  // Bekleyenden fazlası isteniyor: 15 kaldı, 30 yazılıyor. Gelmemiş malı
  // stoğa almamak için bekleyen kadarı alınmalı ve fark söylenmeli.
  await sayfa.fill('[data-test="kabul-adedi"]', "30");
  const topluKabul = await okut(BARKOD);
  kontrol(
    "bekleyenden fazlası istenince yalnız bekleyen kadarı kabul ediliyor",
    (await sayac("okutulan")) === ADET,
    String(await sayac("okutulan")),
  );
  kontrol(
    "kabulde fark kullanıcıya söyleniyor",
    /30 adet istendi ama 15 adet kaldı/.test(topluKabul),
    topluKabul,
  );

  // ======================================= 8) Adet alanı 1'e dönüyor
  // 20 yazıp unutan biri sıradaki ürünün 20 adedini gelmeden kabul ederdi.
  const adetAlani = await sayfa.inputValue('[data-test="kabul-adedi"]');
  kontrol("adet alanı okutmadan sonra 1'e döndü", adetAlani === "1", adetAlani);

  const telefonKabul = await okut(IMEI);
  kontrol("telefon tek adet kabul edildi", (await sayac("okutulan")) === ADET + 1, String(await sayac("okutulan")));
  kontrol("telefon mesajında adet yok", !/adet kabul edildi/.test(telefonKabul), telefonKabul);
  kontrol("bekleyen sıfırlandı", (await sayac("bekleyen")) === 0, String(await sayac("bekleyen")));

  // ======================================= 9) Bekleyenden fazlası istenirse
  // Hepsi kabul edildi; adet yazıp tekrar okutmak stok üretmemeli.
  await sayfa.goto(sevkiyatUrl, { waitUntil: "networkidle" });
  await sayfa.locator('button:has-text("Kabulü Tamamla")').click();
  await sayfa.waitForTimeout(2500);
  await sayfa.goto(sevkiyatUrl, { waitUntil: "networkidle" });
  const govde = (await sayfa.locator("body").textContent()) ?? "";
  kontrol("sevkiyat tamamen kabul edildi", /tamamen kabul edildi/i.test(govde), govde.slice(0, 120).replace(/\s+/g, " "));

  await sayfa.goto(`${hedef}/cihazlar?ara=${BARKOD}`, { waitUntil: "networkidle" });
  const stokSatir = await sayfa.locator("table tbody tr").count();
  kontrol("20 aksesuar hedef mağaza stoğunda", stokSatir === ADET, `${stokSatir} satır`);

  await sayfa.screenshot({ path: `${cikti}-son.png`, fullPage: true });
  kontrol("tarayıcı konsolunda hata yok", konsolHatalari.length === 0, konsolHatalari.slice(0, 3).join(" | "));
} catch (hata) {
  kontrol("betik tamamlandı", false, String(hata).slice(0, 300));
  await sayfa.screenshot({ path: `${cikti}-hata.png`, fullPage: true }).catch(() => {});
} finally {
  await tarayici.close();
}

const gecen = sonuclar.filter((s) => s.gecti).length;
console.log(`\n${gecen}/${sonuclar.length} kontrol geçti`);
if (gecen !== sonuclar.length) process.exit(1);
