// Aynı müşteriye birden çok cihaz satma uçtan uca testi.
//
// Üç cihaz girer, ikisini tek satışta aynı müşteriye satar, üçüncüyü tek
// başına satar. Sepete ekleme, çıkarma, cihaz başına fiyat/kâr, tekrar okutma
// ve kayıt sonrası müşteri sayfası kontrol edilir.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/coklu-satis";
const SIFRE = "Stok2026!";

const damga = Date.now().toString().slice(-8);
const imei = (i) => `35${damga}${String(i).padStart(5, "0")}`.slice(0, 15);
const MUSTERI = `Çoklu Alıcı ${damga}`;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const baglam = await tarayici.newContext({ viewport: { width: 1500, height: 1200 }, locale: "tr-TR" });
const sayfa = await baglam.newPage();
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
  await Promise.all([sayfa.waitForURL("**/panel"), sayfa.click('button[type="submit"]')]);
}

/** Satış ekranında kod okutur. */
async function okut(kod) {
  await sayfa.fill("#okutmaKutusu", kod);
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1200);
}

try {
  await giris("admin");

  // ------------------------------------------------ 1) üç cihaz gir
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `COK${damga}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1200);

  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill("Samsung");
  await alanlar.nth(2).fill("Galaxy A55");
  await kart.locator('input[inputmode="decimal"]').fill("10.000,00");

  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const i of [1, 2, 3]) {
    await imeiKutusu.fill(imei(i));
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(400);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `COK-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);

  // ------------------------------------------------ 2) sepete ekleme
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  const kutuEtiketi = (await sayfa.locator("label[for='okutmaKutusu']").textContent()) ?? "";
  kontrol("başlangıçta 'Satılacak Cihazı Okut' yazıyor", /Satılacak Cihazı Okut/.test(kutuEtiketi), kutuEtiketi.trim());

  await okut(imei(1));
  kontrol("ilk cihaz sepete eklendi", (await sayfa.locator('[data-test="sepet-satiri"]').count()) === 1);

  const ikinciEtiket = (await sayfa.locator("label[for='okutmaKutusu']").textContent()) ?? "";
  kontrol("ekledikten sonra 'Başka Cihaz Okut' oluyor", /Başka Cihaz Okut/.test(ikinciEtiket), ikinciEtiket.trim());

  await okut(imei(2));
  const satirSayisi = await sayfa.locator('[data-test="sepet-satiri"]').count();
  kontrol("ikinci cihaz birinciyi silmeden eklendi", satirSayisi === 2, `${satirSayisi} satır`);

  const sepetMetni = (await sayfa.locator('[data-test="satis-sepeti"]').textContent()) ?? "";
  kontrol("iki cihazın seri numarası da listede", sepetMetni.includes(imei(1)) && sepetMetni.includes(imei(2)));

  // Aynı cihazı tekrar okutmak eklememeli.
  await okut(imei(1));
  const tekrarSonrasi = await sayfa.locator('[data-test="sepet-satiri"]').count();
  kontrol("aynı cihaz ikinci kez eklenmiyor", tekrarSonrasi === 2, `${tekrarSonrasi} satır`);
  const uyari = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("tekrar okutmada uyarı veriliyor", /zaten listede/.test(uyari));

  // Üçüncüyü ekleyip çıkar.
  await okut(imei(3));
  kontrol("üçüncü cihaz eklendi", (await sayfa.locator('[data-test="sepet-satiri"]').count()) === 3);
  await sayfa.locator('[data-test="sepet-cikar"]').last().click();
  await sayfa.waitForTimeout(300);
  const cikarmaSonrasi = await sayfa.locator('[data-test="sepet-satiri"]').count();
  kontrol("çıkar düğmesi cihazı listeden siliyor", cikarmaSonrasi === 2, `${cikarmaSonrasi} satır`);
  const kalanMetin = (await sayfa.locator('[data-test="satis-sepeti"]').textContent()) ?? "";
  kontrol("çıkarılan cihaz listede yok", !kalanMetin.includes(imei(3)));

  // ------------------------------------------------ 3) cihaz başına fiyat
  const fiyatKutulari = sayfa.locator('[data-test="sepet-fiyat"]');
  kontrol("her cihazın kendi fiyat kutusu var", (await fiyatKutulari.count()) === 2);

  // Fiyat kutuları alış fiyatıyla dolu gelmeli: 10 cihazlık satışta her
  // kutuyu elle doldurmak yavaştı. Cihazlar 10.000,00'a girildi.
  const ilkDolgu = await fiyatKutulari.nth(0).inputValue();
  const ikinciDolgu = await fiyatKutulari.nth(1).inputValue();
  kontrol(
    "satış fiyatı alış fiyatıyla dolu geliyor",
    ilkDolgu === "10.000,00" && ikinciDolgu === "10.000,00",
    `${ilkDolgu} | ${ikinciDolgu}`,
  );
  const dolguBandi = (await sayfa.locator('[data-test="satis-toplami"]').textContent()) ?? "";
  kontrol(
    "dolu gelen fiyatta kâr sıfır",
    dolguBandi.includes("20.000,00"),
    dolguBandi.replace(/\s+/g, " ").trim(),
  );
  // Müşteri henüz seçilmedi, o yüzden sorun kutusu görünüyor; bizi ilgilendiren
  // içinde fiyat sorunu olup olmadığı.
  const fiyatSorunuVarMi = async () => {
    const kutu = sayfa.locator('[data-test="satis-sorunlari"]');
    if ((await kutu.count()) === 0) return false;
    return /satış fiyatı/.test((await kutu.textContent()) ?? "");
  };
  kontrol("dolu fiyatla fiyat sorunu bildirilmiyor", !(await fiyatSorunuVarMi()));

  await fiyatKutulari.nth(0).fill("13.000,00");
  await fiyatKutulari.nth(1).fill("11.500,50");
  await sayfa.waitForTimeout(400);

  const altBant = (await sayfa.locator('[data-test="satis-toplami"]').textContent()) ?? "";
  kontrol("alt bantta 2 cihaz yazıyor", /2 cihaz/.test(altBant), altBant.replace(/\s+/g, " ").trim());
  kontrol("toplam satış doğru", altBant.includes("24.500,50"), "13.000,00 + 11.500,50");
  kontrol("toplam kâr doğru", altBant.includes("4.500,50"), "24.500,50 − 20.000,00");

  const dugmeMetni = (await sayfa.locator('button:has-text("Cihazı Sat")').textContent()) ?? "";
  kontrol("kaydet düğmesi adedi gösteriyor", dugmeMetni.includes("2 Cihazı Sat"), dugmeMetni.trim());

  // Fiyatı silmek artık engel değil: alış fiyatına satılmış sayılıyor.
  await fiyatKutulari.nth(1).fill("");
  await sayfa.waitForTimeout(400);
  kontrol("fiyatı boş bırakmak fiyat sorunu doğurmuyor", !(await fiyatSorunuVarMi()));
  const bosBant = (await sayfa.locator('[data-test="satis-toplami"]').textContent()) ?? "";
  kontrol(
    "boş fiyat alış fiyatı (10.000,00) sayılıyor",
    bosBant.includes("23.000,00"),
    bosBant.replace(/\s+/g, " ").trim(),
  );
  kontrol(
    "boş kutuda ipucu görünüyor",
    (await sayfa.locator('[data-test="fiyat-ipucu"]').count()) === 1,
  );

  // Okunamayan metin ise engellemeli: yazım hatasını sessizce alış fiyatı
  // saymak yanlış olurdu.
  await fiyatKutulari.nth(1).fill("abc");
  await sayfa.waitForTimeout(400);
  const sorunMetni = (await sayfa.locator('[data-test="satis-sorunlari"]').textContent()) ?? "";
  kontrol(
    "okunamayan fiyat uyarı veriyor",
    /satış fiyatı okunamadı/.test(sorunMetni),
    sorunMetni.replace(/\s+/g, " ").trim(),
  );
  await fiyatKutulari.nth(1).fill("11.500,50");
  await sayfa.waitForTimeout(300);

  // ------------------------------------------------ 4) satışı yapan seçimi
  const saticiSecici = sayfa.locator("#satanKullaniciId");
  kontrol("satışı yapan alanı var", (await saticiSecici.count()) === 1);

  const saticiSecenekleri = await sayfa.locator("#satanKullaniciId option").allTextContents();
  kontrol(
    "oturum sahibi listede ve (siz) diye işaretli",
    saticiSecenekleri.some((o) => o.includes("(siz)")),
    saticiSecenekleri.join(" | "),
  );
  kontrol(
    "mağaza personeli de seçilebiliyor",
    saticiSecenekleri.length > 1,
    `${saticiSecenekleri.length} seçenek`,
  );

  // Satışı başka bir personelin üstüne yaz.
  const personelSecenegi = saticiSecenekleri.find((o) => !o.includes("(siz)")) ?? "";
  await saticiSecici.selectOption({ label: personelSecenegi });
  await sayfa.waitForTimeout(200);
  const secilenSatici = personelSecenegi.trim();

  // ---- ödeme tipi: Temlik öndeğer, ama değiştirilebiliyor
  const odemeSecenekleri = await sayfa.locator("#odemeTipi option").allTextContents();
  kontrol(
    "ödeme tipinde Temlik var",
    odemeSecenekleri.some((o) => o.trim() === "Temlik"),
    odemeSecenekleri.join(" | "),
  );
  // Satışların çoğu temlikle yapılıyor; her satışta listeden seçmek fazladan
  // bir adımdı. Seçili değerin etiketini okuyoruz, value'yu değil: kullanıcı
  // ekranda "Temlik" yazdığını görmeli.
  const secikiOdeme = await sayfa
    .locator("#odemeTipi option:checked")
    .first()
    .textContent();
  kontrol(
    "ödeme tipi öndeğeri Temlik geliyor",
    (secikiOdeme ?? "").trim() === "Temlik",
    (secikiOdeme ?? "").trim(),
  );

  // Öndeğer bir kilit değil: başka bir tip seçilebilmeli.
  await sayfa.selectOption("#odemeTipi", { label: "Nakit" });
  await sayfa.waitForTimeout(200);
  const degisenOdeme = await sayfa.locator("#odemeTipi option:checked").first().textContent();
  kontrol(
    "ödeme tipi listeden değiştirilebiliyor",
    (degisenOdeme ?? "").trim() === "Nakit",
    (degisenOdeme ?? "").trim(),
  );
  await sayfa.selectOption("#odemeTipi", { label: "Temlik" });

  // ------------------------------------------------ 5) müşteri ve kayıt
  await sayfa.fill("#yeniAd", MUSTERI);
  await sayfa.fill("#yeniTelefon", `555${damga}`);
  await Promise.all([
    sayfa.waitForURL("**/musteriler**", { timeout: 30000 }),
    sayfa.click('button:has-text("Cihazı Sat")'),
  ]);
  kontrol("çoklu satış müşteri sayfasına yönlendirdi", sayfa.url().includes("/musteriler"), sayfa.url());

  const musteriMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("müşteri sayfasında 2 cihaz görünüyor", /2 cihaz/.test(musteriMetni), (musteriMetni.match(/\d+ cihaz/) ?? [""])[0]);
  kontrol("müşteri adı doğru", musteriMetni.includes(MUSTERI));

  // ------------------------------------------------ 6) iki cihaz da satıldı
  for (const i of [1, 2]) {
    await sayfa.goto(`${hedef}/cihazlar?ara=${imei(i)}`, { waitUntil: "networkidle" });
    const cihazMetni = (await sayfa.locator("main").textContent()) ?? "";
    kontrol(`${i}. cihaz satıldı olarak işaretli`, /Satıldı|SATILDI/.test(cihazMetni), imei(i));
    kontrol(`${i}. cihaz müşteriye bağlandı`, cihazMetni.includes(MUSTERI), "");
  }

  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(1)}`, { waitUntil: "networkidle" });
  const ilkCihaz = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("birinci cihazın kendi fiyatı kaydedildi", ilkCihaz.includes("13.000,00"), "");
  kontrol(
    "satışı yapan seçilen kişi olarak kaydedildi",
    ilkCihaz.includes(secilenSatici),
    secilenSatici,
  );

  // Satıştan sonra düşülen sayfalarda yeni satışa dönüş düğmesi olmalı.
  kontrol(
    "cihaz detayında '+ Yeni Satış' düğmesi var",
    (await sayfa.locator('[data-test="yeni-satis"]').count()) === 1,
  );
  await Promise.all([
    sayfa.waitForURL("**/satis", { timeout: 20000 }),
    sayfa.locator('[data-test="yeni-satis"]').click(),
  ]);
  kontrol("düğme satış ekranına götürüyor", sayfa.url().endsWith("/satis"), sayfa.url());

  await sayfa.goto(`${hedef}/musteriler`, { waitUntil: "networkidle" });
  kontrol(
    "müşteriler sayfasında da '+ Yeni Satış' var",
    (await sayfa.locator('[data-test="yeni-satis"]').count()) === 1,
  );

  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(2)}`, { waitUntil: "networkidle" });
  const ikinciCihaz = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("ikinci cihazın kendi fiyatı kaydedildi", ikinciCihaz.includes("11.500,50"), "");

  // Satılan cihaz tekrar sepete eklenememeli.
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  await okut(imei(1));
  const satilmisUyari = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("satılmış cihaz tekrar satışa eklenmiyor", /daha önce satılmış/.test(satilmisUyari));

  // ------------------------------------------------ 7) tek cihaz eski akış
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  await okut(imei(3));
  await sayfa.locator('[data-test="sepet-fiyat"]').first().fill("12.000,00");
  await sayfa.fill("#musteriSorgu", MUSTERI);
  await sayfa.click('button:has-text("Ara")');
  await sayfa.waitForTimeout(1500);
  const secButonu = sayfa.locator('button:has-text("Seç")').first();
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
  kontrol("tek cihaz satışı cihaz detayına gidiyor", /\/cihazlar\/\d+$/.test(sayfa.url()), sayfa.url());

  const tekCihaz = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("tek cihaz da aynı müşteriye bağlandı", tekCihaz.includes(MUSTERI));

  // ------------------------------------------------ 7b) yönetici satışı düzeltebiliyor
  await giris("admin");
  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(1)}`, { waitUntil: "networkidle" });

  const temlikYazdi = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("Temlik ödeme tipi kaydedildi", /Temlik/.test(temlikYazdi));

  await sayfa.locator('[data-test="satis-duzenle-ac"]').click();
  await sayfa.waitForTimeout(300);
  kontrol(
    "yöneticiye satış düzeltme formu açılıyor",
    (await sayfa.locator('[data-test="satis-duzenleme"]').count()) === 1,
  );

  await sayfa.locator('[data-test="duzelt-satis-fiyati"]').fill("15.750,25");
  await sayfa.locator('[data-test="duzelt-odeme-tipi"]').selectOption({ label: "Havale/EFT" });
  await sayfa.click('button:has-text("Değişiklikleri Kaydet")');
  await sayfa.waitForTimeout(2500);

  const duzeltmeSonrasi = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("düzeltilen satış fiyatı kaydedildi", /15\.750,25/.test(duzeltmeSonrasi));
  kontrol("düzeltilen ödeme tipi kaydedildi", /Havale/.test(duzeltmeSonrasi));

  // ---- satışı geri alma
  await sayfa.locator('[data-test="satis-duzenle-ac"]').click().catch(() => {});
  await sayfa.waitForTimeout(300);
  await sayfa.locator('[data-test="satis-geri-al"]').click();
  await sayfa.waitForTimeout(300);
  await sayfa.click('button:has-text("Evet, satışı geri al")');
  await sayfa.waitForTimeout(2500);

  const geriSonrasi = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("satış geri alınınca cihaz stokta", /Stokta/.test(geriSonrasi));
  // Müşteri adı tarihçede kalır (ne olduğu kayıtlı kalmalı); kontrol edilen,
  // satış kartının tamamen kalkmış olması.
  kontrol(
    "satış kartı kalktı, cihaz artık satılmamış sayılıyor",
    !/Satış ve Müşteri Bilgileri/.test(geriSonrasi),
  );
  kontrol("geri alma tarihçeye yazıldı", /İade|Satış geri alındı/.test(geriSonrasi));

  // Stoğa dönen cihaz tekrar satılabilmeli.
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  await okut(imei(1));
  kontrol(
    "geri alınan cihaz tekrar satılabiliyor",
    (await sayfa.locator('[data-test="sepet-satiri"]').count()) === 1,
  );

  // Personel satış düzeltme formunu görmemeli.
  await giris("personel1");
  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(3)}`, { waitUntil: "networkidle" });
  kontrol(
    "personele satış düzeltme formu çıkmıyor",
    (await sayfa.locator('[data-test="satis-duzenle-ac"]').count()) === 0,
  );
  await giris("admin");

  // ------------------------------------------------ 8) personel bazlı rapor
  await sayfa.goto(`${hedef}/rapor`, { waitUntil: "networkidle" });
  const raporMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "kullanıcı bazlı satış raporunda seçilen satıcı görünüyor",
    raporMetni.includes(secilenSatici),
    secilenSatici,
  );

  await sayfa.screenshot({ path: `${cikti}-son.png`, fullPage: true });
} catch (hata) {
  kontrol("betik tamamlandı", false, String(hata).slice(0, 300));
  await sayfa.screenshot({ path: `${cikti}-hata.png`, fullPage: true }).catch(() => {});
} finally {
  await tarayici.close();
}

if (konsolHatalari.length > 0) {
  console.log("\nTarayıcı konsol hataları:");
  for (const h of konsolHatalari.slice(0, 10)) console.log(`  ${h}`);
}

const basarisiz = sonuclar.filter((s) => !s.gecti);
console.log(`\n${sonuclar.length - basarisiz.length}/${sonuclar.length} kontrol geçti.`);
process.exit(basarisiz.length === 0 && konsolHatalari.length === 0 ? 0 : 1);
