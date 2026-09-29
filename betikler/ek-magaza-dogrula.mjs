// Çoklu mağaza yetkisi uçtan uca testi:
// admin bir personele ek mağaza verir, o personel ek mağazada işlem yapabilir mi?
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/ekmagaza";
const SIFRE = "Stok2026!";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1500, height: 1100 }, locale: "tr-TR" });
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
  await Promise.all([sayfa.waitForURL("**/panel"), sayfa.click('button[type="submit"]')]);
}

try {
  // 1) personel1 başlangıçta yalnız kendi mağazasını görüyor
  await giris("personel1");
  await sayfa.goto(`${hedef}/sayim`, { waitUntil: "networkidle" });
  const oncekiSecenek = await sayfa.locator('select[name="magazaId"] option').count();
  kontrol("başlangıçta sayım için tek mağaza", oncekiSecenek === 2, `${oncekiSecenek} seçenek (Seçin… dahil)`);

  await sayfa.goto(`${hedef}/sevkiyat/yeni`, { waitUntil: "networkidle" });
  const oncekiKaynak = await sayfa.locator('#kaynak option').count();
  kontrol("başlangıçta sevkiyat kaynağı tek mağaza", oncekiKaynak === 1, `${oncekiKaynak} seçenek`);

  // 2) admin personel1'e ek mağaza veriyor
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });

  const kart = sayfa.locator("div.rounded-xl").filter({
    has: sayfa.locator('input[name="kullaniciAdi"][value="personel1"]'),
  }).first();
  const kutular = kart.locator('input[name="ekMagazalar"]');
  const kutuSayisi = await kutular.count();
  kontrol("kullanıcı kartında ek mağaza kutuları var", kutuSayisi >= 2, `${kutuSayisi} kutu`);

  // personel1'in ana mağazası M1; ikinci kutuyu (M2) işaretle
  await kutular.nth(1).check();
  await kart.locator('button:has-text("Kaydet")').click();
  await sayfa.waitForTimeout(1500);

  const rozetler = await kart.locator("span").allTextContents();
  kontrol(
    "ek mağaza rozeti göründü",
    rozetler.some((t) => t.trim().startsWith("+")),
    rozetler.filter((t) => t.trim().startsWith("+")).join(" | ") || "rozet yok",
  );

  // 3) personel1 yeniden girince iki mağaza görmeli
  await giris("personel1");
  const panelMetni = (await sayfa.locator("p").first().textContent()) ?? "";
  kontrol("panelde iki mağaza yazıyor", panelMetni.split(",").length >= 2, panelMetni.trim());

  await sayfa.goto(`${hedef}/sayim`, { waitUntil: "networkidle" });
  const sonrakiSecenek = await sayfa.locator('select[name="magazaId"] option').count();
  kontrol("sayımda iki mağaza seçilebiliyor", sonrakiSecenek === 3, `${sonrakiSecenek} seçenek (Seçin… dahil)`);

  await sayfa.goto(`${hedef}/sevkiyat/yeni`, { waitUntil: "networkidle" });
  const sonrakiKaynak = await sayfa.locator('#kaynak option').count();
  kontrol("sevkiyat iki mağazadan yapılabiliyor", sonrakiKaynak === 2, `${sonrakiKaynak} seçenek`);

  const kilitli = await sayfa.locator("#kaynak").isDisabled();
  kontrol("iki mağazalı kullanıcıda kaynak seçimi açık", !kilitli, kilitli ? "kilitli" : "açık");

  // 4) yetkisi olmayan üçüncü mağaza hâlâ kapalı
  const kaynakMetin = await sayfa.locator('#kaynak').textContent();
  kontrol(
    "yetkisiz mağaza listede yok",
    !(kaynakMetin ?? "").includes("3 Nolu"),
    (kaynakMetin ?? "").trim(),
  );

  // 5) temizlik: ek mağazayı geri al
  await giris("admin");
  await sayfa.goto(`${hedef}/ayarlar/kullanicilar`, { waitUntil: "networkidle" });
  const kart2 = sayfa.locator("div.rounded-xl").filter({
    has: sayfa.locator('input[name="kullaniciAdi"][value="personel1"]'),
  }).first();
  await kart2.locator('input[name="ekMagazalar"]').nth(1).uncheck();
  await kart2.locator('button:has-text("Kaydet")').click();
  await sayfa.waitForTimeout(1500);

  await giris("personel1");
  await sayfa.goto(`${hedef}/sayim`, { waitUntil: "networkidle" });
  const geriSecenek = await sayfa.locator('select[name="magazaId"] option').count();
  kontrol("ek mağaza geri alınabiliyor", geriSecenek === 2, `${geriSecenek} seçenek (Seçin… dahil)`);

  await sayfa.screenshot({ path: `${cikti}-son.png`, fullPage: true });
} catch (hata) {
  kontrol("betik tamamlandı", false, String(hata).slice(0, 300));
  await sayfa.screenshot({ path: `${cikti}-hata.png`, fullPage: true }).catch(() => {});
} finally {
  await tarayici.close();
}

if (hatalar.length > 0) {
  console.log("\nTarayıcı konsol hataları:");
  for (const h of hatalar.slice(0, 10)) console.log(`  ${h}`);
}

const basarisiz = sonuclar.filter((s) => !s.gecti);
console.log(`\n${sonuclar.length - basarisiz.length}/${sonuclar.length} kontrol geçti.`);
process.exit(basarisiz.length === 0 && hatalar.length === 0 ? 0 : 1);
