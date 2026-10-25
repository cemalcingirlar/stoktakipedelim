// İşlem loglarının arşivlenmesi testi.
//
// Log tablosu hiç küçülmüyordu. "Ekran yavaşlar" korkusu ÖLÇÜLDÜ ve çıkmadı:
// 500 bin kayıtta 139–262 ms, 3 milyon kayıtta 221–463 ms. Asıl maliyet
// veritabanı dosyası (satır başına ~205 bayt, 3 milyon kayıt 555 MB) —
// çünkü veritabanı her gün yedekleniyor.
//
// Arşivleme bu yüzden iki adımlı: önce CSV indir, sonra indirilen aralığı sil.
// Test asıl kuralı sınıyor: indirilmemiş kayıt SİLİNEMEZ, ve silme işleminin
// kendisi loga yazılır.
import { chromium } from "@playwright/test";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/log-arsivi";
const SIFRE = "Stok2026!";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const baglam = await tarayici.newContext({
  viewport: { width: 1500, height: 1100 },
  locale: "tr-TR",
  acceptDownloads: true,
});
const sayfa = await baglam.newPage();
const hatalar = [];
sayfa.on("console", (m) => {
  // Test bilerek yetkisiz (403) ve geçersiz (400) istek yapıyor; tarayıcının
  // bunları konsola yazması hata değil.
  if (m.type() === "error" && !/status of (400|403)/.test(m.text())) {
    hatalar.push(m.text());
  }
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

const klasor = await mkdtemp(join(tmpdir(), "log-arsivi-"));

/**
 * Eski log kaydı üretir.
 *
 * Bu betik tek istisnayla veritabanına doğrudan yazıyor: arşivlemenin asıl
 * işi "eski kayıtları sil" ve uygulamada kaydı geriye tarihlendirmenin yolu
 * yok. Beş yıl beklemek yerine beş satır ekleniyor. Yazılan tablo yalnız
 * Log; test kendi yalıtılmış veritabanında koşuyor (e2e-kos.sh).
 */
const ESKI_ADET = 5;
function eskiLoglariEkle() {
  const url = process.env.DATABASE_URL ?? "";
  const yol = url.replace(/^file:/, "");
  const db = new Database(yol);
  const ekle = db.prepare(
    "INSERT INTO Log (kullaniciId, kullaniciAdi, islem, hedefTip, hedefId, detay, ip, tarih) VALUES (?,?,?,?,?,?,?,?)",
  );
  const uc = new Date();
  uc.setFullYear(uc.getFullYear() - 3);
  for (let i = 0; i < ESKI_ADET; i += 1) {
    const tarih = new Date(uc.getTime() - i * 86_400_000).toISOString();
    // Detayda bilerek noktalı virgül ve tırnak var: CSV kaçışı da sınansın.
    ekle.run(null, "admin", "GIRIS_YAP", "Kullanici", i, `Eski kayıt ${i}; 12" ekran`, "127.0.0.1", tarih);
  }
  const kalan = db.prepare("SELECT COUNT(*) n FROM Log").get().n;
  db.close();
  return kalan;
}

/** Tablodaki toplam ve eski kayıt sayısı. */
function logSayilari() {
  const db = new Database((process.env.DATABASE_URL ?? "").replace(/^file:/, ""), {
    readonly: true,
  });
  const sinir = new Date();
  sinir.setFullYear(sinir.getFullYear() - 2);
  const toplam = db.prepare("SELECT COUNT(*) n FROM Log").get().n;
  const eski = db
    .prepare("SELECT COUNT(*) n FROM Log WHERE tarih < ?")
    .get(sinir.toISOString()).n;
  db.close();
  return { toplam, eski };
}

try {
  await giris("admin");
  const toplamKayit = eskiLoglariEkle();
  kontrol("hazırlık: 3 yıl öncesine ait kayıtlar eklendi", toplamKayit >= ESKI_ADET, `${toplamKayit} kayıt`);

  await sayfa.goto(`${hedef}/ayarlar/loglar`, { waitUntil: "networkidle" });
  const arsivlenebilirMetni = ((await sayfa.locator('[data-test="arsivlenebilir"]').textContent()) ?? "").trim();
  kontrol(
    "kart kaç kaydın sınırdan eski olduğunu yazıyor",
    arsivlenebilirMetni.includes(String(ESKI_ADET)),
    arsivlenebilirMetni,
  );

  // =============================== 1) Arşiv kartı
  kontrol("log ekranında arşiv kartı var", (await sayfa.locator('[data-test="log-arsivi"]').count()) === 1);
  const boyutMetni = ((await sayfa.locator('[data-test="log-boyutu"]').textContent()) ?? "")
    .replace(/\s+/g, " ")
    .trim();
  kontrol("kart toplam kayıt ve tahmini boyutu yazıyor", /kayıt/.test(boyutMetni) && /(KB|MB)/.test(boyutMetni), boyutMetni.slice(0, 110));
  kontrol(
    "arşiv sınırı seçilebiliyor",
    (await sayfa.locator('[data-test="arsiv-yil"] option').count()) >= 3,
  );

  // =============== 2) İndirilmemiş kayıt silinemez (asıl kural)
  await sayfa.locator('[data-test="arsiv-sil-ac"]').click();
  await sayfa.waitForTimeout(300);
  await sayfa.locator('[data-test="arsiv-silme-formu"] button[type="submit"]').click();
  await sayfa.waitForTimeout(2000);
  const engel = ((await sayfa.locator('[data-test="arsiv-hata"]').textContent()) ?? "").trim();
  kontrol("indirilmemiş aralık silinemiyor", /indirin/.test(engel), engel);

  // =============================== 3) Arşiv indiriliyor
  const [indirme] = await Promise.all([
    sayfa.waitForEvent("download", { timeout: 30000 }),
    sayfa.locator('[data-test="arsiv-indir"]').click(),
  ]);
  const yol = join(klasor, "arsiv.csv");
  await indirme.saveAs(yol);
  const icerik = readFileSync(yol, "utf8");
  kontrol(
    "dosya adı arşiv sınırını taşıyor",
    /stok-log-arsivi-\d{8}-oncesi\.csv/.test(indirme.suggestedFilename()),
    indirme.suggestedFilename(),
  );
  kontrol("CSV başlık satırıyla geliyor", icerik.includes("Kayıt No;Tarih;Kullanıcı"), icerik.slice(0, 60).replace(/﻿/, ""));
  kontrol(
    "Excel'in Türkçe harfleri okuması için BOM var",
    icerik.charCodeAt(0) === 0xfeff,
  );

  const satirlar = icerik.trim().split(/\r?\n/);
  kontrol(
    "arşiv dosyasında eski kayıtların hepsi var",
    satirlar.length === ESKI_ADET + 1,
    `${satirlar.length} satır (1 başlık + ${ESKI_ADET})`,
  );
  kontrol(
    "detaydaki noktalı virgül ve tırnak kaçırılmış",
    icerik.includes('"Eski kayıt 0; 12"" ekran"'),
    (icerik.match(/.{0,36}ekran.{0,6}/) ?? [""])[0],
  );

  // =============================== 4) İndirme loglanıyor
  await sayfa.goto(`${hedef}/ayarlar/loglar?islem=LOG_ARSIVLE`, { waitUntil: "networkidle" });
  const logMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("arşiv indirme loga yazıldı", /Log arşivledi/.test(logMetni));
  kontrol("log satırı kaç kayıt arşivlendiğini yazıyor", /kayıt arşivlendi/.test(logMetni), (logMetni.match(/.{0,30}kayıt arşivlendi.{0,25}/) ?? [""])[0]);

  // =============== 5) İndirildikten sonra silme çalışıyor
  await sayfa.goto(`${hedef}/ayarlar/loglar`, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="arsiv-sil-ac"]').click();
  await sayfa.waitForTimeout(300);
  await sayfa.locator('[data-test="arsiv-silme-formu"] button[type="submit"]').click();
  await sayfa.waitForTimeout(2500);
  const silmeSonucu =
    ((await sayfa.locator('[data-test="arsiv-basari"]').count()) > 0
      ? await sayfa.locator('[data-test="arsiv-basari"]').textContent()
      : await sayfa.locator('[data-test="arsiv-hata"]').textContent()) ?? "";
  kontrol(
    "indirilen aralık silinebiliyor",
    new RegExp(`${ESKI_ADET} eski kayıt silindi`).test(silmeSonucu),
    silmeSonucu.trim(),
  );

  // Asıl ölçüm veritabanında: eski kayıtlar gitti, yeniler durdu.
  const sayilar = logSayilari();
  kontrol("eski kayıtlar tablodan silindi", sayilar.eski === 0, `${sayilar.eski} eski kayıt kaldı`);
  kontrol(
    "yeni kayıtlara dokunulmadı",
    sayilar.toplam > 0,
    `${sayilar.toplam} kayıt duruyor`,
  );

  // Silme işleminin kendisi loga yazılmalı: "kayıtlar sessizce kaybolmaz".
  await sayfa.goto(`${hedef}/ayarlar/loglar?islem=LOG_ARSIVLE`, { waitUntil: "networkidle" });
  const silmeLogu = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "silme işlemi loga yazıldı",
    new RegExp(`${ESKI_ADET} arşivlenmiş kayıt silindi`).test(silmeLogu),
    (silmeLogu.match(/.{0,20}arşivlenmiş kayıt silindi.{0,25}/) ?? [""])[0],
  );

  // İkinci kez silme: arşiv kaydı tüketildiği için reddedilmeli.
  await sayfa.goto(`${hedef}/ayarlar/loglar`, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="arsiv-sil-ac"]').click();
  await sayfa.waitForTimeout(300);
  await sayfa.locator('[data-test="arsiv-silme-formu"] button[type="submit"]').click();
  await sayfa.waitForTimeout(2000);
  const ikinciSilme = ((await sayfa.locator('[data-test="arsiv-hata"]').textContent()) ?? "").trim();
  kontrol("aynı arşivle ikinci kez silinemiyor", /indirin/.test(ikinciSilme), ikinciSilme);

  // =============================== 6) Personel erişemez
  await giris("personel1");
  // sayfa.request oturum çerezini taşımıyor; uca sayfa üzerinden gidiliyor
  // ki gerçek kullanıcı denemesiyle aynı olsun.
  const cevap = await sayfa.goto(`${hedef}/ayarlar/loglar/arsiv?yil=2`);
  kontrol("personel arşiv ucunu çağıramıyor", cevap?.status() === 403, `HTTP ${cevap?.status()}`);

  await sayfa.goto(`${hedef}/ayarlar/loglar`, { waitUntil: "networkidle" });
  kontrol("personel log ekranına giremiyor", !sayfa.url().includes("/loglar"), sayfa.url());

  // =============================== 7) Geçersiz sınır reddediliyor
  await giris("admin");
  const gecersiz = await sayfa.goto(`${hedef}/ayarlar/loglar/arsiv?yil=0`);
  kontrol(
    "bir yıldan yakın sınır reddediliyor",
    gecersiz?.status() === 400,
    `HTTP ${gecersiz?.status()}`,
  );

  await sayfa.screenshot({ path: `${cikti}-son.png`, fullPage: true });
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
