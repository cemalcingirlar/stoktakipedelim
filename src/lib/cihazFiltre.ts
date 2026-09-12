import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { aramaNormalize } from "./metin";
import { gunSonu } from "./tarih";

export type CihazFiltresi = {
  durum: string;
  magazaId: number | null;
  kategoriId: number | null;
  altKategoriId: number | null;
  vade: "" | "gecen" | "yaklasan" | "odenmemis";
  ara: string;
  alisBas: Date | null;
  alisBit: Date | null;
  satisBas: Date | null;
  satisBit: Date | null;
  sayfa: number;
};

export const SAYFA_BOYUTU = 50;

function sayiVeyaNull(deger: unknown): number | null {
  if (typeof deger !== "string" || deger.trim() === "") return null;
  const n = Number(deger);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function tarihVeyaNull(deger: unknown): Date | null {
  if (typeof deger !== "string" || deger.trim() === "") return null;
  const d = new Date(deger);
  return Number.isNaN(d.getTime()) ? null : d;
}

function metin(deger: unknown): string {
  return typeof deger === "string" ? deger.trim() : "";
}

/** URL arama parametrelerini tiplenmiş filtreye çevirir. */
export function filtreyiCoz(params: Record<string, string | string[] | undefined>): CihazFiltresi {
  const tek = (ad: string) => {
    const v = params[ad];
    return Array.isArray(v) ? v[0] : v;
  };

  const vadeDegeri = metin(tek("vade"));

  return {
    durum: metin(tek("durum")),
    magazaId: sayiVeyaNull(tek("magaza")),
    kategoriId: sayiVeyaNull(tek("kategori")),
    altKategoriId: sayiVeyaNull(tek("altKategori")),
    vade:
      vadeDegeri === "gecen" || vadeDegeri === "yaklasan" || vadeDegeri === "odenmemis"
        ? vadeDegeri
        : "",
    ara: metin(tek("ara")),
    alisBas: tarihVeyaNull(tek("alisBas")),
    alisBit: tarihVeyaNull(tek("alisBit")),
    satisBas: tarihVeyaNull(tek("satisBas")),
    satisBit: tarihVeyaNull(tek("satisBit")),
    sayfa: Math.max(1, sayiVeyaNull(tek("sayfa")) ?? 1),
  };
}

/** Filtreyi Prisma `where` koşuluna dönüştürür. */
export function filtredenWhere(
  filtre: CihazFiltresi,
  bugun: Date = new Date(),
): Prisma.StokKalemiWhereInput {
  const kosullar: Prisma.StokKalemiWhereInput[] = [];

  if (filtre.durum) kosullar.push({ durum: filtre.durum });
  if (filtre.magazaId) kosullar.push({ magazaId: filtre.magazaId });
  if (filtre.kategoriId) kosullar.push({ kategoriId: filtre.kategoriId });
  if (filtre.altKategoriId) kosullar.push({ altKategoriId: filtre.altKategoriId });

  if (filtre.alisBas) kosullar.push({ girisTarihi: { gte: filtre.alisBas } });
  if (filtre.alisBit) kosullar.push({ girisTarihi: { lte: gunSonu(filtre.alisBit) } });
  if (filtre.satisBas) kosullar.push({ satisTarihi: { gte: filtre.satisBas } });
  if (filtre.satisBit) kosullar.push({ satisTarihi: { lte: gunSonu(filtre.satisBit) } });

  if (filtre.ara) {
    // Arama normalleştirilmiş metin üzerinde yapılır (Türkçe karakter duyarsız).
    kosullar.push({ aramaMetni: { contains: aramaNormalize(filtre.ara) } });
  }

  if (filtre.vade === "gecen") {
    kosullar.push({
      alisFaturasi: { is: { vadeOdendi: false, vadeTarihi: { not: null, lt: bugun } } },
    });
  } else if (filtre.vade === "yaklasan") {
    const sinir = new Date(bugun);
    sinir.setDate(sinir.getDate() + 7);
    kosullar.push({
      alisFaturasi: {
        is: { vadeOdendi: false, vadeTarihi: { not: null, gte: bugun, lte: gunSonu(sinir) } },
      },
    });
  } else if (filtre.vade === "odenmemis") {
    kosullar.push({ alisFaturasi: { is: { vadeOdendi: false, vadeGun: { gt: 0 } } } });
  }

  return kosullar.length ? { AND: kosullar } : {};
}

/** Cihaz listesinde her satır için gereken ilişkiler. */
export const CIHAZ_ICERIK = {
  kategori: { select: { id: true, ad: true } },
  altKategori: { select: { id: true, ad: true } },
  magaza: { select: { id: true, kod: true, ad: true } },
  tedarikci: { select: { id: true, ad: true } },
  musteri: { select: { id: true, adSoyad: true, telefon: true } },
  satanKullanici: { select: { id: true, adSoyad: true } },
  alisFaturasi: {
    select: {
      id: true,
      faturaNo: true,
      faturaTarihi: true,
      vadeGun: true,
      vadeTarihi: true,
      vadeOdendi: true,
    },
  },
} satisfies Prisma.StokKalemiInclude;

export type CihazSatiri = Prisma.StokKalemiGetPayload<{ include: typeof CIHAZ_ICERIK }>;

/** Filtre nesnesini tekrar URL sorgu dizesine çevirir (sayfalama bağlantıları için). */
export function filtreyiSorguyaCevir(
  params: Record<string, string | string[] | undefined>,
  degisiklikler: Record<string, string | number | null> = {},
): string {
  const sorgu = new URLSearchParams();
  for (const [anahtar, deger] of Object.entries(params)) {
    const v = Array.isArray(deger) ? deger[0] : deger;
    if (v) sorgu.set(anahtar, v);
  }
  for (const [anahtar, deger] of Object.entries(degisiklikler)) {
    if (deger === null || deger === "") sorgu.delete(anahtar);
    else sorgu.set(anahtar, String(deger));
  }
  const metin = sorgu.toString();
  return metin ? `?${metin}` : "";
}
