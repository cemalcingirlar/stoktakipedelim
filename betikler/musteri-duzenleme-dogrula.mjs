// Müşteri kaydının düzeltilmesi ve silinmesi uçtan uca testi.
//
// Müşteriler ekranı salt okunurdu: satış sırasında yanlış yazılan telefon
// sonsuza kadar öyle kalıyordu (yanlış numara = bir daha aranamayan müşteri),
// KVKK kapsamında "verilerimi silin" talebine de teknik bir cevap yoktu.
//
// Silmenin iki biçimi var: satışı olmayan müşteri tamamen silinir, satışı
// olanın yalnız kişisel alanları boşaltılır — ticari kayıt (cihaz kime
// satıldı, ciro) korunur. Bu test satışı olan yolu uçtan uca sürüyor;
// satışı olmayan yol birim testlerinde (src/lib/musteriDuzenleme.test.ts).
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/musteri-duzenleme";
const SIFRE = "Stok2026!";

const damga = Date.now().toString().slice(-8);
const imei = (i) => `36${damga}${String(i).padStart(5, "0")}`.slice(0, 15);
const MUSTERI = `Düzelt Alıcı ${damga}`;
const IKINCI_MUSTERI = `Ikinci Alıcı ${damga}`;
const TELEFON = `0532${damga.slice(0, 7)}`;
const IKINCI_TELEFON = `0533${damga.slice(0, 7)}`;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({
  viewport: { width: 1500, height: 1300 },
  locale: "tr-TR",
});
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

/** Tek cihazı okutup verilen müşteriye satar. */
async function sat(kod, ad, telefon) {
  await sayfa.goto(`${hedef}/satis`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutmaKutusu", kod);
  await sayfa.press("#okutmaKutusu", "Enter");
  await sayfa.waitForTimeout(1500);
  await sayfa.fill("#yeniAd", ad);
  await sayfa.fill("#yeniTelefon", telefon);
  await Promise.all([
    // Tek cihazlık satış cihaz detayına, çoklu satış müşteri sayfasına düşer.
    sayfa.waitForURL(/\/(musteriler|cihazlar\/\d+)/, { timeout: 30000 }),
    // Tek cihazda düğme "Satışı Kaydet", birden çoğunda "N Cihazı Sat".
    sayfa.click('button:has-text("Satışı Kaydet")'),
  ]);
}

/** Cihaz listesindeki kayıt sayısı — başlıktaki "N cihaz"; boş listede 0. */
async function cihazSayisi() {
  const kutu = sayfa.locator("text=/^\\d+ cihaz/").first();
  if ((await kutu.count()) === 0) return 0;
  const metin = (await kutu.textContent()) ?? "";
  return Number((metin.match(/(\d+)/) ?? [0, "0"])[1]);
}

/** Verilen müşterinin satırı. */
function satir(ad) {
  return sayfa.locator("li").filter({ hasText: ad }).first();
}

async function duzenlemeyiAc(ad) {
  await sayfa.goto(`${hedef}/musteriler?ara=${encodeURIComponent(ad)}`, {
    waitUntil: "networkidle",
  });
  await satir(ad).locator('[data-test="musteri-duzenle-ac"]').click();
  await sayfa.waitForTimeout(400);
}

try {
  // =========================================== 0) Hazırlık: iki satış
  await giris("admin");
  await sayfa.goto(`${hedef}/faturalar/yeni`, { waitUntil: "networkidle" });
  await sayfa.fill("#okutma", `MUS${damga}`);
  await sayfa.press("#okutma", "Enter");
  await sayfa.waitForTimeout(1300);

  const kart = sayfa.locator("section.space-y-3 > div.rounded-xl").first();
  await kart.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await kart.locator("select").nth(1).selectOption({ index: 1 });
  const alanlar = kart.locator('input[type="text"], input:not([type])');
  await alanlar.nth(1).fill("Samsung");
  await alanlar.nth(2).fill("Galaxy A55");
  await kart.locator('input[inputmode="decimal"]').fill("10.000,00");
  const imeiKutusu = sayfa.locator('input[id^="imei-"]').first();
  for (const i of [1, 2]) {
    await imeiKutusu.fill(imei(i));
    await imeiKutusu.press("Enter");
    await sayfa.waitForTimeout(400);
  }
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.fill("#faturaNo", `MUS-${damga}`);
  await sayfa.selectOption("#magazaId", { label: "1 Nolu Mağaza" });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }),
    sayfa.click('button:has-text("Faturayı Kaydet")'),
  ]);

  await sat(imei(1), MUSTERI, TELEFON);
  await sat(imei(2), IKINCI_MUSTERI, IKINCI_TELEFON);
  kontrol("hazırlık: iki müşteriye birer cihaz satıldı", true);

  // =========================================== 1) Düzeltme açılıyor
  await sayfa.goto(`${hedef}/musteriler?ara=${encodeURIComponent(MUSTERI)}`, {
    waitUntil: "networkidle",
  });
  kontrol(
    "müşteri satırında düzeltme düğmesi var",
    (await satir(MUSTERI).locator('[data-test="musteri-duzenle-ac"]').count()) === 1,
  );
  kontrol(
    "düzeltme formu başta kapalı",
    (await sayfa.locator('[data-test="musteri-duzenleme-formu"]').count()) === 0,
  );

  await duzenlemeyiAc(MUSTERI);
  const form = satir(MUSTERI).locator('[data-test="musteri-duzenleme-formu"]');
  kontrol("düzeltme formu açıldı", (await form.count()) === 1);
  kontrol(
    "formda mevcut telefon dolu geliyor",
    (await form.locator('[data-test="musteri-telefon"]').inputValue()) === TELEFON,
    await form.locator('[data-test="musteri-telefon"]').inputValue(),
  );

  // =========================================== 2) Telefon düzeltiliyor
  const YENI_TELEFON = `0555 ${damga.slice(0, 3)} ${damga.slice(3, 5)} ${damga.slice(5, 7)}`;
  const BEKLENEN = YENI_TELEFON.replace(/\s/g, "");
  await form.locator('[data-test="musteri-telefon"]').fill(YENI_TELEFON);
  await form.locator('[data-test="musteri-tckn"]').fill("12345678901");
  await form.locator('[data-test="musteri-adres"]').fill(`Deneme Mah. ${damga}`);
  await form.locator('button[type="submit"]').click();
  await sayfa.waitForTimeout(2500);

  await sayfa.goto(`${hedef}/musteriler?ara=${encodeURIComponent(MUSTERI)}`, {
    waitUntil: "networkidle",
  });
  const satirMetni = ((await satir(MUSTERI).textContent()) ?? "").replace(/\s+/g, " ");
  kontrol(
    "telefon boşluklardan arınıp kaydedildi",
    satirMetni.includes(BEKLENEN),
    satirMetni.slice(0, 160),
  );
  kontrol("TCKN kaydedildi", satirMetni.includes("12345678901"), satirMetni.slice(0, 160));
  kontrol("adres kaydedildi", satirMetni.includes(`Deneme Mah. ${damga}`));

  // Numarayla arama düzeltilmiş numarayı bulmalı: asıl mesele bu.
  await sayfa.goto(`${hedef}/musteriler?ara=${BEKLENEN}`, { waitUntil: "networkidle" });
  kontrol(
    "düzeltilmiş numarayla müşteri bulunuyor",
    ((await sayfa.locator("main").textContent()) ?? "").includes(MUSTERI),
  );

  // =========================================== 3) Geçersiz değerler
  await duzenlemeyiAc(MUSTERI);
  const form2 = satir(MUSTERI).locator('[data-test="musteri-duzenleme-formu"]');
  await form2.locator('[data-test="musteri-telefon"]').fill("0532 abc 11");
  await form2.locator('button[type="submit"]').click();
  await sayfa.waitForTimeout(2000);
  const hataMetni = ((await satir(MUSTERI).textContent()) ?? "").replace(/\s+/g, " ");
  kontrol(
    "harf içeren telefon reddedildi",
    hataMetni.includes("yalnız rakamlardan"),
    hataMetni.slice(0, 150),
  );

  await sayfa.goto(`${hedef}/musteriler?ara=${BEKLENEN}`, { waitUntil: "networkidle" });
  kontrol(
    "geçersiz denemeden sonra eski telefon duruyor",
    ((await sayfa.locator("main").textContent()) ?? "").includes(MUSTERI),
  );

  // Başka müşterinin numarası verilemez: aynı numara tek kayda bağlı olmalı.
  await duzenlemeyiAc(MUSTERI);
  const form3 = satir(MUSTERI).locator('[data-test="musteri-duzenleme-formu"]');
  await form3.locator('[data-test="musteri-telefon"]').fill(IKINCI_TELEFON);
  await form3.locator('button[type="submit"]').click();
  await sayfa.waitForTimeout(2000);
  const cakismaMetni = ((await satir(MUSTERI).textContent()) ?? "").replace(/\s+/g, " ");
  kontrol(
    "başka müşteride kayıtlı telefon reddedildi",
    cakismaMetni.includes("iki müşteriye verilemez"),
    cakismaMetni.slice(0, 180),
  );
  kontrol(
    "çakışma mesajı hangi müşteri olduğunu söylüyor",
    cakismaMetni.includes(IKINCI_MUSTERI),
  );

  // Boş ad soyad: tarayıcı doğrulaması da sunucu doğrulaması da engellemeli.
  await duzenlemeyiAc(MUSTERI);
  const adAlani = satir(MUSTERI).locator('[data-test="musteri-ad"]');
  kontrol("ad soyad alanı zorunlu işaretli", await adAlani.evaluate((e) => e.required));

  // =========================================== 4) Personel silemez
  await giris("personel1");
  await sayfa.goto(`${hedef}/musteriler?ara=${encodeURIComponent(MUSTERI)}`, {
    waitUntil: "networkidle",
  });
  kontrol(
    "personel düzeltme düğmesini görüyor",
    (await satir(MUSTERI).locator('[data-test="musteri-duzenle-ac"]').count()) === 1,
  );
  await satir(MUSTERI).locator('[data-test="musteri-duzenle-ac"]').click();
  await sayfa.waitForTimeout(400);
  kontrol(
    "personele silme düğmesi gösterilmiyor",
    (await sayfa.locator('[data-test="musteri-sil-ac"]').count()) === 0,
  );

  // Personel düzeltmeyi yapabilmeli: numarayı fark eden genelde o.
  const personelForm = satir(MUSTERI).locator('[data-test="musteri-duzenleme-formu"]');
  await personelForm.locator('[data-test="musteri-not"]').fill("Personel notu");
  await personelForm.locator('button[type="submit"]').click();
  await sayfa.waitForTimeout(2500);
  await sayfa.goto(`${hedef}/musteriler?ara=${encodeURIComponent(MUSTERI)}`, {
    waitUntil: "networkidle",
  });
  kontrol(
    "personelin düzeltmesi kaydedildi",
    ((await satir(MUSTERI).textContent()) ?? "").includes("Personel notu"),
  );

  // ================== 5) KVKK silme: satışı olan müşteri anonimleşir
  await giris("admin");
  await duzenlemeyiAc(MUSTERI);
  kontrol(
    "yöneticiye silme düğmesi çıkıyor",
    (await satir(MUSTERI).locator('[data-test="musteri-sil-ac"]').count()) === 1,
  );
  await satir(MUSTERI).locator('[data-test="musteri-sil-ac"]').click();
  await sayfa.waitForTimeout(400);
  const ozet = ((await sayfa.locator('[data-test="musteri-silme-ozeti"]').textContent()) ?? "")
    .replace(/\s+/g, " ")
    .trim();
  kontrol("silme onayı ne olacağını söylüyor", /satış kayıtları korunacak/i.test(ozet), ozet);
  kontrol("silme onayı satış adedini yazıyor", /1 satışı/.test(ozet), ozet);

  await sayfa
    .locator('[data-test="musteri-silme-formu"] button[type="submit"]')
    .first()
    .click();
  await sayfa.waitForTimeout(2500);
  // Arama ekranı müşterinin ESKİ adıyla süzülmüş durumda; anonimleşen kayıt
  // aramaya uymadığı için satır listeden düşüyor. Başarı mesajı da satırla
  // birlikte gidiyor, bu yüzden sonuç satırın kaybolmasıyla ölçülüyor.
  kontrol(
    "anonimleşen müşteri eski adıyla listeden düştü",
    (await satir(MUSTERI).count()) === 0,
  );

  await sayfa.goto(`${hedef}/musteriler?ara=${encodeURIComponent(MUSTERI)}`, {
    waitUntil: "networkidle",
  });
  kontrol(
    "eski adıyla artık bulunamıyor",
    !((await sayfa.locator("main").textContent()) ?? "").includes(MUSTERI),
  );
  await sayfa.goto(`${hedef}/musteriler?ara=${BEKLENEN}`, { waitUntil: "networkidle" });
  kontrol(
    "telefonuyla da bulunamıyor",
    !((await sayfa.locator("main").textContent()) ?? "").includes(BEKLENEN),
  );

  await sayfa.goto(`${hedef}/musteriler`, { waitUntil: "networkidle" });
  kontrol(
    "kayıt anonim adla listede duruyor",
    ((await sayfa.locator("main").textContent()) ?? "").includes("Kaydı silinmiş müşteri"),
  );

  // Ticari kayıt korunmalı: satılan cihaz hâlâ satılmış görünüyor ve satışın
  // müşterisi kayıtta duruyor — yalnız kişisel bilgiler gitmiş olmalı.
  await sayfa.goto(`${hedef}/cihazlar?seriNo=${imei(1)}`, { waitUntil: "networkidle" });
  // Listedeki satırdan cihaz detayına geç: üst menüde de /cihazlar ile
  // başlayan bağlantılar var, bu yüzden tablo içinden seçiliyor.
  await Promise.all([
    sayfa.waitForURL(/\/cihazlar\/\d+$/, { timeout: 30000 }),
    sayfa.locator('tbody a[href^="/cihazlar/"]').first().click(),
  ]);
  await sayfa.waitForTimeout(800);
  const cihazMetni = ((await sayfa.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
  kontrol(
    "cihaz hâlâ satılmış görünüyor",
    /Satıldı/.test(cihazMetni),
    cihazMetni.slice(0, 120),
  );
  kontrol(
    "satış müşterisi anonim kayda bağlı kaldı",
    cihazMetni.includes("Kaydı silinmiş müşteri"),
    (cihazMetni.match(/Müşteri.{0,40}/) ?? [""])[0],
  );
  kontrol(
    "cihaz kaydında eski ad ve telefon kalmadı",
    !cihazMetni.includes(MUSTERI) && !cihazMetni.includes(BEKLENEN),
    (cihazMetni.match(new RegExp(`.{0,40}${MUSTERI}.{0,20}`)) ?? [""])[0],
  );
  kontrol(
    "satış hareketinin açıklamasında da ad kalmadı",
    /Kaydı silinmiş müşteri müşterisine satıldı/.test(cihazMetni),
    (cihazMetni.match(/.{0,50}müşterisine satıldı/) ?? [""])[0],
  );

  // Asıl sızıntı buradaydı: müşteri adı cihazın arama metnine de
  // kopyalanıyordu, yani silinen ad cihaz aramasında bulunmaya devam ederdi.
  await sayfa.goto(`${hedef}/cihazlar?ara=${encodeURIComponent(MUSTERI)}`, {
    waitUntil: "networkidle",
  });
  kontrol(
    "silinen müşterinin adıyla cihaz aranamıyor",
    (await cihazSayisi()) === 0,
    `${await cihazSayisi()} cihaz`,
  );
  await sayfa.goto(`${hedef}/cihazlar?ara=${BEKLENEN}`, { waitUntil: "networkidle" });
  kontrol(
    "silinen müşterinin telefonuyla da cihaz aranamıyor",
    (await cihazSayisi()) === 0,
    `${await cihazSayisi()} cihaz`,
  );

  // Ölçüm yanlış yerden okunmasın: silinmeyen müşterinin adıyla arama HÂLÂ
  // cihazı bulmalı. Yoksa "0 cihaz" sonucu aramanın bozulmasından da
  // gelebilirdi ve test bunu başarı sanırdı.
  await sayfa.goto(`${hedef}/cihazlar?ara=${encodeURIComponent(IKINCI_MUSTERI)}`, {
    waitUntil: "networkidle",
  });
  kontrol(
    "silinmeyen müşterinin adıyla cihaz hâlâ bulunuyor",
    (await cihazSayisi()) === 1,
    `${await cihazSayisi()} cihaz`,
  );

  // =========================================== 6) Loglar
  await sayfa.goto(`${hedef}/ayarlar/loglar`, { waitUntil: "networkidle" });
  const logMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("düzeltme loglandı", logMetni.includes("Müşteri bilgisi düzeltti"));
  kontrol("silme loglandı", logMetni.includes("Müşteri kaydı sildi"));
  kontrol(
    "silme logu anonimleştirmeyi yazıyor",
    /anonimleştirildi/.test(logMetni),
    (logMetni.match(/.{0,40}anonimleştirildi.{0,30}/) ?? [""])[0],
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
