// Mağaza bazlı görünürlük testi: personel yalnız kendi mağazasının stoğunu,
// hareketlerini, satışlarını ve faturalarını görür.
//
// Bu bir güvenlik testi, o yüzden "ekranda görünmüyor" yetmiyor. Her yüzey
// ayrı ayrı sayılıyor: liste adedi, toplam stok değeri, panel kartları, rapor
// tabloları, cihaz detayının kimlikle açılması, Excel dosyasının içeriği ve
// arama kutusuna başka mağazanın IMEI'sinin yazılması. Bir tanesi bile açık
// kalırsa sızıntı var.
//
// Aynı veriyle yönetici de kontrol ediliyor: kısıtın "her yerde kapalı"
// olmadığını, yalnız yetkisiz kullanıcıda kapandığını görmek için.
import { chromium } from "@playwright/test";
import ExcelJS from "exceljs";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/gorunurluk";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);

// M1'e giren cihazlar personel1'e görünür, M2'ye girenler görünmez olmalı.
const M1_IMEI = imei(1);
const M2_IMEI = imei(2);
const M2_SATILAN = imei(3);
const M1_MARKA = `GORM1${damga}`;
const M2_MARKA = `GORM2${damga}`;
const MUSTERI = `Görünürlük Müşterisi ${damga}`;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1700, height: 1200 }, locale: "tr-TR" });
const hatalar = [];
sayfa.on("console", (m) => {
  // Test bilerek 404 sayfalarına gidiyor (görünmeyen cihaz/fatura); tarayıcının
  // bu beklenen 404'leri konsola yazması hata sayılmaz.
  if (m.type() === "error" && !/status of 404/.test(m.text())) hatalar.push(m.text());
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

/** Tek markalı, tek mağazalı alış faturası girer ve fatura kimliğini döner. */
async function faturaGir({ faturaNo, marka, model, fiyat, imeiler, magaza }) {
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `GOR${damga}${marka.slice(-3)}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1200);

  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(marka);
  await alanlar.nth(2).fill(model);
  await kart.locator('input[inputmode="decimal"]').fill(fiyat);

  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const no of imeiler) {
    await imeiKutusu.fill(no);
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(400);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", faturaNo);
  await sayfa.selectOption("#magazaId", { label: magaza });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
  return Number(sayfa.url().match(/\/faturalar\/(\d+)$/)[1]);
}

/** Cihaz listesindeki adet — başlıktaki "N cihaz". */
async function cihazSayisi() {
  const metin = (await sayfa.locator("text=/^\\d+ cihaz/").first().textContent()) ?? "";
  return Number((metin.match(/(\d+)/) ?? [0, "0"])[1]);
}

/** Cihaz listesinde markaya göre arayıp bulunan adedi döner. */
async function markayaGoreAdet(marka) {
  await sayfa.goto(`${hedef}/cihazlar?ara=${encodeURIComponent(marka)}`, {
    waitUntil: "networkidle",
  });
  // Marka araması tam kod eşleşmesi olmadığı için listede kalınmalı.
  if (!sayfa.url().includes("/cihazlar?")) return -1;
  return cihazSayisi();
}

/** Bir cihazın kimliğini IMEI'sinden bulur (yönetici oturumunda çağrılmalı). */
async function cihazIdBul(seriNo) {
  await sayfa.goto(`${hedef}/cihazlar?ara=${seriNo}`, { waitUntil: "networkidle" });
  const eslesme = sayfa.url().match(/\/cihazlar\/(\d+)$/);
  return eslesme ? Number(eslesme[1]) : null;
}

/**
 * Excel dosyasını indirip bütün hücrelerini tek metne çevirir.
 *
 * Dosyayı metin olarak aramak işe yaramaz: .xlsx sıkıştırılmış bir zip, içinde
 * IMEI düz metin olarak geçmez — öyle bir kontrol sızıntı varken de geçerdi.
 */
async function excelHucreleri(yol) {
  const cerezler = await sayfa.context().cookies();
  const cerezBasligi = cerezler.map((c) => `${c.name}=${c.value}`).join("; ");
  const yanit = await fetch(`${hedef}${yol}`, { headers: { cookie: cerezBasligi } });
  if (!yanit.ok) return { durum: yanit.status, hucreler: "" };

  const kitap = new ExcelJS.Workbook();
  await kitap.xlsx.load(Buffer.from(await yanit.arrayBuffer()));
  const parcalar = [];
  kitap.eachSheet((sayfaNesnesi) => {
    parcalar.push(sayfaNesnesi.name);
    sayfaNesnesi.eachRow((satir) => {
      satir.eachCell({ includeEmpty: false }, (hucre) => {
        parcalar.push(String(hucre.text ?? ""));
      });
    });
  });
  return { durum: yanit.status, hucreler: parcalar.join(" | ") };
}

/** "Toplam alış değeri: 10.000,00 TL" → 1000000 (kuruş). */
function kurusaCevir(metin) {
  const eslesme = metin.match(/([\d.]+,\d{2})/);
  if (!eslesme) return null;
  return Math.round(Number(eslesme[1].replace(/\./g, "").replace(",", ".")) * 100);
}

/** Cihaz listesindeki "Toplam alış değeri" rakamı, kuruş olarak. */
async function toplamAlisDegeri() {
  const metin = (await sayfa.locator("text=/Toplam alış değeri/").first().textContent()) ?? "";
  return kurusaCevir(metin);
}

try {
  // ================================================== 0) Hazırlık (yönetici)
  await giris("admin");

  const m1Fatura = await faturaGir({
    faturaNo: `GOR-M1-${damga}`,
    marka: M1_MARKA,
    model: "FON M1",
    fiyat: "10.000,00",
    imeiler: [M1_IMEI],
    magaza: "1 Nolu Mağaza",
  });
  const m2Fatura = await faturaGir({
    faturaNo: `GOR-M2-${damga}`,
    marka: M2_MARKA,
    model: "FON M2",
    fiyat: "25.000,00",
    imeiler: [M2_IMEI, M2_SATILAN],
    magaza: "2 Nolu Mağaza",
  });
  kontrol("hazırlık: iki mağazaya fatura girildi", m1Fatura > 0 && m2Fatura > 0);

  // M2'de bir satış yapılıyor: personel1 bunu hiçbir dökümde görmemeli.
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutmaKutusu", M2_SATILAN);
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1500);
  await sayfa.locator('[data-test="sepet-fiyat"]').first().fill("31.000,00");
  await sayfa.fill("#yeniAd", MUSTERI);
  await Promise.all([
    sayfa.waitForURL(/\/(cihazlar\/\d+|musteriler)/, { timeout: 30000 }),
    sayfa.click('button:has-text("Satışı Kaydet")'),
  ]);
  kontrol("hazırlık: M2'de satış yapıldı", !sayfa.url().includes("/satis"), sayfa.url());

  const m1CihazId = await cihazIdBul(M1_IMEI);
  const m2CihazId = await cihazIdBul(M2_IMEI);
  kontrol(
    "hazırlık: cihaz kimlikleri bulundu",
    Boolean(m1CihazId && m2CihazId),
    `M1 #${m1CihazId} · M2 #${m2CihazId}`,
  );

  // ----------------------------------- yöneticinin gördüğü referans değerler
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  const yoneticiToplamCihaz = await cihazSayisi();
  const yoneticiToplamDeger = await toplamAlisDegeri();
  const yoneticiExcel = await excelHucreleri("/cihazlar/excel");
  const yoneticiM1Adet = await markayaGoreAdet(M1_MARKA);
  const yoneticiM2Adet = await markayaGoreAdet(M2_MARKA);
  kontrol(
    "yönetici iki mağazanın cihazlarını da görüyor",
    yoneticiM1Adet === 1 && yoneticiM2Adet === 2,
    `M1 ${yoneticiM1Adet}, M2 ${yoneticiM2Adet}`,
  );
  // Excel okuyucusunun gerçekten hücreleri gördüğünü kanıtla: yöneticinin
  // dosyasında iki IMEI de olmalı. Olmazsa aşağıdaki "yok" kontrolü boş laf.
  kontrol(
    "yönetici Excel'inde iki mağazanın IMEI'si de var",
    yoneticiExcel.hucreler.includes(M1_IMEI) && yoneticiExcel.hucreler.includes(M2_IMEI),
    `HTTP ${yoneticiExcel.durum} · ${yoneticiExcel.hucreler.length} karakter`,
  );

  await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  const yoneticiPanel = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "yönetici panelinde her iki mağaza kartı var",
    yoneticiPanel.includes("1 Nolu Mağaza") && yoneticiPanel.includes("2 Nolu Mağaza"),
  );

  // =============================================== 1) Cihaz listesi kısıtlı
  await giris("personel1");

  const p1M1Adet = await markayaGoreAdet(M1_MARKA);
  kontrol("personel kendi mağazasının cihazını görüyor", p1M1Adet === 1, `${p1M1Adet} cihaz`);

  const p1M2Adet = await markayaGoreAdet(M2_MARKA);
  kontrol("personel başka mağazanın cihazını görmüyor", p1M2Adet === 0, `${p1M2Adet} cihaz`);

  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  const p1ToplamCihaz = await cihazSayisi();
  kontrol(
    "personelin toplam cihaz adedi yöneticiden az",
    p1ToplamCihaz < yoneticiToplamCihaz && p1ToplamCihaz > 0,
    `personel ${p1ToplamCihaz} · yönetici ${yoneticiToplamCihaz}`,
  );

  // Liste kısıtlanıp özet kısıtlanmazsa, görünmeyen stok toplamda sızar.
  // "Şu metni içermesin" demek yetmez; rakam yöneticininkinden küçük olmalı.
  const p1ToplamDeger = await toplamAlisDegeri();
  kontrol(
    "toplam alış değeri yöneticininkinden küçük",
    p1ToplamDeger !== null &&
      yoneticiToplamDeger !== null &&
      p1ToplamDeger < yoneticiToplamDeger,
    `personel ${p1ToplamDeger} kr · yönetici ${yoneticiToplamDeger} kr`,
  );

  // --------------------------------------- 2) Mağaza filtresi açılırı kısıtlı
  const magazaCipleri = await sayfa.locator('[data-test="cip-magaza"]').allTextContents();
  kontrol(
    "filtre çubuğunda yalnız kendi mağazası listeli",
    magazaCipleri.length > 0 &&
      magazaCipleri.some((s) => s.includes("1 Nolu")) &&
      !magazaCipleri.some((s) => s.includes("2 Nolu")) &&
      !magazaCipleri.some((s) => s.includes("3 Nolu")),
    magazaCipleri.join(" | "),
  );

  // URL'ye elle başka mağaza yazmak da boş liste döndürmeli.
  await sayfa.goto(`${hedef}/cihazlar?magaza=2`, { waitUntil: "networkidle" });
  const elleMagaza = await cihazSayisi();
  kontrol("URL'ye elle ?magaza=2 yazmak veri getirmiyor", elleMagaza === 0, `${elleMagaza} cihaz`);

  // ------------------------------------------ 3) Arama kutusu kod sızdırmıyor
  await sayfa.goto(`${hedef}/cihazlar?ara=${M2_IMEI}`, { waitUntil: "networkidle" });
  kontrol(
    "başka mağazanın IMEI'si aramada cihaz detayına atlamıyor",
    !/\/cihazlar\/\d+$/.test(sayfa.url()),
    sayfa.url(),
  );
  const aramaMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("arama sonucunda M2 markası geçmiyor", !aramaMetni.includes(M2_MARKA));

  // ------------------------------- 4) Cihaz detayı kimlikle de açılmıyor
  const detayYanit = await sayfa.goto(`${hedef}/cihazlar/${m2CihazId}`, {
    waitUntil: "networkidle",
  });
  const detayMetni = (await sayfa.locator("body").textContent()) ?? "";
  kontrol(
    "başka mağazanın cihaz detayı 404",
    detayYanit?.status() === 404 || /bulunamadı|not found/i.test(detayMetni),
    `HTTP ${detayYanit?.status()}`,
  );

  const kendiDetay = await sayfa.goto(`${hedef}/cihazlar/${m1CihazId}`, {
    waitUntil: "networkidle",
  });
  kontrol(
    "kendi mağazasının cihaz detayı açılıyor",
    kendiDetay?.status() === 200 &&
      ((await sayfa.locator("main").textContent()) ?? "").includes(M1_MARKA),
    `HTTP ${kendiDetay?.status()}`,
  );

  // ----------------------------------------------- 5) Panel kısıtlı
  await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  const panelMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("panelde kendi mağaza kartı var", panelMetni.includes("1 Nolu Mağaza"));
  kontrol("panelde başka mağaza kartı yok", !panelMetni.includes("2 Nolu Mağaza"));
  kontrol("panelde M2 satışının müşterisi görünmüyor", !panelMetni.includes(MUSTERI));
  kontrol(
    "panel satış dökümünde M2'nin 31.000'lik satışı yok",
    !panelMetni.includes("31.000,00"),
  );

  // Son hareketler de kısıtlı: M2'ye giriş hareketi burada görünmemeli.
  kontrol("son hareketlerde M2 cihazı yok", !panelMetni.includes(M2_MARKA));

  // ------------------------------------------------- 6) Raporlar kısıtlı
  await sayfa.goto(`${hedef}/rapor`, { waitUntil: "networkidle" });
  const raporMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("raporda kendi mağazası var", raporMetni.includes("1 Nolu Mağaza"));
  kontrol("raporda başka mağaza satırı yok", !raporMetni.includes("2 Nolu Mağaza"));
  kontrol("raporda M2 faturası görünmüyor", !raporMetni.includes(`GOR-M2-${damga}`));

  // -------------------------------------------- 7) Faturalar kısıtlı
  await sayfa.goto(`${hedef}/faturalar`, { waitUntil: "networkidle" });
  const faturaListesi = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("fatura listesinde kendi mağazasının faturası var", faturaListesi.includes(`GOR-M1-${damga}`));
  kontrol(
    "fatura listesinde başka mağazanın faturası yok",
    !faturaListesi.includes(`GOR-M2-${damga}`),
  );

  const faturaDetay = await sayfa.goto(`${hedef}/faturalar/${m2Fatura}`, {
    waitUntil: "networkidle",
  });
  kontrol(
    "başka mağazanın fatura detayı 404",
    faturaDetay?.status() === 404 ||
      /bulunamadı|not found/i.test((await sayfa.locator("body").textContent()) ?? ""),
    `HTTP ${faturaDetay?.status()}`,
  );

  // ------------------------------------------------- 8) Müşteri geçmişi
  await sayfa.goto(`${hedef}/musteriler?ara=${encodeURIComponent(MUSTERI)}`, {
    waitUntil: "networkidle",
  });
  const musteriMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "müşteri kaydı görünüyor ama satın aldığı M2 cihazı görünmüyor",
    !musteriMetni.includes(M2_MARKA) && !musteriMetni.includes("31.000,00"),
    musteriMetni.includes(MUSTERI) ? "müşteri listede" : "müşteri listede değil",
  );

  // ------------------------------------------- 9) Excel dosyaları kısıtlı
  const cihazExcel = await excelHucreleri("/cihazlar/excel");
  kontrol(
    "cihaz Excel'inde kendi mağazasının IMEI'si var",
    cihazExcel.durum === 200 && cihazExcel.hucreler.includes(M1_IMEI),
    `HTTP ${cihazExcel.durum}`,
  );
  kontrol(
    "cihaz Excel'i başka mağazanın IMEI'sini içermiyor",
    cihazExcel.durum === 200 && !cihazExcel.hucreler.includes(M2_IMEI),
    `HTTP ${cihazExcel.durum}`,
  );
  const raporExcel = await excelHucreleri("/rapor/excel");
  kontrol(
    "rapor Excel'inde kendi mağazası var",
    raporExcel.durum === 200 && raporExcel.hucreler.includes("1 Nolu Mağaza"),
    `HTTP ${raporExcel.durum}`,
  );
  kontrol(
    "rapor Excel'i başka mağazayı içermiyor",
    raporExcel.durum === 200 && !raporExcel.hucreler.includes("2 Nolu Mağaza"),
    `HTTP ${raporExcel.durum}`,
  );

  // ------------------------------------------------- 10) Sayım ekranı
  await sayfa.goto(`${hedef}/sayim`, { waitUntil: "networkidle" });
  const sayimMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("sayım ekranında başka mağaza yok", !sayimMetni.includes("2 Nolu Mağaza"));

  await sayfa.screenshot({ path: `${cikti}-personel.png`, fullPage: true });

  // =============== 11) Ek yetki verilince o mağaza da görünür hale geliyor
  // Kısıtın "kapalı kaldığı" değil, yetkiye göre açıldığı da görülmeli.
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
  const kartM2 = sayfa
    .locator("div.rounded-xl.border.bg-white")
    .filter({ has: sayfa.locator("span", { hasText: /^M2$/ }) })
    .first();
  const yetkiFormu = kartM2.locator("form").filter({ hasText: "Yetkileri Kaydet" }).first();
  const kutu = yetkiFormu.locator('label:has-text("1 Nolu Mağaza Personeli") input[name="yetkililer"]');
  await kutu.check();
  await yetkiFormu.getByRole("button", { name: "Yetkileri Kaydet" }).click();
  await sayfa.waitForTimeout(1500);

  await giris("personel1");
  const yetkiliM2Adet = await markayaGoreAdet(M2_MARKA);
  kontrol(
    "ek yetki verilince M2 cihazları görünür oldu",
    yetkiliM2Adet === 2,
    `${yetkiliM2Adet} cihaz`,
  );
  await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  const yetkiliPanel = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "ek yetkiden sonra panelde M2 kartı da var",
    yetkiliPanel.includes("1 Nolu Mağaza") && yetkiliPanel.includes("2 Nolu Mağaza"),
  );

  // Düzeni geri al: yetki kaldırılsın, sonraki koşular temiz başlasın.
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
  const kartM2b = sayfa
    .locator("div.rounded-xl.border.bg-white")
    .filter({ has: sayfa.locator("span", { hasText: /^M2$/ }) })
    .first();
  const yetkiFormu2 = kartM2b.locator("form").filter({ hasText: "Yetkileri Kaydet" }).first();
  await yetkiFormu2
    .locator('label:has-text("1 Nolu Mağaza Personeli") input[name="yetkililer"]')
    .uncheck();
  await yetkiFormu2.getByRole("button", { name: "Yetkileri Kaydet" }).click();
  await sayfa.waitForTimeout(1500);

  await giris("personel1");
  const geriAlindi = await markayaGoreAdet(M2_MARKA);
  kontrol("yetki kaldırılınca M2 yeniden görünmez oldu", geriAlindi === 0, `${geriAlindi} cihaz`);

  kontrol("tarayıcı konsolunda hata yok", hatalar.length === 0, hatalar.slice(0, 3).join(" | "));
} finally {
  await tarayici.close();
}

const gecen = sonuclar.filter((s) => s.gecti).length;
console.log(`\n${gecen}/${sonuclar.length} kontrol geçti`);
if (gecen !== sonuclar.length) process.exit(1);
