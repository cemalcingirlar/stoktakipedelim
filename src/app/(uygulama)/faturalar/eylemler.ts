"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { faturaOlustur } from "@/lib/fatura";
import { prisma } from "@/lib/prisma";
import { logYaz } from "@/lib/log";
import { aramaNormalize, kodNormalize } from "@/lib/metin";
import {
  EN_COK_GRUP,
  sonucuKisalt,
  type AramaSonucu,
  EN_COK_CIHAZ,
  aramaYeterliMi,
  gruplaGecmisUrunler,
  type GecmisUrun,
} from "@/lib/urunArama";
import { HAREKET_TIP, LOG_ISLEM, STOK_DURUM } from "@/lib/sabitler";
import { YetkiHatasi, adminZorunlu } from "@/lib/yetki";
import {
  cihazIptalEngeli,
  faturaIptalEngeli,
  gerekceSorunu,
  iptalliFaturaNo,
} from "@/lib/kayitIptali";
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
      return {
        hata: "Form verisi okunamadı. Sayfayı yenileyip tekrar deneyin.",
      };
    }

    const sonuc = faturaSemasi.safeParse(cozulen);
    if (!sonuc.success) {
      return {
        hata: "Formda eksik veya hatalı alanlar var.",
        alanHatalari: sonuc.error.issues.map((i) => {
          const satirNo =
            typeof i.path[1] === "number" ? `${i.path[1] + 1}. satır: ` : "";
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

export type BarkodBilgisi = {
  bulundu: boolean;
  kategoriId: number | null;
  altKategoriId: number | null;
  marka: string;
  model: string;
  renk: string;
  kapasite: string;
  /** Son alış fiyatı — kullanıcı isterse değiştirir. */
  alisFiyatiKurus: number | null;
  /** Bilgilerin alındığı kaydın giriş tarihi; ekranda "en son ... tarihinde girilmiş" der. */
  sonGirisTarihi: string | null;
};

/**
 * Barkoddan o ürünün en son girilen kaydını bulur ve bilgilerini döner.
 *
 * Aynı model cihaz her fatura girişinde yeniden yazılmasın diye: barkod
 * okutulduğunda marka, model, renk, kapasite, kategori ve son alış fiyatı
 * hazır gelir. Fiyat değişmişse kullanıcı üzerine yazar.
 */
export async function barkodBilgisiGetir(
  barkod: string,
): Promise<BarkodBilgisi> {
  const bos: BarkodBilgisi = {
    bulundu: false,
    kategoriId: null,
    altKategoriId: null,
    marka: "",
    model: "",
    renk: "",
    kapasite: "",
    alisFiyatiKurus: null,
    sonGirisTarihi: null,
  };

  try {
    await adminZorunlu();

    const kod = kodNormalize(barkod);
    if (!kod) return bos;

    const son = await prisma.stokKalemi.findFirst({
      where: { barkod: kod },
      orderBy: [{ girisTarihi: "desc" }, { id: "desc" }],
      select: {
        kategoriId: true,
        altKategoriId: true,
        marka: true,
        model: true,
        renk: true,
        kapasite: true,
        alisFiyatiKurus: true,
        girisTarihi: true,
      },
    });
    if (!son) return bos;

    return {
      bulundu: true,
      kategoriId: son.kategoriId,
      altKategoriId: son.altKategoriId,
      marka: son.marka,
      model: son.model,
      renk: son.renk ?? "",
      kapasite: son.kapasite ?? "",
      alisFiyatiKurus: son.alisFiyatiKurus,
      sonGirisTarihi: son.girisTarihi.toISOString(),
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return bos;
    console.error("Barkod bilgisi getirilemedi:", hata);
    return bos;
  }
}

export type SeriNoKontrolu = { kullanimda: boolean; aciklama?: string };

/**
 * Okutulan seri numarası sistemde var mı? Okutma anında bakılır ki kullanıcı
 * onlarca IMEI girdikten sonra kayıtta sürprizle karşılaşmasın.
 */
/**
 * Daha önce girilmiş ürün kartlarını adıyla arar — fatura ekranındaki liste.
 *
 * Barkodu okutmak her zaman mümkün olmuyor: kutu açılmış, etiket silinmiş ya
 * da kullanıcı ürünü adıyla hatırlıyor. Liste barkodu buluyor, seçildiğinde
 * okutmuş gibi kart açılıyor.
 *
 * Stok durumuna bakılmıyor: tükenmiş ürün yeniden alınabilir, hatta listenin
 * asıl işi bu.
 */
export async function faturaUrunleriniAra(
  sorgu: string,
): Promise<AramaSonucu<GecmisUrun>> {
  try {
    await adminZorunlu();
    if (!aramaYeterliMi(sorgu)) return { gruplar: [], kesildi: false };

    const kayitlar = await prisma.stokKalemi.findMany({
      where: {
        barkod: { not: null },
        aramaMetni: { contains: aramaNormalize(sorgu) },
      },
      select: {
        barkod: true,
        marka: true,
        model: true,
        alisFiyatiKurus: true,
        girisTarihi: true,
        kategori: { select: { ad: true } },
        altKategori: { select: { ad: true } },
      },
      // Gruplama burada yapılıyor; makul bir üst sınır yeter.
      // Sınıra dayanıldığını anlamak için bir fazlası çekiliyor.
      take: EN_COK_CIHAZ + 1,
      orderBy: { girisTarihi: "desc" },
    });

    const cihazKesildi = kayitlar.length > EN_COK_CIHAZ;

    const tumGruplar = gruplaGecmisUrunler(
      kayitlar.slice(0, EN_COK_CIHAZ).map((k) => ({
        barkod: k.barkod,
        marka: k.marka,
        model: k.model,
        kategoriAdi: k.kategori.ad,
        altKategoriAdi: k.altKategori?.ad ?? null,
        alisFiyatiKurus: k.alisFiyatiKurus,
        girisTarihi: k.girisTarihi,
      })),
    );
    return sonucuKisalt(tumGruplar, EN_COK_GRUP, cihazKesildi);
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { gruplar: [], kesildi: false };
    console.error("Fatura ürün araması başarısız:", hata);
    return { gruplar: [], kesildi: false };
  }
}

export async function seriNoKontrolEt(seriNo: string): Promise<SeriNoKontrolu> {
  try {
    await adminZorunlu();

    const kod = kodNormalize(seriNo);
    if (!kod) return { kullanimda: false };

    const mevcut = await prisma.stokKalemi.findUnique({
      where: { seriNo: kod },
      select: {
        marka: true,
        model: true,
        durum: true,
        magaza: { select: { ad: true } },
      },
    });
    if (!mevcut) return { kullanimda: false };

    return {
      kullanimda: true,
      aciklama: `${kod} sistemde kayıtlı: ${mevcut.marka} ${mevcut.model} · ${mevcut.magaza.ad} · ${mevcut.durum}`,
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { kullanimda: false };
    console.error("Seri no kontrol edilemedi:", hata);
    return { kullanimda: false };
  }
}

export type HizliTedarikciSonucu =
  | { basarili: true; tedarikci: { id: number; ad: string } }
  | { basarili: false; hata: string };

/**
 * Fatura ekranından ayrılmadan tedarikçi ekler.
 *
 * Ayarlar ekranındaki tam formun yerini almaz; yalnız ad ve telefon alır,
 * vergi no/adres gibi alanlar sonradan Ayarlar > Tedarikçiler'den doldurulur.
 * Aynı isim zaten varsa yenisi açılmaz, mevcut kayıt döner — fatura girerken
 * kullanıcı yinelenen tedarikçi oluşturmasın.
 */
export async function hizliTedarikciEkle(
  ad: string,
  telefon: string,
): Promise<HizliTedarikciSonucu> {
  try {
    const oturum = await adminZorunlu();

    const temizAd = ad.trim();
    if (temizAd.length < 2)
      return { basarili: false, hata: "Tedarikçi adı en az 2 karakter." };
    if (temizAd.length > 80)
      return { basarili: false, hata: "Tedarikçi adı çok uzun." };

    const temizTelefon = telefon.trim().slice(0, 30) || null;

    const mevcut = await prisma.tedarikci.findUnique({
      where: { ad: temizAd },
      select: { id: true, ad: true, aktif: true },
    });
    if (mevcut) {
      if (!mevcut.aktif) {
        await prisma.tedarikci.update({
          where: { id: mevcut.id },
          data: { aktif: true },
        });
      }
      return { basarili: true, tedarikci: { id: mevcut.id, ad: mevcut.ad } };
    }

    const tedarikci = await prisma.tedarikci.create({
      data: { ad: temizAd, telefon: temizTelefon },
      select: { id: true, ad: true },
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.AYAR_DEGISTIR,
      hedefTip: "Tedarikci",
      hedefId: tedarikci.id,
      detay: `Tedarikçi eklendi (fatura ekranından): ${tedarikci.ad}`,
    });
    revalidatePath("/ayarlar/tedarikciler");

    return { basarili: true, tedarikci };
  } catch (hata) {
    if (hata instanceof YetkiHatasi)
      return { basarili: false, hata: hata.message };
    console.error("Tedarikçi eklenemedi:", hata);
    return { basarili: false, hata: "Tedarikçi eklenemedi. Tekrar deneyin." };
  }
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
    if (fatura.vadeGun === 0)
      return { hata: "Bu fatura vadesiz; ödeme işareti gerekmiyor." };

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

export type FaturaIptalDurumu = { hata?: string; basari?: string };

/**
 * Yanlış girilmiş alış faturasını iptal eder.
 *
 * Fatura silinmiyor: iptal işareti konuyor, kalemlerinin hepsi cihaz olarak
 * iptal ediliyor ve numarası serbest bırakılıyor (en olağan senaryo yanlış
 * faturayı iptal edip doğrusunu aynı numarayla girmek).
 *
 * Tek bir cihazı bile satılmış ya da sevkiyattaysa engelleniyor: kısmen
 * iptal, faturayı tutarı kalemlerini tutmayan bir hale sokardı.
 */
export async function faturayiIptalEt(
  _onceki: FaturaIptalDurumu,
  form: FormData,
): Promise<FaturaIptalDurumu> {
  try {
    const oturum = await adminZorunlu();

    const faturaId = Number(form.get("faturaId"));
    if (!Number.isInteger(faturaId) || faturaId <= 0)
      return { hata: "Fatura bulunamadı." };

    const gerekce = String(form.get("gerekce") ?? "").trim();
    const gerekceHatasi = gerekceSorunu(gerekce);
    if (gerekceHatasi) return { hata: gerekceHatasi };

    const fatura = await prisma.alisFaturasi.findUnique({
      where: { id: faturaId },
      include: { kalemler: { select: { id: true, durum: true } } },
    });
    if (!fatura) return { hata: "Fatura bulunamadı." };
    if (fatura.iptalEdildi) return { hata: "Bu fatura zaten iptal edilmiş." };

    const engel = faturaIptalEngeli(fatura.kalemler);
    if (engel) return { hata: engel };

    const iptalEdilecekler = fatura.kalemler
      .filter((k) => !cihazIptalEngeli(k))
      .map((k) => k.id);

    await prisma.$transaction(async (tx) => {
      await tx.stokKalemi.updateMany({
        where: { id: { in: iptalEdilecekler } },
        data: { durum: STOK_DURUM.IPTAL },
      });

      for (const kalemId of iptalEdilecekler) {
        await tx.stokHareketi.create({
          data: {
            stokKalemiId: kalemId,
            tip: HAREKET_TIP.IPTAL,
            kaynakMagazaId: fatura.magazaId,
            kullaniciId: oturum.kullaniciId,
            aciklama: `Fatura iptal edildi (${fatura.faturaNo}): ${gerekce}`,
          },
        });
      }

      await tx.alisFaturasi.update({
        where: { id: fatura.id },
        data: {
          iptalEdildi: true,
          iptalTarihi: new Date(),
          iptalGerekce: gerekce,
          iptalEdenId: oturum.kullaniciId,
          // Numara serbest kalsın: doğrusu aynı numarayla girilebilmeli.
          faturaNo: iptalliFaturaNo(fatura.faturaNo, fatura.id),
        },
      });
    });

    await logYaz(oturum, {
      islem: LOG_ISLEM.STOK_SIL,
      hedefTip: "AlisFaturasi",
      hedefId: fatura.id,
      detay:
        `Fatura iptal edildi: ${fatura.faturaNo} · ${iptalEdilecekler.length} cihaz · ` +
        `gerekçe: ${gerekce}`,
    });

    revalidatePath(`/faturalar/${fatura.id}`);
    revalidatePath("/faturalar");
    revalidatePath("/cihazlar");
    revalidatePath("/panel");
    revalidatePath("/rapor");

    return {
      basari: `Fatura iptal edildi; ${iptalEdilecekler.length} cihaz stok toplamlarından düşüldü.`,
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Fatura iptal edilemedi:", hata);
    return { hata: "Fatura iptal edilemedi. Lütfen tekrar deneyin." };
  }
}
