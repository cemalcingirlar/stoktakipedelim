import "server-only";
import { prisma } from "./prisma";
import { STOK_DURUM, TRANSFER_DURUM } from "./sabitler";
import { gunBasi, gunSonu } from "./tarih";

export type MagazaOzeti = {
  magazaId: number;
  kod: string;
  ad: string;
  adet: number;
  degerKurus: number;
};

/** Her mağaza için stoktaki cihaz adedi ve toplam alış değeri. */
export async function magazaStokOzeti(): Promise<MagazaOzeti[]> {
  const [magazalar, gruplar] = await Promise.all([
    prisma.magaza.findMany({ where: { aktif: true }, orderBy: { kod: "asc" } }),
    prisma.stokKalemi.groupBy({
      by: ["magazaId"],
      where: { durum: STOK_DURUM.STOKTA },
      _count: { _all: true },
      _sum: { alisFiyatiKurus: true },
    }),
  ]);

  const haritalanan = new Map(gruplar.map((g) => [g.magazaId, g]));

  return magazalar.map((m) => {
    const grup = haritalanan.get(m.id);
    return {
      magazaId: m.id,
      kod: m.kod,
      ad: m.ad,
      adet: grup?._count._all ?? 0,
      degerKurus: grup?._sum.alisFiyatiKurus ?? 0,
    };
  });
}

/** Ödenmemiş ve vadesi geçmiş alış faturaları. */
export async function vadesiGecenFaturalar(bugun: Date = new Date()) {
  return prisma.alisFaturasi.findMany({
    where: {
      vadeOdendi: false,
      vadeTarihi: { not: null, lt: bugun },
    },
    include: { tedarikci: true, magaza: true, _count: { select: { kalemler: true } } },
    orderBy: { vadeTarihi: "asc" },
  });
}

/**
 * Vadesi geçmiş cihaz adedi.
 *
 * Fatura değil cihaz sayılır: ödemesi gecikmiş kaç cihaz olduğu, kaç fatura
 * olduğundan daha anlamlı. Koşul cihaz listesindeki "Vadesi geçen" filtresiyle
 * birebir aynı (src/lib/cihazFiltre.ts), böylece paneldeki sayıya tıklayınca
 * aynı cihazlar listelenir.
 */
export async function vadesiGecenCihazSayisi(bugun: Date = new Date()) {
  const vadeKosulu = {
    alisFaturasi: { is: { vadeOdendi: false, vadeTarihi: { not: null, lt: bugun } } },
  } as const;
  const [toplam, stokta] = await Promise.all([
    prisma.stokKalemi.count({ where: vadeKosulu }),
    prisma.stokKalemi.count({ where: { ...vadeKosulu, durum: STOK_DURUM.STOKTA } }),
  ]);
  return { toplam, stokta };
}

/**
 * Bugün satılan cihazlar. Personel için yalnız yetkili olduğu mağazalar;
 * yönetici için (magazaIdleri null) tümü.
 */
export async function bugunSatilanlar(magazaIdleri: number[] | null, bugun: Date = new Date()) {
  const kalemler = await prisma.stokKalemi.findMany({
    where: {
      durum: STOK_DURUM.SATILDI,
      satisTarihi: { gte: gunBasi(bugun), lte: gunSonu(bugun) },
      ...(magazaIdleri ? { magazaId: { in: magazaIdleri } } : {}),
    },
    orderBy: { satisTarihi: "desc" },
    select: {
      id: true,
      marka: true,
      model: true,
      seriNo: true,
      satisTarihi: true,
      satisFiyatiKurus: true,
      alisFiyatiKurus: true,
      magaza: { select: { ad: true } },
      satanKullanici: { select: { adSoyad: true } },
      musteri: { select: { adSoyad: true } },
    },
  });

  const ciroKurus = kalemler.reduce((t, k) => t + (k.satisFiyatiKurus ?? 0), 0);
  const karKurus = kalemler.reduce(
    (t, k) => t + ((k.satisFiyatiKurus ?? 0) - k.alisFiyatiKurus),
    0,
  );
  return { kalemler, adet: kalemler.length, ciroKurus, karKurus };
}

/** Hedef mağazada onay bekleyen sevkiyatlar. magazaId verilmezse tümü. */
export async function bekleyenSevkiyatlar(magazaIdleri: number[] | null) {
  return prisma.transfer.findMany({
    where: {
      durum: TRANSFER_DURUM.BEKLIYOR,
      ...(magazaIdleri ? { hedefMagazaId: { in: magazaIdleri } } : {}),
    },
    include: {
      kaynakMagaza: true,
      hedefMagaza: true,
      gonderen: true,
      _count: { select: { kalemler: true } },
    },
    orderBy: { gonderimTarihi: "desc" },
  });
}

/** Panelde gösterilen son stok hareketleri. */
export async function sonHareketler(adet = 10) {
  return prisma.stokHareketi.findMany({
    take: adet,
    orderBy: { tarih: "desc" },
    include: {
      stokKalemi: { select: { id: true, marka: true, model: true, seriNo: true } },
      kullanici: { select: { adSoyad: true } },
      kaynakMagaza: { select: { ad: true } },
      hedefMagaza: { select: { ad: true } },
    },
  });
}
