// Hata, bulunamadı ve yükleniyor ekranlarının testi.
//
// Bunlar yokken beklenmedik bir durumda personel Next.js'in ham İngilizce
// ekranını görüyor, geri dönüş yolu bulamıyordu. Test "sayfa açılıyor" ile
// yetinmiyor: ekranın Türkçe olduğu, çıkış kapısının çalıştığı ve 404'ün
// başka mağazanın verisini sızdırmadığı ayrı ayrı sayılıyor.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/hata-ekranlari";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = `35${damga}000001`.slice(0, 15);

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1400, height: 1000 }, locale: "tr-TR" });
const hatalar = [];
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

async function govde() {
  return ((await sayfa.locator("body").textContent()) ?? "").replace(/\s+/g, " ").trim();
}

try {
  await giris("admin");

  // -------- 0) Hazırlık: 1 Nolu Mağaza'da bir cihaz (yetki sızıntısı testi için)
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `HTA${damga}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1400);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(`HATAMARKA${damga}`);
  await alanlar.nth(2).fill("FON H");
  await kart.locator('input[inputmode="decimal"]').fill("1.000,00");
  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  await imeiKutusu.fill(imei);
  await imeiKutusu.press("Enter");
  await sayfa.waitForTimeout(400);
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `HTA-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
  // Sayfada "/cihazlar/tedarikci-faturasi" gibi menü bağlantıları da var;
  // aradığımız yalnız sayısal kimlikli cihaz detayı.
  const tumBaglantilar = await sayfa
    .locator('a[href^="/cihazlar/"]')
    .evaluateAll((ler) => ler.map((a) => a.getAttribute("href") ?? ""));
  const cihazUrl = tumBaglantilar.find((h) => /^\/cihazlar\/\d+$/.test(h)) ?? null;

  // ------------------------------ 1) Olmayan adres: Türkçe 404
  const cevap = await sayfa.goto(`${hedef}/boyle-bir-sayfa-yok-${damga}`, {
    waitUntil: "networkidle",
  });
  kontrol("olmayan adres 404 döndürüyor", cevap?.status() === 404, `HTTP ${cevap?.status()}`);
  kontrol(
    "olmayan adreste Türkçe ekran çıkıyor",
    (await sayfa.locator('[data-test="adres-bulunamadi"]').count()) === 1,
  );
  const olmayanMetin = await govde();
  kontrol(
    "ham İngilizce Next ekranı görünmüyor",
    !/This page could not be found/i.test(olmayanMetin),
    olmayanMetin.slice(0, 50),
  );
  kontrol("panele dönüş bağlantısı var", (await sayfa.locator('a[href="/panel"]').count()) >= 1);
  await sayfa.screenshot({ path: `${cikti}-adres404.png`, fullPage: true });

  // ------------------------------ 2) Olmayan kayıt: Türkçe bulunamadı
  await sayfa.goto(`${hedef}/cihazlar/99999999`, { waitUntil: "networkidle" });
  kontrol(
    "olmayan cihazda bulunamadı ekranı",
    (await sayfa.locator('[data-test="bulunamadi-ekrani"]').count()) === 1,
  );
  const kayitMetin = await govde();
  kontrol("metin Türkçe", /Kayıt bulunamadı/.test(kayitMetin), kayitMetin.slice(0, 50));

  await sayfa.goto(`${hedef}/sayim/99999999`, { waitUntil: "networkidle" });
  kontrol(
    "olmayan sayımda da aynı ekran",
    (await sayfa.locator('[data-test="bulunamadi-ekrani"]').count()) === 1,
  );

  // ------- 3) Yetkisiz kayıt: bulunamadı ekranı, veri sızmıyor
  kontrol("hazırlık cihazı bulundu", Boolean(cihazUrl), cihazUrl ?? "(yok)");
  if (cihazUrl) {
    await giris("personel2");
    await sayfa.goto(`${hedef}${cihazUrl}`, { waitUntil: "networkidle" });
    kontrol(
      "yetkisiz kullanıcıya bulunamadı ekranı",
      (await sayfa.locator('[data-test="bulunamadi-ekrani"]').count()) === 1,
    );
    const yabanci = await govde();
    kontrol("başka mağazanın IMEI'si sızmıyor", !yabanci.includes(imei));
    kontrol(
      "başka mağazanın markası sızmıyor",
      !yabanci.includes(`HATAMARKA${damga}`),
      yabanci.slice(0, 50),
    );
    kontrol(
      "ekran 'yetkiniz yok' demiyor (kaydın varlığını sızdırmıyor)",
      /silinmiş olabilir/.test(yabanci),
      "iki ihtimali birden anlatıyor",
    );
  }

  // ------------------------------ 4) Yükleniyor iskeleti
  await giris("admin");
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  const iskeletGoruldu = await sayfa
    .goto(`${hedef}/panel`, { waitUntil: "commit" })
    .then(async () => {
      for (let i = 0; i < 40; i++) {
        if ((await sayfa.locator('[data-test="yukleniyor"]').count()) > 0) return true;
        await sayfa.waitForTimeout(25);
      }
      return false;
    })
    .catch(() => false);
  // Hızlı makinede iskelet hiç görünmeyebilir; bu bir hata değil.
  console.log(`  (bilgi) panel iskeleti yakalandı mı: ${iskeletGoruldu ? "evet" : "hayır — sayfa çok hızlı geldi"}`);
  await sayfa.waitForLoadState("networkidle");
  kontrol("panel iskeletten sonra gerçekten yüklendi", sayfa.url().includes("/panel"), sayfa.url());

  kontrol("sayfa hatası yok", hatalar.length === 0, hatalar.slice(0, 2).join(" | "));
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
