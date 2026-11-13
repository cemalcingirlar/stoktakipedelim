// Günlük stok listesi (Excel) testi.
//
// Her gece yedekle birlikte Drive'a bir stok listesi yükleniyor. Drive test
// ortamında yok; aynı dosya yedekleme ekranından indirilebildiği için içerik
// burada, indirilen gerçek dosya açılarak sınanıyor: hangi cihazlar giriyor
// (satılan ve iptal girmemeli), sayfalar ve toplamlar doğru mu, seri numarası
// metin olarak mı yazılıyor (Excel 15 haneli IMEI'yi sayıya çevirip bozmasın),
// ve dosyayı yöneticiden başkası alabiliyor mu.
import { chromium } from "@playwright/test";
import Database from "better-sqlite3";
import ExcelJS from "exceljs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1400, height: 1000 }, locale: "tr-TR" });
const hatalar = [];
sayfa.on("console", (m) => { if (m.type() === "error") hatalar.push(m.text()); });
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
  await Promise.all([sayfa.waitForURL("**/panel", { timeout: 20000 }), sayfa.click('button[type="submit"]')]);
}

/** Sayfadaki başlık satırını bulur ve altındaki veri satırlarını nesne olarak döner. */
function tabloOku(sayfaExcel, ilkBaslik) {
  let baslikNo = 0;
  sayfaExcel.eachRow((satir, no) => {
    if (!baslikNo && satir.getCell(1).value === ilkBaslik) baslikNo = no;
  });
  if (!baslikNo) return { basliklar: [], satirlar: [] };
  const basliklar = [];
  sayfaExcel.getRow(baslikNo).eachCell((h, i) => { basliklar[i] = String(h.value); });
  const satirlar = [];
  sayfaExcel.eachRow((satir, no) => {
    if (no <= baslikNo) return;
    const kayit = {};
    basliklar.forEach((b, i) => { if (b) kayit[b] = satir.getCell(i).value; });
    satirlar.push(kayit);
  });
  return { basliklar: basliklar.filter(Boolean), satirlar };
}

try {
  // ------------------------------------------------ hazırlık: cihazlar
  // Doğrudan veritabanına: her durumdan bir cihaz gerekli ve iptal/arızalı
  // durumlarını ekrandan üretmek bu testin konusu değil.
  const db = new Database((process.env.DATABASE_URL ?? "").replace(/^file:/, ""));
  db.pragma("busy_timeout = 5000");
  const magazalar = db.prepare('SELECT id, ad FROM "Magaza" WHERE aktif = 1 ORDER BY kod').all();
  const kategori = db.prepare('SELECT id FROM "Kategori" ORDER BY sira LIMIT 1').get().id;
  const simdi = new Date().toISOString().replace("Z", "+00:00");
  const ekle = db.prepare(`INSERT INTO "StokKalemi"
    (seriNo, barkod, kategoriId, marka, model, alisFiyatiKurus, girisTarihi, magazaId, durum, "not", aramaMetni, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const cihaz = (i, magaza, durum, marka, model, kurus, not = null) =>
    ekle.run(imei(i), "4000000000011", kategori, marka, model, kurus, simdi, magaza.id, durum, not,
      `${marka} ${model} ${imei(i)}`.toLowerCase(), simdi, simdi);

  const [m1, m2] = magazalar;
  cihaz(1, m1, "STOKTA", "LISTEMARKA", "Fon 10", 1_000_000);
  cihaz(2, m1, "STOKTA", "LISTEMARKA", "Fon 10", 1_000_000);
  cihaz(3, m2, "STOKTA", "listemarka", "fon 10", 1_250_050, "=1+1");
  cihaz(4, m2, "TRANSFERDE", "LISTEMARKA", "Fon 20", 2_000_000);
  cihaz(5, m1, "ARIZALI", "LISTEMARKA", "Fon 30", 500_000);
  cihaz(6, m1, "IADE", "LISTEMARKA", "Fon 30", 500_000);
  cihaz(7, m1, "SATILDI", "LISTEMARKA", "Satilan Fon", 9_000_000);
  cihaz(8, m1, "IPTAL", "LISTEMARKA", "Iptal Fon", 9_000_000);

  const beklenen = db.prepare(
    `SELECT COUNT(*) AS adet, COALESCE(SUM(alisFiyatiKurus), 0) AS kurus FROM "StokKalemi"
     WHERE durum IN ('STOKTA','TRANSFERDE','IADE','ARIZALI')`,
  ).get();
  db.close();

  // ------------------------------------------------ 1) yetki
  const cerezsiz = await sayfa.request.get(`${hedef}/ayarlar/yedekleme/stok-listesi`, { maxRedirects: 0 });
  kontrol("oturumsuz istek dosyayı alamıyor", cerezsiz.status() !== 200, `HTTP ${cerezsiz.status()}`);

  await giris("personel1");
  const personel = await sayfa.request.get(`${hedef}/ayarlar/yedekleme/stok-listesi`, { maxRedirects: 0 });
  kontrol(
    "personel stok listesini indiremiyor",
    personel.status() === 403,
    `HTTP ${personel.status()}`,
  );

  // ------------------------------------------------ 2) ekran
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/yedekleme`, { waitUntil: "networkidle" });
  const durum = ((await sayfa.locator('[data-test="stok-listesi-durumu"]').textContent()) ?? "").replace(/\s+/g, " ");
  kontrol("yedekleme ekranında stok listesi satırı var", /Henüz yüklenmedi|cihaz|Yüklenemedi/.test(durum), durum.trim());
  kontrol(
    "indirme bağlantısı var",
    (await sayfa.locator('[data-test="stok-listesi-indir"]').count()) === 1,
  );

  // ------------------------------------------------ 3) dosya
  const cevap = await sayfa.request.get(`${hedef}/ayarlar/yedekleme/stok-listesi`);
  kontrol("yönetici dosyayı indiriyor", cevap.status() === 200, `HTTP ${cevap.status()}`);
  const basliklar = cevap.headers();
  kontrol(
    "içerik türü Excel",
    (basliklar["content-type"] ?? "").includes("spreadsheetml"),
    basliklar["content-type"] ?? "",
  );
  kontrol(
    "dosya adı günü taşıyor",
    /stok-listesi-\d{4}-\d{2}-\d{2}\.xlsx/.test(basliklar["content-disposition"] ?? ""),
    basliklar["content-disposition"] ?? "",
  );

  const kitap = new ExcelJS.Workbook();
  await kitap.xlsx.load(await cevap.body());
  const adlar = kitap.worksheets.map((w) => w.name);
  kontrol(
    "üç sayfa var: liste, mağaza özeti, ürün özeti",
    JSON.stringify(adlar) === JSON.stringify(["Stok", "Mağaza Özeti", "Ürün Özeti"]),
    adlar.join(" | "),
  );

  const liste = tabloOku(kitap.getWorksheet("Stok"), "Mağaza");
  kontrol(
    "liste elde olan bütün cihazları taşıyor",
    liste.satirlar.length === beklenen.adet,
    `${liste.satirlar.length} satır (${beklenen.adet} bekleniyor)`,
  );
  const bizim = liste.satirlar.filter((s) => String(s["Marka"]).toLowerCase() === "listemarka");
  kontrol("eklenen altı cihaz listede", bizim.length === 6, `${bizim.length}`);
  const modeller = bizim.map((s) => String(s["Model"]));
  kontrol(
    "satılan ve iptal edilen cihaz listede yok",
    !modeller.includes("Satilan Fon") && !modeller.includes("Iptal Fon"),
    modeller.join(", "),
  );
  const durumlar = new Set(bizim.map((s) => s["Durum"]));
  kontrol(
    "transferde, arızalı ve iade durumları Türkçe yazıyor",
    durumlar.has("Transferde") && durumlar.has("Arızalı") && durumlar.has("İade") && durumlar.has("Stokta"),
    [...durumlar].join(", "),
  );

  const ilk = bizim.find((s) => s["Seri No / IMEI"] === imei(1));
  kontrol("seri numarası metin olarak yazılmış", typeof ilk?.["Seri No / IMEI"] === "string", typeof ilk?.["Seri No / IMEI"]);
  kontrol("seri numarası hane kaybetmemiş", ilk?.["Seri No / IMEI"] === imei(1), String(ilk?.["Seri No / IMEI"]));
  kontrol("barkod metin olarak yazılmış", typeof ilk?.["Barkod"] === "string", typeof ilk?.["Barkod"]);
  kontrol(
    "alış fiyatı sayı ve TL cinsinden",
    ilk?.["Alış Fiyatı (TL)"] === 10000,
    String(ilk?.["Alış Fiyatı (TL)"]),
  );
  const formullu = bizim.find((s) => s["Seri No / IMEI"] === imei(3));
  kontrol(
    "formül gibi başlayan not hesaplanmıyor, metin kalıyor",
    formullu?.["Not"] === "=1+1",
    JSON.stringify(formullu?.["Not"]),
  );
  kontrol(
    "liste mağaza sırasıyla geliyor",
    liste.satirlar.map((s) => String(s["Mağaza"])).join("|") ===
      [...liste.satirlar.map((s) => String(s["Mağaza"]))].sort((a, b) => a.localeCompare(b, "tr", { numeric: true })).join("|"),
  );

  // ---- mağaza özeti
  const ozet = tabloOku(kitap.getWorksheet("Mağaza Özeti"), "Mağaza");
  const toplam = ozet.satirlar.find((s) => s["Mağaza"] === "TOPLAM");
  kontrol("mağaza özetinde toplam satırı var", Boolean(toplam));
  kontrol(
    "toplam adet listedeki cihaz sayısına eşit",
    toplam?.["Adet"] === beklenen.adet,
    `${toplam?.["Adet"]} / ${beklenen.adet}`,
  );
  kontrol(
    "toplam değer veritabanındaki toplamla aynı",
    Math.round(Number(toplam?.["Toplam Alış Değeri (TL)"]) * 100) === beklenen.kurus,
    `${toplam?.["Toplam Alış Değeri (TL)"]} TL / ${beklenen.kurus} kuruş`,
  );
  const magazaToplami = ozet.satirlar
    .filter((s) => s["Mağaza"] !== "TOPLAM")
    .reduce((t, s) => t + Number(s["Adet"]), 0);
  kontrol("mağaza satırları toplamı veriyor", magazaToplami === beklenen.adet, `${magazaToplami}`);

  // ---- ürün özeti
  const urunler = tabloOku(kitap.getWorksheet("Ürün Özeti"), "Marka");
  const fon10 = urunler.satirlar.filter((s) => String(s["Model"]).toLowerCase() === "fon 10");
  kontrol(
    "harf büyüklüğü farkı ürünü ikiye bölmüyor",
    fon10.length === 1 && fon10[0]["Adet"] === 3,
    fon10.map((s) => `${s["Marka"]} ${s["Model"]}: ${s["Adet"]}`).join(" · "),
  );
  kontrol(
    "ürün özeti tutarı topluyor",
    fon10[0]?.["Toplam Alış Değeri (TL)"] === 32500.5,
    String(fon10[0]?.["Toplam Alış Değeri (TL)"]),
  );

  // ---- indirme kayda geçiyor
  await sayfa.goto(`${hedef}/ayarlar/loglar?islem=EXCEL_AKTAR`, { waitUntil: "networkidle" });
  const loglar = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("indirme denetim kaydına geçiyor", loglar.includes("Günlük stok listesi elle indirildi"));

  // ------------------------------------------------ 4) Drive'a yükleme akışı
  // Gerçek Drive yok; akış sahte bir istemciyle koşturuluyor (ayrı süreçte,
  // çünkü uygulamanın sunucu modüllerini içe alıyor).
  const kok = join(dirname(fileURLToPath(import.meta.url)), "..");
  let drive = null;
  try {
    const ham = execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", join(kok, "betikler", "stok-listesi-drive-sinamasi.mts")],
      { cwd: kok, env: process.env, encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"] },
    );
    drive = JSON.parse(ham.split("\n").find((l) => l.startsWith("SONUC "))?.slice(6) ?? "null");
  } catch (hata) {
    kontrol("Drive akışı sınaması çalıştı", false, String(hata.stderr ?? hata).slice(-300));
  }

  if (drive) {
    const { ilk, rotasyon, hata } = drive;
    kontrol("klasör yokken 'Stok Listeleri' klasörü açılıyor", ilk.klasorAdi === "Stok Listeleri", String(ilk.klasorAdi));
    kontrol("klasör yedek klasörünün içinde açılıyor", JSON.stringify(ilk.klasorUstu) === '["ust-klasor"]', JSON.stringify(ilk.klasorUstu));
    kontrol("dosya o klasöre, günün adıyla yükleniyor", ilk.dosyaKlasorde && ilk.dosyaAdi === "stok-listesi-2026-11-13.xlsx", String(ilk.dosyaAdi));
    kontrol("yüklenen dosya boş değil", ilk.bayt > 2000 && ilk.sonuc.boyutBayt === ilk.bayt, `${ilk.bayt} bayt`);
    kontrol(
      "sonuç cihaz sayısını bildiriyor",
      ilk.sonuc.basarili && ilk.sonuc.cihazSayisi === beklenen.adet,
      `${ilk.sonuc.cihazSayisi} / ${beklenen.adet}`,
    );
    kontrol("ilk yüklemede hiçbir dosya silinmiyor", ilk.silinen.length === 0, ilk.silinen.join(","));
    kontrol(
      "başarılı yükleme kaydediliyor",
      ilk.kayit?.basarili === true && ilk.kayit?.cihazSayisi === beklenen.adet,
      JSON.stringify(ilk.kayit),
    );

    kontrol("var olan klasör yeniden açılmıyor", rotasyon.klasorSayisi === 1, `${rotasyon.klasorSayisi} klasör`);
    kontrol(
      "30 günden eskiler ve bugünün eski kopyası siliniyor",
      JSON.stringify(rotasyon.silinen) === JSON.stringify(["bugun-eski", "gun-30", "gun-31"]),
      rotasyon.silinen.join(", "),
    );
    kontrol("geriye tam 30 günlük liste kalıyor", rotasyon.kalanListe === 30, `${rotasyon.kalanListe}`);
    kontrol(
      "bugünün yeni dosyası duruyor",
      rotasyon.bugununDosyasi.length === 1 && rotasyon.bugununDosyasi[0].startsWith("yeni-"),
      rotasyon.bugununDosyasi.join(", "),
    );
    kontrol("klasördeki başka dosyaya dokunulmuyor", rotasyon.yabanciDuruyor === true);
    kontrol("veritabanı yedeğine dokunulmuyor", rotasyon.yedekDuruyor === true);

    kontrol(
      "yükleme hatası sonuçta bildiriliyor, hata fırlamıyor",
      hata.sonuc.basarili === false && /kotası doldu/.test(hata.sonuc.hata ?? ""),
      JSON.stringify(hata.sonuc),
    );
    kontrol("yükleme başarısızken eski liste silinmiyor", hata.silinen.length === 0, hata.silinen.join(","));
    kontrol(
      "başarısızlık kaydediliyor",
      hata.kayit?.basarili === false && /kotası doldu/.test(hata.kayit?.hata ?? ""),
      JSON.stringify(hata.kayit),
    );

    // Kayıt başarısızken yönetici hem yedekleme ekranında hem panelde görmeli.
    await sayfa.goto(`${hedef}/ayarlar/yedekleme`, { waitUntil: "networkidle" });
    const sonDurum = ((await sayfa.locator('[data-test="stok-listesi-durumu"]').textContent()) ?? "").replace(/\s+/g, " ");
    kontrol("yedekleme ekranı yüklenemediğini söylüyor", /Yüklenemedi: .*kotası doldu/.test(sonDurum), sonDurum.trim());
    await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
    const uyari = sayfa.locator('[data-test="sistem-uyarisi-stok-listesi"]');
    const uyariMetni = (await uyari.count()) > 0 ? ((await uyari.textContent()) ?? "") : "";
    kontrol(
      "yönetici panelinde stok listesi uyarısı çıkıyor",
      /stok listesi.*yüklenemedi/i.test(uyariMetni) && /kotası doldu/.test(uyariMetni),
      uyariMetni.replace(/\s+/g, " ").slice(0, 100) || "(uyarı yok)",
    );
    await giris("personel1");
    kontrol(
      "personel bu uyarıyı görmüyor",
      (await sayfa.locator('[data-test="sistem-uyarisi-stok-listesi"]').count()) === 0,
    );
  }

  kontrol("tarayıcı konsolunda hata yok", hatalar.length === 0, hatalar.slice(0, 3).join(" | "));
} catch (hata) {
  kontrol("betik tamamlandı", false, String(hata).slice(0, 300));
} finally {
  await tarayici.close();
}

const basarisiz = sonuclar.filter((s) => !s.gecti);
console.log(`\n${sonuclar.length - basarisiz.length}/${sonuclar.length} kontrol geçti.`);
process.exit(basarisiz.length === 0 ? 0 : 1);
