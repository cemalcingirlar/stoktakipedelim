"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logYaz } from "@/lib/log";
import { aramaMetniUret, aramaNormalize, kodNormalize } from "@/lib/metin";
import { prisma } from "@/lib/prisma";
import { cihazSec, type AdayCihaz } from "@/lib/cihazSecimi";
import {
  EN_COK_GRUP,
  sonucuKisalt,
  type AramaSonucu,
  EN_COK_CIHAZ,
  aramaYeterliMi,
  gruplaUrunler,
  secimSorulmali,
  type UrunGrubu,
} from "@/lib/urunArama";
import { saticiSorunu, type SaticiAdayi } from "@/lib/satici";
import {
  HAREKET_TIP,
  LOG_ISLEM,
  ODEME_TIPI,
  STOK_DURUM,
  TRANSFER_DURUM,
} from "@/lib/sabitler";
import {
  YetkiHatasi,
  adminMi,
  magazaIslemiZorunlu,
  magazadaIslemYapabilirMi,
  oturumZorunlu,
  yetkiliMagazalar,
} from "@/lib/yetki";

/** Prisma kaydını seçim mantığının beklediği biçime çevirir. */
function adayaCevir(c: {
  id: number;
  seriNo: string | null;
  barkod: string | null;
  durum: string;
  magazaId: number;
  marka: string;
  model: string;
  alisFiyatiKurus: number;
  magaza: { ad: string };
}): AdayCihaz {
  return {
    id: c.id,
    seriNo: c.seriNo,
    barkod: c.barkod,
    durum: c.durum,
    magazaId: c.magazaId,
    magazaAdi: c.magaza.ad,
    marka: c.marka,
    model: c.model,
    alisFiyatiKurus: c.alisFiyatiKurus,
  };
}

// ------------------------------------------------------------- Cihaz okutma

export type SatisOkutmaSonucu =
  | {
      durum: "BULUNDU";
      cihaz: {
        id: number;
        marka: string;
        model: string;
        renk: string | null;
        kapasite: string | null;
        seriNo: string | null;
        barkod: string | null;
        kategori: string;
        magazaId: number;
        magazaAdi: string;
        alisFiyatiKurus: number;
      };
    }
  /** Aynı barkodta birden çok uygun cihaz var; kullanıcı seçmeli. */
  | { durum: "SECIM"; aranan: string; adaylar: AdayCihaz[] }
  | { durum: "HATA"; mesaj: string };

/**
 * Satılacak cihazı seri no / barkod ile bulur ve satışa uygunluğunu denetler.
 *
 * `secilmisIdler` sepetteki cihazlar: aynı barkodtan ikinci kez okutulunca
 * aynı cihaz tekrar eklenmesin, sıradaki uygun cihaz gelsin.
 */
export async function satisCihaziOkut(
  kod: string,
  secilmisIdler: number[] = [],
): Promise<SatisOkutmaSonucu> {
  try {
    const oturum = await oturumZorunlu();

    const aranan = kodNormalize(kod);
    if (aranan.length < 3)
      return { durum: "HATA", mesaj: "Geçerli bir seri no veya barkod girin." };

    // Barkod birden çok cihazda olabiliyor (seri numarası olmayan ürünler).
    // Hepsi çekiliyor; hangisinin işleme alınacağına cihazSec karar veriyor.
    const adaylar = await prisma.stokKalemi.findMany({
      where: { OR: [{ seriNo: aranan }, { barkod: aranan }] },
      include: {
        magaza: { select: { ad: true } },
        kategori: { select: { ad: true } },
      },
      orderBy: { id: "asc" },
    });

    const secim = cihazSec(adaylar.map(adayaCevir), {
      aranan,
      yetkiliMagazalar: adminMi(oturum) ? null : yetkiliMagazalar(oturum),
      secilmisIdler,
    });

    if (secim.durum === "SECIM") {
      return { durum: "SECIM", aranan, adaylar: secim.adaylar };
    }

    // Tek cihaza indi ya da hiç uygun cihaz yok. Uygunsuz durumlarda aşağıdaki
    // ayrıntılı denetimler devreye giriyor (sevkiyat numarası gibi).
    const cihaz =
      secim.durum === "TEK"
        ? adaylar.find((a) => a.id === secim.cihaz.id)!
        : (adaylar.find((a) => a.seriNo === aranan) ?? adaylar[0]);

    if (!cihaz)
      return {
        durum: "HATA",
        mesaj:
          secim.durum === "YOK"
            ? secim.mesaj
            : `${aranan} sistemde kayıtlı değil.`,
      };
    if (secim.durum === "YOK" && cihaz.durum !== STOK_DURUM.TRANSFERDE) {
      return { durum: "HATA", mesaj: secim.mesaj };
    }
    if (cihaz.durum === STOK_DURUM.SATILDI) {
      return { durum: "HATA", mesaj: `${aranan} daha önce satılmış.` };
    }
    if (cihaz.durum === STOK_DURUM.TRANSFERDE) {
      // Hangi sevkiyatta olduğunu söylemezsek kullanıcı cihazı aramak zorunda
      // kalıyor; açık sevkiyatın numarasını ve hedefini veriyoruz.
      const kalem = await prisma.transferKalemi.findFirst({
        where: {
          stokKalemiId: cihaz.id,
          transfer: {
            durum: {
              in: [TRANSFER_DURUM.BEKLIYOR, TRANSFER_DURUM.KISMI_KABUL],
            },
          },
        },
        orderBy: { id: "desc" },
        select: {
          transfer: {
            select: { transferNo: true, hedefMagaza: { select: { ad: true } } },
          },
        },
      });

      if (!kalem) {
        return {
          durum: "HATA",
          mesaj:
            `${aranan} sevkiyatta görünüyor ama açık bir sevkiyatı yok. ` +
            "Yöneticinize bildirin, cihaz elle düzeltilmeli.",
        };
      }

      return {
        durum: "HATA",
        mesaj:
          `${aranan} ${kalem.transfer.transferNo} numaralı sevkiyatta ` +
          `(${kalem.transfer.hedefMagaza.ad}). Satmadan önce Mağazalar Arası Sevk ` +
          "ekranından kabul edilmeli.",
      };
    }
    if (cihaz.durum !== STOK_DURUM.STOKTA) {
      return {
        durum: "HATA",
        mesaj: `${aranan} satışa uygun değil (${cihaz.durum}).`,
      };
    }
    if (!magazadaIslemYapabilirMi(oturum, cihaz.magazaId)) {
      return {
        durum: "HATA",
        mesaj: `${aranan} ${cihaz.magaza.ad} deposunda. Yalnız yetkili olduğunuz mağazadaki cihazı satabilirsiniz.`,
      };
    }

    return {
      durum: "BULUNDU",
      cihaz: {
        id: cihaz.id,
        marka: cihaz.marka,
        model: cihaz.model,
        renk: cihaz.renk,
        kapasite: cihaz.kapasite,
        seriNo: cihaz.seriNo,
        barkod: cihaz.barkod,
        kategori: cihaz.kategori.ad,
        magazaId: cihaz.magazaId,
        magazaAdi: cihaz.magaza.ad,
        alisFiyatiKurus: cihaz.alisFiyatiKurus,
      },
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi)
      return { durum: "HATA", mesaj: hata.message };
    console.error("Satış cihazı okutulamadı:", hata);
    return { durum: "HATA", mesaj: "Cihaz aranamadı. Tekrar deneyin." };
  }
}

/** Seçim listesinden bir cihaz seçildiğinde onu kimlikle getirir. */
export async function satisCihaziniSec(
  cihazId: number,
  secilmisIdler: number[] = [],
): Promise<SatisOkutmaSonucu> {
  try {
    const oturum = await oturumZorunlu();

    const cihaz = await prisma.stokKalemi.findUnique({
      where: { id: cihazId },
      include: {
        magaza: { select: { ad: true } },
        kategori: { select: { ad: true } },
      },
    });
    if (!cihaz) return { durum: "HATA", mesaj: "Cihaz bulunamadı." };

    // Seçim ekranda yapılmış olsa da uygunluk sunucuda yeniden denetleniyor:
    // arada başkası satmış olabilir.
    const secim = cihazSec([adayaCevir(cihaz)], {
      aranan: cihaz.seriNo ?? cihaz.barkod ?? String(cihaz.id),
      yetkiliMagazalar: adminMi(oturum) ? null : yetkiliMagazalar(oturum),
      secilmisIdler,
    });
    if (secim.durum !== "TEK") {
      return {
        durum: "HATA",
        mesaj: secim.durum === "YOK" ? secim.mesaj : "Cihaz seçilemedi.",
      };
    }

    return {
      durum: "BULUNDU",
      cihaz: {
        id: cihaz.id,
        marka: cihaz.marka,
        model: cihaz.model,
        renk: cihaz.renk,
        kapasite: cihaz.kapasite,
        seriNo: cihaz.seriNo,
        barkod: cihaz.barkod,
        kategori: cihaz.kategori.ad,
        magazaId: cihaz.magazaId,
        magazaAdi: cihaz.magaza.ad,
        alisFiyatiKurus: cihaz.alisFiyatiKurus,
      },
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi)
      return { durum: "HATA", mesaj: hata.message };
    console.error("Cihaz seçilemedi:", hata);
    return { durum: "HATA", mesaj: "Cihaz seçilemedi. Tekrar deneyin." };
  }
}

// ------------------------------------------------------------ Ürün arama

/**
 * Stoktaki ürünleri adıyla arar — satış ekranındaki "Listeden Seç" için.
 *
 * Bazı ürünü okutmak yerine adıyla bulmak daha kolay: aksesuarın barkodu
 * silinmiş olabiliyor. Sonuç cihaz cihaz değil ürün ürün dönüyor; aynı
 * aksesuardan 20 adet varsa tek satır.
 *
 * Yalnız satılabilir cihazlar geliyor: stokta olanlar, kullanıcının yetkili
 * olduğu mağazalardakiler ve sepette olmayanlar. Böylece listeden seçilen bir
 * ürün "satılamaz" diye geri dönmüyor.
 */
export async function satisUrunleriniAra(
  sorgu: string,
  secilmisIdler: number[] = [],
): Promise<AramaSonucu<UrunGrubu>> {
  try {
    const oturum = await oturumZorunlu();
    if (!aramaYeterliMi(sorgu)) return { gruplar: [], kesildi: false };

    const gorunur = adminMi(oturum) ? null : yetkiliMagazalar(oturum);

    const cihazlar = await prisma.stokKalemi.findMany({
      where: {
        durum: STOK_DURUM.STOKTA,
        aramaMetni: { contains: aramaNormalize(sorgu) },
        ...(gorunur === null ? {} : { magazaId: { in: gorunur } }),
        ...(secilmisIdler.length > 0 ? { id: { notIn: secilmisIdler } } : {}),
      },
      include: {
        magaza: { select: { ad: true } },
        kategori: { select: { ad: true } },
      },
      // Gruplama ekranda değil burada yapılıyor; makul bir üst sınır yeter.
      // Sınıra dayanıldığını anlamak için bir fazlası çekiliyor.
      take: EN_COK_CIHAZ + 1,
      orderBy: { id: "asc" },
    });

    const cihazKesildi = cihazlar.length > EN_COK_CIHAZ;

    const tumGruplar = gruplaUrunler(
      cihazlar.slice(0, EN_COK_CIHAZ).map((c) => ({
        id: c.id,
        marka: c.marka,
        model: c.model,
        barkod: c.barkod,
        seriNo: c.seriNo,
        kategori: c.kategori.ad,
        magazaAdi: c.magaza.ad,
        alisFiyatiKurus: c.alisFiyatiKurus,
      })),
    );
    return sonucuKisalt(tumGruplar, EN_COK_GRUP, cihazKesildi);
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { gruplar: [], kesildi: false };
    console.error("Ürün araması başarısız:", hata);
    return { gruplar: [], kesildi: false };
  }
}

/**
 * Listeden seçilen ürünü satışa alır.
 *
 * Tek cihaz varsa doğrudan sepete; birden çok varsa hangisinin satılacağı
 * sorulur — okutmadaki kuralın aynısı, çünkü aynı ürünün iki kaydı farklı
 * seri numarası ve farklı maliyet taşıyabiliyor.
 *
 * Kimlikler ekrandan geliyor ama uygunluk burada yeniden denetleniyor:
 * arama yapıldıktan sonra başkası o cihazı satmış olabilir.
 */
export async function satisUrunGrubunuSec(
  cihazIdleri: number[],
  secilmisIdler: number[] = [],
): Promise<SatisOkutmaSonucu> {
  try {
    const oturum = await oturumZorunlu();

    const idler = cihazIdleri
      .filter((id) => Number.isInteger(id) && id > 0)
      .slice(0, 500);
    if (idler.length === 0)
      return { durum: "HATA", mesaj: "Ürün seçimi okunamadı." };

    const adaylar = await prisma.stokKalemi.findMany({
      where: { id: { in: idler } },
      include: {
        magaza: { select: { ad: true } },
        kategori: { select: { ad: true } },
      },
      orderBy: { id: "asc" },
    });
    if (adaylar.length === 0)
      return { durum: "HATA", mesaj: "Seçilen ürün bulunamadı." };

    const aranan =
      adaylar[0].barkod ?? `${adaylar[0].marka} ${adaylar[0].model}`;
    const secim = cihazSec(adaylar.map(adayaCevir), {
      aranan,
      yetkiliMagazalar: adminMi(oturum) ? null : yetkiliMagazalar(oturum),
      secilmisIdler,
    });

    if (secim.durum === "YOK") return { durum: "HATA", mesaj: secim.mesaj };

    // Seri numaralı cihazlarda hangisinin satıldığı sorulur; seri numarası
    // olmayan özdeş ürünlerde ilk uygun cihaz alınır.
    if (secim.durum === "SECIM" && secimSorulmali(secim.adaylar)) {
      return { durum: "SECIM", aranan, adaylar: secim.adaylar };
    }
    const secilenId =
      secim.durum === "TEK" ? secim.cihaz.id : secim.adaylar[0].id;

    const cihaz = adaylar.find((a) => a.id === secilenId)!;
    return {
      durum: "BULUNDU",
      cihaz: {
        id: cihaz.id,
        marka: cihaz.marka,
        model: cihaz.model,
        renk: cihaz.renk,
        kapasite: cihaz.kapasite,
        seriNo: cihaz.seriNo,
        barkod: cihaz.barkod,
        kategori: cihaz.kategori.ad,
        magazaId: cihaz.magazaId,
        magazaAdi: cihaz.magaza.ad,
        alisFiyatiKurus: cihaz.alisFiyatiKurus,
      },
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi)
      return { durum: "HATA", mesaj: hata.message };
    console.error("Listeden ürün seçilemedi:", hata);
    return { durum: "HATA", mesaj: "Ürün seçilemedi. Tekrar deneyin." };
  }
}

// ----------------------------------------------------------- Müşteri arama

export type MusteriOzeti = {
  id: number;
  adSoyad: string;
  telefon: string | null;
  tcknVkn: string | null;
};

/** Ad veya telefona göre mevcut müşterileri arar (satış ekranında tekrar kayıt olmasın). */
export async function musteriAra(sorgu: string): Promise<MusteriOzeti[]> {
  try {
    await oturumZorunlu();
    const temiz = sorgu.trim();
    if (temiz.length < 2) return [];

    const rakamlar = temiz.replace(/\D/g, "");

    return prisma.musteri.findMany({
      where: {
        OR: [
          { adSoyad: { contains: temiz } },
          { adSoyad: { contains: aramaNormalize(temiz) } },
          ...(rakamlar.length >= 4
            ? [{ telefon: { contains: rakamlar } }]
            : []),
          ...(rakamlar.length >= 4
            ? [{ tcknVkn: { contains: rakamlar } }]
            : []),
        ],
      },
      orderBy: { adSoyad: "asc" },
      take: 8,
      select: { id: true, adSoyad: true, telefon: true, tcknVkn: true },
    });
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------ Satış

const satisSatiriSemasi = z.object({
  cihazId: z.number().int().positive("Cihaz okutun."),
  satisFiyatiKurus: z
    .number()
    .int("Satış fiyatı geçersiz.")
    .min(0, "Satış fiyatı negatif olamaz.")
    .max(1_000_000_00_00, "Satış fiyatı çok yüksek."),
});

const satisSemasi = z
  .object({
    // Bir müşteri tek seferde birden çok cihaz alabiliyor; müşteri, ödeme tipi
    // ve tarih ortak, satış fiyatı cihaz başına.
    satirlar: z
      .array(satisSatiriSemasi)
      .min(1, "Satılacak cihaz okutun.")
      .max(50, "Tek satışta en çok 50 cihaz olabilir."),
    odemeTipi: z.enum(
      Object.values(ODEME_TIPI) as [string, ...string[]],
      "Ödeme tipi seçin.",
    ),
    satisTarihi: z.coerce.date({ message: "Satış tarihi geçersiz." }),
    /** Satışı fiilen yapan kişi; boşsa oturum sahibi kabul edilir. */
    satanKullaniciId: z.number().int().positive().nullable(),
    musteriId: z.number().int().positive().nullable(),
    musteriAdSoyad: z.string().trim().max(80).nullable(),
    musteriTelefon: z.string().trim().max(30).nullable(),
    musteriTcknVkn: z.string().trim().max(20).nullable(),
    musteriAdres: z.string().trim().max(200).nullable(),
    not: z.string().trim().max(300).nullable(),
  })
  .refine((v) => v.musteriId !== null || (v.musteriAdSoyad ?? "").length > 0, {
    message: "Müşteri seçin veya ad soyad girin.",
    path: ["musteriAdSoyad"],
  });

export type SatisDurumu = { hata?: string };

export async function satisKaydet(
  _onceki: SatisDurumu,
  form: FormData,
): Promise<SatisDurumu> {
  let gidilecekYol: string;

  try {
    const oturum = await oturumZorunlu();

    let cozulen: unknown;
    try {
      cozulen = JSON.parse(String(form.get("veri") ?? ""));
    } catch {
      return {
        hata: "Form verisi okunamadı. Sayfayı yenileyip tekrar deneyin.",
      };
    }

    const sonuc = satisSemasi.safeParse(cozulen);
    if (!sonuc.success) return { hata: sonuc.error.issues[0].message };
    const veri = sonuc.data;

    const idler = veri.satirlar.map((s) => s.cihazId);
    if (new Set(idler).size !== idler.length) {
      return { hata: "Aynı cihaz listede birden fazla var." };
    }

    const cihazlar = await prisma.stokKalemi.findMany({
      where: { id: { in: idler } },
      include: { tedarikci: { select: { ad: true } } },
    });
    if (cihazlar.length !== idler.length)
      return { hata: "Cihazlardan biri bulunamadı." };

    for (const cihaz of cihazlar) {
      if (cihaz.durum !== STOK_DURUM.STOKTA) {
        return {
          hata: `${cihaz.marka} ${cihaz.model} artık stokta değil. Listeyi yenileyin.`,
        };
      }
      // Her cihaz için ayrı ayrı: satışta birden çok mağazanın cihazı olabilir.
      magazaIslemiZorunlu(oturum, cihaz.magazaId);
    }

    const fiyatHarita = new Map(
      veri.satirlar.map((s) => [s.cihazId, s.satisFiyatiKurus]),
    );

    // Satışı yapan: seçilmişse o, değilse oturum sahibi. Seçilen kişinin
    // cihazların bulunduğu mağazalarda yetkili olması gerekiyor — başka
    // şubenin satışı kimsenin üstüne yazılmasın.
    const satanId = veri.satanKullaniciId ?? oturum.kullaniciId;
    if (satanId !== oturum.kullaniciId) {
      const aday = await prisma.kullanici.findUnique({
        where: { id: satanId },
        select: {
          id: true,
          adSoyad: true,
          rol: true,
          aktif: true,
          magazaId: true,
          ekMagazalar: { select: { id: true } },
        },
      });
      const sorun = saticiSorunu(
        aday
          ? {
              id: aday.id,
              adSoyad: aday.adSoyad,
              rol: aday.rol as SaticiAdayi["rol"],
              aktif: aday.aktif,
              magazaIdleri: [
                ...(aday.magazaId === null ? [] : [aday.magazaId]),
                ...aday.ekMagazalar.map((m) => m.id),
              ],
            }
          : undefined,
        [...new Set(cihazlar.map((c) => c.magazaId))],
      );
      if (sorun) return { hata: sorun };
    }

    const satis = await prisma.$transaction(async (tx) => {
      let musteriId = veri.musteriId;

      if (musteriId) {
        const varMi = await tx.musteri.findUnique({
          where: { id: musteriId },
          select: { id: true },
        });
        if (!varMi) throw new Error("Seçilen müşteri bulunamadı.");
      } else {
        // Aynı telefonla kayıtlı müşteri varsa tekrar oluşturma.
        const telefon = veri.musteriTelefon?.replace(/\s/g, "") || null;
        const mevcut = telefon
          ? await tx.musteri.findFirst({
              where: { telefon },
              select: { id: true },
            })
          : null;

        if (mevcut) {
          musteriId = mevcut.id;
        } else {
          const yeni = await tx.musteri.create({
            data: {
              adSoyad: veri.musteriAdSoyad ?? "İsimsiz Müşteri",
              telefon,
              tcknVkn: veri.musteriTcknVkn,
              adres: veri.musteriAdres,
            },
          });
          musteriId = yeni.id;
        }
      }

      const musteri = await tx.musteri.findUniqueOrThrow({
        where: { id: musteriId },
        select: { adSoyad: true, telefon: true },
      });

      for (const cihaz of cihazlar) {
        const satisFiyatiKurus = fiyatHarita.get(cihaz.id) ?? 0;

        await tx.stokKalemi.update({
          where: { id: cihaz.id },
          data: {
            durum: STOK_DURUM.SATILDI,
            satisTarihi: veri.satisTarihi,
            satisFiyatiKurus,
            satanKullaniciId: satanId,
            musteriId,
            odemeTipi: veri.odemeTipi,
            cikisTarihi: veri.satisTarihi,
            not: veri.not ?? cihaz.not,
            // Müşteri artık aranabilir alanların parçası.
            aramaMetni: aramaMetniUret([
              cihaz.marka,
              cihaz.model,
              cihaz.renk,
              cihaz.kapasite,
              cihaz.seriNo,
              cihaz.barkod,
              cihaz.tedarikci?.ad,
              veri.not ?? cihaz.not,
              musteri.adSoyad,
              musteri.telefon,
            ]),
          },
        });

        await tx.stokHareketi.create({
          data: {
            stokKalemiId: cihaz.id,
            tip: HAREKET_TIP.SATIS,
            kaynakMagazaId: cihaz.magazaId,
            kullaniciId: satanId,
            aciklama: `${musteri.adSoyad} müşterisine satıldı`,
            tarih: veri.satisTarihi,
          },
        });
      }

      return { musteriAdi: musteri.adSoyad, musteriId: musteriId! };
    });

    const ozet = cihazlar
      .map((c) => `${c.marka} ${c.model} (${c.seriNo ?? "seri no yok"})`)
      .join(" · ");
    await logYaz(oturum, {
      islem: LOG_ISLEM.SATIS_YAP,
      hedefTip: "StokKalemi",
      hedefId: cihazlar.length === 1 ? cihazlar[0].id : undefined,
      detay: `${cihazlar.length} cihaz · ${satis.musteriAdi} · ${ozet}`.slice(
        0,
        500,
      ),
    });

    revalidatePath("/cihazlar");
    revalidatePath("/panel");
    revalidatePath("/musteriler");

    // Tek cihazda cihaz detayına, birden çoğunda müşterinin sayfasına: orada
    // satın aldığı cihazların tamamı birlikte görünüyor.
    gidilecekYol =
      cihazlar.length === 1
        ? `/cihazlar/${cihazlar[0].id}`
        : `/musteriler?ara=${encodeURIComponent(satis.musteriAdi)}`;
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    if (hata instanceof Error && hata.message) return { hata: hata.message };
    console.error("Satış kaydedilemedi:", hata);
    return { hata: "Satış kaydedilemedi. Lütfen tekrar deneyin." };
  }

  redirect(gidilecekYol);
}
