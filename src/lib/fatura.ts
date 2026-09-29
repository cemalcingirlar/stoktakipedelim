import "server-only";
import { prisma } from "./prisma";
import { aramaMetniUret, kodNormalize } from "./metin";
import { HAREKET_TIP, STOK_DURUM } from "./sabitler";
import { vadeTarihiHesapla } from "./vade";
import type { FaturaGirdisi } from "@/app/(uygulama)/faturalar/dogrulama";

export type FaturaKayitSonucu =
  | { basarili: true; faturaId: number; tedarikciAdi: string; cihazSayisi: number }
  | { basarili: false; hata: string; alanHatalari?: string[] };

/**
 * Alış faturasını ve her satır için bir stok kalemini tek transaction'da yazar.
 *
 * Elle giriş (faturalar/yeni) ve Excel ile toplu yükleme aynı yoldan geçsin diye
 * ayrı bir modülde duruyor; kurallar iki ekranda ayrışmamalı.
 */
export async function faturaOlustur(
  kullaniciId: number,
  veri: FaturaGirdisi,
): Promise<FaturaKayitSonucu> {
  // Seri numaraları faturanın kendi içinde tekrarlamamalı.
  const seriNolar = veri.satirlar
    .map((s) => kodNormalize(s.seriNo))
    .filter((s): s is string => s.length > 0);
  const tekrarlayan = seriNolar.find((s, i) => seriNolar.indexOf(s) !== i);
  if (tekrarlayan) {
    return { basarili: false, hata: `Aynı seri numarası birden fazla satırda var: ${tekrarlayan}` };
  }

  // Kategori seri no zorunluluğu.
  const kategoriler = await prisma.kategori.findMany({
    where: { id: { in: [...new Set(veri.satirlar.map((s) => s.kategoriId))] } },
    select: { id: true, ad: true, seriNoZorunlu: true },
  });
  const kategoriHarita = new Map(kategoriler.map((k) => [k.id, k]));

  const eksikSeri: string[] = [];
  veri.satirlar.forEach((satir, i) => {
    const kategori = kategoriHarita.get(satir.kategoriId);
    if (!kategori) {
      eksikSeri.push(`${i + 1}. satır: kategori bulunamadı.`);
    } else if (kategori.seriNoZorunlu && !kodNormalize(satir.seriNo)) {
      eksikSeri.push(`${i + 1}. satır: ${kategori.ad} için seri no (IMEI) zorunludur.`);
    }
  });
  if (eksikSeri.length) {
    return { basarili: false, hata: "Eksik alanlar var.", alanHatalari: eksikSeri };
  }

  // Seri numarası sistemde benzersiz olmalı.
  if (seriNolar.length) {
    const cakisan = await prisma.stokKalemi.findMany({
      where: { seriNo: { in: seriNolar } },
      select: { seriNo: true },
    });
    if (cakisan.length) {
      return {
        basarili: false,
        hata: "Bu seri numaraları sistemde zaten kayıtlı.",
        alanHatalari: cakisan.map((c) => `${c.seriNo} daha önce girilmiş.`),
      };
    }
  }

  const ayniFatura = await prisma.alisFaturasi.findUnique({
    where: { tedarikciId_faturaNo: { tedarikciId: veri.tedarikciId, faturaNo: veri.faturaNo } },
    select: { id: true },
  });
  if (ayniFatura) {
    return { basarili: false, hata: "Bu tedarikçi için aynı numaralı fatura zaten kayıtlı." };
  }

  const tedarikci = await prisma.tedarikci.findUnique({
    where: { id: veri.tedarikciId },
    select: { ad: true },
  });
  if (!tedarikci) return { basarili: false, hata: "Tedarikçi bulunamadı." };

  const vadeTarihi = vadeTarihiHesapla(veri.faturaTarihi, veri.vadeGun);

  const fatura = await prisma.$transaction(async (tx) => {
    const olusan = await tx.alisFaturasi.create({
      data: {
        faturaNo: veri.faturaNo,
        faturaTarihi: veri.faturaTarihi,
        tedarikciId: veri.tedarikciId,
        magazaId: veri.magazaId,
        vadeGun: veri.vadeGun,
        vadeTarihi,
        not: veri.not,
        olusturanId: kullaniciId,
      },
    });

    for (const satir of veri.satirlar) {
      const seriNo = kodNormalize(satir.seriNo) || null;
      const barkod = kodNormalize(satir.barkod) || null;

      const kalem = await tx.stokKalemi.create({
        data: {
          barkod,
          seriNo,
          kategoriId: satir.kategoriId,
          altKategoriId: satir.altKategoriId,
          marka: satir.marka,
          model: satir.model,
          renk: satir.renk,
          kapasite: satir.kapasite,
          alisFaturasiId: olusan.id,
          tedarikciId: veri.tedarikciId,
          alisFiyatiKurus: satir.alisFiyatiKurus,
          girisTarihi: veri.faturaTarihi,
          magazaId: veri.magazaId,
          durum: STOK_DURUM.STOKTA,
          not: satir.not,
          aramaMetni: aramaMetniUret([
            satir.marka,
            satir.model,
            satir.renk,
            satir.kapasite,
            seriNo,
            barkod,
            tedarikci.ad,
            satir.not,
          ]),
        },
      });

      await tx.stokHareketi.create({
        data: {
          stokKalemiId: kalem.id,
          tip: HAREKET_TIP.GIRIS,
          hedefMagazaId: veri.magazaId,
          kullaniciId,
          aciklama: `${veri.faturaNo} numaralı alış faturası`,
          tarih: veri.faturaTarihi,
        },
      });
    }

    return olusan;
  });

  return {
    basarili: true,
    faturaId: fatura.id,
    tedarikciAdi: tedarikci.ad,
    cihazSayisi: veri.satirlar.length,
  };
}
