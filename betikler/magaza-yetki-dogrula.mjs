// Mağaza ekranından yetki verme testi: admin, mağaza kartındaki "Yetkili
// Kullanıcılar" bölümünden bir personele yetki verir; yetki kullanıcı
// ekranında görünür ve personel o mağazada gerçekten işlem yapabilir hale
// gelir. Yetkiyi geri almak da aynı ekrandan çalışır.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/magazayetki";
const SIFRE = "Stok2026!";

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

/** Kod rozetine göre mağaza kartını bulur; sıraya güvenmez. */
function magazaKarti(kod) {
  return sayfa
    .locator("div.rounded-xl.border.bg-white")
    .filter({ has: sayfa.locator("span", { hasText: new RegExp(`^${kod}$`) }) })
    .first();
}

/**
 * Kullanıcı kartını kullanıcı adı alanından bulur. Ad soyad bir input
 * değerinde durduğu için kartın metninde geçmez; hasText ile aranmaz.
 */
function kullaniciKarti(kullaniciAdi) {
  return sayfa
    .locator("div.rounded-xl.border.bg-white")
    .filter({ has: sayfa.locator(`input[name="kullaniciAdi"][value="${kullaniciAdi}"]`) })
    .first();
}

/** Karttaki "Yetkileri Kaydet" formu. */
function yetkiFormu(kart) {
  return kart.locator("form").filter({ hasText: "Yetkileri Kaydet" }).first();
}

try {
  // ---------------------------------------------------------------- 1) Ekran
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });

  const kartM1 = magazaKarti("M1");
  const kartM2 = magazaKarti("M2");
  kontrol("M1 ve M2 kartları bulundu", (await kartM1.count()) === 1 && (await kartM2.count()) === 1);

  const baslikSayisi = await sayfa.getByText("Yetkili Kullanıcılar", { exact: true }).count();
  kontrol("her mağazada yetki bölümü var", baslikSayisi === 3, `${baslikSayisi} bölüm`);

  // Yönetici kutu listesine girmemeli; her mağazada yetkili olduğu notta yazar.
  const yoneticiKutusu = await yetkiFormu(kartM2)
    .locator('input[name="yetkililer"]')
    .evaluateAll((kutular) => kutular.length);
  kontrol("yönetici kutu olarak listelenmiyor", yoneticiKutusu === 6, `${yoneticiKutusu} kutu (3 sorumlu + 3 personel)`);
  kontrol(
    "yönetici notu görünüyor",
    (await yetkiFormu(kartM2).getByText(/Yönetici .*her mağazada yetkilidir/).count()) === 1,
  );

  // -------------------------------------------------- 2) Ana mağaza kilitli
  const m1Personel1 = yetkiFormu(kartM1).locator(
    'label:has-text("1 Nolu Mağaza Personeli") input[name="yetkililer"]',
  );
  kontrol("ana mağazasında kutu işaretli", await m1Personel1.isChecked());
  kontrol("ana mağazasında kutu devre dışı", await m1Personel1.isDisabled());
  kontrol(
    'ana mağaza etiketi "ana mağazası" yazıyor',
    (await yetkiFormu(kartM1).getByText("ana mağazası").count()) >= 1,
  );

  // ------------------------------------------------- 3) M2'de yetki verelim
  const m2Personel1Etiket = yetkiFormu(kartM2).locator(
    'label:has-text("1 Nolu Mağaza Personeli")',
  );
  const m2Personel1 = m2Personel1Etiket.locator('input[name="yetkililer"]');
  kontrol("M2'de personel1 başta yetkisiz", !(await m2Personel1.isChecked()));
  kontrol("M2'de personel1 kutusu açık", !(await m2Personel1.isDisabled()));

  await m2Personel1.check();
  await yetkiFormu(kartM2).getByRole("button", { name: "Yetkileri Kaydet" }).click();
  await sayfa.waitForTimeout(1500);

  const basariMetni = await yetkiFormu(kartM2).locator('[role="status"]').textContent();
  kontrol(
    "kaydetme başarı mesajı döndü",
    Boolean(basariMetni && basariMetni.includes("1 eklendi")),
    (basariMetni ?? "mesaj yok").trim(),
  );

  await sayfa.reload({ waitUntil: "networkidle" });
  kontrol(
    "sayfa yenilendikten sonra kutu işaretli kaldı",
    await yetkiFormu(magazaKarti("M2"))
      .locator('label:has-text("1 Nolu Mağaza Personeli") input[name="yetkililer"]')
      .isChecked(),
  );

  // ------------------------------- 4) Kullanıcı ekranında da görünüyor mu?
  await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
  const personelKarti = kullaniciKarti("personel1");
  const rozetSayisi = await personelKarti.getByText("+ 2 Nolu Mağaza").count();
  kontrol(
    "kullanıcı ekranında + 2 Nolu Mağaza rozeti var",
    rozetSayisi === 1,
    `${rozetSayisi} rozet`,
  );

  // ------------------------------- 5) Personel gerçekten işlem yapabiliyor
  await giris("personel1");
  await sayfa.goto(`${hedef}/sayim`, { waitUntil: "networkidle" });
  const sayimSecenek = await sayfa.locator('select[name="magazaId"] option').count();
  kontrol(
    "personel sayımda iki mağaza görüyor",
    sayimSecenek === 3,
    `${sayimSecenek} seçenek (Seçin… dahil)`,
  );

  await sayfa.goto(`${hedef}/sevkiyat/yeni`, { waitUntil: "networkidle" });
  const kaynakSecenek = await sayfa.locator("#kaynak option").count();
  kontrol("personel sevkiyatta iki kaynak görüyor", kaynakSecenek === 2, `${kaynakSecenek} seçenek`);

  await sayfa.screenshot({ path: `${cikti}-personel.png`, fullPage: true });

  // ------------------------------------------------- 6) Yetkiyi geri alalım
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
  const kartM2b = magazaKarti("M2");
  await yetkiFormu(kartM2b)
    .locator('label:has-text("1 Nolu Mağaza Personeli") input[name="yetkililer"]')
    .uncheck();
  await yetkiFormu(kartM2b).getByRole("button", { name: "Yetkileri Kaydet" }).click();
  await sayfa.waitForTimeout(1500);

  const geriMetni = await yetkiFormu(kartM2b).locator('[role="status"]').textContent();
  kontrol(
    "yetki kaldırma mesajı döndü",
    Boolean(geriMetni && geriMetni.includes("1 kaldırıldı")),
    (geriMetni ?? "mesaj yok").trim(),
  );

  await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
  kontrol(
    "rozet kalktı",
    (await kullaniciKarti("personel1").getByText("+ 2 Nolu Mağaza").count()) === 0,
  );

  await giris("personel1");
  await sayfa.goto(`${hedef}/sayim`, { waitUntil: "networkidle" });
  const sonSecenek = await sayfa.locator('select[name="magazaId"] option').count();
  kontrol("personel yine tek mağaza görüyor", sonSecenek === 2, `${sonSecenek} seçenek`);

  // ---------------------------------------------------- 7) Değişiklik yoksa
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/magazalar`, { waitUntil: "networkidle" });
  const kartM3 = magazaKarti("M3");
  await yetkiFormu(kartM3).getByRole("button", { name: "Yetkileri Kaydet" }).click();
  await sayfa.waitForTimeout(1200);
  const bosMetni = await yetkiFormu(kartM3).locator('[role="status"]').textContent();
  kontrol(
    "boş kaydetme uyarı vermiyor",
    Boolean(bosMetni && bosMetni.includes("değişiklik yok")),
    (bosMetni ?? "mesaj yok").trim(),
  );

  await sayfa.screenshot({ path: `${cikti}-magazalar.png`, fullPage: true });

  kontrol("tarayıcı konsolunda hata yok", hatalar.length === 0, hatalar.slice(0, 3).join(" | "));
} finally {
  await tarayici.close();
}

const gecen = sonuclar.filter((s) => s.gecti).length;
console.log(`\n${gecen}/${sonuclar.length} kontrol geçti`);
if (gecen !== sonuclar.length) process.exit(1);
