// Tedarikçi e-Fatura PDF'i ile stok yükleme uçtan uca testi.
//
// Gerçek tedarikçi faturası kullanılmıyor (müşteri ve fiyat bilgisi taşır);
// aynı düzende sentetik bir PDF üretilip yükleniyor. Önizleme, kategori
// eşleme, vade tarihinin faturadan gelmesi ve kaydın doğru cihazları açması
// kontrol ediliyor.
import { chromium } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { efaturaSatirlari, pdfUret } from "./efatura-pdf-uret.mjs";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/efatura";
const SIFRE = "Stok2026!";

const damga = Date.now().toString().slice(-8);
const imei = (i) => `88${damga}${String(i).padStart(5, "0")}`.slice(0, 15);
const KART_MARKASI = "Beta Mobile";
const KART_MODELI = "Fon 70 Pro Kart";
const FATURA_NO = `DG${damga}`;

const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const baglam = await tarayici.newContext({
  viewport: { width: 1500, height: 1200 },
  locale: "tr-TR",
});
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

/** Bugünden N gün sonrası, "GG - AA - YYYY" biçiminde. */
function gunSonra(gun) {
  const t = new Date();
  t.setDate(t.getDate() + gun);
  const iki = (n) => String(n).padStart(2, "0");
  return `${iki(t.getDate())} - ${iki(t.getMonth() + 1)} - ${t.getFullYear()}`;
}

const klasor = await mkdtemp(join(tmpdir(), "efatura-"));

try {
  // ------------------------------------------------ 1) yetki
  await giris("personel2");
  await sayfa.goto(`${hedef}/cihazlar/tedarikci-faturasi`, { waitUntil: "networkidle" });
  kontrol(
    "personel tedarikçi faturası ekranına giremiyor",
    !sayfa.url().includes("tedarikci-faturasi"),
    sayfa.url(),
  );

  // ------------------------------------------------ 2) ekran PDF kabul ediyor
  await giris("admin");
  await sayfa.goto(`${hedef}/cihazlar/tedarikci-faturasi`, { waitUntil: "networkidle" });

  const kabul = await sayfa.locator("#dosya").getAttribute("accept");
  kontrol("dosya alanı PDF kabul ediyor", (kabul ?? "").includes(".pdf"), kabul ?? "");

  const aciklama = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("ekranda e-Fatura PDF'inden söz ediliyor", /e-Fatura PDF/i.test(aciklama));

  // ------------------------------------------------ 3) PDF üret
  const satirlar = efaturaSatirlari({
    faturaNo: FATURA_NO,
    faturaTarihi: gunSonra(0),
    vadeTarihi: gunSonra(45),
    araToplam: "80.000,00",
    genelToplam: "96.000,00",
    kalemler: [
      {
        kod: "4000000000011",
        ad: "ALFA FON 10 4/128GB SIYAH",
        adet: 2,
        birim: "10.000,00",
        kdvTutari: "4.000,00",
        tutar: "20.000,00",
        seriler: [imei(1), imei(2)],
      },
      {
        // Satıcı ürün kodlu kalem: not kısmı EAN yerine model kodunu yazıyor,
        // tıpkı gerçek Apple faturalarındaki gibi. Program kalemi sıra
        // numarasından eşleştirmeli; eskiden bu faturayı reddediyordu.
        kod: "4000000000028",
        modelKodu: "GAMA11TU/A",
        ad: "BETA FON 70 PRO 5G 8/128GB",
        adet: 3,
        birim: "20.000,00",
        kdvTutari: "12.000,00",
        tutar: "60.000,00",
        seriler: [imei(3), imei(4), imei(5)],
      },
    ],
  });
  const pdfYolu = join(klasor, "efatura.pdf");
  await writeFile(pdfYolu, pdfUret(satirlar));

  // ---------------- 3b) Yeni barkodlar için "yeni ürün kartı" uyarısı
  // Kullanıcı istedi: barkod kayıtlıysa aynı karttan devam, değilse yeni kart
  // açılacağı söylensin ve yine düzeltilebilsin.

  // ------------------------------------------------ 4) önizleme
  await sayfa.setInputFiles("#dosya", pdfYolu);
  await sayfa.click('button:has-text("Dosyayı Oku")');
  await sayfa.waitForSelector(`text=${FATURA_NO}`, { timeout: 30000 });

  const onizleme = (await sayfa.locator("main").textContent()) ?? "";

  // Bu fatura ilk kez yükleniyor: tüm barkodlar yeni olmalı.
  const yeniRozet = await sayfa.locator('[data-test="kart-yeni"]').count();
  const kayitliRozet = await sayfa.locator('[data-test="kart-kayitli"]').count();
  kontrol(
    "ilk yüklemede tüm ürünler yeni kart olarak işaretli",
    yeniRozet === 2 && kayitliRozet === 0,
    `yeni=${yeniRozet} kayıtlı=${kayitliRozet}`,
  );
  const kartUyarisi =
    (await sayfa.locator('[data-test="yeni-kart-uyarisi"]').count()) > 0
      ? ((await sayfa.locator('[data-test="yeni-kart-uyarisi"]').textContent()) ?? "").trim()
      : "";
  kontrol(
    "yeni kart uyarısı sayıyı söylüyor",
    kartUyarisi.includes("2 ürünün barkodu sistemde kayıtlı değil"),
    kartUyarisi || "uyarı yok",
  );
  kontrol(
    "uyarı düzeltilebileceğini söylüyor",
    kartUyarisi.includes("düzeltebilirsiniz"),
    kartUyarisi || "uyarı yok",
  );
  kontrol("fatura numarası PDF'ten okundu", onizleme.includes(FATURA_NO), FATURA_NO);
  kontrol(
    "5 cihaz bulundu",
    /5\s*adet/.test(onizleme),
    (onizleme.match(/\d+ adet/) ?? ["bulunamadı"])[0],
  );
  kontrol("iki ürün grubu çıktı", onizleme.includes("ALFA FON") && onizleme.includes("BETA FON"));
  kontrol(
    "KDV hariç birim fiyat alındı",
    onizleme.includes("10.000,00") && !onizleme.includes("14.000,00"),
    "KDV tutarı fiyat sanılmamalı",
  );
  kontrol(
    "toplam tutar KDV hariç",
    onizleme.includes("80.000,00"),
    (onizleme.match(/[\d.]+,\d{2} TL/) ?? [""])[0],
  );

  // Seri numaraları varsayılan olarak katlı; açınca düzenlenebilir kutularda görünmeli.
  const acDugmesi = sayfa.locator('button:has-text("Seri numaralarını göster")').first();
  kontrol("seri numarası listesi açılabiliyor", (await acDugmesi.count()) === 1);
  await acDugmesi.click();
  await sayfa.waitForTimeout(300);
  const okunanSeriler = await sayfa
    .locator('[data-test="urun-satiri"]')
    .first()
    .locator('[data-test="seri-kutusu"]')
    .evaluateAll((ogeler) => ogeler.map((o) => o.value));
  kontrol(
    "seri numaraları PDF'teki not bölümünden geldi",
    okunanSeriler.includes(imei(1)) && okunanSeriler.includes(imei(2)),
    okunanSeriler.join(", "),
  );

  // ---- toplu kategori seçimi
  const topluAlan = sayfa.locator('[data-test="toplu-kategori"]');
  kontrol("tümüne uygula alanı var", (await topluAlan.count()) === 1);

  await sayfa.selectOption("#topluKategori", { label: "Cep Telefonu" });
  await sayfa.waitForTimeout(300);

  const altSecenekleri = await sayfa.locator("#topluAltKategori option").allTextContents();
  kontrol(
    "toplu alt kategori listesi seçilen kategoriye göre doldu",
    altSecenekleri.some((a) => a.trim() === "Sıfır"),
    altSecenekleri.join(" | "),
  );

  await sayfa.selectOption("#topluAltKategori", { label: "Sıfır" });
  await sayfa.waitForTimeout(300);

  // Her ürün satırındaki kategori seçimi değişmiş olmalı.
  const urunKategorileri = await sayfa
    .locator('[data-test="urun-satiri"] select')
    .evaluateAll((ogeler) =>
      ogeler.map((o) => o.options[o.selectedIndex]?.textContent?.trim() ?? ""),
    );
  const katSecimleri = urunKategorileri.filter((_, i) => i % 2 === 0);
  const altSecimleri = urunKategorileri.filter((_, i) => i % 2 === 1);
  kontrol(
    "tümüne uygula bütün ürünlerin kategorisini değiştirdi",
    katSecimleri.length === 2 && katSecimleri.every((k) => k === "Cep Telefonu"),
    katSecimleri.join(" | "),
  );
  kontrol(
    "tümüne uygula alt kategoriyi de yazdı",
    altSecimleri.length === 2 && altSecimleri.every((a) => a === "Sıfır"),
    altSecimleri.join(" | "),
  );

  // Tek satırı değiştirince toplu seçici "farklı" durumuna düşmeli.
  const ilkKategori = sayfa.locator('[data-test="urun-satiri"] select').first();
  await ilkKategori.selectOption({ label: "Aksesuar" });
  await sayfa.waitForTimeout(300);
  const topluDeger = await sayfa.locator("#topluKategori").inputValue();
  kontrol("satır bazında değişiklik toplu seçiciyi boşa düşürüyor", topluDeger === "", topluDeger);

  // Geri al: hepsini yine Cep Telefonu / Sıfır yap.
  await sayfa.selectOption("#topluKategori", { label: "Cep Telefonu" });
  await sayfa.waitForTimeout(200);
  await sayfa.selectOption("#topluAltKategori", { label: "Sıfır" });
  await sayfa.waitForTimeout(200);

  // ---- elle düzeltme: yanlış okunan alanlar değiştirilebilmeli
  const ilkUrun = sayfa.locator('[data-test="urun-satiri"]').first();
  await ilkUrun.locator('button:has-text("Bilgileri düzelt")').click();
  await sayfa.waitForTimeout(200);

  const duzeltmeAlani = ilkUrun.locator('[data-test="urun-duzeltme"]');
  kontrol("düzeltme alanı açılıyor", (await duzeltmeAlani.count()) === 1);

  const okunanMarka = await ilkUrun.locator('[data-test="duzelt-marka"]').inputValue();
  const okunanModel = await ilkUrun.locator('[data-test="duzelt-model"]').inputValue();
  kontrol(
    "marka ve model okunan ürün adından ayrılmış geldi",
    okunanMarka === "ALFA" && okunanModel === "FON 10 4/128GB SIYAH",
    `${okunanMarka} / ${okunanModel}`,
  );

  const okunanFiyat = await ilkUrun.locator('[data-test="duzelt-fiyat"]').inputValue();
  kontrol("fiyat Türkçe biçimde geldi", okunanFiyat === "10.000,00", okunanFiyat);

  await ilkUrun.locator('[data-test="duzelt-marka"]').fill("Alfa Mobile");
  await ilkUrun.locator('[data-test="duzelt-model"]').fill("Fon 10 Pro");
  await ilkUrun.locator('[data-test="duzelt-barkod"]').fill("9990000000011");
  await ilkUrun.locator('[data-test="duzelt-fiyat"]').fill("11.500,50");
  await sayfa.waitForTimeout(300);

  const basligi = (await ilkUrun.locator("div").first().textContent()) ?? "";
  kontrol(
    "düzeltme başlığa yansıyor",
    basligi.includes("Alfa Mobile Fon 10 Pro") && basligi.includes("9990000000011"),
    basligi.replace(/\s+/g, " ").slice(0, 90).trim(),
  );
  kontrol("düzeltilen ürün işaretleniyor", basligi.includes("elle düzeltildi"));
  kontrol("yeni fiyat başlıkta görünüyor", basligi.includes("11.500,50"), "");

  // ---- seri numarası düzeltme ve cihaz çıkarma (liste yukarıda açılmıştı)
  const seriKutulari = ilkUrun.locator('[data-test="seri-kutusu"]');
  kontrol("seri numaraları düzenlenebilir kutuda", (await seriKutulari.count()) === 2);

  const duzeltilmisSeri = `${imei(1).slice(0, 14)}9`;
  await seriKutulari.first().fill(duzeltilmisSeri);
  await sayfa.waitForTimeout(200);

  // İkinci cihazı faturadan çıkar.
  await ilkUrun.locator('[data-test="seri-cikar"]').nth(1).click();
  await sayfa.waitForTimeout(300);

  const kaydetMetni =
    (await sayfa.locator('button:has-text("Cihazı Kaydet")').textContent()) ?? "";
  kontrol(
    "çıkarılan cihaz kayıt sayısından düşüyor",
    kaydetMetni.includes("4 Cihazı Kaydet"),
    kaydetMetni.trim(),
  );

  // Geri al çalışmalı.
  await ilkUrun.locator('[data-test="seri-cikar"]').nth(1).click();
  await sayfa.waitForTimeout(300);
  const geriMetni =
    (await sayfa.locator('button:has-text("Cihazı Kaydet")').textContent()) ?? "";
  kontrol("geri al cihazı faturaya döndürüyor", geriMetni.includes("5 Cihazı Kaydet"), geriMetni.trim());

  // ---- hatalı düzeltme kaydı engelliyor
  await seriKutulari.nth(1).fill(duzeltilmisSeri);
  await sayfa.waitForTimeout(300);
  const sorunKutusu = sayfa.locator('[data-test="duzenleme-sorunlari"]');
  kontrol("aynı seri no iki kez yazılınca uyarı çıkıyor", (await sorunKutusu.count()) === 1);
  kontrol(
    "sorun varken kaydet düğmesi yok",
    (await sayfa.locator('button:has-text("Cihazı Kaydet")').count()) === 0,
  );

  await seriKutulari.nth(1).fill(imei(2));
  await sayfa.waitForTimeout(300);
  kontrol(
    "sorun giderilince kaydet düğmesi dönüyor",
    (await sayfa.locator('button:has-text("Cihazı Kaydet")').count()) === 1,
  );

  await ilkUrun.locator('[data-test="duzelt-marka"]').fill("");
  await sayfa.waitForTimeout(300);
  const bosMarkaSorunu = (await sorunKutusu.textContent()) ?? "";
  kontrol(
    "boş marka uyarı veriyor",
    /marka boş/.test(bosMarkaSorunu),
    bosMarkaSorunu.replace(/\s+/g, " ").slice(0, 70).trim(),
  );
  await ilkUrun.locator('[data-test="duzelt-marka"]').fill("Alfa Mobile");
  await sayfa.waitForTimeout(300);

  // İkinci ürünün yalnız adını değiştir, barkodunu bırak: ikinci yüklemede bu
  // barkod kayıtlı çıkacak ve marka/model faturadan değil karttan gelmeli.
  const ikinciUrun = sayfa.locator('[data-test="urun-satiri"]').nth(1);
  await ikinciUrun.locator('button:has-text("Bilgileri düzelt")').click();
  await sayfa.waitForTimeout(200);
  await ikinciUrun.locator('[data-test="duzelt-marka"]').fill(KART_MARKASI);
  await ikinciUrun.locator('[data-test="duzelt-model"]').fill(KART_MODELI);
  await sayfa.waitForTimeout(300);

  // Vade tarihi faturadan gelmeli: "Özel tarih" hazır seçili ve alan dolu.
  const vadeSecimi = await sayfa.locator("#vadeGun").inputValue();
  kontrol("vade seçimi 'özel tarih' olarak geldi", vadeSecimi === "ozel", vadeSecimi);

  const vadeDegeri = await sayfa.locator("#vadeTarihi").inputValue();
  const beklenenVade = (() => {
    const t = new Date();
    t.setDate(t.getDate() + 45);
    const iki = (n) => String(n).padStart(2, "0");
    return `${t.getFullYear()}-${iki(t.getMonth() + 1)}-${iki(t.getDate())}`;
  })();
  kontrol("vade tarihi faturadan doldu", vadeDegeri === beklenenVade, `${vadeDegeri} / ${beklenenVade}`);

  // ------------------------------------------------ 5) kaydet
  await sayfa.selectOption("#tedarikciId", { index: 1 });
  await sayfa.selectOption("#magazaId", { index: 1 });
  await Promise.all([
    sayfa.waitForURL(/\/faturalar\/\d+$/, { timeout: 40000 }),
    sayfa.click('button:has-text("Kaydet")'),
  ]);
  kontrol("kayıt sonrası faturaya yönlendirildi", /\/faturalar\/\d+$/.test(sayfa.url()), sayfa.url());

  const faturaMetni = (await sayfa.locator("main").textContent()) ?? "";
  kontrol("fatura numarası doğru", faturaMetni.includes(FATURA_NO));
  kontrol("5 cihaz faturaya bağlandı", /5/.test(faturaMetni), "");
  kontrol("vade 45 gün olarak hesaplandı", faturaMetni.includes("45"), "");

  // ------------------------------------------------ 6) cihazlar doğru mu
  await sayfa.goto(`${hedef}/cihazlar?ara=${imei(3)}`, { waitUntil: "networkidle" });
  const cihaz = (await sayfa.locator("main").textContent()) ?? "";
  // Marka, kaydetmeden önce elle KART_MARKASI yapılmıştı; cihaz o adla durmalı.
  kontrol("seri numarası ile cihaz bulunuyor", cihaz.includes(KART_MARKASI), imei(3));

  // Elle düzeltilen ürün, düzeltilmiş haliyle kaydedilmiş olmalı.
  await sayfa.goto(`${hedef}/cihazlar?ara=${duzeltilmisSeri}`, { waitUntil: "networkidle" });
  const duzeltilmisCihaz = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "elle düzeltilen seri numarası kaydedildi",
    duzeltilmisCihaz.includes("Alfa Mobile") || duzeltilmisCihaz.includes("ALFA MOBILE"),
    duzeltilmisSeri,
  );
  kontrol("elle düzeltilen marka/model kaydedildi", duzeltilmisCihaz.includes("Fon 10 Pro"));
  kontrol("elle düzeltilen barkod kaydedildi", duzeltilmisCihaz.includes("9990000000011"));
  kontrol("elle düzeltilen fiyat kaydedildi", duzeltilmisCihaz.includes("11.500,50"));
  kontrol("alış fiyatı KDV hariç yazıldı", cihaz.includes("20.000,00"), "");
  kontrol("barkod faturadan geldi", cihaz.includes("4000000000028"), "");

  // ------------------------------------------------ 7) aynı fatura ikinci kez
  await sayfa.goto(`${hedef}/cihazlar/tedarikci-faturasi`, { waitUntil: "networkidle" });
  await sayfa.setInputFiles("#dosya", pdfYolu);
  await sayfa.click('button:has-text("Dosyayı Oku")');
  await sayfa.waitForSelector(`text=${FATURA_NO}`, { timeout: 30000 });
  const ikinci = (await sayfa.locator("main").textContent()) ?? "";
  kontrol(
    "tekrar yüklemede kayıtlı seri numaraları uyarılıyor",
    /zaten kayıtlı|sistemde/i.test(ikinci),
    "",
  );

  // 2. ürünün barkodu değişmedi, o yüzden artık kayıtlı. 1. ürünün barkodu
  // elle 9990000000011 yapılmıştı, faturadaki 4000000000011 hâlâ kayıtsız.
  const ikinciYeni = await sayfa.locator('[data-test="kart-yeni"]').count();
  const ikinciKayitli = await sayfa.locator('[data-test="kart-kayitli"]').count();
  kontrol(
    "ikinci yüklemede kayıtlı ve yeni ürünler ayrışıyor",
    ikinciKayitli === 1 && ikinciYeni === 1,
    `yeni=${ikinciYeni} kayıtlı=${ikinciKayitli}`,
  );

  const ikinciUyari =
    (await sayfa.locator('[data-test="yeni-kart-uyarisi"]').count()) > 0
      ? ((await sayfa.locator('[data-test="yeni-kart-uyarisi"]').textContent()) ?? "").trim()
      : "";
  kontrol(
    "uyarı yalnız kalan yeni ürünü sayıyor",
    ikinciUyari.includes("1 ürünün barkodu sistemde kayıtlı değil"),
    ikinciUyari || "uyarı yok",
  );

  // Asıl kontrol: kayıtlı barkodda marka/model faturadan DEĞİL karttan
  // gelmeli. Fatura metni değişmedi ama kart "Beta Mobile / Fon 70 Pro Kart"
  // olarak kaydedilmişti; ekranda o yazmazsa aynı cihaz stokta iki ayrı
  // isimle birikir.
  const kayitliSatir = sayfa
    .locator('[data-test="urun-satiri"]')
    .filter({ has: sayfa.locator('[data-test="kart-kayitli"]') })
    .first();
  const kayitliBaslik = ((await kayitliSatir.textContent()) ?? "").replace(/\s+/g, " ");
  kontrol(
    "kayıtlı barkodun marka/modeli karttan geliyor",
    kayitliBaslik.includes(`${KART_MARKASI} ${KART_MODELI}`),
    `"${KART_MARKASI} ${KART_MODELI}" bekleniyor · ${kayitliBaslik.slice(0, 110)}`,
  );
  kontrol(
    "kayıtlı üründe de düzeltme düğmesi duruyor",
    (await kayitliSatir.locator('button:has-text("Bilgileri düzelt")').count()) === 1,
  );

  // ------------------------------------------------ 8) bozuk fatura reddediliyor
  // Ara toplam kalemlerle tutmuyor: okuma yanlış demektir, fatura alınmamalı.
  const bozuk = efaturaSatirlari({
    faturaNo: `${FATURA_NO}X`,
    faturaTarihi: gunSonra(0),
    vadeTarihi: gunSonra(45),
    araToplam: "99.999,00",
    genelToplam: "119.998,80",
    kalemler: [
      {
        kod: "4000000000035",
        ad: "GAMA FON",
        adet: 1,
        birim: "10.000,00",
        kdvTutari: "2.000,00",
        tutar: "10.000,00",
        seriler: [imei(9)],
      },
    ],
  });
  const bozukYolu = join(klasor, "bozuk.pdf");
  await writeFile(bozukYolu, pdfUret(bozuk));

  await sayfa.goto(`${hedef}/cihazlar/tedarikci-faturasi`, { waitUntil: "networkidle" });
  await sayfa.setInputFiles("#dosya", bozukYolu);
  await sayfa.click('button:has-text("Dosyayı Oku")');
  await sayfa.waitForSelector('[role="alert"]:not(#__next-route-announcer__)', { timeout: 30000 });
  const bozukMetni = (await sayfa.locator('[role="alert"]:not(#__next-route-announcer__)').textContent()) ?? "";
  kontrol(
    "tutarsız fatura reddediliyor",
    /ara toplam/i.test(bozukMetni),
    bozukMetni.replace(/\s+/g, " ").slice(0, 110).trim(),
  );
  kontrol(
    "reddedilen faturadan cihaz açılmadı",
    !(await sayfa.locator("text=GAMA FON").count()),
    "",
  );

  // ------------------------------------------------ 9) PDF olmayan dosya
  const duzYolu = join(klasor, "duz.pdf");
  await writeFile(duzYolu, "%PDF-1.4\nbu bir fatura degil\n%%EOF\n");
  await sayfa.goto(`${hedef}/cihazlar/tedarikci-faturasi`, { waitUntil: "networkidle" });
  await sayfa.setInputFiles("#dosya", duzYolu);
  await sayfa.click('button:has-text("Dosyayı Oku")');
  await sayfa.waitForSelector('[role="alert"]:not(#__next-route-announcer__)', { timeout: 30000 });
  const duzMetni = (await sayfa.locator('[role="alert"]:not(#__next-route-announcer__)').textContent()) ?? "";
  kontrol(
    "fatura olmayan PDF yol gösteren mesaj veriyor",
    duzMetni.length > 20 && !/beklenmeyen/i.test(duzMetni),
    duzMetni.replace(/\s+/g, " ").slice(0, 110).trim(),
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
