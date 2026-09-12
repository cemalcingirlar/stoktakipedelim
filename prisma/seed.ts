import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { sifreHashle } from "../src/lib/sifre";
import { ROLLER } from "../src/lib/sabitler";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const MAGAZALAR = [
  { kod: "M1", ad: "1 Nolu Mağaza", merkezMi: true },
  { kod: "M2", ad: "2 Nolu Mağaza", merkezMi: false },
  { kod: "M3", ad: "3 Nolu Mağaza", merkezMi: false },
];

const KATEGORILER: { ad: string; alt: string[] }[] = [
  { ad: "Cep Telefonu", alt: ["Sıfır", "İkinci El"] },
  { ad: "Aksesuar", alt: ["Kulaklık", "Saat", "Güç Grubu", "Kılıf", "Kablo / Şarj"] },
  { ad: "Tablet / Notebook", alt: ["Tablet", "Notebook"] },
  { ad: "İkinci El Telefon", alt: ["Garantili", "Garantisiz"] },
];

const TEDARIKCILER = ["Yılmaz Telekom", "Vatan Toptan", "Özkan Ticaret", "İstanbul Toptancı"];

async function main() {
  console.log("Başlangıç verisi yükleniyor...");

  // --- Mağazalar
  for (const [sira, m] of MAGAZALAR.entries()) {
    await prisma.magaza.upsert({
      where: { kod: m.kod },
      update: { ad: m.ad, merkezMi: m.merkezMi },
      create: { kod: m.kod, ad: m.ad, merkezMi: m.merkezMi, telefon: `0212 000 00 0${sira + 1}` },
    });
  }
  const magazalar = await prisma.magaza.findMany({ orderBy: { kod: "asc" } });
  console.log(`  ${magazalar.length} mağaza hazır.`);

  // --- Kategoriler
  for (const [sira, k] of KATEGORILER.entries()) {
    const kategori = await prisma.kategori.upsert({
      where: { ad: k.ad },
      update: { sira },
      create: { ad: k.ad, sira },
    });
    for (const [altSira, altAd] of k.alt.entries()) {
      await prisma.altKategori.upsert({
        where: { kategoriId_ad: { kategoriId: kategori.id, ad: altAd } },
        update: { sira: altSira },
        create: { kategoriId: kategori.id, ad: altAd, sira: altSira },
      });
    }
  }
  console.log(`  ${KATEGORILER.length} kategori ve alt kategorileri hazır.`);

  // --- Tedarikçiler
  for (const ad of TEDARIKCILER) {
    await prisma.tedarikci.upsert({ where: { ad }, update: {}, create: { ad } });
  }
  console.log(`  ${TEDARIKCILER.length} tedarikçi hazır.`);

  // --- Kullanıcılar
  const varsayilanSifre = process.env.SEED_SIFRE ?? "Stok2026!";
  const hash = await sifreHashle(varsayilanSifre);

  await prisma.kullanici.upsert({
    where: { kullaniciAdi: "admin" },
    update: {},
    create: {
      kullaniciAdi: "admin",
      adSoyad: "Sistem Yöneticisi",
      sifreHash: hash,
      rol: ROLLER.ADMIN,
      magazaId: null,
    },
  });

  for (const magaza of magazalar) {
    const sira = magaza.kod.replace("M", "");
    await prisma.kullanici.upsert({
      where: { kullaniciAdi: `sorumlu${sira}` },
      update: {},
      create: {
        kullaniciAdi: `sorumlu${sira}`,
        adSoyad: `${magaza.ad} Sorumlusu`,
        sifreHash: hash,
        rol: ROLLER.MAGAZA_SORUMLUSU,
        magazaId: magaza.id,
      },
    });
    await prisma.kullanici.upsert({
      where: { kullaniciAdi: `personel${sira}` },
      update: {},
      create: {
        kullaniciAdi: `personel${sira}`,
        adSoyad: `${magaza.ad} Personeli`,
        sifreHash: hash,
        rol: ROLLER.MAGAZA_PERSONELI,
        magazaId: magaza.id,
      },
    });
  }
  console.log(`  Kullanıcılar hazır. Varsayılan şifre: ${varsayilanSifre}`);

  // --- Ayarlar
  const ayarlar: Record<string, string> = {
    firma_adi: "ABC İletişim",
    para_birimi: "TL",
  };
  for (const [anahtar, deger] of Object.entries(ayarlar)) {
    await prisma.ayar.upsert({ where: { anahtar }, update: {}, create: { anahtar, deger } });
  }

  console.log("Tamamlandı.");
}

main()
  .catch((hata) => {
    console.error(hata);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
