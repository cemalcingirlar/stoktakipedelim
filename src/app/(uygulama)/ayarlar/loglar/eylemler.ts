"use server";

import { revalidatePath } from "next/cache";
import { logYaz } from "@/lib/log";
import {
  ARSIV_ANAHTARI,
  arsivSiniri,
  silmeEngeli,
  yilSorunu,
  type ArsivKaydi,
} from "@/lib/logArsivi";
import { prisma } from "@/lib/prisma";
import { LOG_ISLEM } from "@/lib/sabitler";
import { YetkiHatasi, adminZorunlu } from "@/lib/yetki";

export type LogDurumu = { hata?: string; basari?: string };

/** Ayar tablosundaki arşiv kaydını okur; bozuksa yok sayar. */
export async function arsivKaydiniOku(): Promise<ArsivKaydi | null> {
  const kayit = await prisma.ayar.findUnique({
    where: { anahtar: ARSIV_ANAHTARI },
  });
  if (!kayit) return null;
  try {
    const coz = JSON.parse(kayit.deger) as ArsivKaydi;
    if (typeof coz.sinirISO !== "string" || typeof coz.adet !== "number")
      return null;
    return coz;
  } catch {
    return null;
  }
}

/**
 * İndirilmiş arşivin kapsadığı eski logları siler.
 *
 * "Kayıtlar silinmez" kuralı duruyor: silme ancak aynı aralık CSV olarak
 * indirildiyse mümkün ve silme işleminin kendisi loga yazılıyor — kaç kayıt,
 * hangi tarihten öncesi, kim sildi.
 */
export async function arsivlenenLoglariSil(
  _onceki: LogDurumu,
  form: FormData,
): Promise<LogDurumu> {
  try {
    const oturum = await adminZorunlu();

    const yil = Number(form.get("yil"));
    const sorun = yilSorunu(yil);
    if (sorun) return { hata: sorun };

    const sinir = arsivSiniri(yil);
    const arsiv = await arsivKaydiniOku();
    const engel = silmeEngeli(arsiv, sinir);
    if (engel) return { hata: engel };

    const sonuc = await prisma.log.deleteMany({
      where: { tarih: { lt: sinir } },
    });

    // Silinen kayıtların yerine ne silindiğinin kaydı kalıyor.
    await logYaz(oturum, {
      islem: LOG_ISLEM.LOG_ARSIVLE,
      hedefTip: "Log",
      detay: `${sonuc.count} arşivlenmiş kayıt silindi (${sinir.toLocaleDateString("tr-TR")} öncesi)`,
    });

    // Aynı arşivle ikinci kez silinmesin.
    await prisma.ayar.deleteMany({ where: { anahtar: ARSIV_ANAHTARI } });

    revalidatePath("/ayarlar/loglar");
    return {
      basari: `${sonuc.count} eski kayıt silindi. Arşiv dosyanızı saklayın.`,
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Log arşivi silinemedi:", hata);
    return { hata: "İşlem tamamlanamadı. Lütfen tekrar deneyin." };
  }
}
