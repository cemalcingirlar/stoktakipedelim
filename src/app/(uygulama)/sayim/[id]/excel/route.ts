import { notFound } from "next/navigation";
import { logYaz } from "@/lib/log";
import { excelBasliklari, excelUret, kurusuExcelSayisi, type ExcelSayfasi } from "@/lib/excel";
import { prisma } from "@/lib/prisma";
import {
  LOG_ISLEM,
  SAYIM_DURUM,
  SAYIM_SONUC,
  SAYIM_SONUC_ETIKET,
  type SayimSonuc,
} from "@/lib/sabitler";
import { tarihSaatYaz, tarihYaz } from "@/lib/tarih";
import { oturumuOku } from "@/lib/oturum";

const SUTUNLAR = [
  { baslik: "Sonuç", genislik: 22 },
  { baslik: "Kategori", genislik: 18 },
  { baslik: "Marka", genislik: 14 },
  { baslik: "Model", genislik: 20 },
  { baslik: "Seri No / Okutulan Kod", genislik: 24 },
  { baslik: "Barkod", genislik: 18 },
  { baslik: "Kayıtlı Depo", genislik: 18 },
  { baslik: "Alış Fiyatı (TL)", genislik: 16, sayisal: true },
  { baslik: "Okutma Zamanı", genislik: 18 },
  { baslik: "Okutan", genislik: 20 },
  { baslik: "Not", genislik: 28 },
];

/** Sayım sonucunu Excel dosyası olarak indirir: sayılanlar, eksikler ve fazlalar ayrı sayfalarda. */
export async function GET(_istek: Request, { params }: RouteContext<"/sayim/[id]/excel">) {
  const oturum = await oturumuOku();
  if (!oturum) {
    return new Response("Oturum gerekli.", { status: 401 });
  }

  const { id } = await params;
  const sayimId = Number(id);
  if (!Number.isInteger(sayimId)) notFound();

  const sayim = await prisma.sayim.findUnique({
    where: { id: sayimId },
    include: {
      magaza: true,
      baslatan: { select: { adSoyad: true } },
      kapatan: { select: { adSoyad: true } },
      kalemler: {
        orderBy: [{ beklenen: "desc" }, { sayildi: "asc" }, { id: "asc" }],
        include: {
          okutan: { select: { adSoyad: true } },
          stokKalemi: {
            include: {
              kategori: { select: { ad: true } },
              magaza: { select: { ad: true } },
            },
          },
        },
      },
    },
  });
  if (!sayim) notFound();

  if (sayim.durum === SAYIM_DURUM.DEVAM) {
    return new Response("Devam eden sayımın raporu alınamaz. Önce sayımı kapatın.", {
      status: 409,
    });
  }

  const beklenenler = sayim.kalemler.filter((k) => k.beklenen);
  const sayilanlar = beklenenler.filter((k) => k.sayildi);
  const eksikler = beklenenler.filter((k) => !k.sayildi);
  const fazlalar = sayim.kalemler.filter((k) => !k.beklenen);

  type Kalem = (typeof sayim.kalemler)[number];

  function satirlar(kalemler: Kalem[]): (string | number | null)[][] {
    return kalemler.map((k) => {
      const sonuc = (k.sonuc ?? (k.sayildi ? SAYIM_SONUC.BULUNDU : SAYIM_SONUC.EKSIK)) as SayimSonuc;
      return [
        SAYIM_SONUC_ETIKET[sonuc] ?? sonuc,
        k.stokKalemi?.kategori.ad ?? "",
        k.stokKalemi?.marka ?? "",
        k.stokKalemi?.model ?? "",
        k.stokKalemi?.seriNo ?? k.okutulanKod ?? "",
        k.stokKalemi?.barkod ?? "",
        k.stokKalemi?.magaza.ad ?? "",
        kurusuExcelSayisi(k.stokKalemi?.alisFiyatiKurus),
        k.okutmaTarihi ? tarihSaatYaz(k.okutmaTarihi) : "",
        k.okutan?.adSoyad ?? "",
        k.not ?? "",
      ];
    });
  }

  const ustBilgiler = [
    `${sayim.magaza.ad} — Stok Sayım Raporu`,
    `Başlangıç: ${tarihSaatYaz(sayim.baslangicTarihi)} · Başlatan: ${sayim.baslatan.adSoyad}`,
    `Bitiş: ${sayim.bitisTarihi ? tarihSaatYaz(sayim.bitisTarihi) : "—"} · Kapatan: ${sayim.kapatan?.adSoyad ?? "—"}`,
    `Beklenen: ${beklenenler.length} · Sayılan: ${sayilanlar.length} · Eksik: ${eksikler.length} · Fazla: ${fazlalar.length}`,
  ];

  const sayfalar: ExcelSayfasi[] = [
    { ad: "Özet", ustBilgiler, sutunlar: SUTUNLAR, satirlar: satirlar(sayim.kalemler) },
    { ad: "Sayılanlar", sutunlar: SUTUNLAR, satirlar: satirlar(sayilanlar) },
    { ad: "Eksikler", sutunlar: SUTUNLAR, satirlar: satirlar(eksikler) },
    { ad: "Fazlalar", sutunlar: SUTUNLAR, satirlar: satirlar(fazlalar) },
  ];

  const dosya = await excelUret(sayfalar);

  await logYaz(oturum, {
    islem: LOG_ISLEM.EXCEL_AKTAR,
    hedefTip: "Sayim",
    hedefId: sayim.id,
    detay: `${sayim.magaza.ad} sayım raporu`,
  });

  const dosyaAdi = `sayim-${sayim.magaza.kod}-${tarihYaz(sayim.baslangicTarihi).replace(/\./g, "")}.xlsx`;
  return new Response(new Uint8Array(dosya), { headers: excelBasliklari(dosyaAdi) });
}
