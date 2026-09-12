"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SUTUN_ANAHTARLARI, sutunlariSirala, type SutunAnahtari } from "@/lib/sutunlar";
import { YetkiHatasi, oturumZorunlu } from "@/lib/yetki";

export type SutunDurumu = { hata?: string };

/**
 * Cihaz listesinde görünecek sütunları kullanıcıya özel kaydeder.
 * Seçim kullanıcı kaydında JSON olarak durur, oturumlar arası korunur.
 */
export async function sutunTercihiKaydet(
  _onceki: SutunDurumu,
  form: FormData,
): Promise<SutunDurumu> {
  try {
    const oturum = await oturumZorunlu();

    const secilenler = form
      .getAll("sutun")
      .map(String)
      .filter((a): a is SutunAnahtari => SUTUN_ANAHTARLARI.includes(a as SutunAnahtari));

    if (secilenler.length === 0) {
      return { hata: "En az bir sütun seçili kalmalı." };
    }

    await prisma.kullanici.update({
      where: { id: oturum.kullaniciId },
      data: { sutunTercihi: JSON.stringify(sutunlariSirala(secilenler)) },
    });

    revalidatePath("/cihazlar");
    return {};
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Sütun tercihi kaydedilemedi:", hata);
    return { hata: "Sütun tercihi kaydedilemedi." };
  }
}

/** Sütun seçimini varsayılana döndürür. */
export async function sutunTercihiSifirla(): Promise<void> {
  const oturum = await oturumZorunlu();
  await prisma.kullanici.update({
    where: { id: oturum.kullaniciId },
    data: { sutunTercihi: null },
  });
  revalidatePath("/cihazlar");
}
