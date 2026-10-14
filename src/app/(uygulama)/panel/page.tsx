import Link from "next/link";
import { HareketGrafigi } from "@/bilesenler/HareketGrafigi";
import { Kart, SayiKarti } from "@/bilesenler/Kart";
import { GRAFIK_DONEMLERI, donemiCoz } from "@/lib/grafikDonem";
import { kurusuTLYazSembollu } from "@/lib/para";
import { HAREKET_TIP_ETIKET, type HareketTip } from "@/lib/sabitler";
import { hareketRaporu } from "@/lib/raporlar";
import {
  bekleyenSevkiyatlar,
  bugunSatilanlar,
  magazaStokOzeti,
  sonHareketler,
  vadesiGecenCihazSayisi,
} from "@/lib/sorgular";
import { inputTarih, saatYaz, tarihSaatYaz } from "@/lib/tarih";
import { adminMi, oturumGerekli, yetkiliMagazalar } from "@/lib/yetki";

export const metadata = { title: "Panel — Stok Takip" };

export default async function PanelSayfasi({ searchParams }: PageProps<"/panel">) {
  const oturum = await oturumGerekli();
  const yonetici = adminMi(oturum);

  const params = await searchParams;
  const donem = donemiCoz(Array.isArray(params.donem) ? params.donem[0] : params.donem);

  const kendiMagazalari = yonetici ? null : yetkiliMagazalar(oturum);

  const [ozetler, vadeDurumu, bugun, bekleyen, hareketler, kovalar] = await Promise.all([
    magazaStokOzeti(),
    vadesiGecenCihazSayisi(),
    bugunSatilanlar(kendiMagazalari),
    bekleyenSevkiyatlar(kendiMagazalari),
    sonHareketler(10),
    hareketRaporu(donem),
  ]);

  // Bugün satılanların tam listesi: cihaz listesinde satış tarihi bugüne
  // kısıtlanmış filtre. Panel ilk 10'u gösteriyor, bağlantı tamamını açıyor.
  const bugunku = inputTarih(new Date());
  const bugunCikanlarYolu = `/cihazlar?durum=SATILDI&satisBas=${bugunku}&satisBit=${bugunku}`;

  const toplamAdet = ozetler.reduce((t, o) => t + o.adet, 0);
  const toplamDeger = ozetler.reduce((t, o) => t + o.degerKurus, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Panel</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Hoş geldiniz, {oturum.adSoyad}
          {oturum.magazaAdlari.length > 0
            ? ` · ${oturum.magazaAdlari.join(", ")}`
            : " · Tüm mağazalar"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <SayiKarti etiket="Toplam Stok" deger={`${toplamAdet}`} altBilgi="adet cihaz" />
        <SayiKarti etiket="Stok Değeri" deger={kurusuTLYazSembollu(toplamDeger)} altBilgi="alış fiyatı üzerinden" />
        <SayiKarti
          etiket="Bugün Satılan"
          deger={`${bugun.adet}`}
          altBilgi={bugun.adet > 0 ? `${kurusuTLYazSembollu(bugun.ciroKurus)} ciro` : "bugün satış yok"}
          vurgu={bugun.adet > 0 ? "basari" : "normal"}
          yol={bugun.adet > 0 ? bugunCikanlarYolu : "/satis"}
        />
        <SayiKarti
          etiket="Vadesi Geçen"
          deger={`${vadeDurumu.toplam}`}
          altBilgi={
            vadeDurumu.toplam > 0
              ? `cihaz · ${vadeDurumu.stokta} tanesi stokta`
              : "ödemesi gecikmiş cihaz yok"
          }
          vurgu={vadeDurumu.toplam > 0 ? "tehlike" : "normal"}
          yol="/cihazlar?vade=gecen"
        />
        <SayiKarti
          etiket="Bekleyen Sevkiyat"
          deger={`${bekleyen.length}`}
          altBilgi="onayınızı bekliyor"
          vurgu={bekleyen.length > 0 ? "uyari" : "normal"}
          yol="/sevkiyat"
        />
      </div>

      <Kart baslik="Mağaza Bazlı Stok">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ozetler.map((o) => (
            <Link
              key={o.magazaId}
              href={`/cihazlar?magaza=${o.magazaId}`}
              className="rounded-lg border border-slate-200 p-3 transition hover:border-blue-300 hover:bg-blue-50"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">{o.ad}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                  {o.kod}
                </span>
              </div>
              <div className="mt-2 text-lg font-semibold tabular-nums text-slate-900">
                {kurusuTLYazSembollu(o.degerKurus)}
              </div>
              <div className="text-xs text-slate-500">{o.adet} adet cihaz</div>
            </Link>
          ))}
        </div>
      </Kart>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Kart
          baslikYolu={bugunCikanlarYolu}
          baslik="Bugün Stoktan Çıkanlar"
          eylem={
            bugun.adet > 0 ? (
              <span className="text-xs text-slate-500">
                {bugun.adet} cihaz · {kurusuTLYazSembollu(bugun.ciroKurus)} ciro ·{" "}
                <span className={bugun.karKurus >= 0 ? "text-emerald-700" : "text-red-600"}>
                  {kurusuTLYazSembollu(bugun.karKurus)} kâr
                </span>
              </span>
            ) : null
          }
        >
          {bugun.adet === 0 ? (
            <p className="text-sm text-slate-500">Bugün henüz satış yapılmadı.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {bugun.kalemler.slice(0, 10).map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <Link
                      href={`/cihazlar/${k.id}`}
                      className="truncate font-medium text-slate-800 underline-offset-2 hover:underline"
                    >
                      {k.marka} {k.model}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {k.seriNo ? `${k.seriNo} · ` : ""}
                      {k.magaza.ad}
                      {k.musteri ? ` · ${k.musteri.adSoyad}` : ""}
                      {k.satanKullanici ? ` · ${k.satanKullanici.adSoyad}` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block font-medium text-slate-800 tabular-nums">
                      {kurusuTLYazSembollu(k.satisFiyatiKurus ?? 0)}
                    </span>
                    <span className="block text-xs text-slate-500">{saatYaz(k.satisTarihi)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {bugun.adet > 10 ? (
            <p className="mt-2 text-xs text-slate-500">
              İlk 10 kayıt gösteriliyor;{" "}
              <Link
                href={bugunCikanlarYolu}
                className="text-sky-700 underline-offset-2 hover:underline"
              >
                tamamını görün ({bugun.adet} cihaz)
              </Link>
              .
            </p>
          ) : null}
        </Kart>

        <Kart baslik="Onay Bekleyen Sevkiyatlar">
          {bekleyen.length === 0 ? (
            <p className="text-sm text-slate-500">Onay bekleyen sevkiyat yok.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {bekleyen.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">
                      {t.kaynakMagaza.ad} → {t.hedefMagaza.ad}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t.transferNo} · {t._count.kalemler} cihaz · {t.gonderen.adSoyad}
                    </div>
                  </div>
                  <Link
                    href={`/sevkiyat/${t.id}`}
                    className="shrink-0 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    İncele
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Kart>
      </div>

      <div id="grafik" className="scroll-mt-4">
        <Kart
          baslik={`${donem.baslik} — Giriş ve Satış`}
          eylem={
            <div className="flex flex-wrap gap-1" data-test="donem-secici">
              {GRAFIK_DONEMLERI.map((d) => (
                <Link
                  key={d.anahtar}
                  href={`/panel?donem=${d.anahtar}#grafik`}
                  aria-current={d.anahtar === donem.anahtar ? "page" : undefined}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    d.anahtar === donem.anahtar
                      ? "bg-slate-800 text-white"
                      : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {d.etiket}
                </Link>
              ))}
            </div>
          }
        >
          <HareketGrafigi kovalar={kovalar} />
        </Kart>
      </div>

      <Kart baslik="Son Hareketler">
        {hareketler.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz hareket kaydı yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Tarih</th>
                  <th className="py-2 pr-3 font-medium">İşlem</th>
                  <th className="py-2 pr-3 font-medium">Cihaz</th>
                  <th className="py-2 pr-3 font-medium">Depo</th>
                  <th className="py-2 font-medium">Kullanıcı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hareketler.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-500">
                      {tarihSaatYaz(h.tarih)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-700">
                      {HAREKET_TIP_ETIKET[h.tip as HareketTip] ?? h.tip}
                    </td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/cihazlar/${h.stokKalemi.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {h.stokKalemi.marka} {h.stokKalemi.model}
                      </Link>
                      {h.stokKalemi.seriNo ? (
                        <span className="ml-1 text-xs text-slate-400">{h.stokKalemi.seriNo}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-600">
                      {h.kaynakMagaza?.ad ?? "—"}
                      {h.hedefMagaza ? ` → ${h.hedefMagaza.ad}` : ""}
                    </td>
                    <td className="py-2 whitespace-nowrap text-slate-600">{h.kullanici.adSoyad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Kart>
    </div>
  );
}
