// Birden çok mağazayı aynı anda sayma testi.
//
// Aynı dükkânda duran kasa ve depo kayıtları fiziken iç içe: raftaki cihazın
// hangi kayıtta olduğu sayım anında bilinmiyor. Ayrı sayıldığında her sayım
// diğerinin cihazlarını "fazla" gösteriyordu — sonuç gerçeği değil kayıt
// bölünmesini raporluyordu.
//
// Asıl ölçüm bu: iki mağaza birlikte sayıldığında ikisinin de cihazı BULUNDU
// olmalı, hiçbiri fazlaya düşmemeli. Tek mağaza sayıldığında ise diğerinin
// cihazı hâlâ fazla sayılmalı — kapsam gerçekten iş görüyor mu, yoksa her şey
// mi kabul ediliyor, bunu ayırt ediyoruz.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/sayim-cok-magaza";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);

const M1_IMEI = imei(1); // 1 Nolu Mağaza
const M2_IMEI = imei(2); // 2 Nolu Mağaza
const M3_IMEI = imei(3); // 3 Nolu Mağaza — kapsam dışı kalacak

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

/** Tek cihazlık fatura girer. */
async function cihazGir(seri, magaza, ek) {
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `SCM${damga}${ek}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1300);

  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ label: "Sıfır" });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(`SAYIMMARKA${damga}`);
  await alanlar.nth(2).fill(`MODEL ${ek}`);
  await kart.locator('input[inputmode="decimal"]').fill("10.000,00");

  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  await imeiKutusu.fill(seri);
  await imeiKutusu.press("Enter");
  await sayfa.waitForTimeout(500);

  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `SCM-${ek}-${damga}`);
  await sayfa.selectOption("#magazaId", { label: magaza });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
}

/** Sayım ekranında verilen mağazaları işaretleyip sayımı başlatır. */
async function sayimBaslat(magazaAdlari) {
  await sayfa.goto(`${hedef}/sayim`, { waitUntil: "networkidle" });
  const kutular = sayfa.locator('[data-test="sayim-magaza-secimi"]');
  const adet = await kutular.count();
  for (let i = 0; i < adet; i += 1) {
    const etiket = kutular.nth(i);
    const metin = (await etiket.textContent()) ?? "";
    const kutu = etiket.locator('input[type="checkbox"]');
    const olmali = magazaAdlari.some((ad) => metin.includes(ad));
    if (await kutu.isDisabled()) continue;
    if (olmali !== (await kutu.isChecked())) {
      await kutu.setChecked(olmali);
      await sayfa.waitForTimeout(150);
    }
  }
  await Promise.all([
    sayfa.waitForURL(/\/sayim\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Sayımı Başlat")'),
  ]);
  return sayfa.url();
}

/** Sayım ekranında kod okutur; dönen bildirimi verir. */
async function okut(kod) {
  await sayfa.fill("#okutmaKutusu", kod);
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1400);
  return ((await sayfa.locator('[role="status"]').first().textContent()) ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Üstteki sayaçlar: Toplam / Okutulan / Okutulmayan / Fazla. */
async function sayaclar() {
  const metin = ((await sayfa.locator("div.grid").first().textContent()) ?? "").replace(/\s+/g, " ");
  const oku = (ad) => Number((metin.match(new RegExp(`${ad}\\s*(\\d+)`)) ?? [0, "-1"])[1]);
  return {
    toplam: oku("Toplam"),
    okutulan: oku("Okutulan"),
    okutulmayan: oku("Okutulmayan"),
    fazla: oku("Fazla"),
  };
}

try {
  await giris("admin");

  // ================================================== 0) Hazırlık
  await cihazGir(M1_IMEI, "1 Nolu Mağaza", "A");
  await cihazGir(M2_IMEI, "2 Nolu Mağaza", "B");
  await cihazGir(M3_IMEI, "3 Nolu Mağaza", "C");
  kontrol("hazırlık: üç mağazaya birer cihaz girildi", true);

  // ============ 1) Önce TEK mağaza sayımı: diğerinin cihazı fazla olmalı
  // Bu, kapsamın gerçekten iş gördüğünü kanıtlıyor — birlikte sayımda aynı
  // cihazın BULUNDU çıkması tesadüf değil.
  const tekUrl = await sayimBaslat(["1 Nolu Mağaza"]);
  kontrol("tek mağaza sayımı başladı", /\/sayim\/\d+$/.test(tekUrl), tekUrl);

  const tekBaslik = (await sayfa.locator("h1").first().textContent()) ?? "";
  kontrol("başlıkta tek mağaza yazıyor", tekBaslik.includes("1 Nolu Mağaza"), tekBaslik.trim());
  kontrol(
    "tek mağazada kapsam notu çıkmıyor",
    (await sayfa.locator('[data-test="kapsam-notu"]').count()) === 0,
  );

  const tekKendi = await okut(M1_IMEI);
  kontrol("tek sayımda kendi cihazı bulundu", /bulundu/i.test(tekKendi), tekKendi);

  const tekDiger = await okut(M2_IMEI);
  kontrol(
    "tek sayımda diğer mağazanın cihazı FAZLA sayılıyor",
    /deposunda kayıtlı/i.test(tekDiger),
    tekDiger,
  );
  const tekSayac = await sayaclar();
  kontrol("tek sayımda fazla 1", tekSayac.fazla === 1, JSON.stringify(tekSayac));

  // Sayımı iptal et ki mağazalar yeniden sayıma girebilsin.
  await sayfa.locator('button:has-text("Sayımı İptal Et")').first().click();
  await sayfa.waitForTimeout(600);
  await sayfa.locator('button:has-text("Evet, İptal Et")').first().click();
  await sayfa.waitForTimeout(1800);

  // ============ 2) İki mağaza BİRLİKTE: ikisi de bulunmalı
  const cokluUrl = await sayimBaslat(["1 Nolu Mağaza", "2 Nolu Mağaza"]);
  kontrol("çoklu mağaza sayımı başladı", /\/sayim\/\d+$/.test(cokluUrl), cokluUrl);

  const cokluBaslik = (await sayfa.locator("h1").first().textContent()) ?? "";
  kontrol(
    "başlıkta iki mağaza da yazıyor",
    cokluBaslik.includes("1 Nolu Mağaza") && cokluBaslik.includes("2 Nolu Mağaza"),
    cokluBaslik.trim(),
  );
  kontrol(
    "çoklu sayımda kapsam notu çıkıyor",
    (await sayfa.locator('[data-test="kapsam-notu"]').count()) === 1,
  );

  const baslangic = await sayaclar();
  kontrol(
    "iki mağazanın stoğu da beklenenlere girdi",
    baslangic.toplam >= 2,
    JSON.stringify(baslangic),
  );

  const cokluBir = await okut(M1_IMEI);
  kontrol("1. mağazanın cihazı bulundu", /bulundu/i.test(cokluBir), cokluBir);

  const cokluIki = await okut(M2_IMEI);
  kontrol(
    "2. mağazanın cihazı da BULUNDU — fazlaya düşmedi",
    /bulundu/i.test(cokluIki) && !/deposunda kayıtlı/i.test(cokluIki),
    cokluIki,
  );

  const cokluSayac = await sayaclar();
  kontrol("çoklu sayımda fazla yok", cokluSayac.fazla === 0, JSON.stringify(cokluSayac));
  kontrol("iki cihaz da okutuldu", cokluSayac.okutulan >= 2, JSON.stringify(cokluSayac));

  // Kapsam DIŞI mağazanın cihazı hâlâ fazla olmalı.
  const kapsamDisi = await okut(M3_IMEI);
  kontrol(
    "kapsam dışı mağazanın cihazı hâlâ fazla sayılıyor",
    /deposunda kayıtlı/i.test(kapsamDisi),
    kapsamDisi,
  );

  await sayfa.screenshot({ path: `${cikti}-sayim.png`, fullPage: true });

  // ============ 3) Kapsamdaki mağazalar ikinci sayıma giremez
  await sayfa.goto(`${hedef}/sayim`, { waitUntil: "networkidle" });
  const kutular = sayfa.locator('[data-test="sayim-magaza-secimi"]');
  const kilitli = [];
  for (let i = 0; i < (await kutular.count()); i += 1) {
    const etiket = kutular.nth(i);
    if (await etiket.locator('input[type="checkbox"]').isDisabled()) {
      kilitli.push(((await etiket.textContent()) ?? "").replace(/\s+/g, " ").trim());
    }
  }
  kontrol(
    "kapsamdaki iki mağaza da yeni sayıma kapalı",
    kilitli.some((k) => k.includes("1 Nolu")) && kilitli.some((k) => k.includes("2 Nolu")),
    kilitli.join(" | ") || "(hiçbiri kilitli değil)",
  );
  kontrol(
    "kapsam dışı mağaza hâlâ seçilebilir",
    !kilitli.some((k) => k.includes("3 Nolu")),
    kilitli.join(" | "),
  );

  // Listede kapsam iki mağazayı da gösteriyor mu?
  const listeMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "sayım listesinde iki mağaza birlikte yazıyor",
    /1 Nolu Mağaza \+ 2 Nolu Mağaza/.test(listeMetni.replace(/\s+/g, " ")),
  );

  // ============ 4) Kapat ve raporda görün
  await sayfa.goto(cokluUrl, { waitUntil: "networkidle" });
  await sayfa.locator('button:has-text("Sayımı Kapat")').first().click();
  await sayfa.waitForTimeout(2000);
  await sayfa.goto(`${hedef}/rapor`, { waitUntil: "networkidle" });
  const raporMetni = ((await sayfa.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
  kontrol(
    "raporda kapsam iki mağazayla görünüyor",
    /1 Nolu Mağaza \+ 2 Nolu Mağaza/.test(raporMetni),
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
