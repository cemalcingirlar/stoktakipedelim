"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logYaz } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { LOG_ISLEM } from "@/lib/sabitler";
import { YetkiHatasi, adminZorunlu } from "@/lib/yetki";

export type AyarDurumu = { hata?: string; basari?: string };

const adSemasi = z.string().trim().min(1, "Ad boş olamaz.").max(60, "Ad çok uzun.");

/** Server action'larda tekrar eden yetki + hata sarmalayıcısı. */
async function calistir(
  isIslem: (oturum: Awaited<ReturnType<typeof adminZorunlu>>) => Promise<AyarDurumu>,
): Promise<AyarDurumu> {
  try {
    const oturum = await adminZorunlu();
    return await isIslem(oturum);
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Ayar işlemi başarısız:", hata);
    return { hata: "İşlem tamamlanamadı. Lütfen tekrar deneyin." };
  }
}

function tazele() {
  revalidatePath("/ayarlar/kategoriler");
  revalidatePath("/ayarlar/tedarikciler");
  revalidatePath("/cihazlar");
  revalidatePath("/faturalar/yeni");
}

// ------------------------------------------------------------------ Kategori

export async function kategoriEkle(_onceki: AyarDurumu, form: FormData): Promise<AyarDurumu> {
  return calistir(async (oturum) => {
    const ad = adSemasi.safeParse(form.get("ad"));
    if (!ad.success) return { hata: ad.error.issues[0].message };

    const seriNoZorunlu = form.get("seriNoZorunlu") === "on";

    const mevcut = await prisma.kategori.findUnique({ where: { ad: ad.data } });
    if (mevcut) return { hata: "Bu isimde bir kategori zaten var." };

    const sonSira = await prisma.kategori.aggregate({ _max: { sira: true } });
    const kategori = await prisma.kategori.create({
      data: { ad: ad.data, seriNoZorunlu, sira: (sonSira._max.sira ?? 0) + 1 },
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.AYAR_DEGISTIR,
      hedefTip: "Kategori",
      hedefId: kategori.id,
      detay: `Kategori eklendi: ${ad.data}`,
    });
    tazele();
    return { basari: `"${ad.data}" kategorisi eklendi.` };
  });
}

export async function kategoriGuncelle(_onceki: AyarDurumu, form: FormData): Promise<AyarDurumu> {
  return calistir(async (oturum) => {
    const id = Number(form.get("id"));
    const ad = adSemasi.safeParse(form.get("ad"));
    if (!Number.isInteger(id) || id <= 0) return { hata: "Kategori bulunamadı." };
    if (!ad.success) return { hata: ad.error.issues[0].message };

    const cakisan = await prisma.kategori.findUnique({ where: { ad: ad.data } });
    if (cakisan && cakisan.id !== id) return { hata: "Bu isimde başka bir kategori var." };

    await prisma.kategori.update({
      where: { id },
      data: {
        ad: ad.data,
        seriNoZorunlu: form.get("seriNoZorunlu") === "on",
        aktif: form.get("aktif") === "on",
      },
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.AYAR_DEGISTIR,
      hedefTip: "Kategori",
      hedefId: id,
      detay: `Kategori güncellendi: ${ad.data}`,
    });
    tazele();
    return { basari: "Kategori güncellendi." };
  });
}

export async function kategoriSil(_onceki: AyarDurumu, form: FormData): Promise<AyarDurumu> {
  return calistir(async (oturum) => {
    const id = Number(form.get("id"));
    if (!Number.isInteger(id) || id <= 0) return { hata: "Kategori bulunamadı." };

    const kategori = await prisma.kategori.findUnique({
      where: { id },
      select: { ad: true, _count: { select: { stokKalemleri: true } } },
    });
    if (!kategori) return { hata: "Kategori bulunamadı." };

    // Kayıtlı cihazı olan kategori silinmez; geçmiş bozulmasın diye pasife alınır.
    if (kategori._count.stokKalemleri > 0) {
      await prisma.kategori.update({ where: { id }, data: { aktif: false } });
      await logYaz(oturum, {
        islem: LOG_ISLEM.AYAR_DEGISTIR,
        hedefTip: "Kategori",
        hedefId: id,
        detay: `Kategori pasife alındı (${kategori._count.stokKalemleri} cihaz bağlı): ${kategori.ad}`,
      });
      tazele();
      return {
        basari: `"${kategori.ad}" kategorisine bağlı ${kategori._count.stokKalemleri} cihaz olduğu için silinmedi, pasife alındı.`,
      };
    }

    await prisma.kategori.delete({ where: { id } });
    await logYaz(oturum, {
      islem: LOG_ISLEM.AYAR_DEGISTIR,
      hedefTip: "Kategori",
      hedefId: id,
      detay: `Kategori silindi: ${kategori.ad}`,
    });
    tazele();
    return { basari: `"${kategori.ad}" kategorisi silindi.` };
  });
}

// -------------------------------------------------------------- Alt kategori

export async function altKategoriEkle(_onceki: AyarDurumu, form: FormData): Promise<AyarDurumu> {
  return calistir(async (oturum) => {
    const kategoriId = Number(form.get("kategoriId"));
    const ad = adSemasi.safeParse(form.get("ad"));
    if (!Number.isInteger(kategoriId) || kategoriId <= 0) return { hata: "Kategori seçin." };
    if (!ad.success) return { hata: ad.error.issues[0].message };

    const mevcut = await prisma.altKategori.findUnique({
      where: { kategoriId_ad: { kategoriId, ad: ad.data } },
    });
    if (mevcut) return { hata: "Bu kategoride aynı isimde alt kategori var." };

    const sonSira = await prisma.altKategori.aggregate({
      where: { kategoriId },
      _max: { sira: true },
    });
    const alt = await prisma.altKategori.create({
      data: { kategoriId, ad: ad.data, sira: (sonSira._max.sira ?? 0) + 1 },
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.AYAR_DEGISTIR,
      hedefTip: "AltKategori",
      hedefId: alt.id,
      detay: `Alt kategori eklendi: ${ad.data}`,
    });
    tazele();
    return { basari: `"${ad.data}" alt kategorisi eklendi.` };
  });
}

export async function altKategoriSil(_onceki: AyarDurumu, form: FormData): Promise<AyarDurumu> {
  return calistir(async (oturum) => {
    const id = Number(form.get("id"));
    if (!Number.isInteger(id) || id <= 0) return { hata: "Alt kategori bulunamadı." };

    const alt = await prisma.altKategori.findUnique({
      where: { id },
      select: { ad: true, _count: { select: { stokKalemleri: true } } },
    });
    if (!alt) return { hata: "Alt kategori bulunamadı." };

    if (alt._count.stokKalemleri > 0) {
      await prisma.altKategori.update({ where: { id }, data: { aktif: false } });
      tazele();
      return {
        basari: `"${alt.ad}" alt kategorisine bağlı cihaz olduğu için silinmedi, pasife alındı.`,
      };
    }

    await prisma.altKategori.delete({ where: { id } });
    await logYaz(oturum, {
      islem: LOG_ISLEM.AYAR_DEGISTIR,
      hedefTip: "AltKategori",
      hedefId: id,
      detay: `Alt kategori silindi: ${alt.ad}`,
    });
    tazele();
    return { basari: `"${alt.ad}" alt kategorisi silindi.` };
  });
}

// ----------------------------------------------------------------- Tedarikçi

const tedarikciSemasi = z.object({
  ad: adSemasi,
  telefon: z.string().trim().max(30).nullable(),
  vergiNo: z.string().trim().max(20).nullable(),
  adres: z.string().trim().max(200).nullable(),
  not: z.string().trim().max(300).nullable(),
});

function tedarikciFormunuOku(form: FormData) {
  const bos = (ad: string) => {
    const v = String(form.get(ad) ?? "").trim();
    return v === "" ? null : v;
  };
  return tedarikciSemasi.safeParse({
    ad: form.get("ad"),
    telefon: bos("telefon"),
    vergiNo: bos("vergiNo"),
    adres: bos("adres"),
    not: bos("not"),
  });
}

export async function tedarikciEkle(_onceki: AyarDurumu, form: FormData): Promise<AyarDurumu> {
  return calistir(async (oturum) => {
    const sonuc = tedarikciFormunuOku(form);
    if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

    const mevcut = await prisma.tedarikci.findUnique({ where: { ad: sonuc.data.ad } });
    if (mevcut) return { hata: "Bu isimde bir tedarikçi zaten var." };

    const tedarikci = await prisma.tedarikci.create({ data: sonuc.data });
    await logYaz(oturum, {
      islem: LOG_ISLEM.AYAR_DEGISTIR,
      hedefTip: "Tedarikci",
      hedefId: tedarikci.id,
      detay: `Tedarikçi eklendi: ${sonuc.data.ad}`,
    });
    tazele();
    return { basari: `"${sonuc.data.ad}" eklendi.` };
  });
}

export async function tedarikciGuncelle(_onceki: AyarDurumu, form: FormData): Promise<AyarDurumu> {
  return calistir(async (oturum) => {
    const id = Number(form.get("id"));
    if (!Number.isInteger(id) || id <= 0) return { hata: "Tedarikçi bulunamadı." };

    const sonuc = tedarikciFormunuOku(form);
    if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

    const cakisan = await prisma.tedarikci.findUnique({ where: { ad: sonuc.data.ad } });
    if (cakisan && cakisan.id !== id) return { hata: "Bu isimde başka bir tedarikçi var." };

    await prisma.tedarikci.update({
      where: { id },
      data: { ...sonuc.data, aktif: form.get("aktif") === "on" },
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.AYAR_DEGISTIR,
      hedefTip: "Tedarikci",
      hedefId: id,
      detay: `Tedarikçi güncellendi: ${sonuc.data.ad}`,
    });
    tazele();
    return { basari: "Tedarikçi güncellendi." };
  });
}
