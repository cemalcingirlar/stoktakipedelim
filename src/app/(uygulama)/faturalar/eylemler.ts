"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { faturaOlustur } from "@/lib/fatura";
import { prisma } from "@/lib/prisma";
import { logYaz } from "@/lib/log";
import { LOG_ISLEM } from "@/lib/sabitler";
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

    const kayit = await faturaOlustur(oturum.kullaniciId, sonuc.data);
    if (!kayit.basarili) {
      return { hata: kayit.hata, alanHatalari: kayit.alanHatalari };
    }

    await logYaz(oturum, {
      islem: LOG_ISLEM.FATURA_EKLE,
      hedefTip: "AlisFaturasi",
      hedefId: kayit.faturaId,
      detay: `${sonuc.data.faturaNo} · ${kayit.cihazSayisi} cihaz · ${kayit.tedarikciAdi}`,
    });

    yeniFaturaId = kayit.faturaId;
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
