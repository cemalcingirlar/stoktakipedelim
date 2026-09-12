import Link from "next/link";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { Kart, SayiKarti } from "@/bilesenler/Kart";
import { Rozet } from "@/bilesenler/Rozet";
import { TransferRozeti } from "@/bilesenler/TransferRozeti";
import { kurusuTLYaz, kurusuTLYazSembollu } from "@/lib/para";
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
import { VADE_ETIKET } from "@/lib/sabitler";
import { inputTarih, tarihYaz } from "@/lib/tarih";
import { oturumGerekli } from "@/lib/yetki";

export const metadata = { title: "Raporlar — Stok Takip" };

function tarihCoz(deger: string | string[] | undefined): Date | null {
  if (typeof deger !== "string" || !deger.trim()) return null;
  const d = new Date(deger);
  return Number.isNaN(d.getTime()) ? null : d;
}

function Tablo({
  basliklar,
  satirlar,
  bos,
}: {
  basliklar: { ad: string; sagaYasli?: boolean }[];
  satirlar: (string | number | React.ReactNode)[][];
  bos: string;
}) {
  if (satirlar.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">{bos}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            {basliklar.map((b) => (
              <th key={b.ad} className={`py-2 pr-3 font-medium ${b.sagaYasli ? "text-right" : ""}`}>
                {b.ad}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {satirlar.map((satir, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {satir.map((hucre, j) => (
                <td
                  key={j}
                  className={`py-2 pr-3 ${basliklar[j]?.sagaYasli ? "text-right tabular-nums" : ""}`}
                >
                  {hucre}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function RaporSayfasi({ searchParams }: PageProps<"/rapor">) {
  await oturumGerekli();
  const params = await searchParams;

  const aralik: RaporAraligi = {
    baslangic: tarihCoz(params.bas),
    bitis: tarihCoz(params.bit),
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

  const toplamAdet = stok.reduce((t, s) => t + s.adet, 0);
  const toplamDeger = stok.reduce((t, s) => t + s.degerKurus, 0);
  const vadesiGecen = vade.filter((v) => v.gecmisMi);
  const vadeBorcu = vade.reduce((t, v) => t + v.tutarKurus, 0);

  const excelSorgu = new URLSearchParams();
  if (params.bas && typeof params.bas === "string") excelSorgu.set("bas", params.bas);
  if (params.bit && typeof params.bit === "string") excelSorgu.set("bit", params.bit);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Raporlar</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Stok ve vade raporları anlık durumu, satış ve hareket raporları seçili tarih aralığını
            gösterir.
          </p>
        </div>
        <a
          href={`/rapor/excel${excelSorgu.toString() ? `?${excelSorgu}` : ""}`}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
        >
          Tümünü Excel&apos;e Aktar
        </a>
      </div>

      <form method="get" action="/rapor" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="bas" className="mb-1 block text-xs font-medium text-slate-600">
              Başlangıç
            </label>
            <input id="bas" name="bas" type="date" defaultValue={inputTarih(aralik.baslangic)} className={GIRDI_SINIFI} />
          </div>
          <div>
            <label htmlFor="bit" className="mb-1 block text-xs font-medium text-slate-600">
              Bitiş
            </label>
            <input id="bit" name="bit" type="date" defaultValue={inputTarih(aralik.bitis)} className={GIRDI_SINIFI} />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900"
          >
            Uygula
          </button>
          <Link
            href="/rapor"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Temizle
          </Link>
          <span className="text-xs text-slate-500">
            {aralik.baslangic || aralik.bitis
              ? `Seçili aralık: ${aralik.baslangic ? tarihYaz(aralik.baslangic) : "başlangıçtan"} – ${aralik.bitis ? tarihYaz(aralik.bitis) : "bugüne"}`
              : "Tüm zamanlar"}
          </span>
        </div>
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SayiKarti etiket="Stoktaki Cihaz" deger={`${toplamAdet}`} altBilgi="adet" />
        <SayiKarti etiket="Stok Değeri" deger={kurusuTLYazSembollu(toplamDeger)} altBilgi="alış fiyatı" />
        <SayiKarti
          etiket="Aralıktaki Satış"
          deger={kurusuTLYazSembollu(girisCikis.satisTutari)}
          altBilgi={`${girisCikis.satisAdedi} cihaz`}
          vurgu="basari"
        />
        <SayiKarti
          etiket="Aralıktaki Kâr"
          deger={kurusuTLYazSembollu(girisCikis.karKurus)}
          altBilgi="satış − alış"
          vurgu={girisCikis.karKurus < 0 ? "tehlike" : "basari"}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Kart baslik="Mağaza Bazlı Stok">
          <Tablo
            basliklar={[{ ad: "Mağaza" }, { ad: "Adet", sagaYasli: true }, { ad: "Değer", sagaYasli: true }]}
            satirlar={stok.map((s) => [s.ad, s.adet, kurusuTLYaz(s.degerKurus)])}
            bos="Stokta cihaz yok."
          />
        </Kart>

        <Kart baslik="Kategori Bazlı Stok">
          <Tablo
            basliklar={[{ ad: "Kategori" }, { ad: "Adet", sagaYasli: true }, { ad: "Değer", sagaYasli: true }]}
            satirlar={kategori.map((k) => [k.ad, k.adet, kurusuTLYaz(k.degerKurus)])}
            bos="Stokta cihaz yok."
          />
        </Kart>
      </div>

      <Kart
        baslik="Vade Raporu"
        eylem={
          <span className="text-sm text-slate-600">
            {vadesiGecen.length} geçmiş · toplam borç{" "}
            <span className="font-medium text-slate-900">{kurusuTLYazSembollu(vadeBorcu)}</span>
          </span>
        }
      >
        <Tablo
          basliklar={[
            { ad: "Durum" },
            { ad: "Tedarikçi" },
            { ad: "Fatura" },
            { ad: "Depo" },
            { ad: "Vade" },
            { ad: "Vade Tarihi" },
            { ad: "Cihaz", sagaYasli: true },
            { ad: "Tutar", sagaYasli: true },
          ]}
          satirlar={vade.map((v) => [
            <Rozet key="d" ton={v.gecmisMi ? "kirmizi" : "sari"}>
              {v.gecmisMi ? "Geçti" : "Bekliyor"}
            </Rozet>,
            v.tedarikci,
            <Link key="f" href={`/faturalar/${v.id}`} className="text-blue-600 hover:underline">
              {v.faturaNo}
            </Link>,
            v.magaza,
            VADE_ETIKET[v.vadeGun] ?? `${v.vadeGun} gün`,
            tarihYaz(v.vadeTarihi),
            v.cihazAdedi,
            kurusuTLYaz(v.tutarKurus),
          ])}
          bos="Ödenmemiş vadeli fatura yok."
        />
      </Kart>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Kart baslik="Mağaza Bazlı Satış ve Kâr">
          <Tablo
            basliklar={[
              { ad: "Mağaza" },
              { ad: "Adet", sagaYasli: true },
              { ad: "Satış", sagaYasli: true },
              { ad: "Kâr", sagaYasli: true },
            ]}
            satirlar={magazaSatis.map((m) => [
              m.ad,
              m.adet,
              kurusuTLYaz(m.satisKurus),
              <span key="k" className={m.karKurus < 0 ? "text-red-600" : "text-emerald-700"}>
                {kurusuTLYaz(m.karKurus)}
              </span>,
            ])}
            bos="Seçili aralıkta satış yok."
          />
        </Kart>

        <Kart baslik="Kullanıcı Bazlı Satış">
          <Tablo
            basliklar={[
              { ad: "Kullanıcı" },
              { ad: "Mağaza" },
              { ad: "Adet", sagaYasli: true },
              { ad: "Satış", sagaYasli: true },
              { ad: "Kâr", sagaYasli: true },
            ]}
            satirlar={kullaniciSatis.map((k) => [
              k.adSoyad,
              k.magaza,
              k.adet,
              kurusuTLYaz(k.satisKurus),
              <span key="k" className={k.karKurus < 0 ? "text-red-600" : "text-emerald-700"}>
                {kurusuTLYaz(k.karKurus)}
              </span>,
            ])}
            bos="Seçili aralıkta satış yok."
          />
        </Kart>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Kart baslik="Giriş / Çıkış Özeti">
          <Tablo
            basliklar={[{ ad: "Kalem" }, { ad: "Adet", sagaYasli: true }, { ad: "Tutar", sagaYasli: true }]}
            satirlar={[
              ["Stok girişi", girisCikis.girisAdedi, kurusuTLYaz(girisCikis.girisTutari)],
              ["Satış", girisCikis.satisAdedi, kurusuTLYaz(girisCikis.satisTutari)],
              ["Satılanların maliyeti", girisCikis.satisAdedi, kurusuTLYaz(girisCikis.satilanMaliyet)],
              [
                "Kâr",
                "",
                <span key="k" className={girisCikis.karKurus < 0 ? "text-red-600" : "text-emerald-700"}>
                  {kurusuTLYaz(girisCikis.karKurus)}
                </span>,
              ],
            ]}
            bos=""
          />
        </Kart>

        <Kart baslik="Sevkiyat Durumları">
          <Tablo
            basliklar={[{ ad: "Durum" }, { ad: "Adet", sagaYasli: true }]}
            satirlar={transfer.map((t) => [<TransferRozeti key="d" durum={t.durum} />, t.adet])}
            bos="Seçili aralıkta sevkiyat yok."
          />
        </Kart>
      </div>

      <Kart baslik="Tamamlanan Sayımlar">
        <Tablo
          basliklar={[
            { ad: "Mağaza" },
            { ad: "Tarih" },
            { ad: "Beklenen", sagaYasli: true },
            { ad: "Sayılan", sagaYasli: true },
            { ad: "Eksik", sagaYasli: true },
            { ad: "Fazla", sagaYasli: true },
            { ad: "" },
          ]}
          satirlar={sayim.map((s) => [
            s.magaza,
            tarihYaz(s.bitisTarihi),
            s.beklenen,
            <span key="s" className="text-emerald-700">
              {s.sayilan}
            </span>,
            <span key="e" className="text-amber-700">
              {s.eksik}
            </span>,
            <span key="f" className="text-violet-700">
              {s.fazla}
            </span>,
            <Link key="l" href={`/sayim/${s.id}`} className="text-blue-600 hover:underline">
              Detay
            </Link>,
          ])}
          bos="Tamamlanmış sayım yok."
        />
      </Kart>
    </div>
  );
}
