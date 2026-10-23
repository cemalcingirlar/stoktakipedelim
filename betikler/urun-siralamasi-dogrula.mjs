// Paneldeki "Stokta En Çok Bulunan" ve "En Çok Satan" ürün dökümleri testi.
//
// Döküm "bir şeyler listeliyor" ile yetinmiyor: sıralamanın gerçekten adede
// göre olduğu, dönem değişince listenin değiştiği, aynı ürünün yazım farkıyla
// ikiye bölünmediği ve mağaza kısıtının uygulandığı tek tek sayılıyor.
//
// Kurgu kasıtlı: en çok STOKTA kalan ürün ile en çok SATAN ürün farklı.
// İkisi aynı olsaydı iki kartın yer değiştirmesi testten kaçardı.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/urun-siralamasi";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);
const MUSTERI = `URUN MUSTERI ${damga}`;

// RAFCI: 6 girdi, 1 satıldı (bugün) -> stokta 5 (stok lideri)
// SATICI: 6 girdi, 5 satıldı -> stokta 1 (satış lideri)
//   3'ü bugün, 1'i 15 gün önce, 1'i 60 gün önce.
// Geri tarihli satışlar kasıtlı: hepsi bugün olsaydı üç dönem de aynı rakamı
// verir, dönem tamamen yok sayılsa bile test geçerdi.
//   son 1 hafta -> 3 · son 1 ay -> 4 · tüm zamanlar -> 5
const RAFCI = `RAFCI${damga}`;
const SATICI = `SATICI${damga}`;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1700, height: 1300 }, locale: "tr-TR" });
const hatalar = [];
sayfa.on("console", (m) => {
  if (m.type() === "error") hatalar.push(m.text());
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

/** Telefon faturası: adet kadar IMEI, verilen marka ile. */
async function faturaGir({ marka, model, imeiler, fiyat, magaza = "1 Nolu Mağaza" }) {
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `URN${damga}${marka.slice(0, 4)}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1400);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill(marka);
  await alanlar.nth(2).fill(model);
  await kart.locator('input[inputmode="decimal"]').fill(fiyat);
  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const no of imeiler) {
    await imeiKutusu.fill(no);
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(320);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `URN-${marka}-${imeiler[0]}`.slice(0, 40));
  await sayfa.selectOption("#magazaId", { label: magaza });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
}

/** input[type=date] biçimi. */
function tarihYaz(gunOnce) {
  const t = new Date();
  t.setDate(t.getDate() - gunOnce);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

async function sat(kod, fiyat, gunOnce = 0) {
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutmaKutusu", kod);
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1200);
  await sayfa.locator('[data-test="sepet-fiyat"]').first().fill(fiyat);
  if (gunOnce > 0) {
    await sayfa.fill("#satisTarihi", tarihYaz(gunOnce));
    await sayfa.waitForTimeout(300);
  }
  await sayfa.fill("#musteriSorgu", MUSTERI);
  await sayfa.locator('[data-test="musteri-ara"]').click();
  await sayfa.waitForTimeout(1500);
  const secButonu = sayfa.locator('[data-test="musteri-sec"]').first();
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
}

async function panele(urunDonem = "ay") {
  await sayfa.goto(`${hedef}/panel?donem=1a&satisDonem=gun&olcu=adet&urunDonem=${urunDonem}#urunler`, {
    waitUntil: "networkidle",
  });
  await sayfa.waitForTimeout(1200);
}

/** Bir dökümün satırları: [{ad, adet}] sırayla. */
async function dokum(testAdi) {
  return await sayfa.locator(`[data-test="${testAdi}"] li`).evaluateAll((ler) =>
    ler.map((li) => ({
      ad: li.querySelector("span.truncate")?.textContent?.trim() ?? "",
      adet: Number(li.querySelector('[data-test="urun-adet"]')?.textContent ?? 0),
    })),
  );
}

try {
  await giris("admin");

  // ---------------------------------------------------- 0) Hazırlık
  await faturaGir({
    marka: RAFCI,
    model: "FON R",
    imeiler: [imei(1), imei(2), imei(3), imei(4), imei(5), imei(6)],
    fiyat: "1.000,00",
  });
  await faturaGir({
    marka: SATICI,
    model: "FON S",
    imeiler: [imei(11), imei(12), imei(13), imei(14), imei(15), imei(16)],
    fiyat: "2.000,00",
  });
  await sat(imei(1), "1.500,00");
  await sat(imei(11), "2.500,00");
  await sat(imei(12), "2.500,00");
  await sat(imei(13), "2.500,00");
  await sat(imei(16), "2.500,00", 15);
  await sat(imei(15), "2.500,00", 60);
  console.log(
    `0) hazırlık: ${RAFCI} stokta 5 · ${SATICI} stokta 1, satış 3 bugün + 1 (15g) + 1 (60g)`,
  );

  // ------------------------------------- 1) Stokta en çok bulunan ürün
  await panele();
  const stok = await dokum("stokta-en-cok");
  const rafciStok = stok.find((s) => s.ad.includes(RAFCI));
  const saticiStok = stok.find((s) => s.ad.includes(SATICI));
  kontrol("stok dökümü ekranda", stok.length > 0, `${stok.length} satır`);
  kontrol(
    "stokta kalan adet doğru (satılanlar düşülmüş)",
    rafciStok?.adet === 5,
    `${rafciStok?.adet} (5 bekleniyor)`,
  );
  kontrol("satılan cihazlar stokta sayılmıyor", saticiStok?.adet === 1, `${saticiStok?.adet} (1 bekleniyor)`);
  kontrol(
    "stok dökümü adede göre sıralı",
    stok.every((s, i) => i === 0 || stok[i - 1].adet >= s.adet),
    stok.map((s) => s.adet).join(" ≥ "),
  );
  kontrol(
    "stok lideri en çok kalan ürün",
    stok[0]?.ad.includes(RAFCI),
    stok[0]?.ad ?? "(boş)",
  );

  // ------------------------------------------- 2) En çok satan ürün
  const satan = await dokum("en-cok-satan");
  kontrol("satış dökümü ekranda", satan.length > 0, `${satan.length} satır`);
  kontrol(
    "satış lideri en çok satan ürün (stok liderinden farklı)",
    satan[0]?.ad.includes(SATICI),
    satan[0]?.ad ?? "(boş)",
  );
  // Varsayılan dönem "son 1 ay": bugünkü 3 + 15 gün önceki 1 = 4.
  kontrol("satış adedi doğru", satan[0]?.adet === 4, `${satan[0]?.adet} (4 bekleniyor)`);
  const rafciSatan = satan.find((s) => s.ad.includes(RAFCI));
  kontrol("az satan ürün de listede, doğru adetle", rafciSatan?.adet === 1, `${rafciSatan?.adet} (1 bekleniyor)`);
  kontrol(
    "satış dökümü adede göre sıralı",
    satan.every((s, i) => i === 0 || satan[i - 1].adet >= s.adet),
    satan.map((s) => s.adet).join(" ≥ "),
  );
  await sayfa.screenshot({ path: `${cikti}-panel.png`, fullPage: true });

  // ---------------------------------- 3) Dönem seçenekleri çalışıyor
  kontrol(
    "üç dönem düğmesi de var",
    (await sayfa.locator('[data-test="urun-donem-secici"] a').count()) === 3,
  );
  // Her dönem FARKLI bir rakam vermeli; aynı olsalardı dönem yok sayılsa
  // bile bu kontrol geçerdi.
  const beklenen = { hafta: 3, ay: 4, tum: 5 };
  const gorulen = {};
  for (const d of ["hafta", "ay", "tum"]) {
    await panele(d);
    const liste = await dokum("en-cok-satan");
    const satici = liste.find((x) => x.ad.includes(SATICI));
    gorulen[d] = satici?.adet;
    kontrol(
      `${d} dönemi yalnız kendi penceresindeki satışları sayıyor`,
      satici?.adet === beklenen[d],
      `${satici?.adet} (${beklenen[d]} bekleniyor)`,
    );
  }
  kontrol(
    "üç dönem üç farklı rakam veriyor (pencere gerçekten uygulanıyor)",
    new Set(Object.values(gorulen)).size === 3,
    JSON.stringify(gorulen),
  );
  kontrol(
    "geri tarihli satış kısa pencerenin dışında kalıyor",
    gorulen.hafta < gorulen.ay && gorulen.ay < gorulen.tum,
    `hafta ${gorulen.hafta} < ay ${gorulen.ay} < tüm ${gorulen.tum}`,
  );

  // Dönem değişince diğer seçimler korunuyor.
  await panele("ay");
  await sayfa.locator('[data-test="urun-donem-tum"]').click();
  await sayfa.waitForTimeout(1500);
  kontrol("dönem değişince ölçü korunuyor", sayfa.url().includes("olcu=adet"), sayfa.url());
  kontrol("dönem değişince grafik dönemi korunuyor", sayfa.url().includes("donem=1a"), sayfa.url());

  // -------------------------- 4) Yazım farkı tek satıra iniyor
  // Aynı ürün "RAFCIxxx" ve "rafcixxx" diye girilirse ayrı sayılmamalı.
  await faturaGir({
    marka: RAFCI.toLowerCase(),
    model: "fon r",
    imeiler: [imei(21), imei(22)],
    fiyat: "1.000,00",
  });
  await panele();
  const birlesmis = await dokum("stokta-en-cok");
  const rafciSatirlari = birlesmis.filter((s) => s.ad.toUpperCase().includes(RAFCI));
  kontrol(
    "yazım farkı ayrı satır açmıyor",
    rafciSatirlari.length === 1,
    `${rafciSatirlari.length} satır`,
  );
  kontrol(
    "birleşen satırın adedi toplanmış",
    rafciSatirlari[0]?.adet === 7,
    `${rafciSatirlari[0]?.adet} (5+2=7 bekleniyor)`,
  );

  // ------------------------------- 5) Mağaza kısıtı dökümlere de uygulanıyor
  await giris("personel2");
  await panele();
  const yabanciStok = await dokum("stokta-en-cok");
  const yabanciSatan = await dokum("en-cok-satan");
  kontrol(
    "yetkisiz kullanıcı başka mağazanın stok dökümünü görmüyor",
    yabanciStok.every((s) => !s.ad.toUpperCase().includes(RAFCI) && !s.ad.includes(SATICI)),
    yabanciStok.map((s) => s.ad).join(", ") || "(boş)",
  );
  kontrol(
    "yetkisiz kullanıcı başka mağazanın satış dökümünü görmüyor",
    yabanciSatan.every((s) => !s.ad.includes(SATICI)),
    yabanciSatan.map((s) => s.ad).join(", ") || "(boş)",
  );

  await giris("personel1");
  await panele();
  const yetkiliSatan = await dokum("en-cok-satan");
  kontrol(
    "yetkili kullanıcı kendi mağazasının dökümünü görüyor",
    yetkiliSatan[0]?.ad.includes(SATICI) && yetkiliSatan[0]?.adet === 4,
    `${yetkiliSatan[0]?.ad} ${yetkiliSatan[0]?.adet}`,
  );
  await sayfa.screenshot({ path: `${cikti}-yetkili.png`, fullPage: true });

  kontrol("konsolda hata yok", hatalar.length === 0, hatalar.slice(0, 3).join(" | "));
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
