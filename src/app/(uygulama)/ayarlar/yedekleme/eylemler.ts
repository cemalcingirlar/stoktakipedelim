"use server";

import { revalidatePath } from "next/cache";
import { logYaz } from "@/lib/log";
import { LOG_ISLEM } from "@/lib/sabitler";
import { YetkiHatasi, adminZorunlu } from "@/lib/yetki";
import { prisma } from "@/lib/prisma";
import { PROVA_ANAHTARI, type ProvaKaydi } from "@/lib/yedekProvasi";
import { baglantiyiSina, geriYuklemeProvasi, yedekAl } from "@/lib/yedek";

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
    const silinenMetni = sonuc.silinen
      ? ` ${sonuc.silinen} eski yedek silindi.`
      : "";
    return { basari: `${sonuc.dosyaAdi} yüklendi (${kb} KB).${silinenMetni}` };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Yedekleme eylemi başarısız:", hata);
    return { hata: "Yedekleme çalıştırılamadı." };
  }
}

/** Son prova kaydını okur; bozuksa yok sayar. */
export async function provaKaydiniOku(): Promise<ProvaKaydi | null> {
  const kayit = await prisma.ayar.findUnique({
    where: { anahtar: PROVA_ANAHTARI },
  });
  if (!kayit) return null;
  try {
    const coz = JSON.parse(kayit.deger) as ProvaKaydi;
    return typeof coz.tarihISO === "string" ? coz : null;
  } catch {
    return null;
  }
}

/**
 * Geri yükleme provası: Drive'daki en yeni yedeği indirip açar.
 *
 * "Yedeğim var" demek, felaket günü o dosyayı açabilmek demek. Prova bunu
 * önceden sınıyor; sonucu kaydediliyor ki provanın ne zaman yapıldığı da
 * görünsün.
 */
export async function provaYap(
  _onceki: YedekEylemDurumu,
  _form: FormData,
): Promise<YedekEylemDurumu> {
  try {
    const oturum = await adminZorunlu();
    const sonuc = await geriYuklemeProvasi();

    const kayit: ProvaKaydi = {
      tarihISO: new Date().toISOString(),
      basarili: sonuc.basarili,
      metin: sonuc.metin,
      dosyaAdi: "",
    };
    await prisma.ayar.upsert({
      where: { anahtar: PROVA_ANAHTARI },
      update: { deger: JSON.stringify(kayit) },
      create: { anahtar: PROVA_ANAHTARI, deger: JSON.stringify(kayit) },
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.YEDEK_AL,
      hedefTip: "Yedek",
      detay: sonuc.basarili
        ? `Geri yükleme provası başarılı: ${sonuc.metin}`
        : `Geri yükleme provası BAŞARISIZ: ${sonuc.metin}`,
    });

    revalidatePath("/ayarlar/yedekleme");
    return sonuc.basarili ? { basari: sonuc.metin } : { hata: sonuc.metin };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Prova eylemi başarısız:", hata);
    return { hata: "Prova çalıştırılamadı." };
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
