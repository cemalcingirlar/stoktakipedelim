"use server";

import { revalidatePath } from "next/cache";
import { faturaOlustur } from "@/lib/fatura";
import { logYaz } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { LOG_ISLEM } from "@/lib/sabitler";
import {
  tedarikciDosyasiniOku,
  type TedarikciFaturasi,
} from "@/lib/tedarikciDosyasi";
import { YetkiHatasi, adminZorunlu } from "@/lib/yetki";
import { faturaSemasi } from "../../faturalar/dogrulama";

const EN_BUYUK_DOSYA = 5 * 1024 * 1024;

/** Barkoddan daha önce girilmiş ürünün kategori bilgisi. */
export type BarkodGecmisi = {
  barkod: string;
  kategoriId: number;
  altKategoriId: number | null;
};

export type OnizlemeDurumu = {
  hata?: string;
  dosyaAdi?: string;
  faturalar?: TedarikciFaturasi[];
  hatalar?: string[];
  /** Barkodu sistemde olan ürünlerin kategorisi — form bunları hazır seçer. */
  gecmis?: BarkodGecmisi[];
  /** Dosyada olup sistemde zaten kayıtlı olan seri numaraları. */
  kayitliSeriNolar?: string[];
};

/**
 * Tedarikçi portalından indirilen Excel'i okur ve önizleme döner.
 * Veritabanına hiçbir şey yazmaz.
 */
export async function tedarikciDosyasiniOnizle(
  _onceki: OnizlemeDurumu,
  form: FormData,
): Promise<OnizlemeDurumu> {
  try {
    await adminZorunlu();

    const dosya = form.get("dosya");
    if (!(dosya instanceof File) || dosya.size === 0) {
      return { hata: "Bir Excel dosyası seçin." };
    }
    if (dosya.size > EN_BUYUK_DOSYA) return { hata: "Dosya 5 MB'tan büyük olamaz." };
    if (!/\.xlsx$/i.test(dosya.name)) {
      return { hata: "Yalnız .xlsx dosyası yüklenebilir." };
    }

    const sonuc = await tedarikciDosyasiniOku(await dosya.arrayBuffer());
    if (!sonuc.basliklarTamam) {
      return { hata: sonuc.hatalar[0] ?? "Dosya okunamadı." };
    }

    const barkodlar = [
      ...new Set(sonuc.faturalar.flatMap((f) => f.gruplar.map((g) => g.barkod))),
    ];

    // Her barkod için en son girilen kaydın kategorisi; kullanıcı aynı ürünü
    // her seferinde yeniden sınıflandırmasın.
    const gecmis: BarkodGecmisi[] = [];
    for (const barkod of barkodlar) {
      const son = await prisma.stokKalemi.findFirst({
        where: { barkod },
        orderBy: [{ girisTarihi: "desc" }, { id: "desc" }],
        select: { kategoriId: true, altKategoriId: true },
      });
      if (son) {
        gecmis.push({ barkod, kategoriId: son.kategoriId, altKategoriId: son.altKategoriId });
      }
    }

    const seriNolar = sonuc.faturalar.flatMap((f) =>
      f.gruplar.flatMap((g) =>
        g.cihazlar.map((c) => c.seriNo).filter((s): s is string => Boolean(s)),
      ),
    );
    const kayitli = seriNolar.length
      ? await prisma.stokKalemi.findMany({
          where: { seriNo: { in: seriNolar } },
          select: { seriNo: true },
        })
      : [];

    return {
      dosyaAdi: dosya.name,
      faturalar: sonuc.faturalar,
      hatalar: sonuc.hatalar,
      gecmis,
      kayitliSeriNolar: kayitli.map((k) => k.seriNo).filter((s): s is string => Boolean(s)),
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Tedarikçi dosyası okunamadı:", hata);
    return { hata: "Dosya okunamadı. Portaldan indirdiğiniz .xlsx dosyasını yükleyin." };
  }
}

export type KayitDurumu = { hata?: string; alanHatalari?: string[]; faturaId?: number };

/** Önizlemesi onaylanan faturayı kaydeder; elle girişle aynı yoldan geçer. */
export async function tedarikciFaturasiniKaydet(
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
        hata: "Eksik veya hatalı alanlar var.",
        alanHatalari: sonuc.error.issues.map((i) => {
          const satirNo = typeof i.path[1] === "number" ? `${i.path[1] + 1}. cihaz: ` : "";
          return `${satirNo}${i.message}`;
        }),
      };
    }

    const kayit = await faturaOlustur(oturum.kullaniciId, sonuc.data);
    if (!kayit.basarili) return { hata: kayit.hata, alanHatalari: kayit.alanHatalari };

    await logYaz(oturum, {
      islem: LOG_ISLEM.FATURA_EKLE,
      hedefTip: "AlisFaturasi",
      hedefId: kayit.faturaId,
      detay: `Tedarikçi dosyasından: ${sonuc.data.faturaNo} · ${kayit.cihazSayisi} cihaz · ${kayit.tedarikciAdi}`,
    });

    revalidatePath("/cihazlar");
    revalidatePath("/faturalar");
    revalidatePath("/panel");
    return { faturaId: kayit.faturaId };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Tedarikçi faturası kaydedilemedi:", hata);
    return { hata: "Kayıt sırasında hata oluştu. Lütfen tekrar deneyin." };
  }
}
