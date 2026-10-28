// Aynı barkodtan çok adetli sevkiyatın kabulü.
//
// Bildirilen hata: 40 aksesuarlık bir sevkiyatta ikinci adedi okuttuğunuzda
// "SAMSUNG EP-T2510N TYPE C(25W) BLACK zaten okutuldu" diyor ve okutmaya izin
// vermiyordu. Sebep: kabul okutması eşleşen İLK kalemi alıyordu (findFirst).
// Aksesuarlar seri numarasıyla değil adetle sayıldığı için tek barkod
// onlarca kaleme denk geliyor; ilk kalem kabul edilince aynı barkodun kalan
// 19 adedi bekliyor olsa bile okutma kilitleniyordu.
//
// Test, kullanıcının yaşadığı düzeni birebir kuruyor: iki barkod, her birinden
// 20 adet, hepsi aynı seri numarasız aksesuar.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/coklu-adet-kabul";
const SIFRE = "Stok2026!";
const damga = Date.now().toString().slice(-8);

// Kullanıcının ekranındaki düzen: 40 cihaz, iki ayrı barkod.
const ADET = 20;
const BARKOD_SIYAH = `880${damga}1`;
const BARKOD_BEYAZ = `880${damga}2`;
const AD_SIYAH = "EP-T2510N TYPE C(25W) BLACK";
const AD_BEYAZ = "EP-T2510N TYPE C(25W) WHITE";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({
  viewport: { width: 1500, height: 1200 },
  locale: "tr-TR",
});
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
  await Promise.all([
    sayfa.waitForURL("**/panel"),
    sayfa.click('button[type="submit"]'),
  ]);
}

/** Barkodu okutur ve ekrandaki geri bildirimi döndürür. */
async function okut(kod) {
  await sayfa.fill("#okutmaKutusu", kod);
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(900);
  const kutu = sayfa.locator('[data-test="okutma-geri-bildirim"]');
  if ((await kutu.count()) > 0)
    return ((await kutu.first().textContent()) ?? "").trim();
  return "";
}

const sayac = async (ad) =>
  Number(
    (
      (await sayfa.locator(`[data-test="sayac-${ad}"]`).textContent()) ?? ""
    ).trim(),
  );

try {
  // ======================================= 0) Hazırlık: sevkiyatı kur
  // 40 aksesuarı ekrandan girmek saatler sürerdi ve test edilen şey stok
  // girişi değil, kabul okutması. Süit kendi yalıtılmış veritabanında koşuyor.
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(
    (process.env.DATABASE_URL ?? "").replace(/^file:/, ""),
  );
  const magazalar = db
    .prepare("SELECT id, kod, ad FROM Magaza ORDER BY kod")
    .all();
  const kaynak = magazalar[0];
  const hedefMagaza = magazalar[1];
  const kategoriId = db
    .prepare("SELECT id FROM Kategori ORDER BY sira LIMIT 1")
    .get().id;
  // Kullanıcı adları mağaza kodundaki "M" olmadan üretiliyor: M2 -> sorumlu2.
  const kullaniciAdi = (magaza) => `sorumlu${magaza.kod.replace("M", "")}`;
  const gonderenId = db
    .prepare("SELECT id FROM Kullanici WHERE kullaniciAdi = ?")
    .get(kullaniciAdi(kaynak)).id;

  const simdi = new Date().toISOString();
  const transferNo = `SVK-${damga}`;
  // Cihazlar TRANSFERDE: sevkiyat yoldayken stok durumu bu.
  const cihazEkle = db.prepare(
    `INSERT INTO StokKalemi
       (magazaId, kategoriId, marka, model, seriNo, barkod, alisFiyatiKurus,
        durum, girisTarihi, aramaMetni, createdAt, updatedAt)
     VALUES (?,?,?,?,NULL,?,?,'TRANSFERDE',?,?,?,?)`,
  );
  const kalemEkle = db.prepare(
    "INSERT INTO TransferKalemi (transferId, stokKalemiId, durum) VALUES (?,?,'BEKLIYOR')",
  );
  db.prepare(
    `INSERT INTO Transfer (transferNo, kaynakMagazaId, hedefMagazaId, durum, gonderenId, gonderimTarihi)
     VALUES (?,?,?,'BEKLIYOR',?,?)`,
  ).run(transferNo, kaynak.id, hedefMagaza.id, gonderenId, simdi);
  const transferId = db
    .prepare("SELECT id FROM Transfer WHERE transferNo = ?")
    .get(transferNo).id;

  db.transaction(() => {
    for (const [barkod, ad] of [
      [BARKOD_SIYAH, AD_SIYAH],
      [BARKOD_BEYAZ, AD_BEYAZ],
    ]) {
      for (let i = 0; i < ADET; i += 1) {
        const bilgi = cihazEkle.run(
          kaynak.id,
          kategoriId,
          "SAMSUNG",
          ad,
          barkod,
          50_000,
          simdi,
          `samsung ${ad} ${barkod}`.toLowerCase(),
          simdi,
          simdi,
        );
        kalemEkle.run(transferId, bilgi.lastInsertRowid);
      }
    }
  })();
  // Mağaza içi aktarım bölümü için iki mağaza aynı dükkâna alınıyor.
  db.prepare("UPDATE Magaza SET dukkanKodu = 'DENEME' WHERE id IN (?,?)").run(
    kaynak.id,
    hedefMagaza.id,
  );

  const kalemSayisi = db
    .prepare("SELECT COUNT(*) n FROM TransferKalemi WHERE transferId = ?")
    .get(transferId).n;
  db.close();
  kontrol(
    "hazırlık: 40 adetlik sevkiyat kuruldu",
    kalemSayisi === ADET * 2,
    `${kalemSayisi} kalem`,
  );

  // ======================================= 1) Kabul ekranı açılıyor
  await giris(kullaniciAdi(hedefMagaza));
  await sayfa.goto(`${hedef}/sevkiyat/${transferId}`, {
    waitUntil: "networkidle",
  });
  kontrol(
    "kabul ekranında okutma kutusu var",
    (await sayfa.locator("#okutmaKutusu").count()) === 1,
  );
  kontrol(
    "başlangıçta bekleyen 40",
    (await sayac("bekleyen")) === ADET * 2,
    String(await sayac("bekleyen")),
  );

  // ======================================= 2) Aynı barkod arka arkaya okunuyor
  // Hatanın tam yeri: ikinci okutma. Eskiden burada "zaten okutuldu" çıkıyordu.
  const ilk = await okut(BARKOD_SIYAH);
  kontrol("ilk okutma kabul edildi", /kabul edildi/i.test(ilk), ilk);

  const ikinci = await okut(BARKOD_SIYAH);
  kontrol(
    "AYNI barkodun ikinci adedi de kabul edildi",
    /kabul edildi/i.test(ikinci) && !/zaten/i.test(ikinci),
    ikinci,
  );
  kontrol("ikinci okutma ilerlemeyi yazıyor", /\(2\/20\)/.test(ikinci), ikinci);

  // Kalan 18 adet de okutulabilmeli.
  let sonSiyah = "";
  for (let i = 3; i <= ADET; i += 1) sonSiyah = await okut(BARKOD_SIYAH);
  kontrol(
    "siyahın 20. adedi de kabul edildi",
    /kabul edildi/i.test(sonSiyah),
    sonSiyah,
  );
  kontrol("son okutma 20/20 diyor", /\(20\/20\)/.test(sonSiyah), sonSiyah);
  kontrol(
    "okutulan sayacı 20",
    (await sayac("okutulan")) === ADET,
    String(await sayac("okutulan")),
  );

  // ======================================= 3) Tükenen barkod doğru uyarıyor
  const fazla = await okut(BARKOD_SIYAH);
  kontrol(
    "21. okutmada adedin tükendiği söyleniyor",
    /20 adedin hepsi okutuldu/i.test(fazla),
    fazla,
  );
  kontrol(
    "fazla okutma sayacı artırmadı",
    (await sayac("okutulan")) === ADET,
    String(await sayac("okutulan")),
  );

  // ======================================= 4) İkinci barkod bağımsız
  const beyaz = await okut(BARKOD_BEYAZ);
  kontrol("diğer barkod etkilenmemiş", /kabul edildi/i.test(beyaz), beyaz);
  kontrol("beyaz kendi sayacından başlıyor", /\(1\/20\)/.test(beyaz), beyaz);

  for (let i = 2; i <= ADET; i += 1) await okut(BARKOD_BEYAZ);
  kontrol(
    "40 adedin hepsi okutuldu",
    (await sayac("okutulan")) === ADET * 2,
    String(await sayac("okutulan")),
  );
  kontrol(
    "bekleyen sıfırlandı",
    (await sayac("bekleyen")) === 0,
    String(await sayac("bekleyen")),
  );

  // ======================================= 5) Kabul tamamlanıyor
  await sayfa.locator('button:has-text("Kabulü Tamamla")').click();
  await sayfa.waitForTimeout(2500);
  await sayfa.goto(`${hedef}/sevkiyat/${transferId}`, {
    waitUntil: "networkidle",
  });
  const govde = (await sayfa.locator("body").textContent()) ?? "";
  kontrol(
    "sevkiyat tamamen kabul edildi",
    /tamamen kabul edildi/i.test(govde),
    govde.slice(0, 160).replace(/\s+/g, " "),
  );

  // Cihazlar hedef mağazanın stoğuna geçmeli.
  await sayfa.goto(`${hedef}/cihazlar?ara=${BARKOD_SIYAH}`, {
    waitUntil: "networkidle",
  });
  const satir = await sayfa.locator("table tbody tr").count();
  kontrol(
    "siyah aksesuarlar hedef mağaza stoğunda",
    satir === ADET,
    `${satir} satır`,
  );

  // ======================================= 6) Sayımda da aynı hata vardı
  // Aksesuarlar adetle sayıldığı için sayım okutması da eşleşen ilk kalemi
  // alıyordu: ikinci adette "daha önce okutuldu" deyip sayıma almıyordu.
  // Kabul biten 40 aksesuar artık hedef mağazanın stoğunda; sayım onları
  // listeye alıyor.
  await sayfa.goto(`${hedef}/sayim`, { waitUntil: "networkidle" });
  const magazaKutulari = sayfa.locator('[data-test="sayim-magaza-secimi"]');
  let secildi = false;
  for (let i = 0; i < (await magazaKutulari.count()); i += 1) {
    const etiket = magazaKutulari.nth(i);
    if (((await etiket.textContent()) ?? "").includes(hedefMagaza.ad)) {
      const kutu = etiket.locator('input[type="checkbox"]');
      if (!(await kutu.isChecked())) await kutu.check();
      secildi = true;
      break;
    }
  }
  kontrol("sayımda hedef mağaza seçilebiliyor", secildi, hedefMagaza.ad);
  await Promise.all([
    sayfa.waitForURL(/\/sayim\/\d+$/, { timeout: 20000 }),
    sayfa.click('button:has-text("Sayımı Başlat")'),
  ]);

  const sayimIlk = await okut(BARKOD_SIYAH);
  kontrol(
    "sayımda ilk adet bulundu",
    /stokta bulundu/i.test(sayimIlk),
    sayimIlk,
  );

  const sayimIkinci = await okut(BARKOD_SIYAH);
  kontrol(
    "sayımda AYNI barkodun ikinci adedi de sayıldı",
    /stokta bulundu/i.test(sayimIkinci) &&
      !/zaten|tekrar sayılmadı/i.test(sayimIkinci),
    sayimIkinci,
  );
  kontrol(
    "sayım ilerlemeyi yazıyor",
    /\(2\/20\)/.test(sayimIkinci),
    sayimIkinci,
  );

  for (let i = 3; i <= ADET; i += 1) await okut(BARKOD_SIYAH);
  const sayimFazla = await okut(BARKOD_SIYAH);
  kontrol(
    "sayımda adet tükenince doğru uyarı veriyor",
    /20 adedin hepsi sayıldı/i.test(sayimFazla),
    sayimFazla,
  );

  // ======================================= 7) Mağaza içi aktarımda da aynı hata
  // Aktarımda barkod okutma cihaz kimliği göndermiyor; eşleşen ilk cihaz
  // alınıyordu. İlk adet aktarıldıktan sonra o cihaz hedef mağazaya geçtiği
  // için ikinci okutma "bu mağazada değil" deyip duruyordu — kaynakta aynı
  // barkodtan 19 adet dururken.
  //
  // Yönetici olarak giriliyor: iki mağazada da yetkili olmak gerekiyor.
  await giris("admin");
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  await sayfa.selectOption("#kaynak", { label: hedefMagaza.ad });
  await sayfa.waitForTimeout(800);

  const aktarimIlk = await okut(BARKOD_BEYAZ);
  kontrol(
    "aktarımda ilk adet taşındı",
    /aktarıldı|taşındı/i.test(aktarimIlk),
    aktarimIlk,
  );

  const aktarimIkinci = await okut(BARKOD_BEYAZ);
  kontrol(
    "aktarımda AYNI barkodun ikinci adedi de taşındı",
    /aktarıldı|taşındı/i.test(aktarimIkinci) &&
      !/deposunda|mağazada değil/i.test(aktarimIkinci),
    aktarimIkinci,
  );

  await sayfa.screenshot({ path: `${cikti}-son.png`, fullPage: true });
  kontrol(
    "tarayıcı konsolunda hata yok",
    konsolHatalari.length === 0,
    konsolHatalari.slice(0, 3).join(" | "),
  );
} catch (hata) {
  kontrol("betik tamamlandı", false, String(hata).slice(0, 300));
  await sayfa
    .screenshot({ path: `${cikti}-hata.png`, fullPage: true })
    .catch(() => {});
} finally {
  await tarayici.close();
}

const gecen = sonuclar.filter((s) => s.gecti).length;
console.log(`\n${gecen}/${sonuclar.length} kontrol geçti`);
if (gecen !== sonuclar.length) process.exit(1);
