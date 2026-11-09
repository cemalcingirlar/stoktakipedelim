// Satış kartı: bir satışta satılan cihazların tamamı tek ekranda.
//
// Bildirilen sıkıntı: bir müşteriye aynı siparişte üç cihaz satıldığında
// panelde üç ayrı satır oluyor ve hangilerinin birlikte satıldığı
// anlaşılmıyordu; müşteri bilgisini görmek için her birini tek tek açmak
// gerekiyordu.
//
// Test, kullanıcının anlattığı durumu kuruyor: bir müşteriye tek satışta üç
// cihaz, aynı müşteriye ayrı bir satışta bir cihaz daha. Ölçüt, üç cihazlık
// satışın kartından ÜÇÜNÜN de görünmesi ve ayrı satışın o karta
// karışmaması. Ayrıca karta giden yollar (panel listesi, cihaz detayı) ve
// satış düzeltildiğinde kartın doğru kalması sınanıyor.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/satis-karti";
const SIFRE = "Stok2026!";

const damga = Date.now().toString().slice(-8);
const imei = (i) => `35${damga}${String(i).padStart(5, "0")}`.slice(0, 15);
const MUSTERI = `Kart Alıcı ${damga}`;
const MUSTERI2 = `Kart İkinci ${damga}`;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const baglam = await tarayici.newContext({
  viewport: { width: 1500, height: 1200 },
  locale: "tr-TR",
});
const sayfa = await baglam.newPage();
const konsolHatalari = [];
sayfa.on("console", (m) => {
  // Görünürlük sınamasında başka mağazanın kartına bilerek giriliyor ve
  // program 404 veriyor; tarayıcının bunu konsola yazması hata değil.
  if (m.type() === "error" && !/status of 404/.test(m.text())) {
    konsolHatalari.push(m.text());
  }
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
  await sayfa.waitForTimeout(1200);
}

/** Verilen cihazları tek satışta müşteriye satar; satış kartının yolunu döner. */
async function sat(kodlar, musteriAdi, fiyat) {
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  for (const kod of kodlar) await okut(kod);
  const fiyatlar = sayfa.locator('[data-test="sepet-fiyat"]');
  for (let i = 0; i < (await fiyatlar.count()); i += 1) {
    await fiyatlar.nth(i).fill(fiyat);
  }
  await sayfa.waitForTimeout(300);

  // Müşteri: varsa seçiliyor, yoksa yeni kayıt açılıyor.
  await sayfa.fill("#musteriSorgu", musteriAdi);
  await sayfa.locator('[data-test="musteri-ara"]').click();
  await sayfa.waitForTimeout(1500);
  const sec = sayfa.locator('[data-test="musteri-sec"]').first();
  if ((await sec.count()) > 0) await sec.click();
  else await sayfa.fill("#yeniAd", musteriAdi);
  await sayfa.waitForTimeout(300);

  await Promise.all([
    sayfa.waitForURL(/\/satislar\/\d+$/, { timeout: 30000 }),
    sayfa.locator('button:has-text("Cihazı Sat"), button:has-text("Satışı Kaydet")').first().click(),
  ]);
  return new URL(sayfa.url()).pathname;
}

try {
  await giris("admin");

  // ------------------------------------------------ 0) beş cihaz gir
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `KART${damga}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1200);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(`KARTMARKA${damga}`);
  await alanlar.nth(2).fill("FON K");
  await kart.locator('input[inputmode="decimal"]').fill("10.000,00");
  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const i of [1, 2, 3, 4, 5]) {
    await imeiKutusu.fill(imei(i));
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(350);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `KART-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);

  // =============================== 1) BİLDİRİLEN DURUM: üç cihazlık satış
  const kartYolu = await sat([imei(1), imei(2), imei(3)], MUSTERI, "13.000,00");
  kontrol("satış sonrası satış kartı açıldı", /^\/satislar\/\d+$/.test(kartYolu), kartYolu);

  const kalemSayisi = await sayfa.locator('[data-test="satis-kalemi"]').count();
  kontrol("kartta üç cihaz da listelenmiş", kalemSayisi === 3, `${kalemSayisi} kalem`);

  const kalemMetni = (await sayfa.locator('[data-test="satis-kalemleri"]').textContent()) ?? "";
  kontrol(
    "üç seri numarası da kartta",
    [1, 2, 3].every((i) => kalemMetni.includes(imei(i))),
    kalemMetni.replace(/\s+/g, " ").slice(0, 120),
  );

  const kartGovde = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("kartta müşteri adı yazıyor", kartGovde.includes(MUSTERI));
  kontrol("kartta müşteri telefonu alanı var", /Telefon/.test(kartGovde));
  kontrol("kartta satışı yapan yazıyor", /Satışı Yapan/.test(kartGovde));
  kontrol("kartta ödeme tipi yazıyor", /Ödeme Tipi/.test(kartGovde));
  const toplam = (await sayfa.locator('[data-test="satis-toplam"]').textContent()) ?? "";
  kontrol("kart toplamı üç cihazın toplamı", toplam.includes("39.000,00"), toplam.trim());

  // Üst menüde yanlış sekme işaretlenmemeli: /satislar/N satış ekranı değil.
  const aktifMenu = await sayfa.locator("header nav a.bg-slate-700").allTextContents();
  kontrol(
    "üst menüde satış ekranı sekmesi işaretli değil",
    aktifMenu.every((m) => !m.includes("Satış")),
    JSON.stringify(aktifMenu),
  );

  await sayfa.screenshot({ path: `${cikti}-kart.png`, fullPage: true });

  // =============== 2) Ayrı satış aynı karta karışmıyor (kullanıcının derdi)
  const ikinciYol = await sat([imei(4)], MUSTERI, "12.000,00");
  kontrol("ikinci satış ayrı kart açtı", ikinciYol !== kartYolu, `${kartYolu} / ${ikinciYol}`);
  const ikinciKalem = await sayfa.locator('[data-test="satis-kalemi"]').count();
  kontrol("ayrı satışın kartında tek cihaz var", ikinciKalem === 1, `${ikinciKalem} kalem`);
  const ikinciMetin = (await sayfa.locator('[data-test="satis-kalemleri"]').textContent()) ?? "";
  kontrol(
    "ayrı satışın kartı önceki cihazları göstermiyor",
    !ikinciMetin.includes(imei(1)) && ikinciMetin.includes(imei(4)),
  );

  // Beşinci cihaz ikinci bir müşteriye: düzeltme sınaması için sistemde
  // başka bir müşteri de bulunmalı.
  const ucuncuYol = await sat([imei(5)], MUSTERI2, "11.000,00");
  const ucuncuMetin = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "başka müşteriye satış kendi kartını açtı",
    ucuncuYol !== kartYolu && ucuncuMetin.includes(MUSTERI2),
    ucuncuYol,
  );

  // İlk kart da bozulmamalı.
  await sayfa.goto(`${hedef}${kartYolu}`, { waitUntil: "networkidle" });
  const ilkKartYine = await sayfa.locator('[data-test="satis-kalemi"]').count();
  kontrol("ilk kart hâlâ üç cihazlı", ilkKartYine === 3, `${ilkKartYine} kalem`);

  // =============================================== 3) Karta giden yollar
  await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  const panelBag = sayfa
    .locator(`[data-test="satis-karti-baglantisi"][href="${kartYolu}"]`)
    .first();
  kontrol("panel listesi satış kartına bağlıyor", (await panelBag.count()) > 0, kartYolu);
  if ((await panelBag.count()) > 0) {
    await panelBag.click();
    await sayfa.waitForURL(/\/satislar\/\d+$/, { timeout: 20000 });
    kontrol("panelden karta geçildi", sayfa.url().endsWith(kartYolu), sayfa.url());
  }

  // Cihaz detayından karta.
  await sayfa.goto(`${hedef}${kartYolu}`, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="satis-kalemi"] a[href^="/cihazlar/"]').first().click();
  await sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 20000 });
  const cihazYolu = new URL(sayfa.url()).pathname;
  const cihazBag = sayfa.locator('[data-test="satis-karti-baglantisi"]').first();
  kontrol("cihaz detayında satış kartı bağı var", (await cihazBag.count()) === 1);
  const bagMetni = (await cihazBag.textContent()) ?? "";
  kontrol(
    "bağ satış numarasını ve adedi gösteriyor",
    /SAT-\d{8}-\d{3}/.test(bagMetni) && bagMetni.includes("3 cihaz"),
    bagMetni.trim(),
  );
  await cihazBag.click();
  await sayfa.waitForURL(/\/satislar\/\d+$/, { timeout: 20000 });
  kontrol("cihazdan karta geçildi", sayfa.url().endsWith(kartYolu), sayfa.url());

  // ================================= 4) Görünürlük: başka mağazanın kartı
  await giris("personel2");
  await sayfa.goto(`${hedef}${kartYolu}`, { waitUntil: "networkidle" });
  const yabanci = (await sayfa.locator("body").textContent()) ?? "";
  kontrol(
    "başka mağazanın personeli kartı göremiyor",
    !yabanci.includes(MUSTERI),
    yabanci.replace(/\s+/g, " ").slice(0, 80),
  );
  await giris("personel1");
  await sayfa.goto(`${hedef}${kartYolu}`, { waitUntil: "networkidle" });
  kontrol(
    "kendi mağazasının personeli kartı görüyor",
    ((await sayfa.locator("main").textContent()) ?? "").includes(MUSTERI),
  );

  // ======================= 5) Satış düzeltilince kart da doğru kalmalı
  // Üç cihazlık satışta bir cihazın müşterisi değişirse kalan ikisinin kartı
  // "üç cihaz bu müşteriye satıldı" demeye devam etmemeli.
  await giris("admin");
  await sayfa.goto(`${hedef}/musteriler`, { waitUntil: "networkidle" });
  await sayfa.goto(`${hedef}${cihazYolu}`, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="satis-duzenle-ac"]').click();
  await sayfa.waitForTimeout(400);
  const musteriSecici = sayfa.locator('[data-test="duzelt-musteri"]');
  const secenekler = await musteriSecici.locator("option").allTextContents();
  const baskaMusteri = secenekler.find((o) => o.trim() && !o.includes(MUSTERI) && !/seçin|müşterisiz/i.test(o));
  kontrol("düzeltmede başka müşteri seçeneği var", Boolean(baskaMusteri), (baskaMusteri ?? "").trim());
  if (baskaMusteri) {
    await musteriSecici.selectOption({ label: baskaMusteri });
    await sayfa.click('button:has-text("Değişiklikleri Kaydet")');
    await sayfa.waitForTimeout(2500);

    await sayfa.goto(`${hedef}${kartYolu}`, { waitUntil: "networkidle" });
    const kalan = await sayfa.locator('[data-test="satis-kalemi"]').count();
    kontrol("düzeltilen cihaz eski karttan çıktı", kalan === 2, `${kalan} kalem`);
    const kalanMetin = (await sayfa.locator('[data-test="satis-kalemleri"]').textContent()) ?? "";
    kontrol(
      "eski kart düzeltilen cihazı listelemiyor",
      !kalanMetin.includes(imei(1)),
      kalanMetin.replace(/\s+/g, " ").slice(0, 100),
    );

    // Kopan cihaz kartsız kalmamalı: kendi kartı açılmış olmalı.
    await sayfa.goto(`${hedef}${cihazYolu}`, { waitUntil: "networkidle" });
    const yeniBag = sayfa.locator('[data-test="satis-karti-baglantisi"]').first();
    kontrol("kopan cihaz kendi kartını aldı", (await yeniBag.count()) === 1);
    const yeniKartYolu = await yeniBag.getAttribute("href");
    kontrol("yeni kart eski karttan farklı", yeniKartYolu !== kartYolu, `${yeniKartYolu}`);
    if (yeniKartYolu) {
      await sayfa.goto(`${hedef}${yeniKartYolu}`, { waitUntil: "networkidle" });
      const yeniKartMetin = (await sayfa.locator("main").textContent()) ?? "";
      kontrol(
        "yeni kart düzeltilen müşteriyi gösteriyor",
        yeniKartMetin.includes(baskaMusteri.split("·")[0].trim()),
        yeniKartMetin.replace(/\s+/g, " ").slice(0, 80),
      );
      kontrol(
        "yeni kartta yalnız o cihaz var",
        (await sayfa.locator('[data-test="satis-kalemi"]').count()) === 1,
      );
    }
  }

  // ============== 6) Satış geri alınınca cihaz karttan düşüyor
  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(2)}`, { waitUntil: "networkidle" });
  if (!/\/cihazlar\/\d+$/.test(sayfa.url())) {
    await sayfa.locator('table tbody tr a[href^="/cihazlar/"]').first().click();
    await sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 20000 });
  }
  await sayfa.locator('[data-test="satis-duzenle-ac"]').click();
  await sayfa.waitForTimeout(400);
  await sayfa.locator('[data-test="satis-geri-al"]').click();
  await sayfa.waitForTimeout(300);
  await sayfa.click('button:has-text("Evet, satışı geri al")');
  await sayfa.waitForTimeout(2500);
  await sayfa.goto(`${hedef}${kartYolu}`, { waitUntil: "networkidle" });
  const geriKalan = await sayfa.locator('[data-test="satis-kalemi"]').count();
  kontrol("geri alınan cihaz karttan düştü", geriKalan === 1, `${geriKalan} kalem`);
  const geriMetin = (await sayfa.locator('[data-test="satis-kalemleri"]').textContent()) ?? "";
  kontrol("karttaki tek cihaz üçüncüsü", geriMetin.includes(imei(3)) && !geriMetin.includes(imei(2)));

  // ===== 7) CANLIDAKİ HATA: silinen karttan sonra numara çakışıyordu
  //
  // Satış numarası o gün kaç satış kaydı olduğundan türetiliyordu. Satış
  // geri alınınca boşalan kart siliniyor, sayı geri düşüyor ve bir sonraki
  // satış var olan bir numarayı istiyordu:
  //   "Unique constraint failed on the fields: (satisNo)"
  // Kullanıcı bu yığın mesajını satış ekranında gördü ve satışı kaydedemedi.
  //
  // Burada aynı durum kuruluyor: tek cihazlık bir satış geri alınıp kartı
  // siliniyor, sonra yeni bir satış yapılıyor.
  const oncekiNolar = async () => {
    await sayfa.goto(`${hedef}/panel?cikisDonem=gun`, { waitUntil: "networkidle" });
    return (await sayfa.locator("main").textContent()) ?? "";
  };
  await oncekiNolar();

  // Tek cihazlık satışı (imei 4) geri al: kartı boşalınca siliniyor.
  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(4)}`, { waitUntil: "networkidle" });
  if (!/\/cihazlar\/\d+$/.test(sayfa.url())) {
    await sayfa.locator('table tbody tr a[href^="/cihazlar/"]').first().click();
    await sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 20000 });
  }
  await sayfa.locator('[data-test="satis-duzenle-ac"]').click();
  await sayfa.waitForTimeout(400);
  await sayfa.locator('[data-test="satis-geri-al"]').click();
  await sayfa.waitForTimeout(300);
  await sayfa.click('button:has-text("Evet, satışı geri al")');
  await sayfa.waitForTimeout(2500);
  kontrol(
    "hazırlık: tek cihazlık satış geri alındı",
    /Stokta/.test((await sayfa.locator("main").textContent()) ?? ""),
  );

  // Silinen kartın ardından yeni satış: numara çakışmamalı.
  // Kaydedilemezse betiği zaman aşımıyla çökertmek yerine ekrandaki hatayı
  // kontrol metnine yazıyoruz — hata canlıda böyle görünmüştü.
  let yeniKartYolu2 = "";
  let kayitHatasi = "";
  try {
    yeniKartYolu2 = await sat([imei(2)], MUSTERI, "8.000,00");
  } catch {
    kayitHatasi = ((await sayfa.locator("main").textContent()) ?? "")
      .replace(/\s+/g, " ")
      .slice(0, 140);
  }
  kontrol(
    "silinen karttan sonra satış kaydedilebiliyor",
    /^\/satislar\/\d+$/.test(yeniKartYolu2),
    kayitHatasi || yeniKartYolu2,
  );
  if (!yeniKartYolu2) throw new Error(`satış kaydedilemedi: ${kayitHatasi}`);
  const yeniKartMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "ekranda ham veritabanı hatası yok",
    !/Unique constraint|prisma\.|invocation/i.test(yeniKartMetni),
    yeniKartMetni.replace(/\s+/g, " ").slice(0, 100),
  );
  const yeniNo = ((await sayfa.locator("h1").first().textContent()) ?? "").trim();
  kontrol("yeni satış kendi numarasını aldı", /^SAT-\d{8}-\d{3}$/.test(yeniNo), yeniNo);

  // Numaralar gerçekten tekil mi? Günün bütün kartlarını gezip bakıyoruz.
  const gununNolari = [];
  for (let id = 1; id <= 12; id += 1) {
    const yanit = await sayfa.goto(`${hedef}/satislar/${id}`, { waitUntil: "domcontentloaded" });
    if ((yanit?.status() ?? 404) !== 200) continue;
    const no = ((await sayfa.locator("h1").first().textContent()) ?? "").trim();
    if (/^SAT-/.test(no)) gununNolari.push(no);
  }
  kontrol(
    "bütün satış numaraları tekil",
    new Set(gununNolari).size === gununNolari.length,
    gununNolari.join(", "),
  );
  kontrol(
    "silinen numaranın yerine yenisi veriliyor",
    gununNolari.includes(yeniNo) && gununNolari.length >= 4,
    `${gununNolari.length} kart`,
  );

  // ============== 8) Satış raporu etkilenmedi (kart rapora dokunmamalı)
  await sayfa.goto(`${hedef}/rapor`, { waitUntil: "networkidle" });
  const rapor = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("rapor sayfası açılıyor", rapor.length > 200, `${rapor.length} karakter`);

  // Konsol hatası ayrı bir kontrol olarak sayılıyor: özet satırının altında
  // kaybolmasın.
  kontrol(
    "tarayıcı konsolunda hata yok",
    konsolHatalari.length === 0,
    konsolHatalari.slice(0, 2).join(" | "),
  );

  await sayfa.screenshot({ path: `${cikti}-son.png`, fullPage: true });
} catch (hata) {
  kontrol("betik tamamlandı", false, String(hata).slice(0, 300));
  await sayfa.screenshot({ path: `${cikti}-hata.png`, fullPage: true }).catch(() => {});
} finally {
  await tarayici.close();
}

if (konsolHatalari.length > 0) {
  console.log("\nTarayıcı konsol hataları:");
  for (const h of konsolHatalari.slice(0, 10)) console.log(`  ${h}`);
}

const basarisiz = sonuclar.filter((s) => !s.gecti);
console.log(`\n${sonuclar.length - basarisiz.length}/${sonuclar.length} kontrol geçti.`);
process.exit(basarisiz.length === 0 && konsolHatalari.length === 0 ? 0 : 1);
