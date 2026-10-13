/**
 * Kimin hangi mağazada yetkili olduğunu tek bakışta dökümler.
 *
 * Ekranda görüneni veritabanından teyit etmek için: yetki verdikten sonra
 * bunu çalıştırıp listeyi karşılaştırın.
 *
 *   cd /opt/stok/app
 *   sudo -u stok npm run yetki:dokum
 *
 * DATABASE_URL değerini .env dosyasından okur (--env-file-if-exists); ayrıca
 * ortamda tanımlıysa o kullanılır.
 */
import { prisma } from "../src/lib/prisma";
import { ROLLER, ROL_ETIKET, type Rol } from "../src/lib/sabitler";

const g = (deger: unknown, genislik: number) =>
  String(deger).padEnd(genislik).slice(0, genislik);

const [kullanicilar, magazalar] = await Promise.all([
  prisma.kullanici.findMany({
    where: { aktif: true },
    orderBy: [{ rol: "asc" }, { kullaniciAdi: "asc" }],
    include: {
      magaza: { select: { id: true, ad: true } },
      ekMagazalar: { select: { id: true, ad: true }, orderBy: { kod: "asc" } },
    },
  }),
  prisma.magaza.findMany({
    where: { aktif: true },
    orderBy: { kod: "asc" },
    include: {
      kullanicilar: { where: { aktif: true }, select: { id: true, adSoyad: true } },
      ekYetkililer: { where: { aktif: true }, select: { id: true, adSoyad: true } },
    },
  }),
]);

console.log("\n=== KULLANICI BAZINDA ===\n");
console.log(g("KULLANICI", 16) + g("AD SOYAD", 24) + g("ROL", 20) + g("ANA MAĞAZA", 24) + "EK MAĞAZALAR");
console.log("-".repeat(120));
for (const k of kullanicilar) {
  const yonetici = k.rol === ROLLER.ADMIN;
  console.log(
    g(k.kullaniciAdi, 16) +
      g(k.adSoyad, 24) +
      g(ROL_ETIKET[k.rol as Rol] ?? k.rol, 20) +
      g(yonetici ? "— (tüm mağazalar)" : (k.magaza?.ad ?? "YOK!"), 24) +
      (yonetici
        ? "tüm mağazalarda yetkili"
        : k.ekMagazalar.length > 0
          ? k.ekMagazalar.map((m) => m.ad).join(" + ")
          : "-"),
  );
}

console.log("\n=== MAĞAZA BAZINDA ===\n");
const yoneticiler = kullanicilar.filter((k) => k.rol === ROLLER.ADMIN);
let uyari = 0;
for (const m of magazalar) {
  const yetkili = new Map<number, string>();
  for (const k of m.kullanicilar) yetkili.set(k.id, `${k.adSoyad} (ana)`);
  for (const k of m.ekYetkililer) if (!yetkili.has(k.id)) yetkili.set(k.id, `${k.adSoyad} (ek)`);

  console.log(`${m.kod} · ${m.ad}`);
  if (yetkili.size === 0) {
    uyari += 1;
    console.log("   ⚠ yetkili kullanıcı yok — bu mağazaya sevkiyat kabulü yapılamaz");
  } else {
    for (const ad of yetkili.values()) console.log(`   ${ad}`);
  }
  if (yoneticiler.length > 0) {
    console.log(`   + yönetici: ${yoneticiler.map((y) => y.adSoyad).join(", ")}`);
  }
  console.log("");
}

// Yönetici dışındaki roller bir mağazaya bağlı olmalı; bağlı değilse o kişi
// hiçbir şubede işlem yapamaz ve ekranda sebebi görünmez.
const magazasiz = kullanicilar.filter(
  (k) => k.rol !== ROLLER.ADMIN && !k.magazaId && k.ekMagazalar.length === 0,
);
if (magazasiz.length > 0) {
  console.log("⚠ HİÇBİR MAĞAZAYA BAĞLI OLMAYAN KULLANICILAR:");
  for (const k of magazasiz) console.log(`   ${k.kullaniciAdi} · ${k.adSoyad}`);
  console.log("");
}

console.log(
  `${kullanicilar.length} aktif kullanıcı · ${magazalar.length} aktif mağaza` +
    (uyari > 0 ? ` · ${uyari} mağaza yetkilisiz` : " · tüm mağazalarda yetkili var"),
);

await prisma.$disconnect();
