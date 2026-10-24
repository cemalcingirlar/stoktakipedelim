// Saat diliminin Ayarlar'dan seçilebilmesi testi.
//
// Gün/hafta/ay hesapları sürecin yerel saatine göre yapılıyor: dilim
// yanlışsa gece yapılan satışlar bir önceki güne yazılıyor, fatura formunun
// varsayılan tarihi dünü gösteriyor. Dilim eskiden yalnız sunucuda komut
// satırından ayarlanabiliyordu; yönetici ne olduğunu göremiyordu bile.
//
// Test "select var mı" ile yetinmiyor. Asıl soru şu: seçim gerçekten çalışan
// sürecin dilimini değiştiriyor mu? Bu yüzden ekranda yazan yerel saat,
// testin kendi hesapladığı o dilimdeki saatle karşılaştırılıyor — dilim
// kaydedilip de uygulanmazsa test düşer. Geçersiz dilimin reddi, log kaydı
// ve personelin erişemediği de ayrıca sayılıyor.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/saat-dilimi";
const SIFRE = "Stok2026!";

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
  await Promise.all([sayfa.waitForURL("**/panel"), sayfa.click('button[type="submit"]')]);
}

/** Verilen dilimde şu anın saat:dakikası — ekranda yazanla karşılaştırmak için. */
function dilimdeSaat(dilim, an = new Date()) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: dilim,
    hour: "2-digit",
    minute: "2-digit",
  }).format(an);
}

/** Dakika sınırına denk gelirse 1 dakika sapma kabul edilir. */
function saatYakinMi(ekran, dilim) {
  const an = Date.now();
  return [an - 60_000, an, an + 60_000].some(
    (t) => dilimdeSaat(dilim, new Date(t)) === ekran,
  );
}

async function dilimSec(dilim) {
  await sayfa.goto(`${hedef}/ayarlar`, { waitUntil: "networkidle" });
  await sayfa.selectOption('[data-test="saat-dilimi-secimi"]', dilim);
  await sayfa
    .locator('form:has([data-test="saat-dilimi-secimi"]) button[type="submit"]')
    .click();
  await sayfa.waitForTimeout(2000);
}

/** Ayarlar'daki "yerel saat HH:MM" bilgisini okur. */
async function ekrandakiSaat() {
  const metin =
    (await sayfa
      .locator('form:has([data-test="saat-dilimi-secimi"]) p')
      .first()
      .textContent()) ?? "";
  return (metin.match(/(\d{2}:\d{2})/) ?? [])[1] ?? "";
}

try {
  // ======================================= 1) Personel ayarlara giremez
  await giris("personel1");
  await sayfa.goto(`${hedef}/ayarlar`, { waitUntil: "networkidle" });
  kontrol("personel ayarlar ekranına giremiyor", !sayfa.url().includes("/ayarlar"), sayfa.url());

  // ======================================= 2) Varsayılan: Türkiye
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar`, { waitUntil: "networkidle" });
  const secim = sayfa.locator('[data-test="saat-dilimi-secimi"]');
  kontrol("ayarlarda saat dilimi seçimi var", (await secim.count()) === 1);
  kontrol(
    "ayar yapılmamışken Türkiye seçili",
    (await secim.inputValue()) === "Europe/Istanbul",
    await secim.inputValue(),
  );
  const secenekler = await secim.locator("option").allTextContents();
  kontrol("listede birden çok dilim var", secenekler.length >= 5, `${secenekler.length} seçenek`);

  const bilgi = sayfa.locator('[data-test="saat-dilimi-bilgisi"]');
  kontrol(
    "üstteki bilgi satırı çalışan dilimi yazıyor",
    ((await bilgi.textContent()) ?? "").includes("Europe/Istanbul"),
    ((await bilgi.textContent()) ?? "").trim(),
  );
  kontrol(
    "dilim doğruyken uyarı bandı yok",
    (await sayfa.locator('[data-test="saat-dilimi-uyarisi"]').count()) === 0,
  );
  const ilkSaat = await ekrandakiSaat();
  kontrol(
    "ekranda yazan yerel saat Türkiye saati",
    saatYakinMi(ilkSaat, "Europe/Istanbul"),
    `ekran ${ilkSaat} · beklenen ${dilimdeSaat("Europe/Istanbul")}`,
  );

  // ===================== 3) Dilim değiştirince süreç gerçekten değişiyor
  await dilimSec("UTC");
  kontrol(
    "kaydetme başarı mesajı veriyor",
    ((await sayfa.locator("body").textContent()) ?? "").includes("UTC"),
  );
  await sayfa.goto(`${hedef}/ayarlar`, { waitUntil: "networkidle" });
  kontrol(
    "seçim kalıcı: sayfa yenilenince UTC duruyor",
    (await secim.inputValue()) === "UTC",
    await secim.inputValue(),
  );
  const utcSaat = await ekrandakiSaat();
  kontrol(
    "çalışan süreç UTC saatine geçti",
    saatYakinMi(utcSaat, "UTC"),
    `ekran ${utcSaat} · UTC ${dilimdeSaat("UTC")} · Türkiye ${dilimdeSaat("Europe/Istanbul")}`,
  );
  kontrol(
    "dilim uygulandığı için uyarı bandı yine yok",
    (await sayfa.locator('[data-test="saat-dilimi-uyarisi"]').count()) === 0,
  );
  kontrol(
    "üstteki bilgi satırı da UTC yazıyor",
    ((await bilgi.textContent()) ?? "").includes("UTC"),
    ((await bilgi.textContent()) ?? "").trim(),
  );

  // Tarih yazımı da dilimi izlemeli: loglardaki saatler UTC'ye kaymalı.
  await sayfa.goto(`${hedef}/ayarlar/loglar`, { waitUntil: "networkidle" });
  const logMetni = (await sayfa.locator("body").textContent()) ?? "";
  kontrol("log kaydı saat dilimi değişikliğini yazdı", logMetni.includes("Saat dilimi: UTC"));

  // ================================= 4) Geçersiz dilim reddedilmeli
  await sayfa.goto(`${hedef}/ayarlar`, { waitUntil: "networkidle" });
  await secim.evaluate((el) => {
    const yeni = document.createElement("option");
    yeni.value = "Mars/Olympus";
    yeni.textContent = "Mars";
    el.appendChild(yeni);
    el.value = "Mars/Olympus";
  });
  await sayfa
    .locator('form:has([data-test="saat-dilimi-secimi"]) button[type="submit"]')
    .click();
  await sayfa.waitForTimeout(2000);
  const hataMetni = (await sayfa.locator("body").textContent()) ?? "";
  kontrol(
    "geçersiz dilim reddedildi",
    hataMetni.includes("Geçerli bir saat dilimi seçin"),
    hataMetni.includes("Geçerli bir saat dilimi") ? "" : hataMetni.slice(0, 120),
  );
  await sayfa.goto(`${hedef}/ayarlar`, { waitUntil: "networkidle" });
  kontrol(
    "geçersiz denemeden sonra ayar bozulmadı",
    (await secim.inputValue()) === "UTC",
    await secim.inputValue(),
  );

  // ================================= 5) Türkiye'ye geri dönülebiliyor
  await dilimSec("Europe/Istanbul");
  await sayfa.goto(`${hedef}/ayarlar`, { waitUntil: "networkidle" });
  kontrol(
    "dilim Türkiye'ye geri alındı",
    (await secim.inputValue()) === "Europe/Istanbul",
    await secim.inputValue(),
  );
  const sonSaat = await ekrandakiSaat();
  kontrol(
    "süreç Türkiye saatine geri döndü",
    saatYakinMi(sonSaat, "Europe/Istanbul"),
    `ekran ${sonSaat} · beklenen ${dilimdeSaat("Europe/Istanbul")}`,
  );

  await sayfa.screenshot({ path: `${cikti}-ayarlar.png`, fullPage: true });
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
