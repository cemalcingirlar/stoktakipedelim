import "server-only";
import {
  aktarimSatislariniTopla,
  dokumleriBirlestir,
} from "./aktarimSatisi";
import { gorebilirMi, gorunurMagazalar, magazaKosulu, transferKosulu } from "./gorunurluk";
import { prisma } from "./prisma";
import { kapsamEtiketi } from "./sayimKapsami";
import { SAYIM_DURUM, STOK_DURUM, TRANSFER_DURUM } from "./sabitler";
import {
  donemKovalari,
  kovaAnahtari,
  type GrafikDonemi,
  type GrafikKovasi,
} from "./grafikDonem";
import { gunSonu } from "./tarih";

export type RaporAraligi = { baslangic: Date | null; bitis: Date | null };

function tarihKosulu(alan: "girisTarihi" | "satisTarihi", aralik: RaporAraligi) {
  const kosul: { gte?: Date; lte?: Date } = {};
  if (aralik.baslangic) kosul.gte = aralik.baslangic;
  if (aralik.bitis) kosul.lte = gunSonu(aralik.bitis);
  return Object.keys(kosul).length ? { [alan]: kosul } : {};
}

/**
 * Aktarım satışları için tarih koşulu.
 *
 * Mağaza içi aktarımda ürün müşteriye satılıp geri alınıyor; kasaya giren bu
 * tutar da satış sayılıyor ve aşağıdaki satış raporlarının hepsine katılıyor.
 * Katılmazsa ekranlar birbirinden farklı ciro gösterir.
 */
function aktarimTarihKosulu(aralik: RaporAraligi) {
  const kosul: { gte?: Date; lte?: Date } = {};
  if (aralik.baslangic) kosul.gte = aralik.baslangic;
  if (aralik.bitis) kosul.lte = gunSonu(aralik.bitis);
  return Object.keys(kosul).length ? { satisTarihi: kosul } : {};
}

/** Mağaza bazlı stok adedi ve değeri (yalnız STOKTA olanlar). */
export async function magazaStokRaporu(gorunur: number[] | null) {
  const [tumMagazalar, gruplar] = await Promise.all([
    prisma.magaza.findMany({ where: { aktif: true }, orderBy: { kod: "asc" } }),
    prisma.stokKalemi.groupBy({
      by: ["magazaId"],
      where: { durum: STOK_DURUM.STOKTA, ...magazaKosulu(gorunur) },
      _count: { _all: true },
      _sum: { alisFiyatiKurus: true },
    }),
  ]);
  const magazalar = gorunurMagazalar(tumMagazalar, gorunur);
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
export async function kategoriStokRaporu(gorunur: number[] | null) {
  const [kategoriler, gruplar] = await Promise.all([
    prisma.kategori.findMany({ orderBy: { sira: "asc" } }),
    prisma.stokKalemi.groupBy({
      by: ["kategoriId"],
      where: { durum: STOK_DURUM.STOKTA, ...magazaKosulu(gorunur) },
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
export async function vadeRaporu(gorunur: number[] | null, bugun: Date = new Date()) {
  const faturalar = await prisma.alisFaturasi.findMany({
    where: {
      vadeOdendi: false,
      vadeGun: { gt: 0 },
      vadeTarihi: { not: null },
      ...magazaKosulu(gorunur),
    },
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
export async function girisCikisRaporu(aralik: RaporAraligi, gorunur: number[] | null) {
  const magaza = magazaKosulu(gorunur);
  const [girisler, satislar, aktarimlar] = await Promise.all([
    prisma.stokKalemi.aggregate({
      where: { ...tarihKosulu("girisTarihi", aralik), ...magaza },
      _count: { _all: true },
      _sum: { alisFiyatiKurus: true },
    }),
    prisma.stokKalemi.aggregate({
      where: { durum: STOK_DURUM.SATILDI, ...tarihKosulu("satisTarihi", aralik), ...magaza },
      _count: { _all: true },
      _sum: { alisFiyatiKurus: true, satisFiyatiKurus: true },
    }),
    prisma.aktarimSatisi.aggregate({
      where: { ...aktarimTarihKosulu(aralik), ...magaza },
      _count: { _all: true },
      _sum: { satisFiyatiKurus: true, maliyetKurus: true },
    }),
  ]);

  const satisTutari =
    (satislar._sum.satisFiyatiKurus ?? 0) + (aktarimlar._sum.satisFiyatiKurus ?? 0);
  const satilanMaliyet =
    (satislar._sum.alisFiyatiKurus ?? 0) + (aktarimlar._sum.maliyetKurus ?? 0);

  return {
    girisAdedi: girisler._count._all,
    girisTutari: girisler._sum.alisFiyatiKurus ?? 0,
    satisAdedi: satislar._count._all + aktarimlar._count._all,
    satisTutari,
    satilanMaliyet,
    karKurus: satisTutari - satilanMaliyet,
  };
}

/**
 * Mağaza bazlı satış ve kâr.
 *
 * Cihaz satışları cihazın bulunduğu mağazaya, aktarım satışları ise satışın
 * yapıldığı mağazaya (aktarımın kaynağına) yazılıyor.
 */
export async function magazaSatisRaporu(aralik: RaporAraligi, gorunur: number[] | null) {
  const magaza = magazaKosulu(gorunur);
  const [tumMagazalar, gruplar, aktarimlar] = await Promise.all([
    prisma.magaza.findMany({ orderBy: { kod: "asc" } }),
    prisma.stokKalemi.groupBy({
      by: ["magazaId"],
      where: { durum: STOK_DURUM.SATILDI, ...tarihKosulu("satisTarihi", aralik), ...magaza },
      _count: { _all: true },
      _sum: { alisFiyatiKurus: true, satisFiyatiKurus: true },
    }),
    prisma.aktarimSatisi.findMany({
      where: { ...aktarimTarihKosulu(aralik), ...magaza },
      select: { magazaId: true, satisFiyatiKurus: true, maliyetKurus: true },
    }),
  ]);
  const magazalar = gorunurMagazalar(tumMagazalar, gorunur);

  const birlesik = dokumleriBirlestir([
    ...gruplar.map((g) => ({
      anahtar: g.magazaId,
      satir: {
        adet: g._count._all,
        satisKurus: g._sum.satisFiyatiKurus ?? 0,
        karKurus: (g._sum.satisFiyatiKurus ?? 0) - (g._sum.alisFiyatiKurus ?? 0),
      },
    })),
    ...aktarimSatislariniTopla(
      aktarimlar.map((a) => ({
        anahtar: a.magazaId,
        satisFiyatiKurus: a.satisFiyatiKurus,
        maliyetKurus: a.maliyetKurus,
      })),
    ),
  ]);

  const harita = new Map(birlesik.map((b) => [b.anahtar, b.satir]));
  return magazalar
    .map((m) => {
      const satir = harita.get(m.id);
      const satis = satir?.satisKurus ?? 0;
      const kar = satir?.karKurus ?? 0;
      return {
        ad: m.ad,
        adet: satir?.adet ?? 0,
        satisKurus: satis,
        maliyetKurus: satis - kar,
        karKurus: kar,
      };
    })
    .filter((m) => m.adet > 0);
}

/**
 * Satan kullanıcı bazlı performans.
 *
 * Mağaza içi aktarımda müşteriye satıp geri alma da bu kişinin satışı sayılıyor:
 * işi fiilen yapan personel, dökümde kendi rakamını görmeli.
 */
export async function kullaniciSatisRaporu(aralik: RaporAraligi, gorunur: number[] | null) {
  const magaza = magazaKosulu(gorunur);
  const [gruplar, aktarimlar] = await Promise.all([
    prisma.stokKalemi.groupBy({
      by: ["satanKullaniciId"],
      where: {
        durum: STOK_DURUM.SATILDI,
        satanKullaniciId: { not: null },
        ...tarihKosulu("satisTarihi", aralik),
        ...magaza,
      },
      _count: { _all: true },
      _sum: { alisFiyatiKurus: true, satisFiyatiKurus: true },
    }),
    prisma.aktarimSatisi.findMany({
      where: { ...aktarimTarihKosulu(aralik), ...magaza },
      select: { satanKullaniciId: true, satisFiyatiKurus: true, maliyetKurus: true },
    }),
  ]);

  const birlesik = dokumleriBirlestir([
    ...gruplar.map((g) => ({
      anahtar: g.satanKullaniciId!,
      satir: {
        adet: g._count._all,
        satisKurus: g._sum.satisFiyatiKurus ?? 0,
        karKurus: (g._sum.satisFiyatiKurus ?? 0) - (g._sum.alisFiyatiKurus ?? 0),
      },
    })),
    ...aktarimSatislariniTopla(
      aktarimlar.map((a) => ({
        anahtar: a.satanKullaniciId,
        satisFiyatiKurus: a.satisFiyatiKurus,
        maliyetKurus: a.maliyetKurus,
      })),
    ),
  ]);

  const kullanicilar = await prisma.kullanici.findMany({
    where: { id: { in: birlesik.map((b) => b.anahtar) } },
    select: { id: true, adSoyad: true, magazaId: true, magaza: { select: { ad: true } } },
  });
  const harita = new Map(kullanicilar.map((k) => [k.id, k]));

  return birlesik
    .map((b) => {
      const k = harita.get(b.anahtar);
      // Satırdaki mağaza, satıcının kendi ana mağazası. Ek yetkiyle başka
      // mağazada satış yapmış biri listeye girdiğinde bu, kullanıcının
      // göremediği bir mağazanın adı olabiliyordu; görünmüyorsa yazılmıyor.
      const magazaGorunur =
        k?.magazaId !== null && k?.magazaId !== undefined && gorebilirMi(gorunur, k.magazaId);
      return {
        adSoyad: k?.adSoyad ?? "Bilinmiyor",
        magaza: magazaGorunur ? (k?.magaza?.ad ?? "—") : "—",
        adet: b.satir.adet,
        satisKurus: b.satir.satisKurus,
        karKurus: b.satir.karKurus,
      };
    })
    .sort((a, b) => b.satisKurus - a.satisKurus);
}

/** Sevkiyat durum özeti. */
export async function transferRaporu(aralik: RaporAraligi, gorunur: number[] | null) {
  const kosul: { gte?: Date; lte?: Date } = {};
  if (aralik.baslangic) kosul.gte = aralik.baslangic;
  if (aralik.bitis) kosul.lte = gunSonu(aralik.bitis);

  const gruplar = await prisma.transfer.groupBy({
    by: ["durum"],
    where: {
      ...(Object.keys(kosul).length ? { gonderimTarihi: kosul } : {}),
      ...transferKosulu(gorunur),
    },
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
export async function sayimRaporu(gorunur: number[] | null) {
  const sayimlar = await prisma.sayim.findMany({
    // Kapsamındaki mağazalardan biri görünürse rapora giriyor; sayım birden
    // çok mağazayı kapsayabildiği için tek alana bakmak yetmez.
    where: {
      durum: SAYIM_DURUM.TAMAMLANDI,
      ...(gorunur === null ? {} : { magazalar: { some: { magazaId: { in: gorunur } } } }),
    },
    orderBy: { bitisTarihi: "desc" },
    take: 20,
    include: {
      magazalar: { include: { magaza: { select: { ad: true } } } },
      kalemler: { select: { beklenen: true, sayildi: true } },
    },
  });

  return sayimlar.map((s) => {
    const beklenen = s.kalemler.filter((k) => k.beklenen);
    return {
      id: s.id,
      magaza: kapsamEtiketi(s.magazalar.map((m) => m.magaza.ad)),
      bitisTarihi: s.bitisTarihi,
      beklenen: beklenen.length,
      sayilan: beklenen.filter((k) => k.sayildi).length,
      eksik: beklenen.filter((k) => !k.sayildi).length,
      fazla: s.kalemler.length - beklenen.length,
    };
  });
}

/**
 * Seçilen dönemin giriş ve satış adetleri — panel grafiği için.
 *
 * Kova genişliği (gün / hafta / ay) dönemden geliyor; tarih matematiği
 * grafikDonem.ts içinde, saf ve test edilmiş halde duruyor.
 */
export async function hareketRaporu(
  donem: GrafikDonemi,
  gorunur: number[] | null,
  bugun: Date = new Date(),
): Promise<GrafikKovasi[]> {
  const { baslangic, kovalar } = donemKovalari(donem, bugun);
  const magaza = magazaKosulu(gorunur);

  const [girisler, satislar, aktarimlar] = await Promise.all([
    prisma.stokKalemi.findMany({
      where: { girisTarihi: { gte: baslangic }, ...magaza },
      select: { girisTarihi: true, alisFiyatiKurus: true },
    }),
    prisma.stokKalemi.findMany({
      where: { durum: STOK_DURUM.SATILDI, satisTarihi: { gte: baslangic }, ...magaza },
      select: { satisTarihi: true, satisFiyatiKurus: true },
    }),
    // Aktarımdaki sat-geri al işlemleri de satış; grafikte görünmezse
    // paneldeki döküm ile grafik birbirini tutmaz.
    prisma.aktarimSatisi.findMany({
      where: { satisTarihi: { gte: baslangic }, ...magaza },
      select: { satisTarihi: true, satisFiyatiKurus: true },
    }),
  ]);

  const satirlar: GrafikKovasi[] = kovalar.map((k) => ({
    anahtar: k.anahtar,
    etiket: k.etiket,
    giris: 0,
    satis: 0,
    girisKurus: 0,
    ciroKurus: 0,
  }));
  const harita = new Map(satirlar.map((a) => [a.anahtar, a]));

  for (const g of girisler) {
    const a = harita.get(kovaAnahtari(g.girisTarihi, donem.kova));
    if (a) {
      a.giris += 1;
      a.girisKurus += g.alisFiyatiKurus ?? 0;
    }
  }
  for (const s of [...satislar, ...aktarimlar]) {
    if (!s.satisTarihi) continue;
    const a = harita.get(kovaAnahtari(s.satisTarihi, donem.kova));
    if (a) {
      a.satis += 1;
      a.ciroKurus += s.satisFiyatiKurus ?? 0;
    }
  }

  return satirlar;
}
