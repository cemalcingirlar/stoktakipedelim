// Mağaza içi aktarım satışını düzeltme ve geri alma testi.
//
// Bildirilen hata (357929731362553, 23.11.2026): aktarım satışının
// düzeltilecek bir yeri yoktu; cihaz sayfasındaki tek seçenek "Kaydı İptal
// Et"ti. Kullanıcı satışı düzeltmek isterken cihazın KENDİSİNİ iptal etti,
// cihaz stoktan düştü ve aktarım ekranı "stokta değil (IPTAL)" dedi.
//
// Sınananlar: senaryonun kendisi (iptal edilen cihaz geri alınabiliyor),
// satışın düzeltilmesi ve geri alınması (yalnız yönetici, sunucuda), her
// işlemin cihazın tarihçesine ve işlem kaydına yazılması, cihazın hiçbir
// adımda stoktan düşmemesi, iptal düğmesinin artık ne yaptığını söylemesi.
import { chromium } from "@playwright/test";
import Database from "better-sqlite3";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const baglam = await tarayici.newContext({ viewport: { width: 1400, height: 1300 }, locale: "tr-TR" });
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
const cihazOku = (id) => db.prepare('SELECT * FROM "StokKalemi" WHERE id = ?').get(id);
const satisOku = (id) => db.prepare('SELECT * FROM "AktarimSatisi" WHERE id = ?').get(id);
const duzeltmeler = (id) =>
  db.prepare(`SELECT aciklama FROM "StokHareketi" WHERE stokKalemiId = ? AND tip = 'DUZELTME' ORDER BY id`).all(id).map((h) => h.aciklama);
const loglar = () =>
  db.prepare(`SELECT detay, kullaniciAdi FROM "Log" WHERE islem = 'SATIS_DUZENLE' AND hedefTip = 'AktarimSatisi' ORDER BY id`).all();
const metin = async (secici) =>
  (await sayfa.locator(secici).count()) > 0
    ? ((await sayfa.locator(secici).first().textContent()) ?? "").replace(/\s+/g, " ").trim()
    : "";

try {
  // ------------------------------------------------ hazırlık
  const [m1, m2] = db.prepare('SELECT id, ad FROM "Magaza" WHERE aktif = 1 ORDER BY kod LIMIT 2').all();
  // Aynı dükkânın iki kaydı: aktarım ekranı ancak böyle açılıyor.
  db.prepare('UPDATE "Magaza" SET dukkanKodu = ? WHERE id IN (?, ?)').run(`DZ${damga}`, m1.id, m2.id);
  const kategori = db.prepare('SELECT id FROM "Kategori" ORDER BY sira LIMIT 1').get().id;
  const kul = (ad) => db.prepare('SELECT id, adSoyad FROM "Kullanici" WHERE kullaniciAdi = ?').get(ad);
  const satan = kul("personel1");
  const admin = kul("admin");
  const dun = new Date(Date.now() - 86_400_000);
  dun.setHours(18, 21, 0, 0);
  const an = dun.toISOString().replace("Z", "+00:00");
  const musteri = Number(db.prepare('INSERT INTO "Musteri" (adSoyad, telefon, createdAt) VALUES (?,?,?)').run(`AKTARIM MUSTERI ${damga}`, `0555${damga}`, an).lastInsertRowid);

  const cihazEkle = (i, alis) =>
    Number(db.prepare(`INSERT INTO "StokKalemi"
      (seriNo, barkod, kategoriId, marka, model, alisFiyatiKurus, girisTarihi, magazaId, durum, aramaMetni, createdAt, updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(imei(i), "8806099359355", kategori, "AKTMARKA", "Galaxy Demo", alis, an, m2.id, "STOKTA",
      `aktmarka galaxy demo ${imei(i)}`, an, an).lastInsertRowid);
  // Gerçek kayıttaki gibi: satış alış fiyatını 17.632,19 -> 16.500,00 çekmiş.
  const satisEkle = (cihaz) =>
    Number(db.prepare(`INSERT INTO "AktarimSatisi"
      (stokKalemiId, magazaId, musteriId, satanKullaniciId, satisFiyatiKurus, maliyetKurus, yeniAlisFiyatiKurus, odemeTipi, satisTarihi, createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(cihaz, m1.id, musteri, satan.id, 1_650_000, 1_763_219, 1_650_000, "NAKIT", an, an).lastInsertRowid);

  const c = cihazEkle(1, 1_650_000);
  const s = satisEkle(c);
  const sayfaYolu = `${hedef}/cihazlar/${c}`;

  // ------------------------------------------------ 1) bildirilen senaryo
  // Cihaz iptal edildi: aktarım ekranı artık ne yapılacağını söylemeli ve
  // iptal geri alınınca cihaz stoğa dönmeli.
  db.prepare(`UPDATE "StokKalemi" SET durum = 'IPTAL' WHERE id = ?`).run(c);
  await giris("admin");
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  await sayfa.selectOption("#kaynak", { label: m2.ad });
  await sayfa.fill("#okutmaKutusu", imei(1));
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1200);
  const aktarimMesaji = ((await sayfa.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
  kontrol(
    "aktarım ekranı iptal edilmiş cihazda ne yapılacağını söylüyor",
    aktarimMesaji.includes(`${imei(1)} iptal edilmiş, aktarılamaz`) && aktarimMesaji.includes("iptali geri alın") && !aktarimMesaji.includes("(IPTAL)"),
    (aktarimMesaji.match(new RegExp(`${imei(1)}[^.]*\\.[^.]*\\.`)) ?? ["(mesaj yok)"])[0],
  );

  await sayfa.goto(sayfaYolu, { waitUntil: "networkidle" });
  await sayfa.click('button:has-text("İptali Geri Al")');
  await sayfa.waitForTimeout(1500);
  kontrol("iptal geri alınınca cihaz stoğa dönüyor", cihazOku(c).durum === "STOKTA", cihazOku(c).durum);
  kontrol("aktarım satışı iptal ve geri almadan etkilenmedi", Boolean(satisOku(s)));

  // ------------------------------------------------ 2) iptal düğmesi ne yaptığını söylüyor
  await sayfa.goto(sayfaYolu, { waitUntil: "networkidle" });
  const iptalKarti = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("iptal kartı 'satışı değil cihazın kendisini' iptal ettiğini söylüyor", iptalKarti.includes("Satışı değil, cihazın kendisini"));
  kontrol("düğme 'Cihazı İptal Et' yazıyor", (await sayfa.locator('[data-test="iptal-ac"]').textContent())?.trim() === "Cihazı İptal Et");
  kontrol(
    "aktarım satışı olan cihazda iptal kartı satış kartına yönlendiriyor",
    /Mağaza İçi Aktarım Satışları/.test(await metin('[data-test="iptal-aktarim-uyarisi"]')),
  );

  // ------------------------------------------------ 3) kart ve yetki
  kontrol("cihaz sayfasında aktarım satışları kartı var", (await sayfa.locator('[data-test="aktarim-satisi"]').count()) === 1);
  kontrol(
    "kart satışın bilgilerini gösteriyor",
    (await metin('[data-test="aktarim-satis-musteri"]')) === `AKTARIM MUSTERI ${damga}` &&
      (await metin('[data-test="aktarim-satis-fiyat"]')) === "16.500,00 TL" &&
      (await metin('[data-test="aktarim-satis-odeme"]')) === "Nakit",
  );

  // m2'de yetkili bir personel bulup kartı ona da gösteriyoruz.
  const sorumlu = db.prepare(`SELECT kullaniciAdi FROM "Kullanici" WHERE rol != 'ADMIN' AND aktif = 1 AND magazaId = ? LIMIT 1`).get(m2.id);
  if (sorumlu) {
    await giris(sorumlu.kullaniciAdi);
    await sayfa.goto(sayfaYolu, { waitUntil: "networkidle" });
    kontrol(
      `${sorumlu.kullaniciAdi} düzelt/geri al düğmelerini görmüyor`,
      (await sayfa.locator('[data-test="aktarim-satis-duzelt"]').count()) === 0 &&
        (await sayfa.locator('[data-test="aktarim-satis-geri-al"]').count()) === 0,
    );
  }

  // Formu yönetici açıyor, personel oturumuyla gönderiliyor: sunucu reddetmeli.
  const diger = await tarayici.newContext({ locale: "tr-TR" });
  const digerSayfa = await diger.newPage();
  await giris("sorumlu1", digerSayfa);
  const sorumluCerez = await diger.cookies();
  await diger.close();

  await giris("admin");
  await sayfa.goto(sayfaYolu, { waitUntil: "networkidle" });
  await sayfa.click('[data-test="aktarim-satis-duzelt"]');
  await sayfa.selectOption('[data-test="aktarim-duzen-odeme"]', "TEMLIK");
  await baglam.clearCookies();
  await baglam.addCookies(sorumluCerez);
  await sayfa.click('[data-test="aktarim-duzelt-formu"] button[type="submit"]');
  await sayfa.waitForTimeout(1500);
  kontrol(
    "yönetici olmayan oturumla düzeltme sunucuda reddediliyor",
    satisOku(s).odemeTipi === "NAKIT" && loglar().length === 0,
    `${satisOku(s).odemeTipi} · ${await metin('[data-test="aktarim-satis-hata"]')}`,
  );

  // ------------------------------------------------ 4) düzeltme
  await giris("admin");
  await sayfa.goto(sayfaYolu, { waitUntil: "networkidle" });
  await sayfa.click('[data-test="aktarim-satis-duzelt"]');
  await sayfa.click('[data-test="aktarim-duzelt-formu"] button[type="submit"]');
  await sayfa.waitForTimeout(1500);
  kontrol(
    "değişiklik yokken kayıt oluşmuyor",
    /Değişiklik yapılmadı/.test(await metin('[data-test="aktarim-satis-hata"]')) && loglar().length === 0,
    await metin('[data-test="aktarim-satis-hata"]'),
  );

  await sayfa.goto(sayfaYolu, { waitUntil: "networkidle" });
  await sayfa.click('[data-test="aktarim-satis-duzelt"]');
  await sayfa.selectOption('[data-test="aktarim-duzen-odeme"]', "TEMLIK");
  await sayfa.fill('[data-test="aktarim-duzen-fiyat"]', "17.000,00");
  await sayfa.fill('[data-test="aktarim-duzen-aciklama"]', "Ödeme tipi yanlış seçilmiş");
  await sayfa.click('[data-test="aktarim-duzelt-formu"] button[type="submit"]');
  await sayfa.waitForTimeout(1600);

  const sd = satisOku(s);
  kontrol("ödeme tipi ve satış fiyatı düzeltildi", sd.odemeTipi === "TEMLIK" && sd.satisFiyatiKurus === 1_700_000, `${sd.odemeTipi} · ${sd.satisFiyatiKurus}`);
  kontrol("satış tarihi saatiyle korundu", new Date(sd.satisTarihi).getTime() === dun.getTime(), String(sd.satisTarihi));
  const cd = cihazOku(c);
  kontrol("düzeltme cihazı stoktan düşürmedi", cd.durum === "STOKTA" && cd.magazaId === m2.id, `${cd.durum}`);
  kontrol("düzeltme alış fiyatına dokunmadı", cd.alisFiyatiKurus === 1_650_000, String(cd.alisFiyatiKurus));
  kontrol(
    "başarı mesajı görünüyor",
    /Satış düzeltildi \(2 değişiklik\)/.test(await metin('[data-test="aktarim-satis-basari"]')),
    await metin('[data-test="aktarim-satis-basari"]'),
  );
  const l1 = loglar();
  kontrol(
    "düzeltme neyden neye değiştiğiyle işlem kaydında",
    l1.length === 1 &&
      l1[0].detay.includes(imei(1)) &&
      l1[0].detay.includes("Ödeme tipi: Nakit → Temlik") &&
      l1[0].detay.includes("Satış fiyatı: 16.500,00 TL → 17.000,00 TL") &&
      l1[0].detay.includes("açıklama: Ödeme tipi yanlış seçilmiş") &&
      l1[0].kullaniciAdi === "admin",
    l1.map((l) => l.detay).join(" | "),
  );
  kontrol(
    "düzeltme cihazın tarihçesinde",
    duzeltmeler(c).some((d) => d.startsWith("Mağaza içi aktarım satışı düzeltildi: Ödeme tipi: Nakit → Temlik")),
  );
  await sayfa.goto(`${hedef}/ayarlar/loglar?islem=SATIS_DUZENLE`, { waitUntil: "networkidle" });
  kontrol(
    "Loglar ekranında 'Satış düzeltti' olarak görünüyor",
    ((await sayfa.locator("main").textContent()) ?? "").includes("Mağaza içi aktarım satışı düzeltildi"),
  );

  // ------------------------------------------------ 5) geri alma
  await sayfa.goto(sayfaYolu, { waitUntil: "networkidle" });
  await sayfa.click('[data-test="aktarim-satis-geri-al"]');
  await sayfa.fill('[data-test="aktarim-geri-gerekce"]', "abc");
  await sayfa.evaluate(() => document.querySelector('[data-test="aktarim-geri-gerekce"]')?.removeAttribute("minlength"));
  await sayfa.click('[data-test="aktarim-geri-formu"] button[type="submit"]');
  await sayfa.waitForTimeout(1400);
  kontrol(
    "kısa gerekçe sunucuda reddediliyor",
    /en az/.test(await metin('[data-test="aktarim-satis-hata"]')) && Boolean(satisOku(s)),
    await metin('[data-test="aktarim-satis-hata"]'),
  );

  await sayfa.fill('[data-test="aktarim-geri-gerekce"]', "Satış yanlış girilmiş");
  await sayfa.click('[data-test="aktarim-geri-formu"] button[type="submit"]');
  await sayfa.waitForTimeout(1600);
  const cg = cihazOku(c);
  kontrol("aktarım satışı silindi", !satisOku(s));
  kontrol("cihaz stokta kaldı", cg.durum === "STOKTA" && cg.magazaId === m2.id, cg.durum);
  kontrol("alış fiyatı satış öncesine döndü (16.500,00 → 17.632,19)", cg.alisFiyatiKurus === 1_763_219, String(cg.alisFiyatiKurus));
  const l2 = loglar();
  kontrol(
    "geri alma işlem kaydında",
    l2.length === 2 &&
      l2[1].detay.includes("Mağaza içi aktarım satışı geri alındı") &&
      l2[1].detay.includes("17.000,00 TL") &&
      l2[1].detay.includes("alış fiyatı 16.500,00 TL → 17.632,19 TL") &&
      l2[1].detay.includes("gerekçe: Satış yanlış girilmiş"),
    l2.map((l) => l.detay).join(" | "),
  );
  kontrol(
    "geri alma cihazın tarihçesinde",
    duzeltmeler(c).some((d) => d.startsWith("Mağaza içi aktarım satışı geri alındı")),
  );
  await sayfa.goto(sayfaYolu, { waitUntil: "networkidle" });
  kontrol("satış kalmayınca kart kalkıyor", (await sayfa.locator('[data-test="aktarim-satislari"]').count()) === 0);
  kontrol("iptal kartındaki aktarım uyarısı da kalkıyor", (await sayfa.locator('[data-test="iptal-aktarim-uyarisi"]').count()) === 0);

  // ------------------------------------------------ 6) fiyat sonradan değiştiyse dokunulmuyor
  const c2 = cihazEkle(2, 1_650_000);
  const s2 = satisEkle(c2);
  db.prepare('UPDATE "StokKalemi" SET alisFiyatiKurus = ? WHERE id = ?').run(1_600_000, c2);
  await sayfa.goto(`${hedef}/cihazlar/${c2}`, { waitUntil: "networkidle" });
  await sayfa.click('[data-test="aktarim-satis-geri-al"]');
  await sayfa.fill('[data-test="aktarim-geri-gerekce"]', "Satış yanlış girilmiş");
  await sayfa.click('[data-test="aktarim-geri-formu"] button[type="submit"]');
  await sayfa.waitForTimeout(1600);
  kontrol(
    "alış fiyatı sonradan elle değiştiyse geri almada korunuyor",
    !satisOku(s2) && cihazOku(c2).alisFiyatiKurus === 1_600_000,
    String(cihazOku(c2).alisFiyatiKurus),
  );
  kontrol(
    "neden dokunulmadığı kayda yazılıyor",
    duzeltmeler(c2).some((d) => d.includes("ayrıca değiştirilmiş; dokunulmadı")),
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
