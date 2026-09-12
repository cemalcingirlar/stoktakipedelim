import { excelBasliklari, excelUret, kurusuExcelSayisi, type ExcelSayfasi } from "@/lib/excel";
import { logYaz } from "@/lib/log";
import { oturumuOku } from "@/lib/oturum";
import {
  girisCikisRaporu,
  kategoriStokRaporu,
  kullaniciSatisRaporu,
  magazaSatisRaporu,
  magazaStokRaporu,
  sayimRaporu,
  transferRaporu,
  vadeRaporu,
  type RaporAraligi,
} from "@/lib/raporlar";
import { LOG_ISLEM, TRANSFER_DURUM_ETIKET, VADE_ETIKET, type TransferDurum } from "@/lib/sabitler";
import { tarihYaz } from "@/lib/tarih";

function tarihCoz(deger: string | null): Date | null {
  if (!deger) return null;
  const d = new Date(deger);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Rapor ekranındaki tüm tabloları tek Excel dosyasında, her biri ayrı sayfada verir. */
export async function GET(istek: Request) {
  const oturum = await oturumuOku();
  if (!oturum) return new Response("Oturum gerekli.", { status: 401 });

  const url = new URL(istek.url);
  const aralik: RaporAraligi = {
    baslangic: tarihCoz(url.searchParams.get("bas")),
    bitis: tarihCoz(url.searchParams.get("bit")),
  };
  const bugun = new Date();

  const [stok, kategori, vade, girisCikis, magazaSatis, kullaniciSatis, transfer, sayim] =
    await Promise.all([
      magazaStokRaporu(),
      kategoriStokRaporu(),
      vadeRaporu(bugun),
      girisCikisRaporu(aralik),
      magazaSatisRaporu(aralik),
      kullaniciSatisRaporu(aralik),
      transferRaporu(aralik),
      sayimRaporu(),
    ]);

  const aralikMetni =
    aralik.baslangic || aralik.bitis
      ? `${aralik.baslangic ? tarihYaz(aralik.baslangic) : "başlangıçtan"} – ${aralik.bitis ? tarihYaz(aralik.bitis) : "bugüne"}`
      : "Tüm zamanlar";

  const sayfalar: ExcelSayfasi[] = [
    {
      ad: "Özet",
      ustBilgiler: [
        "Stok Takip — Rapor Özeti",
        `Rapor tarihi: ${tarihYaz(bugun)} · Aralık: ${aralikMetni}`,
      ],
      sutunlar: [
        { baslik: "Kalem", genislik: 30 },
        { baslik: "Adet", genislik: 12 },
        { baslik: "Tutar (TL)", genislik: 18, sayisal: true },
      ],
      satirlar: [
        [
          "Stoktaki cihaz",
          stok.reduce((t, s) => t + s.adet, 0),
          kurusuExcelSayisi(stok.reduce((t, s) => t + s.degerKurus, 0)),
        ],
        ["Aralıktaki giriş", girisCikis.girisAdedi, kurusuExcelSayisi(girisCikis.girisTutari)],
        ["Aralıktaki satış", girisCikis.satisAdedi, kurusuExcelSayisi(girisCikis.satisTutari)],
        ["Satılanların maliyeti", girisCikis.satisAdedi, kurusuExcelSayisi(girisCikis.satilanMaliyet)],
        ["Kâr", "", kurusuExcelSayisi(girisCikis.karKurus)],
        ["Ödenmemiş vadeli fatura", vade.length, kurusuExcelSayisi(vade.reduce((t, v) => t + v.tutarKurus, 0))],
        ["Vadesi geçmiş fatura", vade.filter((v) => v.gecmisMi).length, ""],
      ],
    },
    {
      ad: "Mağaza Stok",
      sutunlar: [
        { baslik: "Kod", genislik: 10 },
        { baslik: "Mağaza", genislik: 24 },
        { baslik: "Adet", genislik: 12 },
        { baslik: "Değer (TL)", genislik: 18, sayisal: true },
      ],
      satirlar: stok.map((s) => [s.kod, s.ad, s.adet, kurusuExcelSayisi(s.degerKurus)]),
    },
    {
      ad: "Kategori Stok",
      sutunlar: [
        { baslik: "Kategori", genislik: 24 },
        { baslik: "Adet", genislik: 12 },
        { baslik: "Değer (TL)", genislik: 18, sayisal: true },
      ],
      satirlar: kategori.map((k) => [k.ad, k.adet, kurusuExcelSayisi(k.degerKurus)]),
    },
    {
      ad: "Vade",
      sutunlar: [
        { baslik: "Durum", genislik: 12 },
        { baslik: "Tedarikçi", genislik: 24 },
        { baslik: "Fatura No", genislik: 18 },
        { baslik: "Depo", genislik: 20 },
        { baslik: "Fatura Tarihi", genislik: 14 },
        { baslik: "Vade", genislik: 12 },
        { baslik: "Vade Tarihi", genislik: 14 },
        { baslik: "Cihaz", genislik: 10 },
        { baslik: "Tutar (TL)", genislik: 18, sayisal: true },
      ],
      satirlar: vade.map((v) => [
        v.gecmisMi ? "Geçti" : "Bekliyor",
        v.tedarikci,
        v.faturaNo,
        v.magaza,
        tarihYaz(v.faturaTarihi),
        VADE_ETIKET[v.vadeGun] ?? `${v.vadeGun} gün`,
        tarihYaz(v.vadeTarihi),
        v.cihazAdedi,
        kurusuExcelSayisi(v.tutarKurus),
      ]),
    },
    {
      ad: "Mağaza Satış",
      sutunlar: [
        { baslik: "Mağaza", genislik: 24 },
        { baslik: "Adet", genislik: 10 },
        { baslik: "Satış (TL)", genislik: 18, sayisal: true },
        { baslik: "Maliyet (TL)", genislik: 18, sayisal: true },
        { baslik: "Kâr (TL)", genislik: 18, sayisal: true },
      ],
      satirlar: magazaSatis.map((m) => [
        m.ad,
        m.adet,
        kurusuExcelSayisi(m.satisKurus),
        kurusuExcelSayisi(m.maliyetKurus),
        kurusuExcelSayisi(m.karKurus),
      ]),
    },
    {
      ad: "Kullanıcı Satış",
      sutunlar: [
        { baslik: "Kullanıcı", genislik: 26 },
        { baslik: "Mağaza", genislik: 22 },
        { baslik: "Adet", genislik: 10 },
        { baslik: "Satış (TL)", genislik: 18, sayisal: true },
        { baslik: "Kâr (TL)", genislik: 18, sayisal: true },
      ],
      satirlar: kullaniciSatis.map((k) => [
        k.adSoyad,
        k.magaza,
        k.adet,
        kurusuExcelSayisi(k.satisKurus),
        kurusuExcelSayisi(k.karKurus),
      ]),
    },
    {
      ad: "Sevkiyat",
      sutunlar: [
        { baslik: "Durum", genislik: 20 },
        { baslik: "Adet", genislik: 12 },
      ],
      satirlar: transfer.map((t) => [
        TRANSFER_DURUM_ETIKET[t.durum as TransferDurum] ?? t.durum,
        t.adet,
      ]),
    },
    {
      ad: "Sayımlar",
      sutunlar: [
        { baslik: "Mağaza", genislik: 24 },
        { baslik: "Bitiş", genislik: 14 },
        { baslik: "Beklenen", genislik: 12 },
        { baslik: "Sayılan", genislik: 12 },
        { baslik: "Eksik", genislik: 12 },
        { baslik: "Fazla", genislik: 12 },
      ],
      satirlar: sayim.map((s) => [
        s.magaza,
        tarihYaz(s.bitisTarihi),
        s.beklenen,
        s.sayilan,
        s.eksik,
        s.fazla,
      ]),
    },
  ];

  const dosya = await excelUret(sayfalar);

  await logYaz(oturum, {
    islem: LOG_ISLEM.EXCEL_AKTAR,
    hedefTip: "Rapor",
    detay: `Rapor paketi · ${aralikMetni}`,
  });

  const damga = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return new Response(new Uint8Array(dosya), {
    headers: excelBasliklari(`rapor-${damga}.xlsx`),
  });
}
