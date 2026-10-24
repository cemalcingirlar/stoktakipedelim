"use server";

import { revalidatePath } from "next/cache";
import {
  envanteriOku,
  type EnvanterHatasi,
  type EnvanterSatiri,
} from "@/lib/envanterDosyasi";
import { dosyadanMatris } from "@/lib/iceAktar";
import { logYaz } from "@/lib/log";
import { aramaMetniUret } from "@/lib/metin";
import { prisma } from "@/lib/prisma";
import type { Matris } from "@/lib/tablo";
import { HAREKET_TIP, LOG_ISLEM, STOK_DURUM } from "@/lib/sabitler";
import { YetkiHatasi, adminZorunlu } from "@/lib/yetki";
import {
  cihazIptalEngeli,
  faturaIptalEngeli,
  gerekceSorunu,
} from "@/lib/kayitIptali";
import { envanterKaydiSemasi } from "./dogrulama";

/** 20.000 satırlık bir envanter dökümü bu sınırın altında kalıyor. */
const EN_BUYUK_DOSYA = 10 * 1024 * 1024;

export type EnvanterOnizlemesi = {
  hata?: string;
  dosyaAdi?: string;
  satirlar?: EnvanterSatiri[];
  hatalar?: EnvanterHatasi[];
  uyarilar?: EnvanterHatasi[];
  tekrarEdenNumaralar?: string[];
  tekrarEdenSatirSayisi?: number;
  /** Kullanıcı tekrar eden numaraları seri saymama onayını verdi mi. */
  tekrarOnayi?: boolean;
  eslesmeyenAmbarlar?: string[];
  okunanSatir?: number;
  kategoriId?: number;
  kategoriAdi?: string;
};

/**
 * Dökümü okur ve önizleme döner. Veritabanına hiçbir şey yazmaz: kullanıcı
 * hangi satırın hangi mağazaya gittiğini görmeden kayıt oluşmaz.
 */
export async function envanteriOnizle(
  _onceki: EnvanterOnizlemesi,
  form: FormData,
): Promise<EnvanterOnizlemesi> {
  try {
    await adminZorunlu();

    const dosya = form.get("dosya");
    if (!(dosya instanceof File) || dosya.size === 0) {
      return { hata: "Bir envanter dosyası seçin." };
    }
    if (dosya.size > EN_BUYUK_DOSYA) {
      return { hata: "Dosya 10 MB'tan büyük olamaz." };
    }

    const kategoriId = Number(form.get("kategoriId")) || 0;
    if (!kategoriId) return { hata: "Önce kategori seçin." };

    const kategori = await prisma.kategori.findFirst({
      where: { id: kategoriId, aktif: true },
      select: { id: true, ad: true, seriNoZorunlu: true },
    });
    if (!kategori) return { hata: "Seçilen kategori bulunamadı." };

    const magazalar = await prisma.magaza.findMany({
      where: { aktif: true },
      orderBy: { kod: "asc" },
      select: { id: true, ad: true, kod: true },
    });

    // Onay kutusu işaretlenip dosya yeniden okunduğunda geliyor.
    const tekrarOnayi = form.get("tekrarOnayi") === "1";

    const matris = await dosyadanMatris(await dosya.arrayBuffer());
    if ("hata" in matris) return { hata: matris.hata };

    // Sistemde kayıtlı seri numaraları önizlemede hata olarak görünsün;
    // kaydetme anında sürpriz çıkmasın.
    const sonuc = envanteriOku(matris.matris, {
      magazalar,
      kategori,
      tekrarEdenleriSeriSayma: tekrarOnayi,
      kayitliSeriNolar: await kayitliSeriNolariBul(
        matris.matris,
        magazalar,
        kategori,
        tekrarOnayi,
      ),
    });

    return {
      dosyaAdi: dosya.name,
      satirlar: sonuc.satirlar,
      hatalar: sonuc.hatalar,
      uyarilar: sonuc.uyarilar,
      tekrarEdenNumaralar: sonuc.tekrarEdenNumaralar,
      tekrarEdenSatirSayisi: sonuc.tekrarEdenSatirSayisi,
      tekrarOnayi,
      eslesmeyenAmbarlar: sonuc.eslesmeyenAmbarlar,
      okunanSatir: sonuc.okunanSatir,
      kategoriId: kategori.id,
      kategoriAdi: kategori.ad,
    };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Envanter dosyası okunamadı:", hata);
    return {
      hata: "Dosya okunamadı. Raporu .xlsx olarak kaydedip yeniden deneyin.",
    };
  }
}

/**
 * Dosyayı bir kez kuru okuyup içindeki seri numaralarından hangilerinin
 * sistemde kayıtlı olduğunu bulur. İki geçiş gerekiyor: ilk geçiş seri
 * numaralarını çıkarıyor, ikinci geçiş (asıl okuma) bunları hata olarak
 * işaretliyor.
 */
async function kayitliSeriNolariBul(
  matris: Matris,
  magazalar: { id: number; ad: string; kod: string }[],
  kategori: { id: number; ad: string; seriNoZorunlu: boolean },
  tekrarOnayi: boolean,
): Promise<Set<string>> {
  const ilk = envanteriOku(matris, {
    magazalar,
    kategori,
    tekrarEdenleriSeriSayma: tekrarOnayi,
  });
  const seriNolar = ilk.satirlar
    .map((s) => s.seriNo)
    .filter((s): s is string => Boolean(s));
  if (seriNolar.length === 0) return new Set();

  const kayitli = new Set<string>();
  // SQLite'ın değişken sınırına takılmamak için parçalara bölüyoruz.
  for (let i = 0; i < seriNolar.length; i += 500) {
    const dilim = seriNolar.slice(i, i + 500);
    const bulunan = await prisma.stokKalemi.findMany({
      where: { seriNo: { in: dilim } },
      select: { seriNo: true },
    });
    for (const k of bulunan) if (k.seriNo) kayitli.add(k.seriNo);
  }
  return kayitli;
}

export type EnvanterKaydiDurumu = {
  hata?: string;
  alanHatalari?: string[];
  eklenen?: number;
};

/**
 * Önizlemesi onaylanan satırları stoğa yazar.
 *
 * Fatura oluşturulmaz: satırlar birden çok mağazaya dağıldığı için tek bir
 * alış faturasına sığmıyor (AlisFaturasi tek depo tutuyor) ve bu bir devir
 * girişi, alım değil. Her cihaz için bir GIRIS hareketi yazılıyor, böylece
 * cihaz detayındaki tarihçe boş kalmıyor.
 */
export async function envanteriKaydet(
  _onceki: EnvanterKaydiDurumu,
  form: FormData,
): Promise<EnvanterKaydiDurumu> {
  try {
    const oturum = await adminZorunlu();

    let cozulen: unknown;
    try {
      cozulen = JSON.parse(String(form.get("veri") ?? ""));
    } catch {
      return { hata: "Veri okunamadı. Dosyayı yeniden yükleyin." };
    }

    const sonuc = envanterKaydiSemasi.safeParse(cozulen);
    if (!sonuc.success) {
      return {
        hata: "Kayıt bilgilerinde eksik veya hatalı alanlar var.",
        alanHatalari: sonuc.error.issues.map((i) => i.message),
      };
    }
    const veri = sonuc.data;

    const kategori = await prisma.kategori.findFirst({
      where: { id: veri.kategoriId, aktif: true },
      select: { id: true, ad: true, seriNoZorunlu: true },
    });
    if (!kategori) return { hata: "Kategori bulunamadı." };

    if (veri.altKategoriId !== null) {
      const alt = await prisma.altKategori.findFirst({
        where: { id: veri.altKategoriId, kategoriId: kategori.id, aktif: true },
        select: { id: true },
      });
      if (!alt) return { hata: "Alt kategori bu kategoriye ait değil." };
    }

    // Mağazalar gerçekten var mı? Önizleme ile kayıt arasında mağaza
    // kapatılmış olabilir.
    const magazaIdleri = [...new Set(veri.satirlar.map((s) => s.magazaId))];
    const magazalar = await prisma.magaza.findMany({
      where: { id: { in: magazaIdleri }, aktif: true },
      select: { id: true, ad: true },
    });
    if (magazalar.length !== magazaIdleri.length) {
      return {
        hata: "Satırlardaki mağazalardan biri bulunamadı veya kapatılmış.",
      };
    }

    // Seri no zorunluluğu ve tekrar kontrolü — istemciden gelen veriye
    // güvenmiyoruz, önizlemedeki kurallar burada da geçerli.
    const seriNolar = veri.satirlar
      .map((s) => s.seriNo)
      .filter((s): s is string => Boolean(s));
    const tekrar = seriNolar.find((s, i) => seriNolar.indexOf(s) !== i);
    if (tekrar)
      return { hata: `Aynı seri numarası birden fazla satırda var: ${tekrar}` };

    // Seri no zorunluluğu satır bazında: kullanıcının "bu numara gerçek seri
    // numarası değil" diye onayladığı satırlarda aranmıyor, diğerlerinde
    // aranıyor. Toplu bir muafiyet vermiyoruz.
    const seriSiz = veri.satirlar.filter(
      (s) => !s.seriNo && !s.tekrarEdenNumara,
    );
    if (kategori.seriNoZorunlu && seriSiz.length > 0) {
      return {
        hata: `${kategori.ad} kategorisinde her satırda seri no (IMEI) olmalı.`,
      };
    }
    const onayliSerisiz = veri.satirlar.filter(
      (s) => !s.seriNo && s.tekrarEdenNumara,
    ).length;

    if (seriNolar.length > 0) {
      const cakisan: string[] = [];
      for (let i = 0; i < seriNolar.length; i += 500) {
        const bulunan = await prisma.stokKalemi.findMany({
          where: { seriNo: { in: seriNolar.slice(i, i + 500) } },
          select: { seriNo: true },
        });
        for (const k of bulunan) if (k.seriNo) cakisan.push(k.seriNo);
      }
      if (cakisan.length > 0) {
        return {
          hata: "Bu seri numaraları sistemde zaten kayıtlı.",
          alanHatalari: cakisan
            .slice(0, 50)
            .map((s) => `${s} daha önce girilmiş.`),
        };
      }
    }

    const magazaAdlari = new Map(magazalar.map((m) => [m.id, m.ad]));
    const aciklama = veri.aciklama ?? "Envanter dökümünden devir girişi";

    await prisma.$transaction(
      async (tx) => {
        // Parti kaydı: bu yol fatura oluşturmuyor, dolayısıyla yüklenen
        // cihazların hangi yüklemeden geldiği başka türlü bilinemez ve
        // yanlış bir döküm geri alınamazdı.
        const parti = await tx.iceAktarim.create({
          data: {
            aciklama,
            adet: veri.satirlar.length,
            kullaniciId: oturum.kullaniciId,
          },
        });

        for (const satir of veri.satirlar) {
          const kalem = await tx.stokKalemi.create({
            data: {
              iceAktarimId: parti.id,
              barkod: satir.barkod,
              seriNo: satir.seriNo,
              kategoriId: kategori.id,
              altKategoriId: veri.altKategoriId,
              marka: satir.marka,
              model: satir.model,
              alisFiyatiKurus: satir.alisFiyatiKurus,
              girisTarihi: veri.girisTarihi,
              magazaId: satir.magazaId,
              durum: STOK_DURUM.STOKTA,
              not: satir.not,
              aramaMetni: aramaMetniUret([
                satir.marka,
                satir.model,
                satir.seriNo,
                satir.barkod,
                satir.not,
              ]),
            },
          });

          await tx.stokHareketi.create({
            data: {
              stokKalemiId: kalem.id,
              tip: HAREKET_TIP.GIRIS,
              hedefMagazaId: satir.magazaId,
              kullaniciId: oturum.kullaniciId,
              aciklama,
              tarih: veri.girisTarihi,
            },
          });
        }
      },
      { timeout: 120_000, maxWait: 20_000 },
    );

    const ozet = [...magazaAdlari.entries()]
      .map(
        ([id, ad]) =>
          `${ad}: ${veri.satirlar.filter((s) => s.magazaId === id).length}`,
      )
      .join(" · ");

    await logYaz(oturum, {
      islem: LOG_ISLEM.STOK_EKLE,
      hedefTip: "StokKalemi",
      detay:
        `Envanter dökümü: ${veri.satirlar.length} cihaz · ${kategori.ad} · ${ozet}` +
        (onayliSerisiz > 0
          ? ` · ${onayliSerisiz} cihaz kullanıcı onayıyla seri numarasız`
          : ""),
    });

    revalidatePath("/cihazlar");
    revalidatePath("/panel");

    return { eklenen: veri.satirlar.length };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Envanter dökümü kaydedilemedi:", hata);
    return { hata: "Kayıt sırasında hata oluştu. Lütfen tekrar deneyin." };
  }
}

export type PartiGeriAlmaDurumu = { hata?: string; basari?: string };

/**
 * Bir envanter yükleme partisini topluca geri alır.
 *
 * Yanlış bir döküm yüklendiğinde tek çare eski yedeği geri yüklemekti — o da
 * aradaki bütün işi siler. Parti geri alınınca cihazlar tek tek iptal
 * ediliyor: kayıtlar duruyor, stok toplamlarından düşüyor, gerekçe her
 * cihazın tarihçesinde kalıyor.
 *
 * Partideki tek bir cihaz bile satılmış ya da sevkiyattaysa engelleniyor;
 * yüklemenin bir kısmı artık başka kayıtlara bağlı demektir.
 */
export async function partiyiGeriAl(
  _onceki: PartiGeriAlmaDurumu,
  form: FormData,
): Promise<PartiGeriAlmaDurumu> {
  try {
    const oturum = await adminZorunlu();

    const partiId = Number(form.get("partiId"));
    if (!Number.isInteger(partiId) || partiId <= 0)
      return { hata: "Yükleme bulunamadı." };

    const gerekce = String(form.get("gerekce") ?? "").trim();
    const gerekceHatasi = gerekceSorunu(gerekce);
    if (gerekceHatasi) return { hata: gerekceHatasi };

    const parti = await prisma.iceAktarim.findUnique({
      where: { id: partiId },
      include: {
        kalemler: { select: { id: true, durum: true, magazaId: true } },
      },
    });
    if (!parti) return { hata: "Yükleme bulunamadı." };
    if (parti.geriAlindi) return { hata: "Bu yükleme zaten geri alınmış." };

    const engel = faturaIptalEngeli(parti.kalemler);
    if (engel)
      return {
        hata: engel.replace("Fatura", "Yükleme").replace("fatura", "yükleme"),
      };

    const iptalEdilecekler = parti.kalemler.filter((k) => !cihazIptalEngeli(k));

    await prisma.$transaction(
      async (tx) => {
        await tx.stokKalemi.updateMany({
          where: { id: { in: iptalEdilecekler.map((k) => k.id) } },
          data: { durum: STOK_DURUM.IPTAL },
        });
        for (const kalem of iptalEdilecekler) {
          await tx.stokHareketi.create({
            data: {
              stokKalemiId: kalem.id,
              tip: HAREKET_TIP.IPTAL,
              kaynakMagazaId: kalem.magazaId,
              kullaniciId: oturum.kullaniciId,
              aciklama: `Toplu yükleme geri alındı (#${parti.id}): ${gerekce}`,
            },
          });
        }
        await tx.iceAktarim.update({
          where: { id: parti.id },
          data: {
            geriAlindi: true,
            geriAlmaTarihi: new Date(),
            geriAlmaGerekce: gerekce,
          },
        });
      },
      { timeout: 120_000 },
    );

    await logYaz(oturum, {
      islem: LOG_ISLEM.STOK_SIL,
      hedefTip: "IceAktarim",
      hedefId: parti.id,
      detay: `Toplu yükleme geri alındı: ${iptalEdilecekler.length} cihaz · gerekçe: ${gerekce}`,
    });

    revalidatePath("/cihazlar/envanter");
    revalidatePath("/cihazlar");
    revalidatePath("/panel");
    revalidatePath("/rapor");

    return { basari: `${iptalEdilecekler.length} cihaz iptal edildi.` };
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return { hata: hata.message };
    console.error("Yükleme geri alınamadı:", hata);
    return { hata: "Yükleme geri alınamadı. Lütfen tekrar deneyin." };
  }
}
