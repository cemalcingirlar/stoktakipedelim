// Aynı müşteriye birden çok cihaz satma uçtan uca testi.
//
// Üç cihaz girer, ikisini tek satışta aynı müşteriye satar, üçüncüyü tek
// başına satar. Sepete ekleme, çıkarma, cihaz başına fiyat/kâr, tekrar okutma
// ve kayıt sonrası müşteri sayfası kontrol edilir.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/coklu-satis";
const SIFRE = "Stok2026!";

const damga = Date.now().toString().slice(-8);
const imei = (i) => `35${damga}${String(i).padStart(5, "0")}`.slice(0, 15);
const MUSTERI = `Çoklu Alıcı ${damga}`;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const baglam = await tarayici.newContext({ viewport: { width: 1500, height: 1200 }, locale: "tr-TR" });
const sayfa = await baglam.newPage();
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
  await Promise.all([sayfa.waitForURL("**/panel"), sayfa.click('button[type="submit"]')]);
}

/** Satış ekranında kod okutur. */
async function okut(kod) {
  await sayfa.fill("#okutmaKutusu", kod);
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1200);
}

try {
  await giris("admin");

  // ------------------------------------------------ 1) üç cihaz gir
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `COK${damga}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1200);

  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill("Samsung");
  await alanlar.nth(2).fill("Galaxy A55");
  await kart.locator('input[inputmode="decimal"]').fill("10.000,00");

  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const i of [1, 2, 3]) {
    await imeiKutusu.fill(imei(i));
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(400);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `COK-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);

  // ------------------------------------------------ 2) sepete ekleme
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  const kutuEtiketi = (await sayfa.locator("label[for='okutmaKutusu']").textContent()) ?? "";
  kontrol("başlangıçta 'Satılacak Cihazı Okut' yazıyor", /Satılacak Cihazı Okut/.test(kutuEtiketi), kutuEtiketi.trim());

  await okut(imei(1));
  kontrol("ilk cihaz sepete eklendi", (await sayfa.locator('[data-test="sepet-satiri"]').count()) === 1);

  const ikinciEtiket = (await sayfa.locator("label[for='okutmaKutusu']").textContent()) ?? "";
  kontrol("ekledikten sonra 'Başka Cihaz Okut' oluyor", /Başka Cihaz Okut/.test(ikinciEtiket), ikinciEtiket.trim());

  await okut(imei(2));
  const satirSayisi = await sayfa.locator('[data-test="sepet-satiri"]').count();
  kontrol("ikinci cihaz birinciyi silmeden eklendi", satirSayisi === 2, `${satirSayisi} satır`);

  const sepetMetni = (await sayfa.locator('[data-test="satis-sepeti"]').textContent()) ?? "";
  kontrol("iki cihazın seri numarası da listede", sepetMetni.includes(imei(1)) && sepetMetni.includes(imei(2)));

  // Aynı cihazı tekrar okutmak eklememeli.
  await okut(imei(1));
  const tekrarSonrasi = await sayfa.locator('[data-test="sepet-satiri"]').count();
  kontrol("aynı cihaz ikinci kez eklenmiyor", tekrarSonrasi === 2, `${tekrarSonrasi} satır`);
  const uyari = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("tekrar okutmada uyarı veriliyor", /zaten listede/.test(uyari));

  // Üçüncüyü ekleyip çıkar.
  await okut(imei(3));
  kontrol("üçüncü cihaz eklendi", (await sayfa.locator('[data-test="sepet-satiri"]').count()) === 3);
  await sayfa.locator('[data-test="sepet-cikar"]').last().click();
  await sayfa.waitForTimeout(300);
  const cikarmaSonrasi = await sayfa.locator('[data-test="sepet-satiri"]').count();
  kontrol("çıkar düğmesi cihazı listeden siliyor", cikarmaSonrasi === 2, `${cikarmaSonrasi} satır`);
  const kalanMetin = (await sayfa.locator('[data-test="satis-sepeti"]').textContent()) ?? "";
  kontrol("çıkarılan cihaz listede yok", !kalanMetin.includes(imei(3)));

  // ------------------------------------------------ 3) cihaz başına fiyat
  const fiyatKutulari = sayfa.locator('[data-test="sepet-fiyat"]');
  kontrol("her cihazın kendi fiyat kutusu var", (await fiyatKutulari.count()) === 2);

  await fiyatKutulari.nth(0).fill("13.000,00");
  await fiyatKutulari.nth(1).fill("11.500,50");
  await sayfa.waitForTimeout(400);

  const altBant = (await sayfa.locator('[data-test="satis-toplami"]').textContent()) ?? "";
  kontrol("alt bantta 2 cihaz yazıyor", /2 cihaz/.test(altBant), altBant.replace(/\s+/g, " ").trim());
  kontrol("toplam satış doğru", altBant.includes("24.500,50"), "13.000,00 + 11.500,50");
  kontrol("toplam kâr doğru", altBant.includes("4.500,50"), "24.500,50 − 20.000,00");

  const dugmeMetni = (await sayfa.locator('button:has-text("Cihazı Sat")').textContent()) ?? "";
  kontrol("kaydet düğmesi adedi gösteriyor", dugmeMetni.includes("2 Cihazı Sat"), dugmeMetni.trim());

  // Fiyatı silince kaydetme engellenmeli.
  await fiyatKutulari.nth(1).fill("");
  await sayfa.waitForTimeout(300);
  const sorunMetni = (await sayfa.locator('[data-test="satis-sorunlari"]').textContent()) ?? "";
  kontrol("fiyatı eksik cihaz uyarı veriyor", /satış fiyatı girin/.test(sorunMetni), sorunMetni.trim());
  await fiyatKutulari.nth(1).fill("11.500,50");
  await sayfa.waitForTimeout(300);

  // ------------------------------------------------ 4) müşteri ve kayıt
  await sayfa.fill("#yeniAd", MUSTERI);
  await sayfa.fill("#yeniTelefon", `555${damga}`);
  await Promise.all([
    sayfa.waitForURL("**/musteriler**", { timeout: 30000 }),
    sayfa.click('button:has-text("Cihazı Sat")'),
  ]);
  kontrol("çoklu satış müşteri sayfasına yönlendirdi", sayfa.url().includes("/musteriler"), sayfa.url());

  const musteriMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("müşteri sayfasında 2 cihaz görünüyor", /2 cihaz/.test(musteriMetni), (musteriMetni.match(/\d+ cihaz/) ?? [""])[0]);
  kontrol("müşteri adı doğru", musteriMetni.includes(MUSTERI));

  // ------------------------------------------------ 5) iki cihaz da satıldı
  for (const i of [1, 2]) {
    await sayfa.goto(`${hedef}/cihazlar?ara=${imei(i)}`, { waitUntil: "networkidle" });
    const cihazMetni = (await sayfa.locator("main").textContent()) ?? "";
    kontrol(`${i}. cihaz satıldı olarak işaretli`, /Satıldı|SATILDI/.test(cihazMetni), imei(i));
    kontrol(`${i}. cihaz müşteriye bağlandı`, cihazMetni.includes(MUSTERI), "");
  }

  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(1)}`, { waitUntil: "networkidle" });
  const ilkCihaz = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("birinci cihazın kendi fiyatı kaydedildi", ilkCihaz.includes("13.000,00"), "");

  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(2)}`, { waitUntil: "networkidle" });
  const ikinciCihaz = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("ikinci cihazın kendi fiyatı kaydedildi", ikinciCihaz.includes("11.500,50"), "");

  // Satılan cihaz tekrar sepete eklenememeli.
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  await okut(imei(1));
  const satilmisUyari = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("satılmış cihaz tekrar satışa eklenmiyor", /daha önce satılmış/.test(satilmisUyari));

  // ------------------------------------------------ 6) tek cihaz eski akış
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  await okut(imei(3));
  await sayfa.locator('[data-test="sepet-fiyat"]').first().fill("12.000,00");
  await sayfa.fill("#musteriSorgu", MUSTERI);
  await sayfa.click('button:has-text("Ara")');
  await sayfa.waitForTimeout(1500);
  const secButonu = sayfa.locator('button:has-text("Seç")').first();
  if ((await secButonu.count()) > 0) {
    await secButonu.click();
    await sayfa.waitForTimeout(300);
  } else {
    await sayfa.fill("#yeniAd", MUSTERI);
  }
  await Promise.all([
    sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Satışı Kaydet")'),
  ]);
  kontrol("tek cihaz satışı cihaz detayına gidiyor", /\/cihazlar\/\d+$/.test(sayfa.url()), sayfa.url());

  const tekCihaz = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("tek cihaz da aynı müşteriye bağlandı", tekCihaz.includes(MUSTERI));

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
