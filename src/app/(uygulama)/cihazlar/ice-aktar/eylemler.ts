"use server";

import { revalidatePath } from "next/cache";
import { faturaOlustur } from "@/lib/fatura";
import { exceliOku, type OkunanSatir } from "@/lib/iceAktar";
import { logYaz } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { LOG_ISLEM } from "@/lib/sabitler";
import { YetkiHatasi, adminZorunlu } from "@/lib/yetki";
import { faturaSemasi } from "../../faturalar/dogrulama";

/** Dosya boyutu sınırı — 10.000 satırlık bir xlsx bunun çok altında kalır. */
const EN_BUYUK_DOSYA = 5 * 1024 * 1024;

export type OnizlemeDurumu = {
  hata?: string;
  satirlar?: OkunanSatir[];
  hatalar?: string[];
  dosyaAdi?: string;
};

/**
 * Yüklenen Excel dosyasını okur ve önizleme döner. Veritabanına hiçbir şey
 * yazmaz — kullanıcı satırları görüp onaylamadan kayıt yapılmaz.
 */
export async function exceliOnizle(
  _onceki: OnizlemeDurumu,
  form: FormData,
): Promise<OnizlemeDurumu> {
  try {
    await adminZorunlu();

    const dosya = form.get("dosya");
    if (!(dosya instanceof File) || dosya.size === 0) {
      return { hata: "Bir Excel dosyası seçin." };
    }
    if (dosya.size > EN_BUYUK_DOSYA) {
      return { hata: "Dosya 5 MB'tan büyük olamaz." };
    }
    if (!/\.xlsx$/i.test(dosya.name)) {
      return { hata: "Yalnız .xlsx dosyası yüklenebilir. Şablonu indirip kullanın." };
    }

    const kategoriler = await prisma.kategori.findMany({
      where: { aktif: true },
      orderBy: { sira: "asc" },
      select: {
        id: true,
        ad: true,
        seriNoZorunlu: true,
        altKategoriler: { where: { aktif: true }, select: { id: true, ad: true } },
      },
    });

    const sonuc = await exceliOku(await dosya.arrayBuffer(), kategoriler);

    // Sistemde zaten kayıtlı seri numaralarını önizlemede göster; kullanıcı
    // kaydet dediğinde sürprizle karşılaşmasın.
    const seriNolar = sonuc.satirlar
      .map((s) => s.seriNo)
      .filter((s): s is string => Boolean(s));
    if (seriNolar.length > 0) {
      const cakisan = await prisma.stokKalemi.findMany({
        where: { seriNo: { in: seriNolar } },
        select: { seriNo: true },
      });
      const cakisanKume = new Set(cakisan.map((c) => c.seriNo));
      if (cakisanKume.size > 0) {
        const temiz = sonuc.satirlar.filter((s) => !s.seriNo || !cakisanKume.has(s.seriNo));
        for (const s of sonuc.satirlar) {
          if (s.seriNo && cakisanKume.has(s.seriNo)) {
            sonuc.hatalar.push(`${s.excelSatiri}. satır: ${s.seriNo} sistemde zaten kayıtlı.`);
          }
        }
        sonuc.satirlar = temiz;
      }
    }

    return { satirlar: sonuc.satirlar, hatalar: sonuc.hatalar, dosyaAdi: dosya.name };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Excel okunamadı:", hata);
    return { hata: "Dosya okunamadı. Şablona uygun bir .xlsx dosyası olduğundan emin olun." };
  }
}

export type KayitDurumu = { hata?: string; alanHatalari?: string[]; faturaId?: number };

/**
 * Önizlemesi onaylanan satırları tek bir alış faturası altında kaydeder.
 * Elle girişle aynı yoldan geçer; vade ve stok hareketi kuralları ortaktır.
 */
export async function iceAktariKaydet(
  _onceki: KayitDurumu,
  form: FormData,
): Promise<KayitDurumu> {
  try {
    const oturum = await adminZorunlu();

    let cozulen: unknown;
    try {
      cozulen = JSON.parse(String(form.get("veri") ?? ""));
    } catch {
      return { hata: "Veri okunamadı. Dosyayı yeniden yükleyin." };
    }

    const sonuc = faturaSemasi.safeParse(cozulen);
    if (!sonuc.success) {
      return {
        hata: "Fatura bilgilerinde eksik veya hatalı alanlar var.",
        alanHatalari: sonuc.error.issues.map((i) => i.message),
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
      detay: `Excel ile toplu yükleme: ${sonuc.data.faturaNo} · ${kayit.cihazSayisi} cihaz · ${kayit.tedarikciAdi}`,
    });

    revalidatePath("/cihazlar");
    revalidatePath("/faturalar");
    revalidatePath("/panel");

    return { faturaId: kayit.faturaId };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Toplu yükleme kaydedilemedi:", hata);
    return { hata: "Kayıt sırasında hata oluştu. Lütfen tekrar deneyin." };
  }
}
