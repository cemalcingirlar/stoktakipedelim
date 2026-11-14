// Alış fiyatı düzeltme testi.
//
// Cihazın alış fiyatı sonradan düzeltilebiliyor; yetki yalnız yöneticide.
// Asıl sınanan şey düğmenin gizlenmesi değil, SUNUCUNUN reddetmesi: form
// yönetici oturumuyla açılıp personel oturumuyla gönderiliyor. Ayrıca
// düzeltmenin iz bıraktığı (tarihçe + işlem kaydı), "aynı faturadaki aynı
// ürün" seçeneğinin tam olarak doğru cihazlara dokunduğu ve iptal edilmiş
// kaydın düzeltilemediği.
import { chromium } from "@playwright/test";
import Database from "better-sqlite3";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const baglam = await tarayici.newContext({ viewport: { width: 1400, height: 1100 }, locale: "tr-TR" });
const sayfa = await baglam.newPage();
const hatalar = [];
sayfa.on("console", (m) => { if (m.type() === "error") hatalar.push(m.text()); });
sayfa.on("pageerror", (e) => hatalar.push(String(e)));

const sonuclar = [];
function kontrol(ad, gecti, ek = "") {
  sonuclar.push({ ad, gecti, ek });
  console.log(`${gecti ? "✓" : "✗"} ${ad}${ek ? ` — ${ek}` : ""}`);
}

async function giris(kullanici, s = sayfa) {
  await s.context().clearCookies();
  await s.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await s.fill("#kullaniciAdi", kullanici);
  await s.fill("#sifre", SIFRE);
  await Promise.all([s.waitForURL("**/panel", { timeout: 20000 }), s.click('button[type="submit"]')]);
}

const db = new Database((process.env.DATABASE_URL ?? "").replace(/^file:/, ""));
db.pragma("busy_timeout = 5000");
const fiyat = (id) => db.prepare('SELECT alisFiyatiKurus AS k FROM "StokKalemi" WHERE id = ?').get(id).k;
const duzeltmeSayisi = (id) =>
  db.prepare(`SELECT COUNT(*) AS n FROM "StokHareketi" WHERE stokKalemiId = ? AND tip = 'DUZELTME'`).get(id).n;

async function duzelt(yeniFiyat, gerekce, hepsi = false) {
  await sayfa.locator('[data-test="alis-fiyati-duzelt"]').click();
  await sayfa.fill('[data-test="alis-fiyati-girdisi"]', yeniFiyat);
  await sayfa.fill('[data-test="alis-fiyati-gerekce"]', gerekce);
  if (hepsi) await sayfa.check('[data-test="alis-fiyati-hepsi"]');
  await sayfa.click('[data-test="alis-fiyati-formu"] button[type="submit"]');
  await sayfa.waitForTimeout(1500);
}
const metin = async (secici) =>
  (await sayfa.locator(secici).count()) > 0
    ? ((await sayfa.locator(secici).first().textContent()) ?? "").replace(/\s+/g, " ").trim()
    : "";

try {
  // ------------------------------------------------ hazırlık
  const magaza = db.prepare('SELECT id FROM "Magaza" WHERE aktif = 1 ORDER BY kod LIMIT 1').get().id;
  const kategori = db.prepare('SELECT id FROM "Kategori" ORDER BY sira LIMIT 1').get().id;
  const tedarikci = db.prepare('SELECT id FROM "Tedarikci" LIMIT 1').get().id;
  const admin = db.prepare(`SELECT id FROM "Kullanici" WHERE kullaniciAdi = 'admin'`).get().id;
  const simdi = new Date().toISOString().replace("Z", "+00:00");
  const faturaEkle = db.prepare(`INSERT INTO "AlisFaturasi" (faturaNo, faturaTarihi, tedarikciId, magazaId, olusturanId, createdAt) VALUES (?,?,?,?,?,?)`);
  const f1 = faturaEkle.run(`FYT-A-${damga}`, simdi, tedarikci, magaza, admin, simdi).lastInsertRowid;
  const f2 = faturaEkle.run(`FYT-B-${damga}`, simdi, tedarikci, magaza, admin, simdi).lastInsertRowid;
  const ekle = db.prepare(`INSERT INTO "StokKalemi"
    (seriNo, barkod, kategoriId, marka, model, alisFiyatiKurus, girisTarihi, magazaId, durum, alisFaturasiId, satisFiyatiKurus, satisTarihi, aramaMetni, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const cihaz = (i, { barkod = "8683948501789", kurus = 1_000_000, durum = "STOKTA", fatura = f1, satis = null } = {}) =>
    Number(ekle.run(imei(i), barkod, kategori, "FIYATMARKA", "Saat Demo", kurus, simdi, magaza, durum, fatura,
      satis, satis ? simdi : null, `fiyatmarka saat demo ${imei(i)}`, simdi, simdi).lastInsertRowid);

  const hedefCihaz = cihaz(1);
  const kardes1 = cihaz(2);
  const kardes2 = cihaz(3);
  const farkliFiyat = cihaz(4, { kurus: 900_000 }); // ayrıca düzeltilmiş sayılır
  const baskaFatura = cihaz(5, { fatura: f2 });
  const baskaUrun = cihaz(6, { barkod: "9999999999999" });
  const iptalli = cihaz(7, { durum: "IPTAL" });
  const satilan = cihaz(8, { durum: "SATILDI", fatura: f2, barkod: "7777777777777", satis: 1_500_000 });

  // ------------------------------------------------ 1) düğme yalnız yöneticide
  for (const kullanici of ["personel1", "sorumlu1"]) {
    await giris(kullanici);
    await sayfa.goto(`${hedef}/cihazlar/${hedefCihaz}`, { waitUntil: "networkidle" });
    const goruyor = sayfa.url().includes(`/cihazlar/${hedefCihaz}`);
    kontrol(
      `${kullanici} düzeltme düğmesini görmüyor`,
      (await sayfa.locator('[data-test="alis-fiyati-duzelt"]').count()) === 0,
      goruyor ? "sayfa açık, düğme yok" : "sayfayı da göremiyor",
    );
  }

  // ------------------------------------------------ 2) sunucu yöneticiden başkasını reddediyor
  // Form yönetici oturumuyla açılıyor, sonra çerez personelinkiyle
  // değiştirilip gönderiliyor: düğmeyi gizlemek koruma değil.
  const digerBaglam = await tarayici.newContext({ locale: "tr-TR" });
  const digerSayfa = await digerBaglam.newPage();
  await giris("sorumlu1", digerSayfa);
  const sorumluCerezleri = await digerBaglam.cookies();
  await digerBaglam.close();

  await giris("admin");
  await sayfa.goto(`${hedef}/cihazlar/${hedefCihaz}`, { waitUntil: "networkidle" });
  kontrol("yönetici düzeltme düğmesini görüyor", (await sayfa.locator('[data-test="alis-fiyati-duzelt"]').count()) === 1);
  await sayfa.locator('[data-test="alis-fiyati-duzelt"]').click();
  kontrol(
    "form şimdiki fiyatla açılıyor",
    (await sayfa.inputValue('[data-test="alis-fiyati-girdisi"]')) === "10.000,00",
    await sayfa.inputValue('[data-test="alis-fiyati-girdisi"]'),
  );
  await sayfa.fill('[data-test="alis-fiyati-girdisi"]', "1,00");
  await sayfa.fill('[data-test="alis-fiyati-gerekce"]', "yetkisiz deneme");
  await baglam.clearCookies();
  await baglam.addCookies(sorumluCerezleri);
  await sayfa.click('[data-test="alis-fiyati-formu"] button[type="submit"]');
  await sayfa.waitForTimeout(1500);
  kontrol(
    "sorumlu oturumuyla gönderilen düzeltme sunucuda reddediliyor",
    fiyat(hedefCihaz) === 1_000_000 && duzeltmeSayisi(hedefCihaz) === 0,
    `fiyat ${fiyat(hedefCihaz)} · ${await metin('[data-test="alis-fiyati-hata"]')}`,
  );

  // ------------------------------------------------ 3) doğrulama
  await giris("admin");
  await sayfa.goto(`${hedef}/cihazlar/${hedefCihaz}`, { waitUntil: "networkidle" });
  await duzelt("10.000,00", "aynı fiyat denemesi");
  kontrol(
    "aynı fiyat reddediliyor",
    /aynı/.test(await metin('[data-test="alis-fiyati-hata"]')) && duzeltmeSayisi(hedefCihaz) === 0,
    await metin('[data-test="alis-fiyati-hata"]'),
  );
  await sayfa.goto(`${hedef}/cihazlar/${hedefCihaz}`, { waitUntil: "networkidle" });
  await duzelt("abc", "okunamayan fiyat");
  kontrol(
    "okunamayan fiyat reddediliyor",
    /okunamadı/.test(await metin('[data-test="alis-fiyati-hata"]')) && fiyat(hedefCihaz) === 1_000_000,
    await metin('[data-test="alis-fiyati-hata"]'),
  );
  await sayfa.goto(`${hedef}/cihazlar/${hedefCihaz}`, { waitUntil: "networkidle" });
  await duzelt("100.000.000,00", "bir sıfır fazla");
  kontrol(
    "bir sıfır fazla yazılmış fiyat reddediliyor",
    /sıfır fazla/.test(await metin('[data-test="alis-fiyati-hata"]')) && fiyat(hedefCihaz) === 1_000_000,
    await metin('[data-test="alis-fiyati-hata"]'),
  );

  // ------------------------------------------------ 4) tek cihaz
  await sayfa.goto(`${hedef}/cihazlar/${hedefCihaz}`, { waitUntil: "networkidle" });
  kontrol(
    "aynı faturadaki aynı üründen iki cihaz daha sayılıyor",
    (await sayfa.locator('[data-test="alis-fiyati-duzelt"]').click(), await metin('[data-test="alis-fiyati-kardes"]')) === "2",
    await metin('[data-test="alis-fiyati-kardes"]'),
  );
  await sayfa.goto(`${hedef}/cihazlar/${hedefCihaz}`, { waitUntil: "networkidle" });
  await duzelt("11.500,50", "Fatura yanlış girilmiş");
  kontrol("yeni fiyat veritabanına yazıldı", fiyat(hedefCihaz) === 1_150_050, String(fiyat(hedefCihaz)));
  kontrol(
    "başarı mesajı yeni fiyatı söylüyor",
    /11\.500,50 TL/.test(await metin('[data-test="alis-fiyati-basari"]')),
    await metin('[data-test="alis-fiyati-basari"]'),
  );
  kontrol("ekrandaki fiyat güncellendi", (await metin('[data-test="alis-fiyati"]')) === "11.500,50 TL", await metin('[data-test="alis-fiyati"]'));
  kontrol(
    "seçilmedikçe diğer cihazlara dokunulmuyor",
    fiyat(kardes1) === 1_000_000 && fiyat(kardes2) === 1_000_000,
    `${fiyat(kardes1)} / ${fiyat(kardes2)}`,
  );
  const tarihce = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "tarihçede eski fiyat, yeni fiyat ve gerekçe var",
    tarihce.includes("Alış fiyatı düzeltildi: 10.000,00 TL → 11.500,50 TL · gerekçe: Fatura yanlış girilmiş"),
  );
  kontrol("tarihçede tek düzeltme satırı var", duzeltmeSayisi(hedefCihaz) === 1, String(duzeltmeSayisi(hedefCihaz)));

  await sayfa.goto(`${hedef}/ayarlar/loglar?islem=STOK_DUZENLE`, { waitUntil: "networkidle" });
  const loglar = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "düzeltme işlem kaydına geçiyor",
    loglar.includes("Alış fiyatı düzeltildi") && loglar.includes("10.000,00 TL → 11.500,50 TL") && loglar.includes("Fatura yanlış girilmiş"),
  );

  // ------------------------------------------------ 5) aynı faturadaki aynı ürün
  await sayfa.goto(`${hedef}/cihazlar/${kardes1}`, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="alis-fiyati-duzelt"]').click();
  // Hedef cihaz artık farklı fiyatta; kardes1'in yanında yalnız kardes2 kaldı.
  kontrol(
    "fiyatı ayrıca düzeltilmiş cihaz toplu kapsamdan çıkıyor",
    (await metin('[data-test="alis-fiyati-kardes"]')) === "1",
    await metin('[data-test="alis-fiyati-kardes"]'),
  );
  await sayfa.goto(`${hedef}/cihazlar/${kardes1}`, { waitUntil: "networkidle" });
  await duzelt("9.750,00", "Fiyat farkı faturası", true);
  kontrol(
    "seçilince aynı faturadaki aynı ürün birlikte düzeltiliyor",
    fiyat(kardes1) === 975_000 && fiyat(kardes2) === 975_000,
    `${fiyat(kardes1)} / ${fiyat(kardes2)}`,
  );
  kontrol(
    "mesaj kaç cihazın düzeltildiğini söylüyor",
    /2 cihazın alış fiyatı/.test(await metin('[data-test="alis-fiyati-basari"]')),
    await metin('[data-test="alis-fiyati-basari"]'),
  );
  kontrol("fiyatı farklı olan cihaza dokunulmadı", fiyat(farkliFiyat) === 900_000, String(fiyat(farkliFiyat)));
  kontrol("önceden düzeltilen cihazın fiyatı korundu", fiyat(hedefCihaz) === 1_150_050, String(fiyat(hedefCihaz)));
  kontrol("başka faturadaki aynı ürüne dokunulmadı", fiyat(baskaFatura) === 1_000_000, String(fiyat(baskaFatura)));
  kontrol("aynı faturadaki başka ürüne dokunulmadı", fiyat(baskaUrun) === 1_000_000, String(fiyat(baskaUrun)));
  kontrol("iptal edilmiş kayda dokunulmadı", fiyat(iptalli) === 1_000_000, String(fiyat(iptalli)));
  kontrol(
    "her cihazın kendi tarihçesine düzeltme yazıldı",
    duzeltmeSayisi(kardes1) === 1 && duzeltmeSayisi(kardes2) === 1 && duzeltmeSayisi(farkliFiyat) === 0,
    `${duzeltmeSayisi(kardes1)} / ${duzeltmeSayisi(kardes2)} / ${duzeltmeSayisi(farkliFiyat)}`,
  );
  await sayfa.goto(`${hedef}/cihazlar/${kardes2}`, { waitUntil: "networkidle" });
  kontrol(
    "birlikte düzeltilen cihazın sayfasında da görünüyor",
    ((await sayfa.locator("main").textContent()) ?? "").includes("10.000,00 TL → 9.750,00 TL · gerekçe: Fiyat farkı faturası"),
  );

  // ------------------------------------------------ 6) iptal edilmiş kayıt
  await sayfa.goto(`${hedef}/cihazlar/${iptalli}`, { waitUntil: "networkidle" });
  kontrol(
    "iptal edilmiş kayıtta düzeltme düğmesi yok",
    (await sayfa.locator('[data-test="alis-fiyati-duzelt"]').count()) === 0,
  );

  // ------------------------------------------------ 7) satılmış cihaz: kâr yeni fiyata göre
  await sayfa.goto(`${hedef}/cihazlar/${satilan}`, { waitUntil: "networkidle" });
  const oncekiKar = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("düzeltme öncesi kâr 5.000,00 TL", oncekiKar.includes("5.000,00 TL"));
  await duzelt("12.000,00", "Satılan cihazın maliyeti düzeltildi");
  await sayfa.goto(`${hedef}/cihazlar/${satilan}`, { waitUntil: "networkidle" });
  const sonrakiKar = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "satılmış cihazda kâr yeni alış fiyatına göre hesaplanıyor",
    fiyat(satilan) === 1_200_000 && sonrakiKar.includes("3.000,00 TL"),
    String(fiyat(satilan)),
  );

  kontrol("tarayıcı konsolunda hata yok", hatalar.length === 0, hatalar.slice(0, 3).join(" | "));
} catch (hata) {
  kontrol("betik tamamlandı", false, String(hata).slice(0, 300));
} finally {
  db.close();
  await tarayici.close();
}

const basarisiz = sonuclar.filter((s) => !s.gecti);
console.log(`\n${sonuclar.length - basarisiz.length}/${sonuclar.length} kontrol geçti.`);
process.exit(basarisiz.length === 0 ? 0 : 1);
