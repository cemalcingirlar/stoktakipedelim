"use server";

import { revalidatePath } from "next/cache";
import { logYaz } from "@/lib/log";
import { LOG_ISLEM } from "@/lib/sabitler";
import { YetkiHatasi, adminZorunlu } from "@/lib/yetki";
import { baglantiyiSina, yedekAl } from "@/lib/yedek";

export type YedekEylemDurumu = { hata?: string; basari?: string };

/** Panelden elle tetiklenen yedekleme. */
export async function simdiYedekle(
  _onceki: YedekEylemDurumu,
  _form: FormData,
): Promise<YedekEylemDurumu> {
  try {
    const oturum = await adminZorunlu();
    const sonuc = await yedekAl();

    await logYaz(oturum, {
      islem: LOG_ISLEM.YEDEK_AL,
      hedefTip: "Yedek",
      detay: sonuc.basarili
        ? `Elle yedek: ${sonuc.dosyaAdi} (${sonuc.boyutBayt} bayt)`
        : `Elle yedek başarısız: ${sonuc.hata}`,
    });

    revalidatePath("/ayarlar/yedekleme");

    if (!sonuc.basarili) {
      return { hata: `Yedekleme başarısız: ${sonuc.hata}` };
    }

    const kb = Math.round(sonuc.boyutBayt / 1024);
    const silinenMetni = sonuc.silinen ? ` ${sonuc.silinen} eski yedek silindi.` : "";
    return { basari: `${sonuc.dosyaAdi} yüklendi (${kb} KB).${silinenMetni}` };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Yedekleme eylemi başarısız:", hata);
    return { hata: "Yedekleme çalıştırılamadı." };
  }
}

/** Yedek almadan Drive bağlantısını ve hedef klasörü sınar. */
export async function baglantiSina(
  _onceki: YedekEylemDurumu,
  _form: FormData,
): Promise<YedekEylemDurumu> {
  try {
    await adminZorunlu();
    const sonuc = await baglantiyiSina();
    return sonuc.basarili ? { basari: sonuc.mesaj } : { hata: sonuc.mesaj };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    return { hata: "Bağlantı sınanamadı." };
  }
}
