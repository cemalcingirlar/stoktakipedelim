// Tedarikçi portalı Excel'inin doğrudan stoğa işlenmesi — uçtan uca test.
// Ekran görüntüsündeki sütun düzeninde bir dosya üretip tarayıcıdan yükler.
import { chromium } from "@playwright/test";
import ExcelJS from "exceljs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/tedarikcifatura";
const SIFRE = "Stok2026!";

const damga = Date.now().toString().slice(-8);
const FATURA_NO = `TF${damga}`;
const BARKOD_A = `69390930${damga}`.slice(0, 13);
const BARKOD_B = `11111111${damga}`.slice(0, 13);
const seri = (on, i) => `${on}/${damga}SN${String(i).padStart(5, "0")}`;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1500, height: 1200 }, locale: "tr-TR" });
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
  await sayfa.click('button[type="submit"]');
  await sayfa.waitForURL("**/panel", { timeout: 15000 }).catch(() => {});
  return sayfa.url().includes("/panel");
}

/** Portal çıktısını taklit eden dosya: 3 tablet + 2 kılıf, tek fatura. */
async function dosyaUret(yol) {
  const kitap = new ExcelJS.Workbook();
  const sf = kitap.addWorksheet("Seri No Kontrolü");
  sf.addRow(["Seri No Kontrolü"]);               // portal başlık satırı
  sf.addRow([]);
  sf.addRow([
    "Seri No", "Ürün Kodu", "Ürün Adı", "Marka", "Adet",
    "E-Fatura No", "Fatura No", "Tarih", "Birim Tutar", "Kur",
  ]);
  for (let i = 1; i <= 3; i++) {
    sf.addRow([
      seri("78876", i), BARKOD_A, "XIAOMI REDMI PAD 2 9.7 COVER SLVR 4/128",
      "XIAOMI", 1, "", FATURA_NO, "06.10.2026", "8.604,17 TRY", "1.00",
    ]);
  }
  // Seri numarasız, adetli kalem
  sf.addRow(["", BARKOD_B, "XIAOMI KILIF SIYAH", "XIAOMI", 2, "", FATURA_NO, "06.10.2026", "120,00 TRY", "1.00"]);
  await writeFile(yol, Buffer.from(await kitap.xlsx.writeBuffer()));
}

const klasor = await mkdtemp(join(tmpdir(), "tedfatura-"));
const dosya = join(klasor, "seri-no-kontrolu.xlsx");
await dosyaUret(dosya);

async function yukle() {
  await sayfa.setInputFiles("#dosya", dosya);
  await sayfa.click('button:has-text("Dosyayı Oku")');
  await sayfa.waitForSelector('h2:has-text("2. Okunan fatura")', { timeout: 25000 });
}

try {
  // 1) personel giremez
  kontrol("personel giriş yaptı", await giris("personel2"));
  await sayfa.goto(`${hedef}/cihazlar/tedarikci-faturasi`, { waitUntil: "networkidle" });
  kontrol("personel bu sayfaya giremiyor", !sayfa.url().includes("tedarikci-faturasi"), sayfa.url());

  // 2) admin: cihazlar sayfasında bağlantı
  await giris("admin");
  await sayfa.goto(`${hedef}/cihazlar`, { waitUntil: "networkidle" });
  kontrol("cihazlar sayfasında bağlantı var",
    (await sayfa.locator('a[href="/cihazlar/tedarikci-faturasi"]').count()) === 1);

  // 3) dosyayı yükle
  await sayfa.goto(`${hedef}/cihazlar/tedarikci-faturasi`, { waitUntil: "networkidle" });
  await yukle();

  const ozet = (await sayfa.locator('h2:has-text("2. Okunan fatura") + p').textContent()) ?? "";
  kontrol("tek fatura olarak okundu", ozet.includes("1 fatura"), ozet.replace(/\s+/g, " ").trim());

  const gruplar = sayfa.locator("div.rounded-lg.border.border-slate-200.p-3");
  kontrol("iki ürün grubu çıktı", (await gruplar.count()) === 2, `${await gruplar.count()} grup`);

  const govde = (await sayfa.locator("body").textContent()) ?? "";
  const faturaNoDeger = await sayfa.locator("#faturaNo").inputValue();
  kontrol("fatura no dosyadan geldi", faturaNoDeger === FATURA_NO, faturaNoDeger);
  kontrol("barkod dosyadan geldi", govde.includes(BARKOD_A));
  kontrol("birim tutar doğru okundu", govde.includes("8.604,17"), "8.604,17");
  kontrol("tarih dosyadan geldi (06.10.2026)",
    (await sayfa.locator("#faturaTarihi").inputValue()) === "2026-10-06",
    await sayfa.locator("#faturaTarihi").inputValue());

  // Seri numaraları gösterilsin — gruplar ürün adına göre sıralı, seri numarası
  // olan tablet grubunu adıyla hedefliyoruz.
  const seriliGrup = gruplar.filter({ hasText: "REDMI PAD" });
  await seriliGrup.locator('button:has-text("Seri numaralarını göster")').click();
  await sayfa.waitForTimeout(300);
  const seriMetni = (await seriliGrup.locator("ul").last().textContent()) ?? "";
  kontrol("seri numaraları listelendi", seriMetni.includes(seri("78876", 1)),
    seriMetni.replace(/\s+/g, " ").trim().slice(0, 90) || "(liste boş)");

  // 4) kategorisi seçilmeden kaydedilemez uyarısı
  kontrol("kategori seçilmeden uyarı veriyor",
    govde.includes("kategorisi seçilmedi") || govde.includes("Kategorisi seçilmeyen"));

  // 5) kategorileri seç — seri numarası olan tablet ile serisiz kılıf farklı
  // kategorilere gitmeli; kılıfa seri no zorunlu kategori seçilirse program
  // uyarıyor (aşağıda ayrıca sınanıyor).
  const kilifGrubu = sayfa.locator("div.rounded-lg.border.border-slate-200.p-3")
    .filter({ hasText: "KILIF" });
  const tabletGrubu = sayfa.locator("div.rounded-lg.border.border-slate-200.p-3")
    .filter({ hasText: "REDMI PAD" });

  // Önce kasten yanlış seçim: kılıfa seri no zorunlu kategori
  await kilifGrubu.locator("select").first().selectOption({ label: "Cep Telefonu" });
  await sayfa.waitForTimeout(400);
  const uyumsuzMetni = (await sayfa.locator("body").textContent()) ?? "";
  kontrol("serisiz ürüne seri no zorunlu kategori seçilince uyarıyor",
    uyumsuzMetni.includes("seri numarası yok"), "kırmızı uyarı çıktı");

  // Şimdi doğru seçim
  await kilifGrubu.locator("select").first().selectOption({ label: "Aksesuar" });
  await tabletGrubu.locator("select").first().selectOption({ label: "Tablet / Notebook" });
  await sayfa.waitForTimeout(400);
  const duzeltilmis = (await sayfa.locator("body").textContent()) ?? "";
  kontrol("doğru kategori seçilince uyarı kalkıyor",
    !duzeltilmis.includes("seri numarası yok"));

  // 6) fatura bilgilerini doldur ve kaydet
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.selectOption("#magazaId", { index: 1 });
  await sayfa.selectOption("#vadeGun", "45");

  const dugmeMetni = (await sayfa.locator('button:has-text("Cihazı Kaydet")').textContent()) ?? "";
  kontrol("kaydet düğmesi 5 cihaz diyor", dugmeMetni.includes("5"), dugmeMetni.trim());

  await sayfa.click('button:has-text("Cihazı Kaydet")');
  await sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 30000 }).catch(() => {});
  const kaydedildi = /\/faturalar\/\d+$/.test(sayfa.url());
  kontrol("fatura kaydedildi", kaydedildi,
    kaydedildi ? sayfa.url() : (await sayfa.locator('[role="alert"]').allTextContents()).join(" | "));

  const faturaMetni = (await sayfa.locator("body").textContent()) ?? "";
  kontrol("faturada 45 gün vade var", faturaMetni.includes("45 gün"));
  kontrol("faturada seri numaraları var", faturaMetni.includes(seri("78876", 2)));

  // 7) cihaz listesinde seri no ile bulunabiliyor
  await sayfa.goto(`${hedef}/cihazlar?ara=${encodeURIComponent(seri("78876", 3))}`, { waitUntil: "networkidle" });
  const listeMetni = (await sayfa.locator("body").textContent()) ?? "";
  kontrol("yüklenen cihaz seri no ile bulunuyor", listeMetni.includes("REDMI PAD"), seri("78876", 3));

  // 8) aynı dosya ikinci kez: seri numaralı cihazlar elenmeli
  await sayfa.goto(`${hedef}/cihazlar/tedarikci-faturasi`, { waitUntil: "networkidle" });
  await yukle();
  const ikinciGovde = (await sayfa.locator("body").textContent()) ?? "";
  kontrol("tekrar yüklemede kayıtlı seri numaraları eleniyor",
    ikinciGovde.includes("zaten kayıtlı"), "uyarı çıktı");
  const ikinciDugme = (await sayfa.locator('button:has-text("Cihazı Kaydet")').textContent()) ?? "";
  kontrol("tekrar yüklemede yalnız serisiz kalemler kalıyor",
    /\b2 Cihazı Kaydet\b/.test(ikinciDugme.trim()), ikinciDugme.trim());

  // 9) kategori barkod geçmişinden otomatik geldi mi
  const tabletTekrar = sayfa.locator("div.rounded-lg.border.border-slate-200.p-3")
    .filter({ hasText: "REDMI PAD" });
  const seciliKategori = await tabletTekrar.locator("select").first().inputValue();
  kontrol("kategori barkod geçmişinden otomatik geldi", seciliKategori !== "",
    seciliKategori || "(boş)");

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
