"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  EN_YUKSEK_TUTAR_KURUS,
  aktarimSatisAciklamasi,
  aktarimSatisSorunu,
} from "@/lib/aktarimSatisi";
import { dukkanIciAktarabilirMi } from "@/lib/dukkan";
import { logYaz } from "@/lib/log";
import { aramaMetniUret, kodNormalize } from "@/lib/metin";
import { formTarihiCevir } from "@/lib/tarih";
import { kurusuTLYaz } from "@/lib/para";
import { prisma } from "@/lib/prisma";
import { saticiSorunu, type SaticiAdayi } from "@/lib/satici";
import { HAREKET_TIP, LOG_ISLEM, ODEME_TIPI, STOK_DURUM } from "@/lib/sabitler";
import { YetkiHatasi, magazaIslemiZorunlu, oturumZorunlu } from "@/lib/yetki";

export type AktarilanCihaz = {
  id: number;
  marka: string;
  model: string;
  seriNo: string | null;
  barkod: string | null;
  /** Aktarım anındaki alış fiyatı; ekranda revize edilebiliyor. */
  alisFiyatiKurus: number;
  not: string | null;
};

export type AktarimSonucu =
  | { durum: "TAMAM"; mesaj: string; cihaz: AktarilanCihaz }
  | { durum: "HATA"; mesaj: string };

/**
 * Aynı dükkândaki iki mağaza arasında cihazı tek adımda taşır.
 *
 * Sevkiyat akışından farkı: Transfer kaydı açılmaz, cihaz TRANSFERDE durumuna
 * girmez ve karşı tarafın kabul etmesi beklenmez. Mal fiziken yola çıkmadığı
 * için kabul adımı aynı kişinin kendi gönderdiğini onaylamasına dönüşüyordu.
 * Cihazın geçmişi korunur: DUKKAN_ICI tipinde bir stok hareketi yazılır, kaynak
 * ve hedef mağazalarıyla birlikte.
 *
 * Yanlış okutma pahalı değil: aktarımı ters yönde tekrarlamak cihazı geri
 * getirir, ekranda bunun için düğme var.
 */
export async function dukkanIciAktar(
  kod: string,
  kaynakMagazaId: number,
  hedefMagazaId: number,
  not = "",
  /**
   * İşlem tarihi. Geçmişe dönük kayıt girilebilsin diye ekranda seçiliyor;
   * verilmezse bugün. Cihazın tarihçesindeki hareket bu tarihle yazılıyor,
   * yoksa dün yapılan aktarım bugün olmuş gibi görünürdü.
   */
  tarih?: string,
): Promise<AktarimSonucu> {
  try {
    const oturum = await oturumZorunlu();

    // Tarih verilmediyse bugün; verildiyse okunabilir olmalı. Sessizce bugüne
    // düşmek, kullanıcının yazdığı tarihi yok saymak olurdu.
    const islemTarihi = tarih === undefined || tarih === "" ? new Date() : formTarihiCevir(tarih);
    if (islemTarihi === null) return { durum: "HATA", mesaj: "Aktarım tarihi geçersiz." };

    // Not cihazın tarihçesine yazılıyor; neden taşındığı sonradan okunabilsin.
    const temizNot = not.trim().slice(0, 200);

    if (!Number.isInteger(kaynakMagazaId) || !Number.isInteger(hedefMagazaId)) {
      return { durum: "HATA", mesaj: "Mağaza seçimi okunamadı. Sayfayı yenileyin." };
    }

    const magazalar = await prisma.magaza.findMany({
      where: { id: { in: [kaynakMagazaId, hedefMagazaId] } },
      select: { id: true, ad: true, aktif: true, dukkanKodu: true },
    });
    const kaynak = magazalar.find((m) => m.id === kaynakMagazaId);
    const hedef = magazalar.find((m) => m.id === hedefMagazaId);

    if (!kaynak || !hedef) return { durum: "HATA", mesaj: "Mağaza bulunamadı." };
    if (!hedef.aktif) return { durum: "HATA", mesaj: `${hedef.ad} pasif durumda.` };

    if (!dukkanIciAktarabilirMi(oturum, kaynak, hedef)) {
      return {
        durum: "HATA",
        mesaj:
          `${kaynak.ad} ile ${hedef.ad} aynı dükkân değil ya da ikisinde de yetkiniz yok. ` +
          "Farklı dükkânlar arasında Sevkiyat ekranını kullanın.",
      };
    }

    const aranan = kodNormalize(kod);
    if (aranan.length < 3) {
      return { durum: "HATA", mesaj: "Geçerli bir seri no veya barkod girin." };
    }

    const sonuc = await prisma.$transaction(async (tx) => {
      // Cihazın hâlâ kaynak mağazada ve stokta olduğunu işlem içinde doğrula;
      // iki kişi aynı anda okutursa ikincisi hata almalı.
      const cihaz = await tx.stokKalemi.findFirst({
        where: { OR: [{ seriNo: aranan }, { barkod: aranan }] },
        include: { magaza: { select: { ad: true } } },
      });

      if (!cihaz) return { durum: "HATA" as const, mesaj: `${aranan} sistemde kayıtlı değil.` };
      if (cihaz.durum === STOK_DURUM.SATILDI) {
        return { durum: "HATA" as const, mesaj: `${aranan} satılmış, aktarılamaz.` };
      }
      if (cihaz.durum === STOK_DURUM.TRANSFERDE) {
        return { durum: "HATA" as const, mesaj: `${aranan} bir sevkiyatta, önce kabul edilmeli.` };
      }
      if (cihaz.durum !== STOK_DURUM.STOKTA) {
        return {
          durum: "HATA" as const,
          mesaj: `${aranan} stokta değil (${cihaz.durum}), aktarılamaz.`,
        };
      }
      if (cihaz.magazaId === hedefMagazaId) {
        return { durum: "HATA" as const, mesaj: `${aranan} zaten ${hedef.ad} deposunda.` };
      }
      if (cihaz.magazaId !== kaynakMagazaId) {
        return {
          durum: "HATA" as const,
          mesaj: `${aranan} ${cihaz.magaza.ad} deposunda, ${kaynak.ad} deposunda değil.`,
        };
      }

      await tx.stokKalemi.update({
        where: { id: cihaz.id },
        data: { magazaId: hedefMagazaId, durum: STOK_DURUM.STOKTA, cikisTarihi: null },
      });
      await tx.stokHareketi.create({
        data: {
          stokKalemiId: cihaz.id,
          tip: HAREKET_TIP.DUKKAN_ICI,
          kaynakMagazaId: kaynakMagazaId,
          hedefMagazaId: hedefMagazaId,
          kullaniciId: oturum.kullaniciId,
          tarih: islemTarihi,
          aciklama:
            `Dükkân içi aktarım: ${kaynak.ad} → ${hedef.ad}` +
            (temizNot ? ` · ${temizNot}` : ""),
        },
      });

      return {
        durum: "TAMAM" as const,
        cihaz: {
          id: cihaz.id,
          marka: cihaz.marka,
          model: cihaz.model,
          seriNo: cihaz.seriNo,
          barkod: cihaz.barkod,
          alisFiyatiKurus: cihaz.alisFiyatiKurus,
          not: cihaz.not,
        },
      };
    });

    if (sonuc.durum === "HATA") return sonuc;

    await logYaz(oturum, {
      islem: LOG_ISLEM.DUKKAN_ICI_AKTARIM,
      hedefTip: "StokKalemi",
      hedefId: sonuc.cihaz.id,
      detay: `${sonuc.cihaz.marka} ${sonuc.cihaz.model} · ${kaynak.ad} → ${hedef.ad}`,
    });

    revalidatePath("/aktarim");
    revalidatePath("/cihazlar");
    revalidatePath("/satis");
    revalidatePath("/panel");

    return {
      durum: "TAMAM",
      mesaj: `${sonuc.cihaz.marka} ${sonuc.cihaz.model} → ${hedef.ad}`,
      cihaz: sonuc.cihaz,
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { durum: "HATA", mesaj: hata.message };
    console.error("Dükkân içi aktarım başarısız:", hata);
    return { durum: "HATA", mesaj: "Aktarım yapılamadı. Lütfen tekrar deneyin." };
  }
}


// -------------------------------------------------- Fiyat / not düzeltme

export type FiyatDuzeltmeSonucu =
  | { durum: "TAMAM"; mesaj: string; alisFiyatiKurus: number; not: string | null }
  | { durum: "HATA"; mesaj: string };

/**
 * Aktarılan cihazın alış fiyatını ve notunu düzeltir.
 *
 * Bazı ürünlerin fiyatı nakit depoya girerken revize oluyor; aktarımla birlikte
 * tek ekranda düzeltilebilsin diye burada. Aktarımı fiilen yapan mağaza
 * personeli fiyatı da kendi giriyor, bu yüzden yetki mağaza bazlı: kişi
 * cihazın bulunduğu mağazada işlem yapabiliyorsa düzeltebiliyor.
 *
 * Eski ve yeni fiyat tarihçeye DUZELTME hareketi olarak yazılıyor; sonradan
 * neyin ne zaman değiştiği okunabiliyor.
 */
export async function aktarilanCihaziDuzelt(
  cihazId: number,
  alisFiyatiKurus: number,
  not: string,
): Promise<FiyatDuzeltmeSonucu> {
  try {
    const oturum = await oturumZorunlu();

    if (!Number.isInteger(cihazId) || cihazId <= 0) {
      return { durum: "HATA", mesaj: "Cihaz bulunamadı." };
    }
    if (!Number.isInteger(alisFiyatiKurus) || alisFiyatiKurus < 0) {
      return { durum: "HATA", mesaj: "Alış fiyatı okunamadı." };
    }
    if (alisFiyatiKurus > 1_000_000_00_00) {
      return { durum: "HATA", mesaj: "Alış fiyatı çok yüksek." };
    }

    const cihaz = await prisma.stokKalemi.findUnique({
      where: { id: cihazId },
      include: { tedarikci: { select: { ad: true } } },
    });
    if (!cihaz) return { durum: "HATA", mesaj: "Cihaz bulunamadı." };
    if (cihaz.durum !== STOK_DURUM.STOKTA) {
      // Satılmış cihazın alış fiyatı kârı değiştirir; orası cihaz sayfasının işi.
      return {
        durum: "HATA",
        mesaj: `Cihaz stokta değil (${cihaz.durum}); fiyat buradan düzeltilemez.`,
      };
    }
    magazaIslemiZorunlu(oturum, cihaz.magazaId);

    const temizNot = not.trim().slice(0, 500);
    const yeniNot = temizNot || null;
    const fiyatDegisti = cihaz.alisFiyatiKurus !== alisFiyatiKurus;
    const notDegisti = (cihaz.not ?? null) !== yeniNot;

    if (!fiyatDegisti && !notDegisti) {
      return {
        durum: "TAMAM",
        mesaj: "Değişiklik yok.",
        alisFiyatiKurus: cihaz.alisFiyatiKurus,
        not: cihaz.not,
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.stokKalemi.update({
        where: { id: cihaz.id },
        data: {
          alisFiyatiKurus,
          not: yeniNot,
          aramaMetni: aramaMetniUret([
            cihaz.marka,
            cihaz.model,
            cihaz.renk,
            cihaz.kapasite,
            cihaz.seriNo,
            cihaz.barkod,
            cihaz.tedarikci?.ad,
            yeniNot,
          ]),
        },
      });

      const parcalar: string[] = [];
      if (fiyatDegisti) {
        parcalar.push(
          `Alış fiyatı ${kurusuTLYaz(cihaz.alisFiyatiKurus)} → ${kurusuTLYaz(alisFiyatiKurus)} TL`,
        );
      }
      if (notDegisti) parcalar.push(yeniNot ? `Not: ${yeniNot}` : "Not silindi");

      await tx.stokHareketi.create({
        data: {
          stokKalemiId: cihaz.id,
          tip: HAREKET_TIP.DUZELTME,
          kaynakMagazaId: cihaz.magazaId,
          kullaniciId: oturum.kullaniciId,
          aciklama: parcalar.join(" · "),
        },
      });
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.STOK_DUZENLE,
      hedefTip: "StokKalemi",
      hedefId: cihaz.id,
      detay:
        `Aktarımda düzeltme: ${cihaz.marka} ${cihaz.model} ` +
        `(${cihaz.seriNo ?? "seri no yok"}) · ` +
        `${kurusuTLYaz(cihaz.alisFiyatiKurus)} → ${kurusuTLYaz(alisFiyatiKurus)} TL`,
    });

    revalidatePath("/cihazlar");
    revalidatePath("/panel");

    return {
      durum: "TAMAM",
      mesaj: fiyatDegisti ? "Fiyat güncellendi." : "Not güncellendi.",
      alisFiyatiKurus,
      not: yeniNot,
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { durum: "HATA", mesaj: hata.message };
    console.error("Aktarılan cihaz düzeltilemedi:", hata);
    return { durum: "HATA", mesaj: "Düzeltme kaydedilemedi. Tekrar deneyin." };
  }
}


// ------------------------------------------- Müşteriye satıp geri alma

export type AktarimSatisKaydi = {
  cihazId: number;
  /**
   * Satışın yapıldığı mağaza: aktarımın kaynağı.
   *
   * Cihaz okutulduğu anda hedefe taşınıyor, ama satış kaynakta (ör. kasada)
   * yapılıyor; geri alınan mal depoya giriyor. Cihazın o anki mağazası
   * kullanılırsa satış depoya yazılır ve mağaza bazlı rapor yanlış çıkar.
   */
  kaynakMagazaId: number;
  satisFiyatiKurus: number;
  yeniAlisFiyatiKurus: number;
  /** Satış tarihi (gg-aa-yyyy girdi biçiminde); geçmişe dönük kayıt için. */
  satisTarihi: string;
  odemeTipi: string;
  satanKullaniciId: number | null;
  musteriId: number | null;
  musteriAdSoyad: string | null;
  musteriTelefon: string | null;
  not: string | null;
};

export type AktarimSatisSonucu =
  | {
      durum: "TAMAM";
      mesaj: string;
      /** Satış sonrası cihazın yeni maliyeti — ekranda satır bununla güncelleniyor. */
      alisFiyatiKurus: number;
      musteriAdi: string;
    }
  | { durum: "HATA"; mesaj: string };

const aktarimSatisSemasi = z
  .object({
    cihazId: z.number().int().positive(),
    kaynakMagazaId: z.number().int().positive(),
    satisFiyatiKurus: z.number().int().min(0).max(EN_YUKSEK_TUTAR_KURUS),
    yeniAlisFiyatiKurus: z.number().int().min(0).max(EN_YUKSEK_TUTAR_KURUS),
    satisTarihi: z.coerce.date({ message: "Satış tarihi geçersiz." }),
    odemeTipi: z.enum(Object.values(ODEME_TIPI) as [string, ...string[]], "Ödeme tipi seçin."),
    satanKullaniciId: z.number().int().positive().nullable(),
    musteriId: z.number().int().positive().nullable(),
    musteriAdSoyad: z.string().trim().max(80).nullable(),
    musteriTelefon: z.string().trim().max(30).nullable(),
    not: z.string().trim().max(300).nullable(),
  })
  .refine((v) => v.musteriId !== null || (v.musteriAdSoyad ?? "").length > 0, {
    message: "Müşteri seçin veya ad soyad girin.",
    path: ["musteriAdSoyad"],
  });

/**
 * Mağaza içi aktarımda cihazı müşteriye satıp geri alır.
 *
 * Cihaz stokta kalıyor, satış ayrı bir AktarimSatisi kaydına yazılıyor —
 * gerekçesi src/lib/aktarimSatisi.ts başında. Satışın kârı o andaki alış
 * fiyatına göre; geri alış fiyatı cihazın yeni maliyeti oluyor.
 *
 * Tüm kullanıcılarda açık: işi fiilen yapan mağaza personeli, hem satışı hem
 * geri alış fiyatını kendi girebilmeli.
 */
export async function aktarimSatisiKaydet(
  kayit: AktarimSatisKaydi,
): Promise<AktarimSatisSonucu> {
  try {
    const oturum = await oturumZorunlu();

    const cozum = aktarimSatisSemasi.safeParse(kayit);
    if (!cozum.success) return { durum: "HATA", mesaj: cozum.error.issues[0].message };
    const veri = cozum.data;

    const sorun = aktarimSatisSorunu({
      satisFiyatiKurus: veri.satisFiyatiKurus,
      yeniAlisFiyatiKurus: veri.yeniAlisFiyatiKurus,
    });
    if (sorun) return { durum: "HATA", mesaj: sorun };

    const cihaz = await prisma.stokKalemi.findUnique({
      where: { id: veri.cihazId },
      include: { tedarikci: { select: { ad: true } } },
    });
    if (!cihaz) return { durum: "HATA", mesaj: "Cihaz bulunamadı." };
    if (cihaz.durum !== STOK_DURUM.STOKTA) {
      return {
        durum: "HATA",
        mesaj: `Cihaz stokta değil (${cihaz.durum}); satış kaydedilemez.`,
      };
    }
    magazaIslemiZorunlu(oturum, cihaz.magazaId);

    // Satış kaynak mağazaya yazılıyor. Kaynağın cihazın bulunduğu mağazayla
    // aynı dükkânda olması ve kullanıcının ikisinde de yetkili olması şart —
    // yoksa başka bir dükkânın satışı buraya yazılabilirdi.
    const [kaynak, mevcut] = await Promise.all([
      prisma.magaza.findUnique({
        where: { id: veri.kaynakMagazaId },
        select: { id: true, ad: true, dukkanKodu: true },
      }),
      prisma.magaza.findUnique({
        where: { id: cihaz.magazaId },
        select: { id: true, ad: true, dukkanKodu: true },
      }),
    ]);
    if (!kaynak || !mevcut) return { durum: "HATA", mesaj: "Mağaza bulunamadı." };
    if (kaynak.id !== mevcut.id && !dukkanIciAktarabilirMi(oturum, kaynak, mevcut)) {
      return {
        durum: "HATA",
        mesaj: `${kaynak.ad} ile ${mevcut.ad} aynı dükkân değil ya da ikisinde de yetkiniz yok.`,
      };
    }

    // Satışı yapan: seçilmişse o, değilse oturum sahibi. Seçilen kişi satışın
    // mağazasında yetkili olmalı — başka şubenin satışı kimseye yazılmasın.
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
      const saticiHatasi = saticiSorunu(
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
        [kaynak.id],
      );
      if (saticiHatasi) return { durum: "HATA", mesaj: saticiHatasi };
    }

    const sonuc = await prisma.$transaction(async (tx) => {
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
          ? await tx.musteri.findFirst({ where: { telefon }, select: { id: true } })
          : null;
        musteriId = mevcut
          ? mevcut.id
          : (
              await tx.musteri.create({
                data: { adSoyad: veri.musteriAdSoyad ?? "İsimsiz Müşteri", telefon },
              })
            ).id;
      }

      const musteri = await tx.musteri.findUniqueOrThrow({
        where: { id: musteriId },
        select: { adSoyad: true, telefon: true },
      });

      await tx.aktarimSatisi.create({
        data: {
          stokKalemiId: cihaz.id,
          magazaId: kaynak.id,
          musteriId,
          satanKullaniciId: satanId,
          satisFiyatiKurus: veri.satisFiyatiKurus,
          maliyetKurus: cihaz.alisFiyatiKurus,
          yeniAlisFiyatiKurus: veri.yeniAlisFiyatiKurus,
          satisTarihi: veri.satisTarihi,
          odemeTipi: veri.odemeTipi,
          not: veri.not,
        },
      });

      // Geri alış fiyatı cihazın yeni maliyeti; stok değeri ve bir sonraki
      // satışın kârı bundan sonra buna göre hesaplanıyor.
      await tx.stokKalemi.update({
        where: { id: cihaz.id },
        data: {
          alisFiyatiKurus: veri.yeniAlisFiyatiKurus,
          not: veri.not ?? cihaz.not,
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
          kaynakMagazaId: kaynak.id,
          kullaniciId: satanId,
          tarih: veri.satisTarihi,
          aciklama: aktarimSatisAciklamasi({
            musteriAdi: musteri.adSoyad,
            satisFiyatiYazi: kurusuTLYaz(veri.satisFiyatiKurus),
            eskiAlisYazi: kurusuTLYaz(cihaz.alisFiyatiKurus),
            yeniAlisYazi: kurusuTLYaz(veri.yeniAlisFiyatiKurus),
          }),
        },
      });

      return { musteriAdi: musteri.adSoyad };
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.SATIS_YAP,
      hedefTip: "StokKalemi",
      hedefId: cihaz.id,
      detay:
        `Aktarımda sat-geri al: ${cihaz.marka} ${cihaz.model} ` +
        `(${cihaz.seriNo ?? "seri no yok"}) · ${sonuc.musteriAdi} · ` +
        `${kurusuTLYaz(veri.satisFiyatiKurus)} TL satış · ` +
        `yeni alış ${kurusuTLYaz(veri.yeniAlisFiyatiKurus)} TL`,
    });

    revalidatePath("/aktarim");
    revalidatePath("/cihazlar");
    revalidatePath("/panel");
    revalidatePath("/rapor");
    revalidatePath("/musteriler");

    return {
      durum: "TAMAM",
      mesaj: `${sonuc.musteriAdi} müşterisine satılıp geri alındı.`,
      alisFiyatiKurus: veri.yeniAlisFiyatiKurus,
      musteriAdi: sonuc.musteriAdi,
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { durum: "HATA", mesaj: hata.message };
    if (hata instanceof Error && hata.message) return { durum: "HATA", mesaj: hata.message };
    console.error("Aktarım satışı kaydedilemedi:", hata);
    return { durum: "HATA", mesaj: "Satış kaydedilemedi. Tekrar deneyin." };
  }
}
