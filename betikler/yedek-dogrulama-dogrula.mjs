// Yedeklerin doğrulanması testi.
//
// Yedek almak ile yedeği olmak aynı şey değil. Önceden yalnız "yükleme
// isteği hata verdi mi" bakılıyordu; bozuk ya da yarım yüklenmiş bir yedeğin
// bozukluğu ancak geri yükleme günü anlaşılırdı.
//
// Artık her yedekte anlık görüntünün bütünlüğü (PRAGMA integrity_check)
// sınanıyor ve yüklenen dosyanın boyutu yereldekiyle karşılaştırılıyor.
// Test ortamında Drive yapılandırılmadığı için yükleme adımı başarısız
// oluyor; buradaki ölçüt, bütünlük kontrolünün GERÇEKTEN çalıştığı ve
// sonucunun yedek kaydına yazıldığı — yani sıkıştırmadan önce gerçek bir
// anlık görüntü üzerinde koştuğu.
import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/yedek-dogrulama";
const SIFRE = "Stok2026!";

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({
  viewport: { width: 1500, height: 1100 },
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

try {
  await giris("admin");

  // =============================== 1) Ekran doğrulamayı gösteriyor
  await sayfa.goto(`${hedef}/ayarlar/yedekleme`, { waitUntil: "networkidle" });
  kontrol(
    "özet kartında doğrulanmamış yedek sayacı var",
    (await sayfa.locator('[data-test="dogrulanmamis-sayisi"]').count()) === 1,
  );
  kontrol(
    "henüz yedek yokken doğrulanmamış sayısı 0",
    ((await sayfa.locator('[data-test="dogrulanmamis-sayisi"]').textContent()) ?? "").trim() === "0",
    ((await sayfa.locator('[data-test="dogrulanmamis-sayisi"]').textContent()) ?? "").trim(),
  );

  // ======================== 2) Yedek denemesi bütünlüğü gerçekten sınıyor
  const anahtar = process.env.YEDEK_ANAHTARI ?? "";
  const cevap = await sayfa.request.post(`${hedef}/api/yedek`, {
    headers: { "x-yedek-anahtari": anahtar },
  });
  // Test ortamında Drive yapılandırılmadığı için yedekleme başarısız
  // bitiyor (HTTP 500) — beklenen bu. Önemli olan denemenin kaydedilmesi
  // ve bütünlük sonucunun kayda düşmesi.
  const govde = await cevap.text();
  kontrol(
    "yedek denemesi yapıldı ve sonucu döndü",
    cevap.status() === 500 || cevap.status() === 200,
    `HTTP ${cevap.status()} · ${govde.slice(0, 80)}`,
  );
  kontrol(
    "başarısızlık sebebi Drive yapılandırması",
    /Drive|yapılandır/i.test(govde),
    govde.slice(0, 120),
  );

  await sayfa.goto(`${hedef}/ayarlar/yedekleme`, { waitUntil: "networkidle" });
  const basliklar = await sayfa.locator("table th").allTextContents();
  kontrol(
    "yedek geçmişinde Doğrulama sütunu var",
    basliklar.some((b) => b.trim() === "Doğrulama"),
    basliklar.join(" | "),
  );
  const satirSayisi = await sayfa.locator("tbody tr").count();
  kontrol("deneme yedek geçmişine yazıldı", satirSayisi >= 1, `${satirSayisi} satır`);

  const dogrulamaMetni = (
    (await sayfa.locator('[data-test="yedek-dogrulama"]').first().textContent()) ?? ""
  )
    .replace(/\s+/g, " ")
    .trim();
  // Drive yapılandırılmadığı için yükleme yok; ama bütünlük kontrolü
  // sıkıştırmadan önce gerçek anlık görüntü üzerinde koşuyor ve sonucu
  // kayda yazılıyor. "Bütünlük tamam" yazması, kontrolün çalıştığının
  // ve veritabanının sağlam olduğunun kanıtı.
  kontrol(
    "bütünlük kontrolü çalışıp kayda yazıldı",
    /Bütünlük tamam/.test(dogrulamaMetni),
    dogrulamaMetni,
  );
  kontrol(
    "yüklenemeyen yedek doğrulanmış sayılmıyor",
    !/Doğrulandı/.test(dogrulamaMetni),
    dogrulamaMetni,
  );

  // Başarısız deneme "doğrulanmamış başarılı yedek" sayacını şişirmemeli:
  // o sayaç, başarılı görünüp sınanmamış yedekleri gösteriyor.
  kontrol(
    "başarısız deneme doğrulanmamış sayacına girmiyor",
    ((await sayfa.locator('[data-test="dogrulanmamis-sayisi"]').textContent()) ?? "").trim() === "0",
    ((await sayfa.locator('[data-test="dogrulanmamis-sayisi"]').textContent()) ?? "").trim(),
  );

  await sayfa.screenshot({ path: `${cikti}-yedekleme.png`, fullPage: true });

  // =============== 3) Sistem durumu ve geri yükleme provası
  await sayfa.goto(`${hedef}/ayarlar`, { waitUntil: "networkidle" });
  const sistem = sayfa.locator('[data-test="sistem-durumu"]');
  kontrol("ayarlarda sistem durumu kartı var", (await sistem.count()) === 1);
  const sistemMetni = ((await sistem.textContent()) ?? "").replace(/\s+/g, " ").trim();
  kontrol("disk doluluğu yazıyor", /Disk/.test(sistemMetni) && /%\d+ dolu/.test(sistemMetni), sistemMetni.slice(0, 90));
  kontrol("veritabanı boyutu yazıyor", /Veritabanı/.test(sistemMetni) && /(KB|MB|GB)/.test(sistemMetni));
  // Test ortamında hiç başarılı yedek yok: bu kritik olarak işaretlenmeli,
  // sessizce "iyi" görünmemeli.
  kontrol(
    "yedeksiz sistemde durum kritik işaretleniyor",
    (await sistem.getAttribute("data-siddet")) === "kritik",
    (await sistem.getAttribute("data-siddet")) ?? "(yok)",
  );
  kontrol("son yedek satırı 'hiç alınmamış' diyor", /hiç alınmamış/.test(sistemMetni));

  await sayfa.goto(`${hedef}/ayarlar/yedekleme`, { waitUntil: "networkidle" });
  kontrol(
    "geri yükleme provası düğmesi var",
    (await sayfa.locator('[data-test="prova-formu"]').count()) === 1,
  );
  const provaYasiMetni = ((await sayfa.locator('[data-test="prova-yasi"]').textContent()) ?? "").trim();
  kontrol("prova yaşı gösteriliyor", /Hiç prova yapılmamış/.test(provaYasiMetni), provaYasiMetni);

  // =============================== 4) Personel bu ekranı göremez
  await giris("personel1");
  await sayfa.goto(`${hedef}/ayarlar/yedekleme`, { waitUntil: "networkidle" });
  kontrol(
    "personel yedekleme ekranına giremiyor",
    !sayfa.url().includes("/yedekleme"),
    sayfa.url(),
  );

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
