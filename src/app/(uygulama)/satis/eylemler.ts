"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logYaz } from "@/lib/log";
import { aramaMetniUret, aramaNormalize, kodNormalize } from "@/lib/metin";
import { prisma } from "@/lib/prisma";
import { HAREKET_TIP, LOG_ISLEM, ODEME_TIPI, STOK_DURUM } from "@/lib/sabitler";
import { YetkiHatasi, magazaIslemiZorunlu, oturumZorunlu } from "@/lib/yetki";

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
  | { durum: "HATA"; mesaj: string };

/** Satılacak cihazı seri no / barkod ile bulur ve satışa uygunluğunu denetler. */
export async function satisCihaziOkut(kod: string): Promise<SatisOkutmaSonucu> {
  try {
    const oturum = await oturumZorunlu();

    const aranan = kodNormalize(kod);
    if (aranan.length < 3) return { durum: "HATA", mesaj: "Geçerli bir seri no veya barkod girin." };

    const cihaz = await prisma.stokKalemi.findFirst({
      where: { OR: [{ seriNo: aranan }, { barkod: aranan }] },
      include: { magaza: { select: { ad: true } }, kategori: { select: { ad: true } } },
    });

    if (!cihaz) return { durum: "HATA", mesaj: `${aranan} sistemde kayıtlı değil.` };
    if (cihaz.durum === STOK_DURUM.SATILDI) {
      return { durum: "HATA", mesaj: `${aranan} daha önce satılmış.` };
    }
    if (cihaz.durum === STOK_DURUM.TRANSFERDE) {
      return { durum: "HATA", mesaj: `${aranan} sevkiyatta; önce kabul edilmeli.` };
    }
    if (cihaz.durum !== STOK_DURUM.STOKTA) {
      return { durum: "HATA", mesaj: `${aranan} satışa uygun değil (${cihaz.durum}).` };
    }
    if (!magazadaSatabilir(oturum.rol, oturum.magazaId, cihaz.magazaId)) {
      return {
        durum: "HATA",
        mesaj: `${aranan} ${cihaz.magaza.ad} deposunda. Yalnız kendi mağazanızdaki cihazı satabilirsiniz.`,
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
    if (hata instanceof YetkiHatasi) return { durum: "HATA", mesaj: hata.message };
    console.error("Satış cihazı okutulamadı:", hata);
    return { durum: "HATA", mesaj: "Cihaz aranamadı. Tekrar deneyin." };
  }
}

function magazadaSatabilir(rol: string, kullaniciMagazaId: number | null, cihazMagazaId: number) {
  if (rol === "ADMIN") return true;
  return kullaniciMagazaId === cihazMagazaId;
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
          ...(rakamlar.length >= 4 ? [{ telefon: { contains: rakamlar } }] : []),
          ...(rakamlar.length >= 4 ? [{ tcknVkn: { contains: rakamlar } }] : []),
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

const satisSemasi = z
  .object({
    cihazId: z.number().int().positive("Cihaz okutun."),
    satisFiyatiKurus: z
      .number()
      .int("Satış fiyatı geçersiz.")
      .min(0, "Satış fiyatı negatif olamaz.")
      .max(1_000_000_00_00, "Satış fiyatı çok yüksek."),
    odemeTipi: z.enum(
      Object.values(ODEME_TIPI) as [string, ...string[]],
      "Ödeme tipi seçin.",
    ),
    satisTarihi: z.coerce.date({ message: "Satış tarihi geçersiz." }),
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

export async function satisKaydet(_onceki: SatisDurumu, form: FormData): Promise<SatisDurumu> {
  let cihazId: number;

  try {
    const oturum = await oturumZorunlu();

    let cozulen: unknown;
    try {
      cozulen = JSON.parse(String(form.get("veri") ?? ""));
    } catch {
      return { hata: "Form verisi okunamadı. Sayfayı yenileyip tekrar deneyin." };
    }

    const sonuc = satisSemasi.safeParse(cozulen);
    if (!sonuc.success) return { hata: sonuc.error.issues[0].message };
    const veri = sonuc.data;

    const cihaz = await prisma.stokKalemi.findUnique({
      where: { id: veri.cihazId },
      include: { tedarikci: { select: { ad: true } } },
    });
    if (!cihaz) return { hata: "Cihaz bulunamadı." };
    if (cihaz.durum !== STOK_DURUM.STOKTA) {
      return { hata: "Bu cihaz artık stokta değil. Listeyi yenileyin." };
    }
    magazaIslemiZorunlu(oturum, cihaz.magazaId);

    const satis = await prisma.$transaction(async (tx) => {
      let musteriId = veri.musteriId;

      if (musteriId) {
        const varMi = await tx.musteri.findUnique({ where: { id: musteriId }, select: { id: true } });
        if (!varMi) throw new Error("Seçilen müşteri bulunamadı.");
      } else {
        // Aynı telefonla kayıtlı müşteri varsa tekrar oluşturma.
        const telefon = veri.musteriTelefon?.replace(/\s/g, "") || null;
        const mevcut = telefon
          ? await tx.musteri.findFirst({ where: { telefon }, select: { id: true } })
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

      const guncel = await tx.stokKalemi.update({
        where: { id: cihaz.id },
        data: {
          durum: STOK_DURUM.SATILDI,
          satisTarihi: veri.satisTarihi,
          satisFiyatiKurus: veri.satisFiyatiKurus,
          satanKullaniciId: oturum.kullaniciId,
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
          kullaniciId: oturum.kullaniciId,
          aciklama: `${musteri.adSoyad} müşterisine satıldı`,
          tarih: veri.satisTarihi,
        },
      });

      return { guncel, musteriAdi: musteri.adSoyad };
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.SATIS_YAP,
      hedefTip: "StokKalemi",
      hedefId: cihaz.id,
      detay: `${cihaz.marka} ${cihaz.model} (${cihaz.seriNo ?? "seri no yok"}) · ${satis.musteriAdi}`,
    });

    revalidatePath("/cihazlar");
    revalidatePath("/panel");
    revalidatePath("/musteriler");
    cihazId = cihaz.id;
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    if (hata instanceof Error && hata.message) return { hata: hata.message };
    console.error("Satış kaydedilemedi:", hata);
    return { hata: "Satış kaydedilemedi. Lütfen tekrar deneyin." };
  }

  redirect(`/cihazlar/${cihazId}`);
}
