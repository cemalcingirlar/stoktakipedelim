// İptal edilen faturanın geri alınması ve seri numaralarının serbest kalması.
//
// Kullanıcı iki şey bildirdi:
//   1. İptal ettiği faturada "iptali geri al" seçeneği yoktu.
//   2. İptal ettiği faturadaki seri numaraları sistemde kayıtlı kaldığı için
//      aynı IMEI'leri tekrar giremiyordu.
//
// İkincisi asıl hataydı: iptal kaydı silmiyor (denetim izi kalsın diye durumu
// IPTAL oluyor) ve seri numarası alan üzerinde GENEL benzersizdi, yani numara
// iptal edilen kayıtta asılı kalıyordu. Yanlış girilen faturayı iptal edip
// DOĞRUSUNU aynı IMEI'lerle girmek en olağan senaryo. Aynı sorun fatura
// numarasında daha önce görülüp çözülmüştü; seri numarası gözden kaçmış.
//
// Test ikisini de sayıyor, ayrıca geri almanın güvenlik şartlarını: numara ya
// da seri numarası aradan geçen sürede yeniden kullanıldıysa geri alma
// reddedilmeli, sessizce yarım iş yapılmamalı.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/fatura-geri-al";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);
const FATURA_A = `FGA-${damga}`;
const FATURA_B = `FGB-${damga}`;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({
  viewport: { width: 1500, height: 1100 },
  locale: "tr-TR",
});
const hatalar = [];
sayfa.on("pageerror", (e) => hatalar.push(String(e)));
sayfa.on("console", (m) => {
  if (m.type() === "error") hatalar.push(m.text());
});

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

/**
 * Fatura girer. Kaydedilemezse ekrandaki hatayı döner — "aynı IMEI tekrar
 * girilebiliyor mu" sorusunun cevabı tam olarak burada.
 */
async function faturaGir({ faturaNo, imeiler, marka }) {
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `FGA${damga}${marka.slice(-3)}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1400);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(marka);
  await alanlar.nth(2).fill("FON G");
  await kart.locator('input[inputmode="decimal"]').fill("2.000,00");
  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const no of imeiler) {
    await imeiKutusu.fill(no);
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(350);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", faturaNo);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await sayfa.click('button:has-text("Faturayı Kaydet")');
  try {
    await sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 15000 });
    return { url: sayfa.url(), hata: null };
  } catch {
    const govde = ((await sayfa.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
    return { url: null, hata: govde.slice(0, 220) };
  }
}

async function iptalEt(url, gerekce) {
  await sayfa.goto(url, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="fatura-iptal-ac"]').click();
  await sayfa.waitForTimeout(300);
  await sayfa.fill("#faturaGerekce", gerekce);
  await sayfa.click('button:has-text("Evet, Faturayı İptal Et")');
  await sayfa.waitForTimeout(2200);
}

async function geriAl(url) {
  await sayfa.goto(url, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="fatura-geri-al-ac"]').click();
  await sayfa.waitForTimeout(300);
  await sayfa.click('button:has-text("Evet, İptali Geri Al")');
  await sayfa.waitForTimeout(2200);
  const hata = sayfa.locator('[data-test="fatura-geri-al-hata"]');
  return (await hata.count()) > 0 ? ((await hata.textContent()) ?? "").trim() : null;
}

try {
  await giris("admin");

  // ====================================== 1) Fatura girilip iptal ediliyor
  const a = await faturaGir({
    faturaNo: FATURA_A,
    imeiler: [imei(1), imei(2)],
    marka: `FGAMARKA${damga}`,
  });
  kontrol("fatura girildi", Boolean(a.url), a.hata ?? FATURA_A);
  if (!a.url) throw new Error("fatura girilemedi");
  await iptalEt(a.url, "Fatura yanlis girildi");
  await sayfa.goto(a.url, { waitUntil: "networkidle" });
  const iptalliMetin = ((await sayfa.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
  kontrol("fatura iptal edildi", iptalliMetin.includes("iptal edildi"), iptalliMetin.slice(0, 80));
  // Bildirilen eksik: iptal edilen faturada geri alma seçeneği yoktu.
  kontrol(
    "iptalli faturada geri alma düğmesi var",
    (await sayfa.locator('[data-test="fatura-geri-al-ac"]').count()) === 1,
  );

  // ============== 2) BİLDİRİLEN HATA: aynı IMEI'ler tekrar girilebilmeli
  // İptal edilen kayıt seri numarasını tutmamalı; aksi halde yanlış girilen
  // faturanın doğrusu hiç girilemez.
  const b = await faturaGir({
    faturaNo: FATURA_B,
    imeiler: [imei(1), imei(2)],
    marka: `FGBMARKA${damga}`,
  });
  kontrol(
    "iptal edilen faturanın IMEI'leri tekrar girilebiliyor",
    Boolean(b.url),
    b.hata ?? "kaydedildi",
  );

  // ====================================== 3) İptali geri alma: engel sebebi
  // A faturasının IMEI'leri şimdi B'de aktif; geri alma reddedilmeli.
  const engelMesaji = await geriAl(a.url);
  kontrol(
    "seri no yeniden kullanılmışsa geri alma reddediliyor",
    Boolean(engelMesaji) && /yeniden girilmiş/i.test(engelMesaji ?? ""),
    engelMesaji ?? "(hata yok — geri alındı!)",
  );
  kontrol(
    "red mesajı hangi numara olduğunu söylüyor",
    (engelMesaji ?? "").includes(imei(1)) || (engelMesaji ?? "").includes(imei(2)),
    engelMesaji ?? "",
  );

  // ============ 3b) Cihaz bazında geri alma da aynı çakışmayı görmeli
  // Aynı sınıftan açık: tek cihazın iptalini geri almak da aktif kayıtlarda
  // aynı IMEI'den iki tane oluşmasına yol açardı. Ham veritabanı hatası
  // yerine ne olduğu söylenmeli.
  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(1)}`, { waitUntil: "networkidle" });
  const iptalliSatir = sayfa.locator("table tbody tr", { hasText: "İptal Edildi" }).first();
  const cihazBaglantisi = iptalliSatir.locator('a[href^="/cihazlar/"]').first();
  kontrol("iptalli cihaz listede bulundu", (await cihazBaglantisi.count()) === 1);
  if ((await cihazBaglantisi.count()) === 1) {
    await cihazBaglantisi.click();
    await sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 20000 });
    await sayfa.locator('[data-test="iptal-geri-alma"] button').click();
    await sayfa.waitForTimeout(2000);
    const cihazMesaji = ((await sayfa.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
    kontrol(
      "cihaz geri almada çakışma açıkça söyleniyor",
      /yeniden girilmiş/i.test(cihazMesaji),
      cihazMesaji.slice(0, 140),
    );
  }

  // ====================================== 4) Engel kalkınca geri alınabiliyor
  // B faturası iptal edilince numaralar tekrar serbest kalıyor.
  if (b.url) await iptalEt(b.url, "Deneme faturasi geri alindi");
  const engel2 = await geriAl(a.url);
  kontrol("engel kalkınca iptal geri alınıyor", engel2 === null, engel2 ?? "geri alındı");

  await sayfa.goto(a.url, { waitUntil: "networkidle" });
  const geriMetin = ((await sayfa.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
  kontrol(
    "fatura artık iptalli görünmüyor",
    !geriMetin.includes("iptal edildi"),
    geriMetin.slice(0, 80),
  );
  kontrol(
    "fatura numarası eski haline döndü",
    geriMetin.includes(FATURA_A) && !geriMetin.includes("(iptal #"),
    geriMetin.slice(0, 80),
  );
  kontrol(
    "geri alındıktan sonra tekrar iptal edilebiliyor",
    (await sayfa.locator('[data-test="fatura-iptal-ac"]').count()) === 1,
  );
  await sayfa.screenshot({ path: `${cikti}-geri-alindi.png`, fullPage: true });

  // ====================================== 5) Cihazlar tekrar stokta
  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(1)}`, { waitUntil: "networkidle" });
  const satirlar = sayfa.locator("table tbody tr");
  const satir = await satirlar.count();
  kontrol("geri alınan cihaz listede", satir >= 1, `${satir} satır`);
  // Aynı IMEI'de iki kayıt olabiliyor: biri geri alınan (stokta), biri 4.
  // adımda iptal edilen B faturasının kaydı. Beklenen de bu — iptal edilen
  // numarayı tutmadığı için ikisi yan yana durabiliyor.
  const satirMetinleri = [];
  for (let i = 0; i < satir; i += 1) {
    satirMetinleri.push(((await satirlar.nth(i).textContent()) ?? "").replace(/\s+/g, " "));
  }
  const iptalsiz = satirMetinleri.filter((m) => !/İptal Edildi/.test(m));
  kontrol(
    "geri alınan cihaz stokta görünüyor",
    iptalsiz.length >= 1,
    `${iptalsiz.length}/${satir} satır iptalsiz`,
  );

  // ====================================== 6) Fatura numarası çakışması
  // A geri alındı, numarası yine A. Şimdi C faturasını aynı numarayla girmek
  // için önce A iptal edilip numara serbest bırakılıyor; sonra geri alma
  // numara yüzünden reddedilmeli.
  await iptalEt(a.url, "Numara cakismasi denemesi");
  const c = await faturaGir({
    faturaNo: FATURA_A,
    imeiler: [imei(7)],
    marka: `FGCMARKA${damga}`,
  });
  kontrol("iptalden sonra aynı fatura numarası kullanılabiliyor", Boolean(c.url), c.hata ?? FATURA_A);
  const numaraEngeli = await geriAl(a.url);
  kontrol(
    "numara yeniden kullanılmışsa geri alma reddediliyor",
    Boolean(numaraEngeli) && /yeniden kullanılmış/i.test(numaraEngeli ?? ""),
    numaraEngeli ?? "(hata yok — geri alındı!)",
  );

  // ====================================== 7) Yetki
  await giris("personel1");
  await sayfa.goto(a.url, { waitUntil: "networkidle" });
  kontrol(
    "personele geri alma düğmesi çıkmıyor",
    (await sayfa.locator('[data-test="fatura-geri-al-ac"]').count()) === 0,
  );

  kontrol("tarayıcı konsolunda hata yok", hatalar.length === 0, hatalar.slice(0, 2).join(" | "));
} catch (hata) {
  kontrol("betik tamamlandı", false, String(hata).slice(0, 300));
  await sayfa.screenshot({ path: `${cikti}-hata.png`, fullPage: true }).catch(() => {});
} finally {
  await tarayici.close();
}

const gecen = sonuclar.filter((s) => s.gecti).length;
console.log(`\n${gecen}/${sonuclar.length} kontrol geçti`);
if (gecen !== sonuclar.length) process.exit(1);
