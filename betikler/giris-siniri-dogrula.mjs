// Giriş deneme sınırı testi.
//
// Şifre denemesi sınırsızdı: ekrandaki sayaç yalnız arayüz içindi, sunucuda
// engel yoktu. scrypt denemeyi yavaşlatıyor ama durdurmuyor.
//
// Test "kilit mesajı çıkıyor" ile yetinmiyor: kilitliyken DOĞRU şifrenin de
// reddedildiği (korumanın asıl anlamı), başka kullanıcının etkilenmediği,
// başarılı girişin sayacı sıfırladığı ve var olmayan kullanıcı adlarının da
// sayıldığı (hesap taramasına karşı) ayrı ayrı sayılıyor.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/giris-siniri";
const SIFRE = "Stok2026!";
const YANLIS = "YanlisSifre123!";
const damga = String(Date.now()).slice(-7);

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1200, height: 900 }, locale: "tr-TR" });

const sonuclar = [];
function kontrol(ad, gecti, ek = "") {
  sonuclar.push({ ad, gecti, ek });
  console.log(`${gecti ? "✓" : "✗"} ${ad}${ek ? ` — ${ek}` : ""}`);
}

/** Bir giriş denemesi yapar; hata mesajını ya da "" (başarılı) döner. */
async function dene(kullanici, sifre) {
  await sayfa.context().clearCookies();
  await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sayfa.fill("#kullaniciAdi", kullanici);
  await sayfa.fill("#sifre", sifre);
  await sayfa.click('button[type="submit"]');
  await sayfa.waitForTimeout(900);
  if (sayfa.url().includes("/panel")) return "";
  const kutu = sayfa.locator('[role="alert"]').first();
  return (await kutu.count()) > 0 ? ((await kutu.textContent()) ?? "").trim() : "(mesaj yok)";
}

const kilitliMi = (m) => /Çok fazla hatalı deneme/.test(m);

/** Kaç denemede kilitlendiğini ölçer. Sınır sabitini betiğe kopyalamamak için:
 *  kopya olsaydı kod değiştiğinde test sessizce yanlış sayıyı doğrular. */
async function kilitlenmeNoktasi(kullanici) {
  for (let i = 1; i <= 25; i++) {
    const m = await dene(kullanici, YANLIS);
    if (kilitliMi(m)) return { deneme: i, mesaj: m };
  }
  return { deneme: 0, mesaj: "(25 denemede kilitlenmedi)" };
}

let EN_COK_DENEME = 0;

try {
  // ---------------- 1) Var olmayan kullanıcı adı da sayılıyor
  const yokAd = `yokboyle${damga}`;
  const olcum = await kilitlenmeNoktasi(yokAd);
  EN_COK_DENEME = olcum.deneme;
  const sonMesaj = olcum.mesaj;
  kontrol(
    "var olmayan kullanıcı adı da kilitleniyor",
    kilitliMi(sonMesaj),
    `${EN_COK_DENEME}. denemede kilitlendi`,
  );
  kontrol(
    "sınır makul bir aralıkta",
    EN_COK_DENEME >= 5 && EN_COK_DENEME <= 15,
    `${EN_COK_DENEME} deneme`,
  );
  kontrol(
    "kilit öncesi mesaj hesabın varlığını sızdırmıyor",
    !/bulunamadı|yok|kayıtlı değil/i.test(sonMesaj),
    sonMesaj.slice(0, 60),
  );

  // ---------------- 2) Sınırın altında kilit yok
  const altMesaj = [];
  for (let i = 1; i <= EN_COK_DENEME - 1; i++) altMesaj.push(await dene("personel2", YANLIS));
  kontrol(
    `${EN_COK_DENEME - 1} denemede henüz kilit yok`,
    altMesaj.every((m) => !kilitliMi(m)),
    altMesaj[altMesaj.length - 1].slice(0, 50),
  );

  // ---------------- 3) Başarılı giriş sayacı sıfırlıyor
  const basarili = await dene("personel2", SIFRE);
  kontrol("sınırın altındayken doğru şifre çalışıyor", basarili === "", basarili.slice(0, 50));

  const ikinciTur = [];
  for (let i = 1; i <= EN_COK_DENEME - 1; i++) ikinciTur.push(await dene("personel2", YANLIS));
  kontrol(
    "başarılı giriş sayacı sıfırladı (ikinci tur da kilitlemiyor)",
    ikinciTur.every((m) => !kilitliMi(m)),
    `${EN_COK_DENEME - 1} deneme daha yapıldı`,
  );

  // ---------------- 4) Kilitliyken DOĞRU şifre de reddediliyor
  let kilitMesaj = "";
  for (let i = 1; i <= EN_COK_DENEME; i++) kilitMesaj = await dene("sorumlu3", YANLIS);
  kontrol("sınıra ulaşınca kilitleniyor", kilitliMi(kilitMesaj), kilitMesaj.slice(0, 60));

  const dogruAmaKilitli = await dene("sorumlu3", SIFRE);
  kontrol(
    "kilitliyken doğru şifre de reddediliyor",
    kilitliMi(dogruAmaKilitli),
    dogruAmaKilitli.slice(0, 60),
  );
  kontrol("kilitliyken panele girilemedi", !sayfa.url().includes("/panel"), sayfa.url());
  kontrol("mesaj ne kadar bekleneceğini söylüyor", /dakika/.test(dogruAmaKilitli));
  await sayfa.screenshot({ path: `${cikti}-kilit.png`, fullPage: true });

  // ---------------- 5) Başka kullanıcı etkilenmiyor
  const digeri = await dene("personel1", SIFRE);
  kontrol("başka kullanıcı kilitten etkilenmiyor", digeri === "", digeri.slice(0, 50));

  const admin = await dene("admin", SIFRE);
  kontrol("yönetici de normal giriyor", admin === "", admin.slice(0, 50));
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
