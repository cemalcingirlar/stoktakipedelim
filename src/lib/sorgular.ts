import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { gorunurMagazalar, hareketKosulu, magazaKosulu } from "./gorunurluk";
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

/**
 * Her mağaza için stoktaki cihaz adedi ve toplam alış değeri.
 *
 * Hem mağaza listesi hem sayılar görünür mağazalara kısıtlanıyor: yalnız
 * sayıları kısıtlamak, kullanıcıya göremediği mağazaları "0 adet" diye
 * gösterirdi.
 */
export async function magazaStokOzeti(
  gorunur: number[] | null,
): Promise<MagazaOzeti[]> {
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
export async function vadesiGecenFaturalar(
  gorunur: number[] | null,
  bugun: Date = new Date(),
) {
  return prisma.alisFaturasi.findMany({
    where: {
      // İptal edilen fatura borç değil; vade raporlarına girmemeli.
      iptalEdildi: false,
      vadeOdendi: false,
      vadeTarihi: { not: null, lt: bugun },
      ...magazaKosulu(gorunur),
    },
    include: {
      tedarikci: true,
      magaza: true,
      _count: { select: { kalemler: true } },
    },
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
export async function vadesiGecenCihazSayisi(
  gorunur: number[] | null,
  bugun: Date = new Date(),
) {
  const vadeKosulu: Prisma.StokKalemiWhereInput = {
    alisFaturasi: {
      // İptal edilen fatura borç değil.
      is: {
        iptalEdildi: false,
        vadeOdendi: false,
        vadeTarihi: { not: null, lt: bugun },
      },
    },
    ...magazaKosulu(gorunur),
  };
  const [toplam, stokta] = await Promise.all([
    prisma.stokKalemi.count({ where: vadeKosulu }),
    prisma.stokKalemi.count({
      where: { ...vadeKosulu, durum: STOK_DURUM.STOKTA },
    }),
  ]);
  return { toplam, stokta };
}

/** Panelde "Bugün Satılan" listesinin bir satırı. */
export type BugunSatisSatiri = {
  /** React anahtarı; cihaz satışı ile aktarım satışı aynı cihazı gösterebilir. */
  anahtar: string;
  /** Bağlantının gittiği cihaz. */
  cihazId: number;
  marka: string;
  model: string;
  seriNo: string | null;
  satisTarihi: Date | null;
  satisFiyatiKurus: number;
  karKurus: number;
  magazaAdi: string;
  satanAdSoyad: string | null;
  musteriAdSoyad: string | null;
  /** Mağaza içi aktarımda sat-geri al işlemi mi? */
  aktarimMi: boolean;
};

/**
 * Bugün satılan cihazlar. Personel için yalnız yetkili olduğu mağazalar;
 * yönetici için (magazaIdleri null) tümü.
 *
 * Mağaza içi aktarımdaki sat-geri al işlemleri de listede: kasaya giren tutar
 * açısından bunlar da bugünün satışı. Cihaz stokta kaldığı için cihaz
 * listesinde "satıldı" olarak görünmüyorlar, bu yüzden burada ayrıca
 * işaretleniyorlar.
 */
export async function bugunSatilanlar(
  magazaIdleri: number[] | null,
  bugun: Date = new Date(),
) {
  const aralik = { gte: gunBasi(bugun), lte: gunSonu(bugun) };

  const [kalemler, aktarimlar] = await Promise.all([
    prisma.stokKalemi.findMany({
      where: {
        durum: STOK_DURUM.SATILDI,
        satisTarihi: aralik,
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
    }),
    prisma.aktarimSatisi.findMany({
      where: {
        satisTarihi: aralik,
        ...(magazaIdleri ? { magazaId: { in: magazaIdleri } } : {}),
      },
      orderBy: { satisTarihi: "desc" },
      select: {
        id: true,
        satisTarihi: true,
        satisFiyatiKurus: true,
        maliyetKurus: true,
        magaza: { select: { ad: true } },
        satanKullanici: { select: { adSoyad: true } },
        musteri: { select: { adSoyad: true } },
        stokKalemi: {
          select: { id: true, marka: true, model: true, seriNo: true },
        },
      },
    }),
  ]);

  const satirlar: BugunSatisSatiri[] = [
    ...kalemler.map((k) => ({
      anahtar: `cihaz-${k.id}`,
      cihazId: k.id,
      marka: k.marka,
      model: k.model,
      seriNo: k.seriNo,
      satisTarihi: k.satisTarihi,
      satisFiyatiKurus: k.satisFiyatiKurus ?? 0,
      karKurus: (k.satisFiyatiKurus ?? 0) - k.alisFiyatiKurus,
      magazaAdi: k.magaza.ad,
      satanAdSoyad: k.satanKullanici?.adSoyad ?? null,
      musteriAdSoyad: k.musteri?.adSoyad ?? null,
      aktarimMi: false,
    })),
    ...aktarimlar.map((a) => ({
      anahtar: `aktarim-${a.id}`,
      cihazId: a.stokKalemi.id,
      marka: a.stokKalemi.marka,
      model: a.stokKalemi.model,
      seriNo: a.stokKalemi.seriNo,
      satisTarihi: a.satisTarihi,
      satisFiyatiKurus: a.satisFiyatiKurus,
      karKurus: a.satisFiyatiKurus - a.maliyetKurus,
      magazaAdi: a.magaza.ad,
      satanAdSoyad: a.satanKullanici.adSoyad,
      musteriAdSoyad: a.musteri?.adSoyad ?? null,
      aktarimMi: true,
    })),
  ].sort(
    (a, b) => (b.satisTarihi?.getTime() ?? 0) - (a.satisTarihi?.getTime() ?? 0),
  );

  const ciroKurus = satirlar.reduce((t, s) => t + s.satisFiyatiKurus, 0);
  const karKurus = satirlar.reduce((t, s) => t + s.karKurus, 0);

  return {
    kalemler: satirlar,
    adet: satirlar.length,
    ciroKurus,
    karKurus,
    /** Bunların kaçı aktarımdaki sat-geri al işlemi. */
    aktarimAdedi: satirlar.filter((s) => s.aktarimMi).length,
  };
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

/** Panelde gösterilen son stok hareketleri — yalnız görünür mağazaların. */
export async function sonHareketler(gorunur: number[] | null, adet = 10) {
  return prisma.stokHareketi.findMany({
    where: hareketKosulu(gorunur),
    take: adet,
    orderBy: { tarih: "desc" },
    include: {
      stokKalemi: {
        select: { id: true, marka: true, model: true, seriNo: true },
      },
      kullanici: { select: { adSoyad: true } },
      kaynakMagaza: { select: { ad: true } },
      hedefMagaza: { select: { ad: true } },
    },
  });
}
