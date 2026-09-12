// Giriş, yetki ve panel ekranı için uçtan uca duman testi.
// Kullanım: npm run dev  &&  node betikler/dogrula.mjs

import { chromium } from "@playwright/test";

const hedef = process.env.HEDEF ?? "http://127.0.0.1:3000";
const cikti = process.env.CIKTI ?? "/tmp/ekran";
const SIFRE = "Stok2026!";

// CHROME_YOLU verilmezse Playwright'ın kendi indirdiği tarayıcı kullanılır.
const tarayici = await chromium.launch(
  process.env.CHROME_YOLU ? { executablePath: process.env.CHROME_YOLU } : {},
);
const sayfa = await tarayici.newPage({ viewport: { width: 1440, height: 900 }, locale: "tr-TR" });

const hatalar = [];
sayfa.on("console", (m) => { if (m.type() === "error") hatalar.push(m.text()); });
sayfa.on("pageerror", (e) => hatalar.push(String(e)));

async function girisYap(kullanici, sifre) {
  await sayfa.goto(`${hedef}/giris`, { waitUntil: "networkidle" });
  await sayfa.fill("#kullaniciAdi", kullanici);
  await sayfa.fill("#sifre", sifre);
  await Promise.all([
    sayfa.waitForURL("**/panel", { timeout: 20000 }),
    sayfa.click('button[type="submit"]'),
  ]);
  await sayfa.waitForLoadState("networkidle");
}

// 1) Oturumsuz korumalı sayfa giriş ekranına yönlenmeli
await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
console.log("1) oturumsuz /panel ->", new URL(sayfa.url()).pathname, sayfa.url().includes("/giris") ? "✓" : "✗");

// 2) Hatalı şifre reddedilmeli ve kullanıcı adı korunmalı
await sayfa.fill("#kullaniciAdi", "admin");
await sayfa.fill("#sifre", "yanlis-sifre");
await sayfa.click('button[type="submit"]');
await sayfa.waitForSelector('p[role="alert"]', { timeout: 10000 });
console.log("2) hatalı giriş:", (await sayfa.textContent('p[role="alert"]'))?.trim());
console.log("   kullanıcı adı korundu:", JSON.stringify(await sayfa.inputValue("#kullaniciAdi")));

// 3) Yönetici girişi
await girisYap("admin", SIFRE);
console.log("3) admin girişi ->", new URL(sayfa.url()).pathname, "|", (await sayfa.textContent("h1"))?.trim());
const adminMenu = await sayfa.$$eval("header nav a", (a) => a.map((x) => x.textContent.trim()));
console.log("   menü:", adminMenu.join(" · "));
await sayfa.screenshot({ path: `${cikti}-panel-admin.png`, fullPage: true });

// 4) Mağaza personeli girişi — Ayarlar menüsü görünmemeli
await girisYap("personel2", SIFRE);
const personelMenu = await sayfa.$$eval("header nav a", (a) => a.map((x) => x.textContent.trim()));
console.log("4) personel2 menüsü:", personelMenu.join(" · "));
console.log("   Ayarlar gizli:", personelMenu.includes("Ayarlar") ? "✗ GÖRÜNÜYOR" : "✓");
console.log("   mağaza etiketi:", (await sayfa.textContent("main p"))?.trim());
await sayfa.screenshot({ path: `${cikti}-panel-personel.png`, fullPage: true });

// 5) Yetkisiz sayfa erişimi engellenmeli
await sayfa.goto(`${hedef}/ayarlar`, { waitUntil: "networkidle" });
console.log("5) personel /ayarlar ->", new URL(sayfa.url()).pathname);

// 6) Telefon genişliği
await sayfa.setViewportSize({ width: 390, height: 844 });
await sayfa.goto(`${hedef}/panel`, { waitUntil: "networkidle" });
const yatayKaydirma = await sayfa.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
console.log("6) 390px yatay kaydırma:", yatayKaydirma ? "✗ VAR" : "✓ yok");
await sayfa.screenshot({ path: `${cikti}-panel-mobil.png`, fullPage: true });

console.log("konsol hataları:", hatalar.length ? hatalar : "yok");
await tarayici.close();
