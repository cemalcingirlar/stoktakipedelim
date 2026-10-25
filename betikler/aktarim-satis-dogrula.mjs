// Mağaza içi aktarımda "müşteriye sat, geri al" testi.
//
// Kritik soru şu: satış gerçekten panel satış raporlarına yansıyor mu, ve kâr
// satış anındaki maliyete göre mi hesaplanıyor? Geri alış fiyatı kâra karışırsa
// satıştan kazanılan tutar kaybolur, bu yüzden sayılar tek tek kontrol ediliyor.
import { chromium } from "@playwright/test";
import { gunKaydir, gunMetni } from "./ortak-tarih.mjs";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/aktarim-satis";
const SIFRE = "Stok2026!";
const damga = String(Date.now()).slice(-7);
const imei = (i) => `35${damga}${String(i).padStart(6, "0")}`.slice(0, 15);

// 10.000'e alınan cihaz 13.000'e satılıp 12.000'e geri alınıyor.
// Satışın kârı 3.000 TL olmalı; stok değeri 12.000'e dönmeli.
const ALIS = "10.000,00";
const SATIS = "13.000,00";
const GERI_ALIS = "12.000,00";
const BEKLENEN_KAR = "3.000,00";
const MUSTERI = `Aktarim Musteri ${damga}`;

// Geçmişe dönük kayıt denemesi: 2. cihaz 5 gün önceki tarihle satılıyor.
// Tutarlar birinci satıştan farklı seçildi ki raporda karışmasın.
const GECMIS_SATIS = "17.777,00";
const GECMIS_GERI_ALIS = "11.111,00";
// Tarihler uygulamanın saat dilimine göre: test süreci UTC'de koşuyor ve
// gece yarısından sonra kendi günü sunucununkinden farklı oluyordu.
const GECMIS_TARIH = gunKaydir(-5);
const BUGUN_TARIH = gunMetni();

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1500, height: 1200 }, locale: "tr-TR" });
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

function magazaKarti(kod) {
  return sayfa
    .locator("div.rounded-xl.border.bg-white")
    .filter({ has: sayfa.locator(`input[name="kod"][value="${kod}"]`) })
    .first();
}

async function aktar(kod) {
  await sayfa.fill("#okutmaKutusu", kod);
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1500);
  const bildirim = sayfa.locator('[role="status"], [role="alert"]').first();
  return (await bildirim.textContent())?.replace(/\s+/g, " ").trim() ?? "";
}

/** Cihaz künyesindeki bir satırın değeri. Sayfa metni aramak yanıltıcı. */
async function kunyeOku(etiket) {
  const dt = sayfa
    .locator("dt")
    .filter({ hasText: new RegExp(`^${etiket}$`) })
    .first();
  return ((await dt.locator("xpath=following-sibling::dd[1]").first().textContent()) ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tutar hücresini tam karşılaştırır.
 *
 * Alt dize aramak yanıltıcı: "13.000,00" içinde "3.000,00" de geçiyor, bu
 * yüzden kâr hücresi yanlış hesaplanmışken kontrol geçebiliyor.
 */
function hucreEsit(hucreler, beklenen) {
  return hucreler.some((h) => h.replace(/[₺\s]/g, "") === beklenen);
}

/** Paneldeki döküm tablosundan bir satırın hücrelerini okur. */
async function dokumSatiri(testAdi, ad) {
  const satir = sayfa
    .locator(`[data-test="${testAdi}"] tr`)
    .filter({ hasText: ad })
    .first();
  if ((await satir.count()) === 0) return null;
  return (await satir.locator("td").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
}

try {
  // ---------------------------------- 0) Hazırlık: dükkân kodu + 2 cihaz
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
  for (const kod of ["M1", "M2"]) {
    const kutu = magazaKarti(kod).locator('input[name="dukkanKodu"]');
    if ((await kutu.inputValue()) !== "DENEME") {
      await kutu.fill("DENEME");
      await magazaKarti(kod).getByRole("button", { name: "Kaydet", exact: true }).click();
      await sayfa.waitForTimeout(1200);
      await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
    }
  }

  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `SGA${damga}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1200);
  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const metinler = kart.locator('input[type="text"], input:not([type])');
  await metinler.nth(1).fill("SatGeri");
  await metinler.nth(2).fill("Test B1");
  await kart.locator('input[inputmode="decimal"]').fill(ALIS);
  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const i of [1, 2]) {
    await imeiKutusu.fill(imei(i));
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(400);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `SGA-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);
  console.log(`0) hazırlık: 2 cihaz ${ALIS} TL alışla 1 Nolu Mağaza'ya girildi`);

  // ----------------------------- 1) Satış modu varsayılan kapalı olmalı
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  const kutucuk = sayfa.locator('[data-test="satis-modu"]');
  kontrol("sat-geri al kutucuğu ekranda var", (await kutucuk.count()) === 1);
  kontrol("varsayılan olarak kapalı", !(await kutucuk.isChecked()));
  kontrol(
    "kapalıyken müşteri alanları gizli",
    (await sayfa.locator('[data-test="musteri-sorgu"]').count()) === 0,
  );

  // --------------------------------- 2) Açınca müşteri ve satıcı çıkıyor
  await kutucuk.check();
  await sayfa.waitForTimeout(400);
  kontrol("müşteri arama alanı açıldı", (await sayfa.locator('[data-test="musteri-sorgu"]').count()) === 1);
  kontrol("ödeme tipi seçimi açıldı", (await sayfa.locator('[data-test="odeme-tipi"]').count()) === 1);
  kontrol(
    "satışı yapan seçimi açıldı",
    (await sayfa.locator('[data-test="satisi-yapan"]').count()) === 1,
  );
  const odemeSecenekleri = await sayfa.locator('[data-test="odeme-tipi"] option').allTextContents();
  kontrol(
    "ödeme tipleri arasında Temlik var",
    odemeSecenekleri.some((t) => t.includes("Temlik")),
    odemeSecenekleri.join(", "),
  );

  // -------------------- 3) Müşteri girilmeden satış formu açılmamalı
  await sayfa.selectOption("#kaynak", { label: "1 Nolu Mağaza" });
  await sayfa.waitForTimeout(400);
  const mesaj1 = await aktar(imei(1));
  kontrol("cihaz aktarıldı", mesaj1.includes("aktarıldı"), mesaj1);
  kontrol(
    "müşteri yokken uyarı çıkıyor",
    (await sayfa.locator('[data-test="musteri-eksik"]').count()) === 1,
  );
  kontrol(
    "müşteri yokken satış formu açılmıyor",
    (await sayfa.locator('[data-test="sat-geri-al"]').count()) === 0,
  );

  // ------------------------------------ 4) Müşteri girilince form açılıyor
  await sayfa.fill('[data-test="musteri-ad"]', MUSTERI);
  await sayfa.waitForTimeout(400);
  kontrol(
    "müşteri girilince satış formu açıldı",
    (await sayfa.locator('[data-test="sat-geri-al"]').count()) === 1,
  );
  kontrol(
    "kaydedilmedi uyarısı duruyor",
    ((await sayfa.locator('[data-test="sat-geri-al"]').textContent()) ?? "").includes(
      "kaydedilmedi",
    ),
  );
  kontrol(
    "satış fiyatı boşken ne olacağı yazıyor",
    ((await sayfa.locator('[data-test="ne-olacak"]').textContent()) ?? "").includes(
      "yalnız alış fiyatı güncellenecek",
    ),
    ((await sayfa.locator('[data-test="ne-olacak"]').textContent()) ?? "").trim(),
  );
  kontrol(
    "satış fiyatı boşken düğme alış fiyatını kaydediyor",
    ((await sayfa.locator('[data-test="satisi-kaydet"]').textContent()) ?? "").includes(
      "Alış Fiyatını Kaydet",
    ),
    ((await sayfa.locator('[data-test="satisi-kaydet"]').textContent()) ?? "").trim(),
  );
  kontrol(
    "yeni alış fiyatı mevcut alışla hazır geliyor",
    (await sayfa.locator('[data-test="yeni-alis-fiyati"]').inputValue()) === ALIS,
    await sayfa.locator('[data-test="yeni-alis-fiyati"]').inputValue(),
  );

  // ------------- 5) Satış fiyatı boşken yalnız alış fiyatı kaydedilebilmeli
  // Kullanıcı bildirdi: kutucuğun adı "Alış Fiyatını Revize Et" olduğu için
  // yalnız alış fiyatı yazılıyor, satış fiyatı istemek kaydı engelliyordu.
  await sayfa.fill('[data-test="yeni-alis-fiyati"]', "9.000,00");
  await sayfa.locator('[data-test="satisi-kaydet"]').click();
  await sayfa.waitForTimeout(2000);
  kontrol(
    "satış fiyatı boşken alış fiyatı kaydedildi",
    (await sayfa.locator('[data-test="fiyat-kaydedildi"]').count()) === 1,
    ((await sayfa.locator('[data-test="satis-hata"]').count()) > 0
      ? ((await sayfa.locator('[data-test="satis-hata"]').first().textContent()) ?? "").trim()
      : ""),
  );
  kontrol(
    "yalnız fiyat kaydında satış açılmadığı söyleniyor",
    ((await sayfa.locator('[data-test="fiyat-kaydedildi"]').textContent()) ?? "").includes(
      "satış kaydı açılmadı",
    ),
  );

  // Cihazın maliyeti gerçekten değişmiş olmalı.
  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(1)}`, { waitUntil: "networkidle" });
  const yalnizFiyatSonrasi = await kunyeOku("Alış Fiyatı");
  kontrol(
    "yalnız fiyat kaydı cihazın maliyetine işledi",
    yalnizFiyatSonrasi.includes("9.000,00"),
    `${yalnizFiyatSonrasi} (beklenen 9.000,00)`,
  );
  const yalnizFiyatTarihce = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "yalnız fiyat kaydında satış hareketi yazılmadı",
    !yalnizFiyatTarihce.includes("satılıp geri alındı"),
  );

  // Satış akışına geri dön: aynı cihaz için şimdi satış fiyatı da yazılacak.
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="satis-modu"]').check();
  await sayfa.fill('[data-test="musteri-ad"]', MUSTERI);
  await sayfa.selectOption("#kaynak", { label: "2 Nolu Mağaza" });
  await sayfa.waitForTimeout(400);
  const geriMesaj = await aktar(imei(1));
  kontrol("cihaz kaynağa geri aktarıldı", geriMesaj.includes("aktarıldı"), geriMesaj);
  await sayfa.fill('[data-test="yeni-alis-fiyati"]', ALIS);
  await sayfa.locator('[data-test="satisi-kaydet"]').click();
  await sayfa.waitForTimeout(2000);
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="satis-modu"]').check();
  await sayfa.fill('[data-test="musteri-ad"]', MUSTERI);
  await sayfa.selectOption("#kaynak", { label: "1 Nolu Mağaza" });
  await sayfa.waitForTimeout(400);
  await aktar(imei(1));

  // ------------------------------------------------ 6) Kâr satış anındaki
  // maliyete göre gösteriliyor mu? 13.000 − 10.000 = 3.000
  await sayfa.fill('[data-test="satis-fiyati"]', SATIS);
  await sayfa.fill('[data-test="yeni-alis-fiyati"]', GERI_ALIS);
  await sayfa.waitForTimeout(400);
  const formMetni = (await sayfa.locator('[data-test="sat-geri-al"]').textContent()) ?? "";
  kontrol(
    "ekranda kâr satış anındaki maliyete göre",
    formMetni.includes(BEKLENEN_KAR),
    `${BEKLENEN_KAR} bekleniyor · ${formMetni.replace(/\s+/g, " ").slice(0, 160)}`,
  );

  await sayfa.locator('[data-test="satisi-kaydet"]').click();
  await sayfa.waitForTimeout(2500);
  kontrol(
    "satış kaydedildi",
    (await sayfa.locator('[data-test="satis-kaydedildi"]').count()) === 1,
    ((await sayfa.locator('[data-test="satis-kaydedildi"]').textContent()) ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140),
  );
  await sayfa.screenshot({ path: `${cikti}-form.png`, fullPage: true });

  // ------------------------------- 7) Cihaz stokta kaldı, maliyeti değişti
  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(1)}`, { waitUntil: "networkidle" });
  // Durum künye satırı değil, başlıktaki rozet.
  const durum = ((await sayfa.locator("main").textContent()) ?? "").slice(0, 400);
  kontrol("cihaz stokta kaldı", durum.includes("Stokta") && !durum.includes("Satıldı"),
    durum.replace(/\s+/g, " ").slice(0, 120));
  const depo = await kunyeOku("Bulunduğu Depo");
  kontrol("cihaz hedef mağazada", depo === "2 Nolu Mağaza", depo);
  const yeniAlis = await kunyeOku("Alış Fiyatı");
  kontrol(
    "cihazın maliyeti geri alış fiyatına döndü",
    yeniAlis.includes(GERI_ALIS),
    `${yeniAlis} (beklenen ${GERI_ALIS})`,
  );

  const tarihce = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("tarihçeye satış yazıldı", tarihce.includes("satılıp geri alındı"));
  kontrol("tarihçede müşteri adı var", tarihce.includes(MUSTERI));
  kontrol(
    "tarihçede eski → yeni alış fiyatı var",
    tarihce.includes(`${ALIS} → ${GERI_ALIS}`),
    `${ALIS} → ${GERI_ALIS}`,
  );

  // ------------------------------------- 8) Panel satış raporuna yansıdı mı?
  await sayfa.goto(`${hedef}/panel?satisDonem=gun`, { waitUntil: "networkidle" });
  await sayfa.screenshot({ path: `${cikti}-panel.png`, fullPage: true });

  const magazaSatiri = await dokumSatiri("magaza-satis", "1 Nolu Mağaza");
  kontrol("mağaza satış dökümünde satış mağazası var", magazaSatiri !== null, String(magazaSatiri));
  if (magazaSatiri) {
    kontrol(
      "mağaza dökümünde satış tutarı doğru",
      hucreEsit(magazaSatiri, SATIS),
      `${SATIS} bekleniyor · ${magazaSatiri.join(" | ")}`,
    );
    kontrol(
      "mağaza dökümünde kâr satış anındaki maliyete göre",
      hucreEsit(magazaSatiri, BEKLENEN_KAR),
      `${BEKLENEN_KAR} bekleniyor · ${magazaSatiri.join(" | ")}`,
    );
  }

  const personelSatiri = await dokumSatiri("personel-satis", "Yönetici");
  kontrol("personel satış dökümünde satıcı var", personelSatiri !== null, String(personelSatiri));
  if (personelSatiri) {
    kontrol(
      "personel dökümünde satış tutarı doğru",
      hucreEsit(personelSatiri, SATIS),
      `${SATIS} bekleniyor · ${personelSatiri.join(" | ")}`,
    );
    kontrol(
      "personel dökümünde kâr doğru",
      hucreEsit(personelSatiri, BEKLENEN_KAR),
      `${BEKLENEN_KAR} bekleniyor · ${personelSatiri.join(" | ")}`,
    );
  }

  const panelMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "Bugün Satılan kartı sat-geri al işlemini sayıyor",
    panelMetni.includes("sat-geri al"),
  );
  kontrol(
    "bugünün listesinde aktarım satışı işaretli",
    (await sayfa.locator('[data-test="bugun-aktarim-satisi"]').count()) >= 1,
  );

  // ------------------------------------------ 9) /rapor ekranı da aynı sayı
  // Rapor aralığı da uygulamanın dilimine göre: test süreci UTC'de.
  const bugunISO = gunMetni();
  await sayfa.goto(`${hedef}/rapor?bas=${bugunISO}&bit=${bugunISO}`, {
    waitUntil: "networkidle",
  });
  const raporMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "rapor ekranında da satış görünüyor",
    raporMetni.includes(SATIS),
    SATIS,
  );

  // -------------------------- 10) Personel de sat-geri al yapabilmeli
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
  const m2Kutusu = magazaKarti("M2").locator(
    'label:has-text("1 Nolu Mağaza Personeli") input[name="yetkililer"]',
  );
  if (!(await m2Kutusu.isChecked())) await m2Kutusu.check();
  await magazaKarti("M2").getByRole("button", { name: "Yetkileri Kaydet" }).click();
  await sayfa.waitForTimeout(1500);

  await giris("personel1");
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  kontrol(
    "personele de sat-geri al kutucuğu çıkıyor",
    (await sayfa.locator('[data-test="satis-modu"]').count()) === 1,
  );
  await sayfa.locator('[data-test="satis-modu"]').check();
  await sayfa.fill('[data-test="musteri-ad"]', `${MUSTERI} 2`);
  await sayfa.selectOption("#kaynak", { label: "1 Nolu Mağaza" });
  await sayfa.waitForTimeout(400);
  const mesaj2 = await aktar(imei(2));
  kontrol("personel aktarım yapabiliyor", mesaj2.includes("aktarıldı"), mesaj2);
  // Zararına satış: cihazın maliyeti 10.000, satış 5.000 → kâr −5.000.
  // Dökümün negatif kârı sıfıra kırpmadığı da böylece kontrol ediliyor.
  await sayfa.fill('[data-test="satis-fiyati"]', "5.000,00");
  await sayfa.fill('[data-test="yeni-alis-fiyati"]', "4.000,00");
  await sayfa.locator('[data-test="satisi-kaydet"]').click();
  await sayfa.waitForTimeout(2500);
  const personelHatasi =
    (await sayfa.locator('[data-test="satis-hata"]').count()) > 0
      ? ((await sayfa.locator('[data-test="satis-hata"]').first().textContent()) ?? "").trim()
      : "";
  kontrol(
    "personelin satışı kaydedildi",
    (await sayfa.locator('[data-test="satis-kaydedildi"]').count()) === 1,
    personelHatasi,
  );

  await sayfa.goto(`${hedef}/panel?satisDonem=gun`, { waitUntil: "networkidle" });
  const personelKendi = await dokumSatiri("personel-satis", "1 Nolu Mağaza Personeli");
  kontrol(
    "personelin satışı kendi adına yazıldı",
    personelKendi !== null && hucreEsit(personelKendi, "5.000,00"),
    String(personelKendi),
  );
  kontrol(
    "zararına satışın kârı negatif yazıldı",
    personelKendi !== null && hucreEsit(personelKendi, "-5.000,00"),
    `-5.000,00 bekleniyor · ${String(personelKendi)}`,
  );
  kontrol(
    "zararına satışta da cihazın maliyeti geri alışa döndü",
    await (async () => {
      await sayfa.goto(`${hedef}/cihazlar?ara=${imei(2)}`, { waitUntil: "networkidle" });
      return (await kunyeOku("Alış Fiyatı")).includes("4.000,00");
    })(),
    await kunyeOku("Alış Fiyatı"),
  );

  // ======================= 10) Geçmişe dönük tarihle aktarım ve satış
  // Dün yapılan bir işlem bugünün rakamlarına karışmamalı. Cihaz sat-geri
  // alda stokta kaldığı için aynı cihazla yeniden satış yapılabiliyor.
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  const tarihKutusu = sayfa.locator('[data-test="aktarim-tarihi"]');
  kontrol("aktarım ekranında tarih alanı var", (await tarihKutusu.count()) === 1);
  kontrol(
    "tarih varsayılan olarak bugün",
    (await tarihKutusu.inputValue()) === BUGUN_TARIH,
    `${await tarihKutusu.inputValue()} (bugün ${BUGUN_TARIH})`,
  );

  await tarihKutusu.fill(GECMIS_TARIH);
  await sayfa.locator('[data-test="satis-modu"]').check();
  await sayfa.fill('[data-test="musteri-ad"]', MUSTERI);
  // Cihaz 2 Nolu'da duruyor; oradan 1 Nolu'ya aktarıp satışı 2 Nolu'ya yazdır.
  await sayfa.selectOption("#kaynak", { label: "2 Nolu Mağaza" });
  await sayfa.waitForTimeout(400);
  const gecmisMesaj = await aktar(imei(2));
  kontrol("geçmiş tarihli aktarım yapıldı", gecmisMesaj.includes("aktarıldı"), gecmisMesaj);

  await sayfa.fill('[data-test="satis-fiyati"]', GECMIS_SATIS);
  await sayfa.fill('[data-test="yeni-alis-fiyati"]', GECMIS_GERI_ALIS);
  await sayfa.locator('[data-test="satisi-kaydet"]').click();
  await sayfa.waitForTimeout(2500);
  kontrol(
    "geçmiş tarihli satış kaydedildi",
    (await sayfa.locator('[data-test="satis-kaydedildi"]').count()) === 1,
    ((await sayfa.locator('[data-test="satis-hata"]').count()) > 0
      ? ((await sayfa.locator('[data-test="satis-hata"]').first().textContent()) ?? "").trim()
      : ""),
  );

  // Asıl ölçüm: tarih gerçekten raporlara yansıyor mu?
  await sayfa.goto(`${hedef}/rapor?bas=${GECMIS_TARIH}&bit=${GECMIS_TARIH}`, {
    waitUntil: "networkidle",
  });
  const gecmisRapor = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "satış seçilen geçmiş tarihin raporunda görünüyor",
    gecmisRapor.includes(GECMIS_SATIS),
    `${GECMIS_SATIS} bekleniyor`,
  );

  await sayfa.goto(`${hedef}/rapor?bas=${BUGUN_TARIH}&bit=${BUGUN_TARIH}`, {
    waitUntil: "networkidle",
  });
  const bugunRapor = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "geçmiş tarihli satış bugünün raporuna karışmıyor",
    !bugunRapor.includes(GECMIS_SATIS),
    `${GECMIS_SATIS} görünmemeli`,
  );

  // Cihazın tarihçesindeki hareketler de o tarihle yazılmalı.
  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(2)}`, { waitUntil: "networkidle" });
  const gosterimTarihi = GECMIS_TARIH.split("-").reverse().join(".");
  const gecmisTarihce = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "cihaz tarihçesinde geçmiş tarih görünüyor",
    gecmisTarihce.includes(gosterimTarihi),
    `${gosterimTarihi} bekleniyor`,
  );

  // ================= 11) Sat-geri al yönetici ayrıcalığı DEĞİL
  // Kullanıcı "admin'de görünüyor, diğerlerinde de olsun" dedi. Kodda rol
  // kısıtı yok; ekranı açan şey iki mağazada da yetkili olmak. Bölüm kendi
  // içinde tutarlı: betiğin başında verilmiş yetkiyi önce geri alıyoruz,
  // yoksa "yetkisiz hal" hiç ölçülemezdi.
  async function m2Yetkisi(ver) {
    await giris("admin");
    await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
    const form = magazaKarti("M2")
      .locator("form")
      .filter({ hasText: "Yetkileri Kaydet" })
      .first();
    const kutu = form.locator(
      'label:has-text("1 Nolu Mağaza Personeli") input[name="yetkililer"]',
    );
    if (ver) await kutu.check();
    else await kutu.uncheck();
    await form.getByRole("button", { name: "Yetkileri Kaydet" }).click();
    await sayfa.waitForTimeout(1500);
  }

  await m2Yetkisi(false);
  await giris("personel1");
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  kontrol(
    "eşte yetkisi olmayan personele kutu çıkmıyor",
    (await sayfa.locator('[data-test="satis-modu"]').count()) === 0,
  );
  const engelMetni = await sayfa
    .locator('[data-test="aktarim-yetki-engeli"]')
    .textContent()
    .catch(() => null);
  kontrol(
    "engel sebebi 'dükkân kodu' değil 'yetki' diye söyleniyor",
    Boolean(engelMetni) && /yetkili olmanız/.test(engelMetni ?? ""),
    (engelMetni ?? "(mesaj yok)").replace(/\s+/g, " ").slice(0, 110),
  );
  kontrol(
    "eksik yetkinin hangi mağazada olduğu yazıyor",
    (engelMetni ?? "").includes("2 Nolu Mağaza"),
    (engelMetni ?? "").replace(/\s+/g, " ").slice(0, 110),
  );

  await m2Yetkisi(true);
  await giris("personel1");
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  kontrol(
    "yetki verilince personele de sat-geri al kutusu çıkıyor",
    (await sayfa.locator('[data-test="satis-modu"]').count()) === 1,
  );

  // Düğmeyi göstermek yetmez: personel gerçekten kaydedebilmeli.
  // Cihaz bu noktada 2 Nolu Mağaza'da duruyor; aktarım oradan başlıyor.
  await sayfa.locator('[data-test="satis-modu"]').check();
  await sayfa.fill('[data-test="musteri-ad"]', `${MUSTERI} P`);
  await sayfa.selectOption("#kaynak", { label: "2 Nolu Mağaza" });
  await sayfa.waitForTimeout(400);
  const personelMesaj = await aktar(imei(1));
  kontrol("personel cihazı aktardı", personelMesaj.includes("aktarıldı"), personelMesaj);
  await sayfa.fill('[data-test="satis-fiyati"]', "15.000,00");
  await sayfa.fill('[data-test="yeni-alis-fiyati"]', "14.000,00");
  await sayfa.locator('[data-test="satisi-kaydet"]').click();
  await sayfa.waitForTimeout(2500);
  kontrol(
    "personel sat-geri al satışını kaydedebildi",
    (await sayfa.locator('[data-test="satis-kaydedildi"]').count()) === 1,
    ((await sayfa.locator('[data-test="satis-hata"]').count()) > 0
      ? ((await sayfa.locator('[data-test="satis-hata"]').first().textContent()) ?? "").trim()
      : ""),
  );

  // ===== 12) Müşteri girilmeden de alış fiyatı revize edilebilmeli
  // Kullanıcı bildirdi: "Alış Fiyatını Revize Et" işaretliyken müşteri
  // girilmediğinde satır için HİÇBİR fiyat alanı çıkmıyordu — ne satış formu
  // ne fiyat düzeltme. Oysa satış için müşteri gerekir, fiyat düzeltmek için
  // gerekmez; kutunun kendi metni de bunu söylüyor.
  await giris("admin");
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  await sayfa.locator('[data-test="satis-modu"]').check();
  await sayfa.selectOption("#kaynak", { label: "1 Nolu Mağaza" });
  await sayfa.waitForTimeout(400);
  const musterisizMesaj = await aktar(imei(2));
  kontrol("müşterisiz aktarım yapıldı", musterisizMesaj.includes("aktarıldı"), musterisizMesaj);
  kontrol(
    "müşteri eksik uyarısı duruyor",
    (await sayfa.locator('[data-test="musteri-eksik"]').count()) === 1,
  );
  kontrol(
    "müşteri girilmeden de alış fiyatı alanı çıkıyor",
    (await sayfa.locator('[data-test="fiyat-duzelt-ac"]').count()) >= 1,
  );

  // ===== 13) Aktarım ekranında listeden ürün ekleme
  await sayfa.goto(`${hedef}/aktarim`, { waitUntil: "networkidle" });
  await sayfa.selectOption("#kaynak", { label: "2 Nolu Mağaza" });
  await sayfa.waitForTimeout(400);
  kontrol(
    "aktarım ekranında 'Ürün Listesinden Ekle' var",
    (await sayfa.locator('[data-test="aktarim-liste-ac"]').count()) === 1,
  );
  await sayfa.locator('[data-test="aktarim-liste-ac"]').click();
  await sayfa.waitForTimeout(300);
  await sayfa.fill('[data-test="aktarim-urun-sorgu"]', "SatGeri");
  await sayfa.locator('[data-test="aktarim-urun-bul"]').click();
  await sayfa.waitForTimeout(1500);
  const aktarimSatirlari = sayfa.locator('[data-test="aktarim-urun-satiri"]');
  const bulunanAdet = await aktarimSatirlari.count();
  kontrol("kaynak mağazanın stoğu listeleniyor", bulunanAdet > 0, `${bulunanAdet} satır`);

  const oncekiSatir = await sayfa.locator("li").filter({ hasText: "→" }).count();
  await aktarimSatirlari.first().click();
  await sayfa.waitForTimeout(2500);
  kontrol(
    "listeden seçilen ürün aktarıldı",
    ((await sayfa.locator("main").textContent()) ?? "").includes("Bu oturumda aktarılanlar"),
    `önce ${oncekiSatir} satır`,
  );

  // Aktarılan cihaz listeden düşmeli: aynı cihaz iki kez aktarılamaz.
  await sayfa.fill('[data-test="aktarim-urun-sorgu"]', "SatGeri");
  await sayfa.locator('[data-test="aktarim-urun-bul"]').click();
  await sayfa.waitForTimeout(1500);
  kontrol(
    "aktarılan cihaz listeden düştü",
    (await aktarimSatirlari.count()) < bulunanAdet,
    `${await aktarimSatirlari.count()} satır (önce ${bulunanAdet})`,
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
