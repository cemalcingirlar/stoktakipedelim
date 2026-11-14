// Satış kartını düzenleme testi.
//
// Yönetici satış kartından müşteriyi, satışı yapanı, ödeme tipini, tarihi,
// notu ve her cihazın satış fiyatını düzeltebiliyor. Sınananlar:
//   - yetki SUNUCUDA: form yönetici oturumuyla açılıp sorumlu oturumuyla
//     gönderiliyor,
//   - kart ile cihaz satırları birlikte güncelleniyor (raporlar cihaz
//     satırından okuyor),
//   - her düzeltme neyin neyden neye değiştiğiyle işlem kaydına ve ilgili
//     cihazların tarihçesine yazılıyor,
//   - dokunulmayan alanlar (satışın saati, diğer cihazın fiyatı) değişmiyor.
import { chromium } from "@playwright/test";
import Database from "better-sqlite3";
import { gunKaydir } from "./ortak-tarih.mjs";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const baglam = await tarayici.newContext({ viewport: { width: 1400, height: 1200 }, locale: "tr-TR" });
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
const satisOku = (id) => db.prepare('SELECT * FROM "Satis" WHERE id = ?').get(id);
const cihazOku = (id) => db.prepare('SELECT * FROM "StokKalemi" WHERE id = ?').get(id);
const duzeltmeler = (id) =>
  db.prepare(`SELECT aciklama FROM "StokHareketi" WHERE stokKalemiId = ? AND tip = 'DUZELTME' ORDER BY id`).all(id).map((h) => h.aciklama);
const logSayisi = () => db.prepare(`SELECT COUNT(*) AS n FROM "Log" WHERE islem = 'SATIS_DUZENLE'`).get().n;
const sonLog = () => db.prepare(`SELECT detay, kullaniciAdi FROM "Log" WHERE islem = 'SATIS_DUZENLE' ORDER BY id DESC LIMIT 1`).get();

const metin = async (secici) =>
  (await sayfa.locator(secici).count()) > 0
    ? ((await sayfa.locator(secici).first().textContent()) ?? "").replace(/\s+/g, " ").trim()
    : "";
async function formuAc() {
  await sayfa.locator('[data-test="satis-karti-duzenle"]').click();
  await sayfa.waitForSelector('[data-test="satis-karti-formu"]');
}
async function kaydet() {
  await sayfa.click('[data-test="satis-karti-formu"] button[type="submit"]');
  await sayfa.waitForTimeout(1600);
}

try {
  // ------------------------------------------------ hazırlık
  const magaza = db.prepare('SELECT id FROM "Magaza" WHERE aktif = 1 ORDER BY kod LIMIT 1').get().id;
  const kategori = db.prepare('SELECT id FROM "Kategori" ORDER BY sira LIMIT 1').get().id;
  const kul = (ad) => db.prepare('SELECT id, adSoyad FROM "Kullanici" WHERE kullaniciAdi = ?').get(ad);
  const satan1 = kul("personel1");
  const satan2 = kul("sorumlu1");
  // Satışın anı: dün 16:42:07 — saatinin korunduğu bu damgayla sınanıyor.
  const satisAni = new Date(Date.now() - 86_400_000);
  satisAni.setHours(16, 42, 7, 0);
  const an = satisAni.toISOString().replace("Z", "+00:00");
  const musteriEkle = db.prepare('INSERT INTO "Musteri" (adSoyad, telefon, createdAt) VALUES (?,?,?)');
  const m1 = Number(musteriEkle.run(`DUZEN MUSTERI BIR ${damga}`, `0500${damga}`, an).lastInsertRowid);
  const m2 = Number(musteriEkle.run(`DUZEN MUSTERI IKI ${damga}`, `0501${damga}`, an).lastInsertRowid);
  const satisId = Number(
    db.prepare('INSERT INTO "Satis" (satisNo, musteriId, satanKullaniciId, odemeTipi, satisTarihi, createdAt) VALUES (?,?,?,?,?,?)')
      .run(`SAT-DZN-${damga}`, m1, satan1.id, "NAKIT", an, an).lastInsertRowid,
  );
  const ekle = db.prepare(`INSERT INTO "StokKalemi"
    (seriNo, barkod, kategoriId, marka, model, alisFiyatiKurus, girisTarihi, magazaId, durum, satisId, satisTarihi, cikisTarihi,
     satisFiyatiKurus, satanKullaniciId, musteriId, odemeTipi, aramaMetni, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const cihaz = (i, model, satisKurus) =>
    Number(ekle.run(imei(i), "4000000000011", kategori, "DUZENMARKA", model, 500_000, an, magaza, "SATILDI", satisId, an, an,
      satisKurus, satan1.id, m1, "NAKIT", `duzenmarka ${model} ${imei(i)} duzen musteri bir ${damga}`.toLowerCase(), an, an).lastInsertRowid);
  const c1 = cihaz(1, "Fon Bir", 879_750);
  const c2 = cihaz(2, "Fon Iki", 250_000);
  const kart = `${hedef}/satislar/${satisId}`;

  // ------------------------------------------------ 1) düğme yalnız yöneticide
  for (const kullanici of ["personel1", "sorumlu1"]) {
    await giris(kullanici);
    await sayfa.goto(kart, { waitUntil: "networkidle" });
    kontrol(
      `${kullanici} düzenleme düğmesini görmüyor`,
      (await sayfa.locator('[data-test="satis-karti-duzenle"]').count()) === 0,
      sayfa.url().endsWith(`/satislar/${satisId}`) ? "kart açık, düğme yok" : "kartı da göremiyor",
    );
  }

  // ------------------------------------------------ 2) sunucu yöneticiden başkasını reddediyor
  const digerBaglam = await tarayici.newContext({ locale: "tr-TR" });
  const digerSayfa = await digerBaglam.newPage();
  await giris("sorumlu1", digerSayfa);
  const sorumluCerezleri = await digerBaglam.cookies();
  await digerBaglam.close();

  await giris("admin");
  await sayfa.goto(kart, { waitUntil: "networkidle" });
  kontrol("yönetici düzenleme düğmesini görüyor", (await sayfa.locator('[data-test="satis-karti-duzenle"]').count()) === 1);
  await formuAc();
  kontrol(
    "form şimdiki değerlerle açılıyor",
    (await sayfa.inputValue('[data-test="duzen-odeme"]')) === "NAKIT" &&
      (await sayfa.locator('[data-test="duzen-fiyat"]').first().inputValue()) === "8.797,50" &&
      Number(await sayfa.inputValue('[data-test="duzen-musteri"]')) === m1 &&
      Number(await sayfa.inputValue('[data-test="duzen-satan"]')) === satan1.id,
    `${await sayfa.inputValue('[data-test="duzen-odeme"]')} · ${await sayfa.locator('[data-test="duzen-fiyat"]').first().inputValue()}`,
  );
  await sayfa.selectOption('[data-test="duzen-odeme"]', "HAVALE");
  await baglam.clearCookies();
  await baglam.addCookies(sorumluCerezleri);
  await kaydet();
  kontrol(
    "sorumlu oturumuyla gönderilen düzeltme sunucuda reddediliyor",
    satisOku(satisId).odemeTipi === "NAKIT" && cihazOku(c1).odemeTipi === "NAKIT" && logSayisi() === 0,
    `${satisOku(satisId).odemeTipi} · ${await metin('[data-test="satis-karti-hata"]')}`,
  );

  // ------------------------------------------------ 3) değişiklik yokken kayıt yok
  await giris("admin");
  await sayfa.goto(kart, { waitUntil: "networkidle" });
  await formuAc();
  await kaydet();
  kontrol(
    "değişiklik yapılmadan kaydetmek kayıt üretmiyor",
    /Değişiklik yapılmadı/.test(await metin('[data-test="satis-karti-hata"]')) && logSayisi() === 0,
    await metin('[data-test="satis-karti-hata"]'),
  );

  // ------------------------------------------------ 4) ödeme tipi + tek cihazın fiyatı + not
  await sayfa.goto(kart, { waitUntil: "networkidle" });
  await formuAc();
  await sayfa.selectOption('[data-test="duzen-odeme"]', "HAVALE");
  await sayfa.locator('[data-test="duzen-fiyat"]').first().fill("9.000,00");
  kontrol(
    "formdaki toplam yazarken güncelleniyor",
    (await metin('[data-test="duzen-toplam"]')) === "11.500,00 TL",
    await metin('[data-test="duzen-toplam"]'),
  );
  await sayfa.fill('[data-test="duzen-not"]', "Havaleyle ödendi");
  await sayfa.fill('[data-test="duzen-aciklama"]', "Ödeme tipi yanlış seçilmiş");
  await kaydet();

  const s4 = satisOku(satisId);
  const c1d = cihazOku(c1);
  const c2d = cihazOku(c2);
  kontrol(
    "başarı mesajı kayda yazıldığını söylüyor",
    /Satış güncellendi \(3 değişiklik\)/.test(await metin('[data-test="satis-karti-basari"]')),
    await metin('[data-test="satis-karti-basari"]'),
  );
  kontrol("kartın ödeme tipi değişti", s4.odemeTipi === "HAVALE", s4.odemeTipi);
  kontrol(
    "iki cihazın ödeme tipi de değişti",
    c1d.odemeTipi === "HAVALE" && c2d.odemeTipi === "HAVALE",
    `${c1d.odemeTipi} / ${c2d.odemeTipi}`,
  );
  kontrol("fiyatı düzeltilen cihazın fiyatı değişti", c1d.satisFiyatiKurus === 900_000, String(c1d.satisFiyatiKurus));
  kontrol("diğer cihazın fiyatına dokunulmadı", c2d.satisFiyatiKurus === 250_000, String(c2d.satisFiyatiKurus));
  kontrol("satış notu yazıldı", s4.not === "Havaleyle ödendi", String(s4.not));
  kontrol(
    "dokunulmayan satış tarihi saatiyle birlikte korundu",
    new Date(s4.satisTarihi).getTime() === satisAni.getTime() && new Date(c1d.satisTarihi).getTime() === satisAni.getTime(),
    `${s4.satisTarihi} / ${an}`,
  );
  kontrol("müşteri ve satan değişmedi", s4.musteriId === m1 && s4.satanKullaniciId === satan1.id);

  const kartMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "kart yeni değerleri gösteriyor",
    kartMetni.includes("Havale") && kartMetni.includes("9.000,00 TL") && (await metin('[data-test="satis-toplam"]')) === "11.500,00 TL",
    await metin('[data-test="satis-toplam"]'),
  );

  const log4 = sonLog();
  kontrol("düzeltme işlem kaydına yazıldı", logSayisi() === 1, `${logSayisi()} kayıt`);
  kontrol(
    "kayıtta neyin neyden neye değiştiği var",
    log4.detay.includes(`SAT-DZN-${damga}`) &&
      log4.detay.includes("Ödeme tipi: Nakit → Havale") &&
      log4.detay.includes("satış fiyatı: 8.797,50 TL → 9.000,00 TL") &&
      log4.detay.includes('Not: (boş) → "Havaleyle ödendi"') &&
      log4.detay.includes("açıklama: Ödeme tipi yanlış seçilmiş"),
    log4.detay,
  );
  kontrol("kayıtta düzeltmeyi yapan yönetici yazıyor", log4.kullaniciAdi === "admin", log4.kullaniciAdi);

  const t1 = duzeltmeler(c1);
  const t2 = duzeltmeler(c2);
  kontrol(
    "fiyatı değişen cihazın tarihçesinde ödeme ve fiyat var",
    t1.length === 1 && t1[0].includes("Ödeme tipi: Nakit → Havale") && t1[0].includes("Satış fiyatı: 8.797,50 TL → 9.000,00 TL"),
    t1.join(" | "),
  );
  kontrol(
    "diğer cihazın tarihçesinde yalnız ödeme var, fiyat yok",
    t2.length === 1 && t2[0].includes("Ödeme tipi: Nakit → Havale") && !t2[0].includes("Satış fiyatı"),
    t2.join(" | "),
  );

  await sayfa.goto(`${hedef}/ayarlar/loglar?islem=SATIS_DUZENLE`, { waitUntil: "networkidle" });
  const logEkrani = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "kayıt Loglar ekranında 'Satış düzeltti' olarak görünüyor",
    logEkrani.includes("Satış düzeltti") && logEkrani.includes("Ödeme tipi: Nakit → Havale"),
  );
  await sayfa.goto(`${hedef}/cihazlar/${c1}`, { waitUntil: "networkidle" });
  kontrol(
    "düzeltme cihazın sayfasındaki tarihçede görünüyor",
    ((await sayfa.locator("main").textContent()) ?? "").includes("Satış fiyatı: 8.797,50 TL → 9.000,00 TL"),
  );

  // ------------------------------------------------ 5) müşteri, satışı yapan ve tarih
  await sayfa.goto(kart, { waitUntil: "networkidle" });
  await formuAc();
  await sayfa.selectOption('[data-test="duzen-musteri"]', String(m2));
  await sayfa.selectOption('[data-test="duzen-satan"]', String(satan2.id));
  const ucGunOnce = gunKaydir(-3);
  await sayfa.fill('[data-test="duzen-tarih"]', ucGunOnce);
  await kaydet();

  const s5 = satisOku(satisId);
  const c1e = cihazOku(c1);
  const c2e = cihazOku(c2);
  kontrol(
    "müşteri kartta ve iki cihazda değişti",
    s5.musteriId === m2 && c1e.musteriId === m2 && c2e.musteriId === m2,
    `${s5.musteriId} / ${c1e.musteriId} / ${c2e.musteriId}`,
  );
  kontrol(
    "satışı yapan kartta ve iki cihazda değişti",
    s5.satanKullaniciId === satan2.id && c1e.satanKullaniciId === satan2.id && c2e.satanKullaniciId === satan2.id,
  );
  const yeniGun = new Date(s5.satisTarihi);
  kontrol(
    "satış tarihi yeni güne, kart ve cihazlarda aynı ana taşındı",
    s5.satisTarihi === c1e.satisTarihi && c1e.satisTarihi === c2e.satisTarihi && c1e.cikisTarihi === c1e.satisTarihi &&
      Math.abs(yeniGun.getTime() - new Date(`${ucGunOnce}T12:00:00`).getTime()) < 13 * 3_600_000,
    String(s5.satisTarihi),
  );
  kontrol(
    "cihaz yeni müşterinin adıyla aranabiliyor",
    c1e.aramaMetni.includes(`duzen musteri iki ${damga}`) && !c1e.aramaMetni.includes(`duzen musteri bir ${damga}`),
    c1e.aramaMetni,
  );
  kontrol("fiyatlar bu düzeltmede değişmedi", c1e.satisFiyatiKurus === 900_000 && c2e.satisFiyatiKurus === 250_000);
  const log5 = sonLog();
  kontrol(
    "ikinci düzeltme de ayrı bir kayıt olarak yazıldı",
    logSayisi() === 2 &&
      log5.detay.includes(`Müşteri: DUZEN MUSTERI BIR ${damga} → DUZEN MUSTERI IKI ${damga}`) &&
      log5.detay.includes(`Satışı yapan: ${satan1.adSoyad} → ${satan2.adSoyad}`) &&
      log5.detay.includes("Satış tarihi: "),
    log5.detay,
  );
  await sayfa.goto(kart, { waitUntil: "networkidle" });
  const kart5 = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("kart yeni müşteriyi ve satanı gösteriyor", kart5.includes(`DUZEN MUSTERI IKI ${damga}`) && kart5.includes(satan2.adSoyad));

  // ------------------------------------------------ 6) geçersiz girişler
  await formuAc();
  // Tarayıcının "max" denetimi kaldırılıyor: sınanan sunucu.
  await sayfa.evaluate(() => document.querySelector('[data-test="duzen-tarih"]')?.removeAttribute("max"));
  await sayfa.fill('[data-test="duzen-tarih"]', gunKaydir(2));
  await kaydet();
  kontrol(
    "ileri tarih sunucuda reddediliyor",
    /ileri olamaz/.test(await metin('[data-test="satis-karti-hata"]')) && satisOku(satisId).satisTarihi === s5.satisTarihi,
    await metin('[data-test="satis-karti-hata"]'),
  );

  await sayfa.goto(kart, { waitUntil: "networkidle" });
  await formuAc();
  await sayfa.locator('[data-test="duzen-fiyat"]').first().fill("abc");
  kontrol(
    "okunamayan fiyatla kaydet düğmesi kapalı",
    await sayfa.locator('[data-test="satis-karti-formu"] button[type="submit"]').isDisabled(),
  );
  await sayfa.locator('[data-test="duzen-fiyat"]').first().fill("100.000.000,00");
  await kaydet();
  kontrol(
    "bir sıfır fazla yazılmış fiyat sunucuda reddediliyor",
    /sıfır fazla/.test(await metin('[data-test="satis-karti-hata"]')) && cihazOku(c1).satisFiyatiKurus === 900_000,
    await metin('[data-test="satis-karti-hata"]'),
  );
  kontrol("reddedilen denemeler kayıt üretmedi", logSayisi() === 2, `${logSayisi()} kayıt`);

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
