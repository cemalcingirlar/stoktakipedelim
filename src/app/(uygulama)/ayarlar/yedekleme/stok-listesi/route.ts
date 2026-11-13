import { PassThrough } from "node:stream";
import { excelBasliklari } from "@/lib/excel";
import { logYaz } from "@/lib/log";
import { oturumuTazeOku } from "@/lib/oturumTaze";
import { LOG_ISLEM } from "@/lib/sabitler";
import { stokListesiDosyaAdi } from "@/lib/stokListesi";
import { stokListesiDosyasiUret } from "@/lib/yedek";
import { adminMi } from "@/lib/yetki";

/**
 * Günlük stok listesinin o anki hâlini indirir.
 *
 * Her gece yedekle birlikte Drive'a yüklenen dosyanın aynısı, aynı işlevden
 * üretiliyor: Drive'a ne gittiği buradan görülebiliyor. Yalnız yönetici:
 * dosya bütün mağazaların stokunu ve alış fiyatlarını taşıyor.
 */
export async function GET() {
  const oturum = await oturumuTazeOku();
  if (!oturum) return new Response("Oturum gerekli.", { status: 401 });
  if (!adminMi(oturum)) return new Response("Yetkiniz yok.", { status: 403 });

  const tarih = new Date();
  const kopru = new PassThrough();
  stokListesiDosyasiUret(kopru, tarih).catch((hata) => {
    console.error("Stok listesi üretilemedi:", hata);
    kopru.destroy(hata instanceof Error ? hata : new Error(String(hata)));
  });

  await logYaz(oturum, {
    islem: LOG_ISLEM.EXCEL_AKTAR,
    hedefTip: "StokListesi",
    detay: "Günlük stok listesi elle indirildi",
  });

  return new Response(kopru as unknown as ReadableStream, {
    headers: excelBasliklari(stokListesiDosyaAdi(tarih)),
  });
}
