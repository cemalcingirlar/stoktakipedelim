import { logYaz } from "@/lib/log";
import { CIHAZ_ICERIK, filtredenWhere, filtreyiCoz } from "@/lib/cihazFiltre";
import { PassThrough } from "node:stream";
import { excelAkisaYaz, excelBasliklari, kurusuExcelSayisi } from "@/lib/excel";
import { EXCEL_EN_COK_SATIR, excelKesintiNotu } from "@/lib/excelSiniri";
import { gorunurMagazaIdleri } from "@/lib/gorunurluk";
import { oturumuTazeOku } from "@/lib/oturumTaze";
import { prisma } from "@/lib/prisma";
import { LOG_ISLEM } from "@/lib/sabitler";
import {
  SUTUNLAR,
  beklemeGunu,
  karKurus,
  sutunTercihiniCoz,
  sutunlariSirala,
  type SutunAnahtari,
} from "@/lib/sutunlar";

/** Excel'de metin yerine sayı yazılacak sütunlar — hücrede toplam alınabilsin diye. */
const PARASAL = new Set<SutunAnahtari>(["alisFiyati", "satisFiyati", "kar"]);

/** Cihaz listesini o anki filtre ve seçili sütunlarla Excel olarak indirir. */
export async function GET(istek: Request) {
  const oturum = await oturumuTazeOku();
  if (!oturum) return new Response("Oturum gerekli.", { status: 401 });

  const url = new URL(istek.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const filtre = filtreyiCoz(params);
  const bugun = new Date();
  // Dosya ekrandaki listenin aynısı: aynı mağaza kısıtı burada da geçerli.
  const where = filtredenWhere(filtre, gorunurMagazaIdleri(oturum), bugun);

  const [kullanici, toplamKayit, toplamAlisToplami] = await Promise.all([
    prisma.kullanici.findUnique({
      where: { id: oturum.kullaniciId },
      select: { sutunTercihi: true },
    }),
    prisma.stokKalemi.count({ where }),
    prisma.stokKalemi.aggregate({ where, _sum: { alisFiyatiKurus: true } }),
  ]);

  // Tek dosyada makul bir üst sınır; daha fazlası için filtre daraltılır.
  const kesildi = toplamKayit > EXCEL_EN_COK_SATIR;
  const yazilacak = Math.min(toplamKayit, EXCEL_EN_COK_SATIR);

  const sutunlar = sutunlariSirala(sutunTercihiniCoz(kullanici?.sutunTercihi));

  /**
   * Cihazlar öbek öbek okunuyor.
   *
   * Eskiden 20.000 satır tek seferde belleğe alınıp kitap da bellekte
   * kuruluyordu. Ölçüldü: sunucu süreci 420 MB'dan 1264 MB'a çıkıyordu;
   * 2 GB'lık bir VPS'te iki eşzamanlı aktarım süreci öldürmeye yeter.
   * Şimdi hem sorgu hem yazma akış halinde, bellek sabit kalıyor.
   */
  const OBEK = 1000;
  type CihazSatiri = Awaited<
    ReturnType<
      typeof prisma.stokKalemi.findMany<{ include: typeof CIHAZ_ICERIK }>
    >
  >[number];
  async function* satirUret() {
    let sonId: number | null = null;
    let yazilan = 0;
    while (yazilan < yazilacak) {
      const obek: CihazSatiri[] = await prisma.stokKalemi.findMany({
        where: sonId === null ? where : { AND: [where, { id: { lt: sonId } }] },
        include: CIHAZ_ICERIK,
        // Sayfalama id'ye göre: `skip` büyük listelerde her öbekte baştan
        // sayıyor, kayan kayıtlarda da satır atlatabiliyor.
        orderBy: { id: "desc" },
        take: Math.min(OBEK, yazilacak - yazilan),
      });
      if (obek.length === 0) break;
      for (const satir of obek) {
        yield sutunlar.map((anahtar) => {
          if (PARASAL.has(anahtar)) {
            if (anahtar === "alisFiyati")
              return kurusuExcelSayisi(satir.alisFiyatiKurus);
            if (anahtar === "satisFiyati")
              return kurusuExcelSayisi(satir.satisFiyatiKurus);
            return kurusuExcelSayisi(karKurus(satir));
          }
          if (anahtar === "bekleme") return beklemeGunu(satir, bugun);
          return SUTUNLAR[anahtar].metin(satir, bugun);
        });
      }
      yazilan += obek.length;
      sonId = obek[obek.length - 1].id;
    }
  }

  const filtreOzeti: string[] = [];
  if (filtre.durum) filtreOzeti.push(`Durum: ${filtre.durum}`);
  if (filtre.magazaId) filtreOzeti.push(`Depo no: ${filtre.magazaId}`);
  if (filtre.kategoriId) filtreOzeti.push(`Kategori no: ${filtre.kategoriId}`);
  if (filtre.vade) filtreOzeti.push(`Vade: ${filtre.vade}`);
  if (filtre.ara) filtreOzeti.push(`Arama: ${filtre.ara}`);

  const toplamAlis = toplamAlisToplami._sum.alisFiyatiKurus ?? 0;

  // PassThrough: exceljs Node akışına yazıyor, Response ise web akışı
  // istiyor. Köprü burada kuruluyor ve veri birikmeden geçiyor.
  const kopru = new PassThrough();
  const yazma = excelAkisaYaz(kopru, {
    ad: "Cihazlar",
    ustBilgiler: [
      `Cihaz Listesi — ${yazilacak} kayıt`,
      `Toplam alış değeri: ${(toplamAlis / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL`,
      filtreOzeti.length
        ? `Filtreler — ${filtreOzeti.join(" · ")}`
        : "Filtre uygulanmadı",
      ...(excelKesintiNotu(kesildi) ? [excelKesintiNotu(kesildi)!] : []),
    ],
    sutunlar: sutunlar.map((a) => ({
      baslik: SUTUNLAR[a].baslik,
      sayisal: PARASAL.has(a),
      genislik: a === "seriNo" || a === "barkod" ? 20 : undefined,
    })),
    satirUret,
  });
  yazma.catch((hata) => {
    console.error("Excel akışı yazılamadı:", hata);
    kopru.destroy(hata instanceof Error ? hata : new Error(String(hata)));
  });

  await logYaz(oturum, {
    islem: LOG_ISLEM.EXCEL_AKTAR,
    hedefTip: "StokKalemi",
    detay: `${yazilacak} cihaz · ${sutunlar.length} sütun${kesildi ? " · sınıra takıldı" : ""}`,
  });

  const damga = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return new Response(kopru as unknown as ReadableStream, {
    headers: excelBasliklari(`cihazlar-${damga}.xlsx`),
  });
}
