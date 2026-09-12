import "server-only";
import { prisma } from "./prisma";
import { SAYIM_DURUM, STOK_DURUM, TRANSFER_DURUM } from "./sabitler";
import { gunSonu } from "./tarih";

export type RaporAraligi = { baslangic: Date | null; bitis: Date | null };

function tarihKosulu(alan: "girisTarihi" | "satisTarihi", aralik: RaporAraligi) {
  const kosul: { gte?: Date; lte?: Date } = {};
  if (aralik.baslangic) kosul.gte = aralik.baslangic;
  if (aralik.bitis) kosul.lte = gunSonu(aralik.bitis);
  return Object.keys(kosul).length ? { [alan]: kosul } : {};
}

/** Mağaza bazlı stok adedi ve değeri (yalnız STOKTA olanlar). */
export async function magazaStokRaporu() {
  const [magazalar, gruplar] = await Promise.all([
    prisma.magaza.findMany({ where: { aktif: true }, orderBy: { kod: "asc" } }),
    prisma.stokKalemi.groupBy({
      by: ["magazaId"],
      where: { durum: STOK_DURUM.STOKTA },
      _count: { _all: true },
      _sum: { alisFiyatiKurus: true },
    }),
  ]);
  const harita = new Map(gruplar.map((g) => [g.magazaId, g]));
  return magazalar.map((m) => ({
    magazaId: m.id,
    kod: m.kod,
    ad: m.ad,
    adet: harita.get(m.id)?._count._all ?? 0,
    degerKurus: harita.get(m.id)?._sum.alisFiyatiKurus ?? 0,
  }));
}

/** Kategori kırılımında stok. */
export async function kategoriStokRaporu() {
  const [kategoriler, gruplar] = await Promise.all([
    prisma.kategori.findMany({ orderBy: { sira: "asc" } }),
    prisma.stokKalemi.groupBy({
      by: ["kategoriId"],
      where: { durum: STOK_DURUM.STOKTA },
      _count: { _all: true },
      _sum: { alisFiyatiKurus: true },
    }),
  ]);
  const harita = new Map(gruplar.map((g) => [g.kategoriId, g]));
  return kategoriler
    .map((k) => ({
      ad: k.ad,
      adet: harita.get(k.id)?._count._all ?? 0,
      degerKurus: harita.get(k.id)?._sum.alisFiyatiKurus ?? 0,
    }))
    .filter((k) => k.adet > 0);
}

/** Ödenmemiş vadeli faturalar; geçenler ve yaklaşanlar ayrı ayrı. */
export async function vadeRaporu(bugun: Date = new Date()) {
  const faturalar = await prisma.alisFaturasi.findMany({
    where: { vadeOdendi: false, vadeGun: { gt: 0 }, vadeTarihi: { not: null } },
    include: {
      tedarikci: { select: { ad: true } },
      magaza: { select: { ad: true } },
      kalemler: { select: { alisFiyatiKurus: true } },
    },
    orderBy: { vadeTarihi: "asc" },
  });

  return faturalar.map((f) => ({
    id: f.id,
    faturaNo: f.faturaNo,
    tedarikci: f.tedarikci.ad,
    magaza: f.magaza.ad,
    faturaTarihi: f.faturaTarihi,
    vadeGun: f.vadeGun,
    vadeTarihi: f.vadeTarihi!,
    cihazAdedi: f.kalemler.length,
    tutarKurus: f.kalemler.reduce((t, k) => t + k.alisFiyatiKurus, 0),
    gecmisMi: f.vadeTarihi! < bugun,
  }));
}

/** Tarih aralığındaki girişler ve satışlar. */
export async function girisCikisRaporu(aralik: RaporAraligi) {
  const [girisler, satislar] = await Promise.all([
    prisma.stokKalemi.aggregate({
      where: tarihKosulu("girisTarihi", aralik),
      _count: { _all: true },
      _sum: { alisFiyatiKurus: true },
    }),
    prisma.stokKalemi.aggregate({
      where: { durum: STOK_DURUM.SATILDI, ...tarihKosulu("satisTarihi", aralik) },
      _count: { _all: true },
      _sum: { alisFiyatiKurus: true, satisFiyatiKurus: true },
    }),
  ]);

  const satisTutari = satislar._sum.satisFiyatiKurus ?? 0;
  const satilanMaliyet = satislar._sum.alisFiyatiKurus ?? 0;

  return {
    girisAdedi: girisler._count._all,
    girisTutari: girisler._sum.alisFiyatiKurus ?? 0,
    satisAdedi: satislar._count._all,
    satisTutari,
    satilanMaliyet,
    karKurus: satisTutari - satilanMaliyet,
  };
}

/** Mağaza bazlı satış ve kâr. */
export async function magazaSatisRaporu(aralik: RaporAraligi) {
  const [magazalar, gruplar] = await Promise.all([
    prisma.magaza.findMany({ orderBy: { kod: "asc" } }),
    prisma.stokKalemi.groupBy({
      by: ["magazaId"],
      where: { durum: STOK_DURUM.SATILDI, ...tarihKosulu("satisTarihi", aralik) },
      _count: { _all: true },
      _sum: { alisFiyatiKurus: true, satisFiyatiKurus: true },
    }),
  ]);
  const harita = new Map(gruplar.map((g) => [g.magazaId, g]));
  return magazalar
    .map((m) => {
      const g = harita.get(m.id);
      const satis = g?._sum.satisFiyatiKurus ?? 0;
      const maliyet = g?._sum.alisFiyatiKurus ?? 0;
      return {
        ad: m.ad,
        adet: g?._count._all ?? 0,
        satisKurus: satis,
        maliyetKurus: maliyet,
        karKurus: satis - maliyet,
      };
    })
    .filter((m) => m.adet > 0);
}

/** Satan kullanıcı bazlı performans. */
export async function kullaniciSatisRaporu(aralik: RaporAraligi) {
  const gruplar = await prisma.stokKalemi.groupBy({
    by: ["satanKullaniciId"],
    where: {
      durum: STOK_DURUM.SATILDI,
      satanKullaniciId: { not: null },
      ...tarihKosulu("satisTarihi", aralik),
    },
    _count: { _all: true },
    _sum: { alisFiyatiKurus: true, satisFiyatiKurus: true },
  });

  const idler = gruplar.map((g) => g.satanKullaniciId!).filter(Boolean);
  const kullanicilar = await prisma.kullanici.findMany({
    where: { id: { in: idler } },
    select: { id: true, adSoyad: true, magaza: { select: { ad: true } } },
  });
  const harita = new Map(kullanicilar.map((k) => [k.id, k]));

  return gruplar
    .map((g) => {
      const satis = g._sum.satisFiyatiKurus ?? 0;
      const maliyet = g._sum.alisFiyatiKurus ?? 0;
      const k = harita.get(g.satanKullaniciId!);
      return {
        adSoyad: k?.adSoyad ?? "Bilinmiyor",
        magaza: k?.magaza?.ad ?? "—",
        adet: g._count._all,
        satisKurus: satis,
        karKurus: satis - maliyet,
      };
    })
    .sort((a, b) => b.satisKurus - a.satisKurus);
}

/** Sevkiyat durum özeti. */
export async function transferRaporu(aralik: RaporAraligi) {
  const kosul: { gte?: Date; lte?: Date } = {};
  if (aralik.baslangic) kosul.gte = aralik.baslangic;
  if (aralik.bitis) kosul.lte = gunSonu(aralik.bitis);

  const gruplar = await prisma.transfer.groupBy({
    by: ["durum"],
    where: Object.keys(kosul).length ? { gonderimTarihi: kosul } : {},
    _count: { _all: true },
  });

  const sirali = [
    TRANSFER_DURUM.BEKLIYOR,
    TRANSFER_DURUM.KISMI_KABUL,
    TRANSFER_DURUM.KABUL,
    TRANSFER_DURUM.RED,
    TRANSFER_DURUM.IPTAL,
  ];
  const harita = new Map(gruplar.map((g) => [g.durum, g._count._all]));
  return sirali.map((d) => ({ durum: d, adet: harita.get(d) ?? 0 }));
}

/** Son sayımların eksik/fazla özeti. */
export async function sayimRaporu() {
  const sayimlar = await prisma.sayim.findMany({
    where: { durum: SAYIM_DURUM.TAMAMLANDI },
    orderBy: { bitisTarihi: "desc" },
    take: 20,
    include: {
      magaza: { select: { ad: true } },
      kalemler: { select: { beklenen: true, sayildi: true } },
    },
  });

  return sayimlar.map((s) => {
    const beklenen = s.kalemler.filter((k) => k.beklenen);
    return {
      id: s.id,
      magaza: s.magaza.ad,
      bitisTarihi: s.bitisTarihi,
      beklenen: beklenen.length,
      sayilan: beklenen.filter((k) => k.sayildi).length,
      eksik: beklenen.filter((k) => !k.sayildi).length,
      fazla: s.kalemler.length - beklenen.length,
    };
  });
}

/** Son 12 ayın giriş ve satış adetleri — panel grafiği için. */
export async function aylikHareketRaporu(aySayisi = 12) {
  const bugun = new Date();
  const baslangic = new Date(bugun.getFullYear(), bugun.getMonth() - (aySayisi - 1), 1);

  const [girisler, satislar] = await Promise.all([
    prisma.stokKalemi.findMany({
      where: { girisTarihi: { gte: baslangic } },
      select: { girisTarihi: true },
    }),
    prisma.stokKalemi.findMany({
      where: { durum: STOK_DURUM.SATILDI, satisTarihi: { gte: baslangic } },
      select: { satisTarihi: true, satisFiyatiKurus: true },
    }),
  ]);

  const aylar: { anahtar: string; etiket: string; giris: number; satis: number; ciroKurus: number }[] =
    [];
  for (let i = 0; i < aySayisi; i++) {
    const t = new Date(baslangic.getFullYear(), baslangic.getMonth() + i, 1);
    aylar.push({
      anahtar: `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`,
      etiket: t.toLocaleDateString("tr-TR", { month: "short", year: "2-digit" }),
      giris: 0,
      satis: 0,
      ciroKurus: 0,
    });
  }
  const harita = new Map(aylar.map((a) => [a.anahtar, a]));

  function anahtarla(t: Date) {
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  }

  for (const g of girisler) {
    const a = harita.get(anahtarla(g.girisTarihi));
    if (a) a.giris += 1;
  }
  for (const s of satislar) {
    if (!s.satisTarihi) continue;
    const a = harita.get(anahtarla(s.satisTarihi));
    if (a) {
      a.satis += 1;
      a.ciroKurus += s.satisFiyatiKurus ?? 0;
    }
  }

  return aylar;
}
