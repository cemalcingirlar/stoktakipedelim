// Giriş deneme sınırı testi.
//
// Şifre denemesi sınırsızdı: ekrandaki sayaç yalnız arayüz içindi, sunucuda
// engel yoktu. scrypt denemeyi yavaşlatıyor ama durdurmuyor.
//
// Test "kilit mesajı çıkıyor" ile yetinmiyor: kilitliyken DOĞRU şifrenin de
// reddedildiği (korumanın asıl anlamı), başka kullanıcının etkilenmediği,
// başarılı girişin sayacı sıfırladığı ve var olmayan kullanıcı adlarının da
// sayıldığı (hesap taramasına karşı) ayrı ayrı sayılıyor.
//
// Ayrıca: kilidin denemeyi yapan ADRESE ait olduğu (adı bilen biri hesabın
// sahibini kilitleyemesin), hatalı denemelerin denetim kaydına şifresiz
// yazıldığı, yöneticinin panelde uyarıldığı ve hareketsiz kalan oturumun
// kapandığı.
import { chromium } from "@playwright/test";
import Database from "better-sqlite3";

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

  // ---------------- 6) Kilit denemeyi yapan adrese ait
  // sorumlu3 yukarıda bu adresten kilitlendi. Hesabın sahibi BAŞKA adresten
  // doğru şifreyle girebilmeli: yoksa adı bilen herkes onu sürekli kilitli
  // tutabilir. Cloudflare'in yazdığı başlık taklit ediliyor.
  const baskaAdres = await tarayici.newContext({
    locale: "tr-TR",
    extraHTTPHeaders: { "CF-Connecting-IP": "198.51.100.4" },
  });
  const sahibi = await baskaAdres.newPage();
  await sahibi.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sahibi.fill("#kullaniciAdi", "sorumlu3");
  await sahibi.fill("#sifre", SIFRE);
  await sahibi.click('button[type="submit"]');
  await sahibi.waitForTimeout(1200);
  kontrol(
    "başka adresten hesabın sahibi kilide takılmıyor",
    sahibi.url().includes("/panel"),
    sahibi.url(),
  );
  await baskaAdres.close();

  const halaKilitli = await dene("sorumlu3", SIFRE);
  kontrol(
    "kilitlenen adres hâlâ kilitli",
    kilitliMi(halaKilitli),
    halaKilitli.slice(0, 60),
  );

  // ---------------- 7) Hatalı denemeler denetim kaydında
  await dene("admin", SIFRE);
  await sayfa.goto(`${hedef}/ayarlar/loglar?islem=GIRIS_BASARISIZ`, { waitUntil: "networkidle" });
  const hataliKayitlar = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "hatalı giriş denemeleri kayda geçiyor",
    hataliKayitlar.includes("Denenen ad: sorumlu3") && hataliKayitlar.includes("Hatalı giriş denemesi"),
    hataliKayitlar.replace(/\s+/g, " ").slice(0, 80),
  );
  kontrol(
    "var olmayan ad da kayıtta ve işaretli",
    hataliKayitlar.includes(`Denenen ad: ${yokAd}`) && hataliKayitlar.includes("kayıtlı değil"),
  );
  await sayfa.goto(`${hedef}/ayarlar/loglar?islem=GIRIS_KILITLENDI`, { waitUntil: "networkidle" });
  const kilitKayitlari = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "kilitlenme ayrı bir kayıt olarak yazılıyor",
    kilitKayitlari.includes("Giriş kilitlendi") && kilitKayitlari.includes("Denenen ad: sorumlu3"),
  );
  kontrol(
    "denenen şifre hiçbir kayıtta yok",
    !hataliKayitlar.includes(YANLIS) && !kilitKayitlari.includes(YANLIS),
  );

  // ---------------- 8) Yönetici panelde uyarılıyor
  await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  const uyari = sayfa.locator('[data-test="sistem-uyarisi-giris"]');
  const uyariMetni = (await uyari.count()) > 0 ? ((await uyari.textContent()) ?? "") : "";
  kontrol(
    "yönetici panelinde hatalı giriş uyarısı var",
    /hatalı giriş denemesi/.test(uyariMetni) && /kilitlendi/.test(uyariMetni),
    uyariMetni.replace(/\s+/g, " ").slice(0, 90) || "(uyarı yok)",
  );
  await dene("personel1", SIFRE);
  kontrol(
    "personel bu uyarıyı görmüyor",
    (await sayfa.locator('[data-test="sistem-uyarilari"]').count()) === 0,
  );

  // ---------------- 9) Hareketsiz oturum kapanıyor
  // Saat ileri alınamadığı için kayıtlı son etkinlik anı geriye çekiliyor.
  await dene("admin", SIFRE);
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  kontrol("etkin oturum sayfayı açıyor", sayfa.url().includes("/cihazlar"), sayfa.url());

  const db = new Database((process.env.DATABASE_URL ?? "").replace(/^file:/, ""));
  db.pragma("busy_timeout = 5000");
  const etkinlikSayisi = db.prepare('SELECT COUNT(*) AS n FROM "OturumEtkinligi"').get().n;
  kontrol("oturumun son etkinliği kaydediliyor", etkinlikSayisi >= 1, `${etkinlikSayisi} kayıt`);

  // 60 dakika önce: sınırın (120 dk) altında, oturum yaşamalı.
  const dkOnce = (dk) => new Date(Date.now() - dk * 60_000).toISOString();
  db.prepare('UPDATE "OturumEtkinligi" SET "sonEtkinlik" = ?').run(dkOnce(60));
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  kontrol("bir saat hareketsiz kalan oturum hâlâ açık", sayfa.url().includes("/cihazlar"), sayfa.url());

  db.prepare('UPDATE "OturumEtkinligi" SET "sonEtkinlik" = ?').run(dkOnce(180));
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  kontrol("üç saat hareketsiz kalan oturum girişe düşüyor", sayfa.url().includes("/giris"), sayfa.url());

  // Süresi dolmuş oturumla yapılan istek onu yeniden canlandırmamalı.
  await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
  kontrol("kapanan oturum tekrar denemeyle açılmıyor", sayfa.url().includes("/giris"), sayfa.url());
  db.close();

  const yeniden = await dene("admin", SIFRE);
  kontrol("yeniden giriş yapılabiliyor", yeniden === "", yeniden.slice(0, 50));
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
