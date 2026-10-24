// Yanlış girilmiş kayıtların iptali testi.
//
// Uygulamada hiçbir cihaz silinemiyordu: sehven girilen bir cihaz sonsuza
// kadar stokta kalıp stok değerini şişiriyordu, tek çare eski yedeği geri
// yüklemekti.
//
// Test "iptal düğmesi var" ile yetinmiyor: iptal edilen cihazın stok
// ADEDİNDEN ve stok DEĞERİNDEN düştüğü, gerekçenin tarihçede kaldığı,
// satılmış cihazın iptal edilemediği ve iptalin geri alınabildiği tek tek
// sayılıyor.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/kayit-iptali";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);
const MARKA = `IPTALMARKA${damga}`;
const ALIS = "1.000,00";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1500, height: 1100 }, locale: "tr-TR" });
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

/** Panelde 1 Nolu Mağaza'nın stok adedi ve değeri. */
async function stokOzeti() {
  await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  const govde = ((await sayfa.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
  const adet = Number((govde.match(/Toplam Stok\s*([0-9.]+)/) ?? [0, "0"])[1].replace(/\./g, ""));
  const deger = (govde.match(/Stok Değeri\s*([0-9.,]+)/) ?? [0, "0"])[1];
  return { adet, deger };
}

// Sütun filtresi kullanılıyor, "ara" değil: tam bir IMEI arama kutusuna
// yazıldığında ekran tek cihaz detayına yönleniyor ve listede sayı olmuyor.
// "ara" ile yazılan bir kontrol, cihaz hâlâ stoktayken bile "0 cihaz" okuyup
// yanlış sebeple geçerdi.
async function cihazSayisi(sorgu) {
  await sayfa.goto(`${hedef}/cihazlar?${sorgu}`, { waitUntil: "networkidle" });
  const kutu = sayfa.locator("text=/^\\d+ cihaz/").first();
  if ((await kutu.count()) === 0) return 0;
  return Number((((await kutu.textContent()) ?? "").match(/(\d+)/) ?? [0, "0"])[1]);
}

try {
  await giris("admin");

  // ---------------------------------------------- 0) Hazırlık: 3 cihaz
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `IPT${damga}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1400);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(MARKA);
  await alanlar.nth(2).fill("FON I");
  await kart.locator('input[inputmode="decimal"]').fill(ALIS);
  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (let i = 1; i <= 3; i++) {
    await imeiKutusu.fill(imei(i));
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(320);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `IPT-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);

  const once = await stokOzeti();
  console.log(`0) hazırlık: 3 cihaz ${ALIS}'dan girildi · stok ${once.adet} adet / ${once.deger}`);

  // -------------------------------- 1) Cihaz detayında iptal bölümü var
  const cihazlar = await sayfa
    .goto(`${hedef}/cihazlar?ara=${imei(1)}`, { waitUntil: "networkidle" })
    .then(() => sayfa.url());
  kontrol("tek IMEI cihaz detayına götürdü", /\/cihazlar\/\d+/.test(cihazlar), cihazlar);
  const cihazUrl = sayfa.url();

  kontrol("yöneticide iptal bölümü var", (await sayfa.locator('[data-test="iptal-ac"]').count()) === 1);

  // İptalden ÖNCEKİ hal: kontrolün ayırt edici olduğunu sabitliyor.
  const oncekiStokta = await cihazSayisi(`seriNo=${imei(1)}&durum=STOKTA`);
  kontrol("iptalden önce cihaz Stokta listesinde", oncekiStokta === 1, `${oncekiStokta} cihaz`);
  // Ölçüm için listeye gidildi; cihaz sayfasına dönülüyor.
  await sayfa.goto(cihazUrl, { waitUntil: "networkidle" });

  // ---------------------------------- 2) Kısa gerekçe reddediliyor
  await sayfa.locator('[data-test="iptal-ac"]').click();
  await sayfa.waitForTimeout(300);
  await sayfa.evaluate(() => document.querySelector("#gerekce")?.removeAttribute("minlength"));
  await sayfa.fill("#gerekce", "a");
  await sayfa.click('button:has-text("Evet, İptal Et")');
  await sayfa.waitForTimeout(1200);
  const kisaHata = await sayfa.locator('[data-test="iptal-hata"]').textContent().catch(() => "");
  kontrol("kısa gerekçe reddediliyor", /en az/.test(kisaHata ?? ""), (kisaHata ?? "").trim());

  // ---------------------------------- 3) Gerekçeyle iptal
  await sayfa.fill("#gerekce", "Yanlış IMEI girilmiş");
  await sayfa.click('button:has-text("Evet, İptal Et")');
  await sayfa.waitForTimeout(1800);
  await sayfa.goto(cihazUrl, { waitUntil: "networkidle" });
  const detay = ((await sayfa.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
  kontrol("cihaz durumu İptal Edildi", detay.includes("İptal Edildi"), detay.slice(0, 60));
  kontrol("gerekçe tarihçede duruyor", detay.includes("Yanlış IMEI girilmiş"));
  kontrol(
    "iptalden sonra geri alma seçeneği çıkıyor",
    (await sayfa.locator('[data-test="iptal-geri-alma"]').count()) === 1,
  );

  // ------------------------- 4) Stok adedi ve DEĞERİ düştü
  const sonra = await stokOzeti();
  kontrol(
    "stok adedi bir azaldı",
    sonra.adet === once.adet - 1,
    `${once.adet} -> ${sonra.adet}`,
  );
  kontrol(
    "stok değeri de düştü (sadece adet değil)",
    sonra.deger !== once.deger,
    `${once.deger} -> ${sonra.deger}`,
  );
  const stoktaSayi = await cihazSayisi(`seriNo=${imei(1)}&durum=STOKTA`);
  kontrol("iptal edilen cihaz 'Stokta' filtresinde yok", stoktaSayi === 0, `${stoktaSayi} cihaz`);
  await sayfa.screenshot({ path: `${cikti}-iptal.png`, fullPage: true });

  // ------------------------- 5) Satılmış cihaz iptal edilemez
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutmaKutusu", imei(2));
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1200);
  await sayfa.locator('[data-test="sepet-fiyat"]').first().fill("1.500,00");
  await sayfa.fill("#musteriSorgu", `IPTAL MUSTERI ${damga}`);
  await sayfa.locator('[data-test="musteri-ara"]').click();
  await sayfa.waitForTimeout(1500);
  const secBtn = sayfa.locator('[data-test="musteri-sec"]').first();
  if ((await secBtn.count()) > 0) await secBtn.click();
  else await sayfa.fill("#yeniAd", `IPTAL MUSTERI ${damga}`);
  await Promise.all([
    sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Satışı Kaydet")'),
  ]);
  const satilanUrl = sayfa.url();
  kontrol(
    "satılmış cihazda iptal düğmesi yok",
    (await sayfa.locator('[data-test="iptal-ac"]').count()) === 0,
    satilanUrl,
  );

  // ------------------------- 6) İptal geri alınabiliyor
  await sayfa.goto(cihazUrl, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="iptal-geri-alma"] button').click();
  await sayfa.waitForTimeout(1800);
  await sayfa.goto(cihazUrl, { waitUntil: "networkidle" });
  // Sayfanın tüm metnine bakmak yanıltıcı: tarihçe iptal kaydını taşımaya
  // devam ediyor (ve etmeli). Ölçüt davranış: cihaz "Stokta" filtresine
  // geri döndü mü?
  const geriStokta = await cihazSayisi(`seriNo=${imei(1)}&durum=STOKTA`);
  kontrol("geri alınca cihaz Stokta filtresine döndü", geriStokta === 1, `${geriStokta} cihaz`);
  await sayfa.goto(cihazUrl, { waitUntil: "networkidle" });
  kontrol(
    "geri alma seçeneği kayboldu, iptal seçeneği döndü",
    (await sayfa.locator('[data-test="iptal-geri-alma"]').count()) === 0 &&
      (await sayfa.locator('[data-test="iptal-ac"]').count()) === 1,
  );
  // Arada bir cihaz SATILDI (5. adım), o yüzden beklenen başlangıç değil
  // başlangıç eksi bir. Beklentiyi "once.adet" bırakmak, satışın stoktan
  // düşmediği anlamına gelirdi ki o ayrı bir hata olurdu.
  const geriOzet = await stokOzeti();
  const beklenen = once.adet - 1;
  kontrol(
    "geri alınca stok adedi arttı (satılan hariç)",
    geriOzet.adet === beklenen,
    `${sonra.adet} -> ${geriOzet.adet} (${beklenen} bekleniyor: ${once.adet} girdi, 1 satıldı)`,
  );

  // ------------------------- 7) Personel iptal edemez
  await giris("personel1");
  await sayfa.goto(cihazUrl, { waitUntil: "networkidle" });
  kontrol(
    "personelde iptal bölümü yok",
    (await sayfa.locator('[data-test="iptal-ac"]').count()) === 0,
  );

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
