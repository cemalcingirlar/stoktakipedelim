// Gezinme hızı için yapılan düzeltmelerin testi.
//
// "Sayfalar arası geçişte yavaşlık" şikâyeti ölçüldü. Sunucunun sayfa üretme
// süresi 12-80 ms çıktı, yani sorun render değildi. Üç gerçek sebep bulundu:
//
//   1) Tıklamadan sonra ekranda HİÇBİR ŞEY değişmiyordu. Dinamik sayfada
//      içerik bir gidiş-dönüş sonra geliyor (tünel üzerinden 230-330 ms);
//      bu sürede tepki olmayınca kullanıcı tekrar tıklıyordu.
//   2) Next, ekrandaki her bağlantı için önden getirme isteği açıyordu.
//      Sayfalar dinamik ve yükleme sınırı yok; bu istekler boş dönüyordu.
//      50 satırlık cihaz listesinde sayfa başına 30'u aşan boşa giden istek.
//   3) Sekme simgesi (25 KB) önbelleklenemediği için her gezinmede baştan
//      iniyordu.
//
// Ayrıca müşteri listesi en yeni 200 müşteriyi tek seferde çekiyordu: hem
// ağdan 105 KB hem de 200'den eskisine ekrandan erişilemiyordu.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/hiz";
const SIFRE = "Stok2026!";
const damga = Date.now().toString().slice(-6);
// Sayfa boyutu 50; 52 müşteri ikinci sayfayı garantiliyor.
const MUSTERI_ADEDI = 52;
// Cihaz listesinde 50 satır: prefetch açıkken sayfa başına 44 boş istek
// buradan çıkıyordu.
const CIHAZ_ADEDI = 60;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({
  viewport: { width: 1500, height: 1100 },
  locale: "tr-TR",
});
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
  await Promise.all([
    sayfa.waitForURL("**/panel"),
    sayfa.click('button[type="submit"]'),
  ]);
}

try {
  await giris("admin");

  // =============================== 0) Hazırlık: liste dolu olmalı
  // Boş listede ne önden getirme isteği ne satır bağlantısı olur; kontroller
  // sessizce anlamsızlaşır. Kayıtlar doğrudan veritabanına yazılıyor: 52
  // müşteri ile 60 cihazı ekrandan girmek saatler sürerdi ve test edilen şey
  // satış girişi değil, listenin kendisi. (Süit kendi yalıtılmış
  // veritabanında koşuyor.)
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(
    (process.env.DATABASE_URL ?? "").replace(/^file:/, ""),
  );
  const kategoriId = db
    .prepare("SELECT id FROM Kategori ORDER BY sira LIMIT 1")
    .get().id;
  const magazaId = db
    .prepare("SELECT id FROM Magaza ORDER BY kod LIMIT 1")
    .get().id;
  const simdi = Date.now();

  const musteriEkle = db.prepare(
    "INSERT INTO Musteri (adSoyad, telefon, createdAt) VALUES (?,?,?)",
  );
  const cihazEkle = db.prepare(
    `INSERT INTO StokKalemi
       (magazaId, kategoriId, marka, model, seriNo, alisFiyatiKurus, durum,
        girisTarihi, aramaMetni, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  );
  db.transaction(() => {
    // En eski kayıt listenin son sayfasına düşüyor: sıralama createdAt azalan.
    for (let i = 0; i < MUSTERI_ADEDI; i += 1) {
      musteriEkle.run(
        `MUS${damga}-${String(i).padStart(2, "0")}`,
        `0555${String(1000000 + i)}`,
        simdi - (MUSTERI_ADEDI - i) * 60_000,
      );
    }
    for (let i = 0; i < CIHAZ_ADEDI; i += 1) {
      const marka = i % 2 === 0 ? "ALFAMARKA" : "ZETAMARKA";
      cihazEkle.run(
        magazaId,
        kategoriId,
        marka,
        `Model ${i}`,
        `35${damga}${String(i).padStart(7, "0")}`,
        1_000_000,
        "STOKTA",
        simdi,
        `${marka} model ${i}`.toLowerCase(),
        simdi,
        simdi,
      );
    }
  })();
  const toplamMusteri = db.prepare("SELECT COUNT(*) n FROM Musteri").get().n;
  const toplamCihaz = db.prepare("SELECT COUNT(*) n FROM StokKalemi").get().n;
  db.close();
  kontrol(
    "hazırlık: müşteri ve cihaz eklendi",
    toplamMusteri >= MUSTERI_ADEDI && toplamCihaz >= CIHAZ_ADEDI,
    `${toplamMusteri} müşteri · ${toplamCihaz} cihaz`,
  );

  // =============================== 1) Sekme simgesi önbelleklenebiliyor
  // Next bu dosyayı "max-age=0, must-revalidate" ile ve doğrulayıcı olmadan
  // sunuyordu: tarayıcı her gezinmede 25 KB'ı baştan indiriyordu.
  const simge = await sayfa.request.get(`${hedef}/favicon.ico`);
  const simgeBaslik = simge.headers()["cache-control"] ?? "";
  kontrol(
    "sekme simgesi önbelleklenebilir geliyor",
    /max-age=\d{4,}/.test(simgeBaslik) && !/max-age=0/.test(simgeBaslik),
    simgeBaslik || "(başlık yok)",
  );

  // =============================== 2) Boşa giden önden getirme yok
  // Cihaz listesinde 50 satır, her satırda bağlantı var. Prefetch açıkken
  // sayfa açılır açılmaz onlarca boş istek gidiyordu.
  const rscIstekleri = [];
  const dinleyici = (istek) => {
    const u = istek.url();
    if (u.includes("_rsc=")) rscIstekleri.push(new URL(u).pathname);
  };
  sayfa.on("request", dinleyici);
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  // Prefetch bağlantı görünür alana girince tetikleniyor; sayfayı dolaşıp
  // bekliyoruz ki tetiklenecekse tetiklensin.
  await sayfa.mouse.wheel(0, 2000);
  await sayfa.waitForTimeout(2500);
  sayfa.off("request", dinleyici);
  kontrol(
    "cihaz listesi boşa önden getirme isteği açmıyor",
    rscIstekleri.length === 0,
    rscIstekleri.length
      ? `${rscIstekleri.length} istek: ${rscIstekleri.slice(0, 4).join(", ")}`
      : "0 istek",
  );

  // =============================== 3) Tıklamada anında tepki
  // Ağ gecikmesi veriliyor: yerelde içerik o kadar hızlı geliyor ki bekleme
  // işaretini yakalamak tesadüfe kalırdı. Tünel üzerinden bağlanan mağazanın
  // durumu zaten bu.
  const cdp = await sayfa.context().newCDPSession(sayfa);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: (10 * 1024 * 1024) / 8,
    uploadThroughput: (5 * 1024 * 1024) / 8,
  });
  await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  const isaret = sayfa.locator('[data-test="gezinme-beklemede"]');
  await sayfa
    .getByRole("navigation")
    .getByRole("link", { name: "Cihazlar", exact: true })
    .click();
  let isaretGorundu = true;
  try {
    await isaret.first().waitFor({ state: "attached", timeout: 3000 });
  } catch {
    isaretGorundu = false;
  }
  kontrol("menüye tıklayınca bekleme işareti çıkıyor", isaretGorundu);
  await sayfa
    .locator("h1", { hasText: "Cihazlar" })
    .first()
    .waitFor({ state: "visible", timeout: 20000 });
  kontrol(
    "içerik gelince bekleme işareti kayboluyor",
    (await isaret.count()) === 0,
  );

  // Menü dışı bağlantılar da tepki vermeli: cihaz satırına veya "Sonraki
  // sayfa"ya tıklamak da aynı gidiş-dönüşü bekliyor. İşaret bu yüzden ortak
  // bağlantı bileşeninde (src/bilesenler/Bag.tsx) duruyor, menüde değil.
  const satirBaglantisi = sayfa.locator("table tbody tr a").first();
  await satirBaglantisi.click();
  let satirIsareti = true;
  try {
    await isaret.first().waitFor({ state: "attached", timeout: 3000 });
  } catch {
    satirIsareti = false;
  }
  kontrol("cihaz satırına tıklayınca da bekleme işareti çıkıyor", satirIsareti);
  await sayfa.waitForURL(/\/cihazlar\/\d+/, { timeout: 20000 });

  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

  // =============================== 4) Müşteri listesi sayfalanıyor
  await sayfa.goto(`${hedef}/musteriler`, { waitUntil: "networkidle" });
  const satir = () => sayfa.locator("ul.divide-y > li").count();
  const ilkSayfa = await satir();
  kontrol(
    "müşteri listesi bir sayfada 50 kayıt gösteriyor",
    ilkSayfa === 50,
    `${ilkSayfa} satır`,
  );

  const baslik =
    (await sayfa
      .locator("h2, h3")
      .filter({ hasText: "müşteri" })
      .first()
      .textContent()) ?? "";
  kontrol(
    "başlık toplam müşteri sayısını yazıyor",
    baslik.includes(String(toplamMusteri)),
    baslik.trim(),
  );

  const sonraki = sayfa.getByRole("link", { name: /Sonraki/ });
  kontrol("ikinci sayfaya geçiş bağlantısı var", (await sonraki.count()) === 1);
  await sonraki.first().click();
  await sayfa.waitForURL("**/musteriler?*sayfa=2*");
  await sayfa.waitForLoadState("networkidle");
  const ikinciSayfa = await satir();
  kontrol(
    "ikinci sayfa kalan müşterileri gösteriyor",
    ikinciSayfa > 0 && ikinciSayfa < 50,
    `${ikinciSayfa} satır`,
  );

  // En eski müşteri — eskiden 200 sınırının ötesinde kalanlar hiç görünmüyordu.
  const enEski = `MUS${damga}-00`;
  const enEskiGorunur = await sayfa.getByText(enEski, { exact: false }).count();
  kontrol(
    "en eski müşteri son sayfadan erişilebiliyor",
    enEskiGorunur > 0,
    enEski,
  );

  // =============================== 5) Arama sayfalamadan bağımsız çalışıyor
  await sayfa.goto(`${hedef}/musteriler?ara=${enEski}`, {
    waitUntil: "networkidle",
  });
  const aramaSatir = await satir();
  kontrol(
    "arama tek müşteriye düşürüyor",
    aramaSatir === 1,
    `${aramaSatir} satır`,
  );

  await sayfa.goto(`${hedef}/musteriler?ara=OLMAYANMUSTERI`, {
    waitUntil: "networkidle",
  });
  kontrol("arama sonuçsuzsa liste boş", (await satir()) === 0);

  await sayfa.screenshot({ path: `${cikti}-son.png`, fullPage: true });
  kontrol(
    "tarayıcı konsolunda hata yok",
    hatalar.length === 0,
    hatalar.slice(0, 3).join(" | "),
  );
} catch (hata) {
  kontrol("betik tamamlandı", false, String(hata).slice(0, 300));
  await sayfa
    .screenshot({ path: `${cikti}-hata.png`, fullPage: true })
    .catch(() => {});
} finally {
  await tarayici.close();
}

const gecen = sonuclar.filter((s) => s.gecti).length;
console.log(`\n${gecen}/${sonuclar.length} kontrol geçti`);
if (gecen !== sonuclar.length) process.exit(1);
