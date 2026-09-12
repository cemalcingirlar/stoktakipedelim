"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logYaz } from "@/lib/log";
import { aramaMetniUret, kodNormalize } from "@/lib/metin";
import { HAREKET_TIP, LOG_ISLEM, STOK_DURUM } from "@/lib/sabitler";
import { vadeTarihiHesapla } from "@/lib/vade";
import { YetkiHatasi, adminZorunlu } from "@/lib/yetki";
import { faturaSemasi } from "./dogrulama";

export type FaturaDurumu = { hata?: string; alanHatalari?: string[] };

/**
 * Alış faturasını ve her satır için bir stok kalemini tek transaction'da oluşturur.
 * Faturanın vadesi tedarikçinin uyguladığı ödeme vadesidir.
 */
export async function faturaKaydet(
  _onceki: FaturaDurumu,
  form: FormData,
): Promise<FaturaDurumu> {
  let yeniFaturaId: number;

  try {
    const oturum = await adminZorunlu();

    const hamVeri = String(form.get("veri") ?? "");
    let cozulen: unknown;
    try {
      cozulen = JSON.parse(hamVeri);
    } catch {
      return { hata: "Form verisi okunamadı. Sayfayı yenileyip tekrar deneyin." };
    }

    const sonuc = faturaSemasi.safeParse(cozulen);
    if (!sonuc.success) {
      return {
        hata: "Formda eksik veya hatalı alanlar var.",
        alanHatalari: sonuc.error.issues.map((i) => {
          const satirNo = typeof i.path[1] === "number" ? `${i.path[1] + 1}. satır: ` : "";
          return `${satirNo}${i.message}`;
        }),
      };
    }

    const veri = sonuc.data;

    // Seri numaraları formun kendi içinde tekrarlamamalı.
    const seriNolar = veri.satirlar
      .map((s) => kodNormalize(s.seriNo))
      .filter((s): s is string => s.length > 0);
    const tekrarlayan = seriNolar.find((s, i) => seriNolar.indexOf(s) !== i);
    if (tekrarlayan) {
      return { hata: `Aynı seri numarası birden fazla satırda var: ${tekrarlayan}` };
    }

    // Kategori seri no zorunluluğu ve seri numarasının sistemde benzersizliği.
    const kategoriler = await prisma.kategori.findMany({
      where: { id: { in: [...new Set(veri.satirlar.map((s) => s.kategoriId))] } },
      select: { id: true, ad: true, seriNoZorunlu: true },
    });
    const kategoriHarita = new Map(kategoriler.map((k) => [k.id, k]));

    const eksikSeri: string[] = [];
    veri.satirlar.forEach((satir, i) => {
      const kategori = kategoriHarita.get(satir.kategoriId);
      if (!kategori) {
        eksikSeri.push(`${i + 1}. satır: kategori bulunamadı.`);
      } else if (kategori.seriNoZorunlu && !kodNormalize(satir.seriNo)) {
        eksikSeri.push(`${i + 1}. satır: ${kategori.ad} için seri no (IMEI) zorunludur.`);
      }
    });
    if (eksikSeri.length) {
      return { hata: "Formda eksik alanlar var.", alanHatalari: eksikSeri };
    }

    if (seriNolar.length) {
      const cakisan = await prisma.stokKalemi.findMany({
        where: { seriNo: { in: seriNolar } },
        select: { seriNo: true },
      });
      if (cakisan.length) {
        return {
          hata: "Bu seri numaraları sistemde zaten kayıtlı.",
          alanHatalari: cakisan.map((c) => `${c.seriNo} daha önce girilmiş.`),
        };
      }
    }

    const ayniFatura = await prisma.alisFaturasi.findUnique({
      where: {
        tedarikciId_faturaNo: {
          tedarikciId: veri.tedarikciId,
          faturaNo: veri.faturaNo,
        },
      },
      select: { id: true },
    });
    if (ayniFatura) {
      return { hata: "Bu tedarikçi için aynı numaralı fatura zaten kayıtlı." };
    }

    const tedarikci = await prisma.tedarikci.findUnique({
      where: { id: veri.tedarikciId },
      select: { ad: true },
    });

    const vadeTarihi = vadeTarihiHesapla(veri.faturaTarihi, veri.vadeGun);

    const fatura = await prisma.$transaction(async (tx) => {
      const olusan = await tx.alisFaturasi.create({
        data: {
          faturaNo: veri.faturaNo,
          faturaTarihi: veri.faturaTarihi,
          tedarikciId: veri.tedarikciId,
          magazaId: veri.magazaId,
          vadeGun: veri.vadeGun,
          vadeTarihi,
          not: veri.not,
          olusturanId: oturum.kullaniciId,
        },
      });

      for (const satir of veri.satirlar) {
        const seriNo = kodNormalize(satir.seriNo) || null;
        const barkod = kodNormalize(satir.barkod) || null;

        const kalem = await tx.stokKalemi.create({
          data: {
            barkod,
            seriNo,
            kategoriId: satir.kategoriId,
            altKategoriId: satir.altKategoriId,
            marka: satir.marka,
            model: satir.model,
            renk: satir.renk,
            kapasite: satir.kapasite,
            alisFaturasiId: olusan.id,
            tedarikciId: veri.tedarikciId,
            alisFiyatiKurus: satir.alisFiyatiKurus,
            girisTarihi: veri.faturaTarihi,
            magazaId: veri.magazaId,
            durum: STOK_DURUM.STOKTA,
            not: satir.not,
            aramaMetni: aramaMetniUret([
              satir.marka,
              satir.model,
              satir.renk,
              satir.kapasite,
              seriNo,
              barkod,
              tedarikci?.ad,
              satir.not,
            ]),
          },
        });

        await tx.stokHareketi.create({
          data: {
            stokKalemiId: kalem.id,
            tip: HAREKET_TIP.GIRIS,
            hedefMagazaId: veri.magazaId,
            kullaniciId: oturum.kullaniciId,
            aciklama: `${veri.faturaNo} numaralı alış faturası`,
            tarih: veri.faturaTarihi,
          },
        });
      }

      return olusan;
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.FATURA_EKLE,
      hedefTip: "AlisFaturasi",
      hedefId: fatura.id,
      detay: `${veri.faturaNo} · ${veri.satirlar.length} cihaz · ${tedarikci?.ad ?? ""}`,
    });

    yeniFaturaId = fatura.id;
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Fatura kaydedilemedi:", hata);
    return { hata: "Fatura kaydedilemedi. Lütfen tekrar deneyin." };
  }

  // redirect() hata fırlatarak çalışır; try bloğunun dışında olmalı.
  redirect(`/faturalar/${yeniFaturaId}`);
}

export type OdemeDurumu = { hata?: string; basarili?: boolean };

/** Faturanın tedarikçi vadesini ödendi / ödenmedi olarak işaretler (yalnız yönetici). */
export async function vadeOdemesiDegistir(
  _onceki: OdemeDurumu,
  form: FormData,
): Promise<OdemeDurumu> {
  try {
    const oturum = await adminZorunlu();

    const faturaId = Number(form.get("faturaId"));
    const odendi = form.get("odendi") === "1";
    if (!Number.isInteger(faturaId) || faturaId <= 0) {
      return { hata: "Fatura bulunamadı." };
    }

    const fatura = await prisma.alisFaturasi.findUnique({
      where: { id: faturaId },
      select: { id: true, faturaNo: true, vadeGun: true },
    });
    if (!fatura) return { hata: "Fatura bulunamadı." };
    if (fatura.vadeGun === 0) return { hata: "Bu fatura vadesiz; ödeme işareti gerekmiyor." };

    await prisma.alisFaturasi.update({
      where: { id: faturaId },
      data: { vadeOdendi: odendi, odemeTarihi: odendi ? new Date() : null },
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.AYAR_DEGISTIR,
      hedefTip: "AlisFaturasi",
      hedefId: faturaId,
      detay: `${fatura.faturaNo} vadesi ${odendi ? "ödendi" : "ödenmedi"} olarak işaretlendi`,
    });

    revalidatePath(`/faturalar/${faturaId}`);
    revalidatePath("/faturalar");
    revalidatePath("/cihazlar");
    return { basarili: true };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Vade durumu güncellenemedi:", hata);
    return { hata: "Vade durumu güncellenemedi." };
  }
}
