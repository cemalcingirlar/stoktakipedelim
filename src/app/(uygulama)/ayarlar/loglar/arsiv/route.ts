import { logYaz } from "@/lib/log";
import {
  ARSIV_ANAHTARI,
  CSV_BASLIKLARI,
  arsivDosyaAdi,
  arsivSiniri,
  csvSatiri,
  yilSorunu,
} from "@/lib/logArsivi";
import { prisma } from "@/lib/prisma";
import { LOG_ISLEM } from "@/lib/sabitler";
import { tarihSaatYaz } from "@/lib/tarih";
import { adminMi } from "@/lib/yetki";
import { oturumuTazeOku } from "@/lib/oturumTaze";

/** Tek seferde belleğe alınan kayıt sayısı. */
const OBEK = 5000;

/**
 * Eski işlem loglarını CSV olarak indirir ve "indirildi" kaydını yazar.
 *
 * Neden Excel değil CSV: arşiv yüz binlerce satır olabiliyor; exceljs bütün
 * dosyayı bellekte kuruyor. CSV parça parça akıtılıyor, sunucunun belleği
 * kayıt sayısından bağımsız kalıyor.
 *
 * İndirme kaydı (Ayar tablosunda) silme adımının ön koşulu: indirilmemiş
 * kayıt silinemiyor.
 */
export async function GET(istek: Request) {
  const oturum = await oturumuTazeOku();
  if (!oturum) return new Response("Oturum gerekli.", { status: 401 });
  if (!adminMi(oturum)) return new Response("Yetkisiz.", { status: 403 });

  const url = new URL(istek.url);
  const yil = Number(url.searchParams.get("yil") ?? "2");
  const sorun = yilSorunu(yil);
  if (sorun) return new Response(sorun, { status: 400 });

  const sinir = arsivSiniri(yil);
  const adet = await prisma.log.count({ where: { tarih: { lt: sinir } } });

  await prisma.ayar.upsert({
    where: { anahtar: ARSIV_ANAHTARI },
    update: {
      deger: JSON.stringify({
        sinirISO: sinir.toISOString(),
        adet,
        tarihISO: new Date().toISOString(),
      }),
    },
    create: {
      anahtar: ARSIV_ANAHTARI,
      deger: JSON.stringify({
        sinirISO: sinir.toISOString(),
        adet,
        tarihISO: new Date().toISOString(),
      }),
    },
  });

  await logYaz(oturum, {
    islem: LOG_ISLEM.LOG_ARSIVLE,
    hedefTip: "Log",
    detay: `${adet} kayıt arşivlendi (${sinir.toLocaleDateString("tr-TR")} öncesi)`,
  });

  const akis = new ReadableStream<Uint8Array>({
    async start(kontrol) {
      const kodla = new TextEncoder();
      // Excel'in UTF-8 anlaması için BOM; yoksa Türkçe harfler bozuluyor.
      kontrol.enqueue(kodla.encode("﻿" + csvSatiri(CSV_BASLIKLARI) + "\r\n"));

      let sonId = 0;
      for (;;) {
        const obek = await prisma.log.findMany({
          where: { tarih: { lt: sinir }, id: { gt: sonId } },
          orderBy: { id: "asc" },
          take: OBEK,
          select: {
            id: true,
            tarih: true,
            kullaniciAdi: true,
            islem: true,
            hedefTip: true,
            hedefId: true,
            detay: true,
            ip: true,
          },
        });
        if (obek.length === 0) break;
        const satirlar = obek
          .map((l) =>
            csvSatiri([
              l.id,
              tarihSaatYaz(l.tarih),
              l.kullaniciAdi,
              l.islem,
              l.hedefTip,
              l.hedefId,
              l.detay,
              l.ip,
            ]),
          )
          .join("\r\n");
        kontrol.enqueue(kodla.encode(satirlar + "\r\n"));
        sonId = obek[obek.length - 1].id;
      }
      kontrol.close();
    },
  });

  return new Response(akis, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${arsivDosyaAdi(sinir)}"`,
      "Cache-Control": "no-store",
    },
  });
}
