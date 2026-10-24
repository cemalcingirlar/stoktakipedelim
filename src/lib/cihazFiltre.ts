import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { siralamaCoz, type Siralama } from "./cihazSiralama";
import { magazaKosulu } from "./gorunurluk";
import { aramaNormalize, kodNormalize } from "./metin";
import { tlyiKurusaCevir } from "./para";
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

  // ----------------------------------------------- sütun bazlı filtreler
  // Excel'in sütun filtresi gibi: her sütun kendi başına daraltılabiliyor.
  // Metin alanları "içerir" araması yapıyor; SQLite'ın LIKE'ı ASCII için
  // büyük/küçük harf duyarsız, bu yüzden "iphone" da "iPhone"u buluyor.
  marka: string;
  model: string;
  seriNo: string;
  barkod: string;
  tedarikciId: number | null;
  satanKullaniciId: number | null;
  musteri: string;
  not: string;
  /** Alış fiyatı aralığı (kuruş). */
  alisMin: number | null;
  alisMax: number | null;
  /** Satış fiyatı aralığı (kuruş). */
  satisMin: number | null;
  satisMax: number | null;

  siralama: Siralama;
  sayfa: number;
};

/** Sütun filtrelerinin URL parametre adları — temizleme ve sayım için. */
export const SUTUN_FILTRE_PARAMETRELERI = [
  "marka",
  "model",
  "seriNo",
  "barkod",
  "tedarikci",
  "satan",
  "musteri",
  "not",
  "alisMin",
  "alisMax",
  "satisMin",
  "satisMax",
] as const;

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

/** "12.500,00" ya da "12500" → kuruş. Boşsa null. */
function tutarVeyaNull(deger: unknown): number | null {
  const ham = metin(deger);
  if (!ham) return null;
  return tlyiKurusaCevir(ham);
}

/** URL arama parametrelerini tiplenmiş filtreye çevirir. */
export function filtreyiCoz(
  params: Record<string, string | string[] | undefined>,
): CihazFiltresi {
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
      vadeDegeri === "gecen" ||
      vadeDegeri === "yaklasan" ||
      vadeDegeri === "odenmemis"
        ? vadeDegeri
        : "",
    ara: metin(tek("ara")),
    alisBas: tarihVeyaNull(tek("alisBas")),
    alisBit: tarihVeyaNull(tek("alisBit")),
    satisBas: tarihVeyaNull(tek("satisBas")),
    satisBit: tarihVeyaNull(tek("satisBit")),

    marka: metin(tek("marka")),
    model: metin(tek("model")),
    seriNo: metin(tek("seriNo")),
    barkod: metin(tek("barkod")),
    tedarikciId: sayiVeyaNull(tek("tedarikci")),
    satanKullaniciId: sayiVeyaNull(tek("satan")),
    musteri: metin(tek("musteri")),
    not: metin(tek("not")),
    alisMin: tutarVeyaNull(tek("alisMin")),
    alisMax: tutarVeyaNull(tek("alisMax")),
    satisMin: tutarVeyaNull(tek("satisMin")),
    satisMax: tutarVeyaNull(tek("satisMax")),

    siralama: siralamaCoz(tek("sirala"), tek("yon")),
    sayfa: Math.max(1, sayiVeyaNull(tek("sayfa")) ?? 1),
  };
}

/** Kaç sütun filtresi etkin? Ekranda "temizle" düğmesi için. */
export function etkinSutunFiltresiSayisi(filtre: CihazFiltresi): number {
  const degerler = [
    filtre.marka,
    filtre.model,
    filtre.seriNo,
    filtre.barkod,
    filtre.musteri,
    filtre.not,
    filtre.tedarikciId,
    filtre.satanKullaniciId,
    filtre.alisMin,
    filtre.alisMax,
    filtre.satisMin,
    filtre.satisMax,
  ];
  return degerler.filter((d) => d !== null && d !== "").length;
}

/**
 * Filtreyi Prisma `where` koşuluna dönüştürür.
 *
 * `gorunur` zorunlu ve ikinci sırada: cihaz listesi, Excel aktarımı ve özet
 * rakamların hepsi buradan geçiyor, dolayısıyla mağaza kısıtını atlayan bir
 * çağrı derlenmemeli. Kısıt diğer filtrelerle VE'leniyor; kullanıcı URL'ye
 * elle `?magaza=` yazsa bile göremediği mağaza boş liste döner.
 */
export function filtredenWhere(
  filtre: CihazFiltresi,
  gorunur: number[] | null,
  bugun: Date = new Date(),
): Prisma.StokKalemiWhereInput {
  const kosullar: Prisma.StokKalemiWhereInput[] = [];

  if (gorunur !== null) kosullar.push(magazaKosulu(gorunur));

  if (filtre.durum) kosullar.push({ durum: filtre.durum });
  if (filtre.magazaId) kosullar.push({ magazaId: filtre.magazaId });
  if (filtre.kategoriId) kosullar.push({ kategoriId: filtre.kategoriId });
  if (filtre.altKategoriId)
    kosullar.push({ altKategoriId: filtre.altKategoriId });

  if (filtre.alisBas) kosullar.push({ girisTarihi: { gte: filtre.alisBas } });
  if (filtre.alisBit)
    kosullar.push({ girisTarihi: { lte: gunSonu(filtre.alisBit) } });
  if (filtre.satisBas) kosullar.push({ satisTarihi: { gte: filtre.satisBas } });
  if (filtre.satisBit)
    kosullar.push({ satisTarihi: { lte: gunSonu(filtre.satisBit) } });

  // Marka tam eşleşme: değer listeden seçiliyor, "içerir" araması burada
  // yanıltıcı olurdu (ör. "Samsung" seçildiğinde başka marka gelmemeli).
  if (filtre.marka) kosullar.push({ marka: filtre.marka });
  if (filtre.model) kosullar.push({ model: { contains: filtre.model } });
  if (filtre.seriNo)
    kosullar.push({ seriNo: { contains: kodNormalize(filtre.seriNo) } });
  if (filtre.barkod)
    kosullar.push({ barkod: { contains: kodNormalize(filtre.barkod) } });
  if (filtre.tedarikciId) kosullar.push({ tedarikciId: filtre.tedarikciId });
  if (filtre.satanKullaniciId) {
    kosullar.push({ satanKullaniciId: filtre.satanKullaniciId });
  }
  if (filtre.musteri) {
    kosullar.push({
      musteri: { is: { adSoyad: { contains: filtre.musteri } } },
    });
  }
  if (filtre.not) kosullar.push({ not: { contains: filtre.not } });

  if (filtre.alisMin !== null)
    kosullar.push({ alisFiyatiKurus: { gte: filtre.alisMin } });
  if (filtre.alisMax !== null)
    kosullar.push({ alisFiyatiKurus: { lte: filtre.alisMax } });
  if (filtre.satisMin !== null)
    kosullar.push({ satisFiyatiKurus: { gte: filtre.satisMin } });
  if (filtre.satisMax !== null)
    kosullar.push({ satisFiyatiKurus: { lte: filtre.satisMax } });

  if (filtre.ara) {
    // Arama normalleştirilmiş metin üzerinde yapılır (Türkçe karakter duyarsız).
    kosullar.push({ aramaMetni: { contains: aramaNormalize(filtre.ara) } });
  }

  if (filtre.vade === "gecen") {
    kosullar.push({
      // İptal edilen fatura borç değil; vade süzgeçlerine girmemeli.
      alisFaturasi: {
        is: {
          iptalEdildi: false,
          vadeOdendi: false,
          vadeTarihi: { not: null, lt: bugun },
        },
      },
    });
  } else if (filtre.vade === "yaklasan") {
    const sinir = new Date(bugun);
    sinir.setDate(sinir.getDate() + 7);
    kosullar.push({
      alisFaturasi: {
        is: {
          iptalEdildi: false,
          vadeOdendi: false,
          vadeTarihi: { not: null, gte: bugun, lte: gunSonu(sinir) },
        },
      },
    });
  } else if (filtre.vade === "odenmemis") {
    kosullar.push({
      alisFaturasi: {
        is: { iptalEdildi: false, vadeOdendi: false, vadeGun: { gt: 0 } },
      },
    });
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

export type CihazSatiri = Prisma.StokKalemiGetPayload<{
  include: typeof CIHAZ_ICERIK;
}>;

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
