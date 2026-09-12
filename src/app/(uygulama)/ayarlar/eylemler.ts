"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logYaz } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { LOG_ISLEM, ROLLER, type Rol } from "@/lib/sabitler";
import { sifreHashle } from "@/lib/sifre";
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
  revalidatePath("/ayarlar");
  revalidatePath("/ayarlar/kategoriler");
  revalidatePath("/ayarlar/tedarikciler");
  revalidatePath("/ayarlar/magazalar");
  revalidatePath("/cihazlar");
  revalidatePath("/faturalar/yeni");
  revalidatePath("/panel");
  revalidatePath("/ayarlar/kullanicilar");
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

// ------------------------------------------------------------------- Mağaza

const magazaSemasi = z.object({
  kod: z
    .string()
    .trim()
    .min(1, "Mağaza kodu boş olamaz.")
    .max(10, "Mağaza kodu en fazla 10 karakter olabilir.")
    .regex(/^[A-Za-z0-9-]+$/, "Mağaza kodu yalnız harf, rakam ve tire içerebilir.")
    .transform((v) => v.toUpperCase()),
  ad: adSemasi,
  adres: z.string().trim().max(200).nullable(),
  telefon: z.string().trim().max(30).nullable(),
});

function magazaFormunuOku(form: FormData) {
  const bos = (ad: string) => {
    const v = String(form.get(ad) ?? "").trim();
    return v === "" ? null : v;
  };
  return magazaSemasi.safeParse({
    kod: form.get("kod"),
    ad: form.get("ad"),
    adres: bos("adres"),
    telefon: bos("telefon"),
  });
}

export async function magazaEkle(_onceki: AyarDurumu, form: FormData): Promise<AyarDurumu> {
  return calistir(async (oturum) => {
    const sonuc = magazaFormunuOku(form);
    if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

    const mevcut = await prisma.magaza.findUnique({ where: { kod: sonuc.data.kod } });
    if (mevcut) return { hata: `"${sonuc.data.kod}" kodlu bir mağaza zaten var.` };

    const magaza = await prisma.magaza.create({ data: sonuc.data });

    await logYaz(oturum, {
      islem: LOG_ISLEM.AYAR_DEGISTIR,
      hedefTip: "Magaza",
      hedefId: magaza.id,
      detay: `Mağaza eklendi: ${sonuc.data.kod} · ${sonuc.data.ad}`,
    });
    tazele();
    return { basari: `"${sonuc.data.ad}" eklendi. Kullanıcı atamasını unutmayın.` };
  });
}

export async function magazaGuncelle(_onceki: AyarDurumu, form: FormData): Promise<AyarDurumu> {
  return calistir(async (oturum) => {
    const id = Number(form.get("id"));
    if (!Number.isInteger(id) || id <= 0) return { hata: "Mağaza bulunamadı." };

    const sonuc = magazaFormunuOku(form);
    if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

    const cakisan = await prisma.magaza.findUnique({ where: { kod: sonuc.data.kod } });
    if (cakisan && cakisan.id !== id) return { hata: `"${sonuc.data.kod}" kodu başka mağazada.` };

    const aktif = form.get("aktif") === "on";
    const merkezMi = form.get("merkezMi") === "on";

    // Stoğu olan mağaza pasife alınamaz; cihazlar görünmez hale gelirdi.
    if (!aktif) {
      const stokAdedi = await prisma.stokKalemi.count({
        where: { magazaId: id, durum: { in: ["STOKTA", "TRANSFERDE"] } },
      });
      if (stokAdedi > 0) {
        return {
          hata: `Bu mağazada ${stokAdedi} cihaz duruyor. Pasife almadan önce cihazları başka mağazaya sevk edin.`,
        };
      }
    }

    await prisma.magaza.update({
      where: { id },
      data: { ...sonuc.data, aktif, merkezMi },
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.AYAR_DEGISTIR,
      hedefTip: "Magaza",
      hedefId: id,
      detay: `Mağaza güncellendi: ${sonuc.data.kod} · ${sonuc.data.ad}${aktif ? "" : " (pasif)"}`,
    });
    tazele();
    return { basari: "Mağaza güncellendi." };
  });
}

export async function magazaSil(_onceki: AyarDurumu, form: FormData): Promise<AyarDurumu> {
  return calistir(async (oturum) => {
    const id = Number(form.get("id"));
    if (!Number.isInteger(id) || id <= 0) return { hata: "Mağaza bulunamadı." };

    const magaza = await prisma.magaza.findUnique({
      where: { id },
      select: {
        ad: true,
        kod: true,
        _count: {
          select: {
            stokKalemleri: true,
            kullanicilar: true,
            alisFaturalari: true,
            gonderilenTransfer: true,
            alinanTransfer: true,
            sayimlar: true,
          },
        },
      },
    });
    if (!magaza) return { hata: "Mağaza bulunamadı." };

    const bagli =
      magaza._count.stokKalemleri +
      magaza._count.alisFaturalari +
      magaza._count.gonderilenTransfer +
      magaza._count.alinanTransfer +
      magaza._count.sayimlar;

    // Geçmiş kayıtları olan mağaza silinmez; raporlar ve tarihçe bozulurdu.
    if (bagli > 0) {
      const stokta = await prisma.stokKalemi.count({
        where: { magazaId: id, durum: { in: ["STOKTA", "TRANSFERDE"] } },
      });
      if (stokta > 0) {
        return {
          hata: `Bu mağazada ${stokta} cihaz duruyor. Önce cihazları başka mağazaya sevk edin.`,
        };
      }

      await prisma.magaza.update({ where: { id }, data: { aktif: false } });
      await logYaz(oturum, {
        islem: LOG_ISLEM.AYAR_DEGISTIR,
        hedefTip: "Magaza",
        hedefId: id,
        detay: `Mağaza pasife alındı (geçmiş kayıtları var): ${magaza.kod}`,
      });
      tazele();
      return {
        basari: `"${magaza.ad}" geçmiş kayıtları olduğu için silinmedi, pasife alındı. Raporlarda görünmeye devam eder.`,
      };
    }

    if (magaza._count.kullanicilar > 0) {
      return {
        hata: `Bu mağazaya bağlı ${magaza._count.kullanicilar} kullanıcı var. Önce onları başka mağazaya taşıyın.`,
      };
    }

    await prisma.magaza.delete({ where: { id } });
    await logYaz(oturum, {
      islem: LOG_ISLEM.AYAR_DEGISTIR,
      hedefTip: "Magaza",
      hedefId: id,
      detay: `Mağaza silindi: ${magaza.kod} · ${magaza.ad}`,
    });
    tazele();
    return { basari: `"${magaza.ad}" silindi.` };
  });
}

// ----------------------------------------------------------------- Kullanıcı

const KULLANICI_ADI_DESENI = /^[a-z0-9._-]+$/;

const kullaniciSemasi = z.object({
  kullaniciAdi: z
    .string()
    .trim()
    .min(3, "Kullanıcı adı en az 3 karakter olmalı.")
    .max(30, "Kullanıcı adı en fazla 30 karakter olabilir.")
    .transform((v) => v.toLowerCase())
    .refine(
      (v) => KULLANICI_ADI_DESENI.test(v),
      "Kullanıcı adı yalnız küçük harf, rakam, nokta, tire ve alt çizgi içerebilir.",
    ),
  adSoyad: z.string().trim().min(2, "Ad soyad zorunlu.").max(80),
  rol: z.enum(Object.values(ROLLER) as [string, ...string[]], "Rol seçin."),
  magazaId: z.number().int().positive().nullable(),
});

function kullaniciFormunuOku(form: FormData) {
  const magazaHam = String(form.get("magazaId") ?? "").trim();
  return kullaniciSemasi.safeParse({
    kullaniciAdi: form.get("kullaniciAdi"),
    adSoyad: form.get("adSoyad"),
    rol: form.get("rol"),
    magazaId: magazaHam ? Number(magazaHam) : null,
  });
}

/** Yönetici dışındaki roller mutlaka bir mağazaya bağlı olmalı. */
function magazaKurali(rol: string, magazaId: number | null): string | null {
  if (rol === ROLLER.ADMIN) return null;
  if (!magazaId) return "Mağaza sorumlusu ve personeli bir mağazaya bağlanmalı.";
  return null;
}

export async function kullaniciEkle(_onceki: AyarDurumu, form: FormData): Promise<AyarDurumu> {
  return calistir(async (oturum) => {
    const sonuc = kullaniciFormunuOku(form);
    if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

    const sifre = String(form.get("sifre") ?? "");
    if (sifre.length < 8) return { hata: "Şifre en az 8 karakter olmalı." };

    const kuralHatasi = magazaKurali(sonuc.data.rol, sonuc.data.magazaId);
    if (kuralHatasi) return { hata: kuralHatasi };

    const mevcut = await prisma.kullanici.findUnique({
      where: { kullaniciAdi: sonuc.data.kullaniciAdi },
    });
    if (mevcut) return { hata: "Bu kullanıcı adı zaten kullanılıyor." };

    const kullanici = await prisma.kullanici.create({
      data: {
        kullaniciAdi: sonuc.data.kullaniciAdi,
        adSoyad: sonuc.data.adSoyad,
        rol: sonuc.data.rol,
        magazaId: sonuc.data.rol === ROLLER.ADMIN ? null : sonuc.data.magazaId,
        sifreHash: await sifreHashle(sifre),
      },
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.AYAR_DEGISTIR,
      hedefTip: "Kullanici",
      hedefId: kullanici.id,
      detay: `Kullanıcı eklendi: ${sonuc.data.kullaniciAdi} (${sonuc.data.rol})`,
    });
    tazele();
    return { basari: `"${sonuc.data.adSoyad}" eklendi.` };
  });
}

export async function kullaniciGuncelle(_onceki: AyarDurumu, form: FormData): Promise<AyarDurumu> {
  return calistir(async (oturum) => {
    const id = Number(form.get("id"));
    if (!Number.isInteger(id) || id <= 0) return { hata: "Kullanıcı bulunamadı." };

    const sonuc = kullaniciFormunuOku(form);
    if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

    const kuralHatasi = magazaKurali(sonuc.data.rol, sonuc.data.magazaId);
    if (kuralHatasi) return { hata: kuralHatasi };

    const cakisan = await prisma.kullanici.findUnique({
      where: { kullaniciAdi: sonuc.data.kullaniciAdi },
    });
    if (cakisan && cakisan.id !== id) return { hata: "Bu kullanıcı adı başkasında." };

    const aktif = form.get("aktif") === "on";

    // Son yönetici kilitlenmesin: sistemde en az bir aktif yönetici kalmalı.
    if (sonuc.data.rol !== ROLLER.ADMIN || !aktif) {
      const mevcut = await prisma.kullanici.findUnique({ where: { id }, select: { rol: true } });
      if (mevcut?.rol === ROLLER.ADMIN) {
        const digerAdminler = await prisma.kullanici.count({
          where: { rol: ROLLER.ADMIN, aktif: true, id: { not: id } },
        });
        if (digerAdminler === 0) {
          return { hata: "Sistemde en az bir aktif yönetici kalmalı." };
        }
      }
    }

    await prisma.kullanici.update({
      where: { id },
      data: {
        kullaniciAdi: sonuc.data.kullaniciAdi,
        adSoyad: sonuc.data.adSoyad,
        rol: sonuc.data.rol,
        magazaId: sonuc.data.rol === ROLLER.ADMIN ? null : sonuc.data.magazaId,
        aktif,
      },
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.AYAR_DEGISTIR,
      hedefTip: "Kullanici",
      hedefId: id,
      detay: `Kullanıcı güncellendi: ${sonuc.data.kullaniciAdi} (${sonuc.data.rol})${aktif ? "" : " · pasif"}`,
    });
    tazele();
    return { basari: "Kullanıcı güncellendi." };
  });
}

export async function sifreSifirla(_onceki: AyarDurumu, form: FormData): Promise<AyarDurumu> {
  return calistir(async (oturum) => {
    const id = Number(form.get("id"));
    const sifre = String(form.get("yeniSifre") ?? "");
    if (!Number.isInteger(id) || id <= 0) return { hata: "Kullanıcı bulunamadı." };
    if (sifre.length < 8) return { hata: "Şifre en az 8 karakter olmalı." };

    const kullanici = await prisma.kullanici.findUnique({
      where: { id },
      select: { kullaniciAdi: true },
    });
    if (!kullanici) return { hata: "Kullanıcı bulunamadı." };

    await prisma.kullanici.update({
      where: { id },
      data: { sifreHash: await sifreHashle(sifre) },
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.AYAR_DEGISTIR,
      hedefTip: "Kullanici",
      hedefId: id,
      detay: `${kullanici.kullaniciAdi} şifresi sıfırlandı`,
    });
    tazele();
    return { basari: `${kullanici.kullaniciAdi} için yeni şifre kaydedildi.` };
  });
}

export type { Rol };
