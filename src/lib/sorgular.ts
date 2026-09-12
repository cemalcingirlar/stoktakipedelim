import "server-only";
import { prisma } from "./prisma";
import { STOK_DURUM, TRANSFER_DURUM } from "./sabitler";

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

/** Hedef mağazada onay bekleyen sevkiyatlar. magazaId verilmezse tümü. */
export async function bekleyenSevkiyatlar(magazaId: number | null) {
  return prisma.transfer.findMany({
    where: {
      durum: TRANSFER_DURUM.BEKLIYOR,
      ...(magazaId ? { hedefMagazaId: magazaId } : {}),
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
