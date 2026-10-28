import { Link } from "@/bilesenler/Bag";
import { HareketGrafigi } from "@/bilesenler/HareketGrafigi";
import { Kart, SayiKarti } from "@/bilesenler/Kart";
import {
  GRAFIK_DONEMLERI,
  GRAFIK_OLCULERI,
  donemiCoz,
  olcuEtiketleri,
  olcuyuCoz,
  panelAdresi,
} from "@/lib/grafikDonem";
import {
  PANEL_URUN_SAYISI,
  URUN_DONEMLERI,
  urunAdi,
  urunDonemBaslangici,
  urunDonemiCoz,
} from "@/lib/urunSiralamasi";
import { kurusuTLYaz, kurusuTLYazSembollu } from "@/lib/para";
import { HAREKET_TIP_ETIKET, type HareketTip } from "@/lib/sabitler";
import {
  hareketRaporu,
  enCokSatanUrunler,
  kullaniciSatisRaporu,
  magazaSatisRaporu,
  stoktaEnCokUrunler,
} from "@/lib/raporlar";
import {
  SATIS_DONEMLERI,
  satisDonemAraligi,
  satisDonemiCoz,
  satisToplami,
} from "@/lib/satisDonemi";
import {
  bekleyenSevkiyatlar,
  bugunSatilanlar,
  magazaStokOzeti,
  sonHareketler,
  vadesiGecenCihazSayisi,
} from "@/lib/sorgular";
import { inputTarih, saatYaz, tarihSaatYaz } from "@/lib/tarih";
import { gorunurMagazaIdleri } from "@/lib/gorunurluk";
import { oturumGerekli } from "@/lib/yetki";

export const metadata = { title: "Panel — Stok Takip" };

export default async function PanelSayfasi({
  searchParams,
}: PageProps<"/panel">) {
  const oturum = await oturumGerekli();

  const params = await searchParams;
  const donem = donemiCoz(
    Array.isArray(params.donem) ? params.donem[0] : params.donem,
  );
  const satisDonemi = satisDonemiCoz(
    Array.isArray(params.satisDonem) ? params.satisDonem[0] : params.satisDonem,
  );
  const satisAraligi = satisDonemAraligi(satisDonemi);
  const olcu = olcuyuCoz(
    Array.isArray(params.olcu) ? params.olcu[0] : params.olcu,
  );
  const urunDonemi = urunDonemiCoz(
    Array.isArray(params.urunDonem) ? params.urunDonem[0] : params.urunDonem,
  );
  const secimler = {
    donem: donem.anahtar,
    satisDonem: satisDonemi.anahtar,
    olcu,
    urunDonem: urunDonemi.anahtar,
  };

  // Tek kural: yönetici her mağazayı görür, diğer herkes yalnız yetkili
  // olduklarını. Panelin bütün kartları, dökümleri ve grafiği aynı kısıttan
  // geçiyor; biri atlanırsa ekrandaki rakamlar birbirini tutmaz.
  const gorunur = gorunurMagazaIdleri(oturum);

  const [
    ozetler,
    vadeDurumu,
    bugun,
    bekleyen,
    hareketler,
    kovalar,
    magazaSatislari,
    personelSatislari,
    stoktakiUrunler,
    satanUrunler,
  ] = await Promise.all([
    magazaStokOzeti(gorunur),
    vadesiGecenCihazSayisi(gorunur),
    bugunSatilanlar(gorunur),
    bekleyenSevkiyatlar(gorunur),
    sonHareketler(gorunur, 10),
    hareketRaporu(donem, gorunur),
    magazaSatisRaporu(satisAraligi, gorunur),
    kullaniciSatisRaporu(satisAraligi, gorunur),
    stoktaEnCokUrunler(gorunur, PANEL_URUN_SAYISI),
    enCokSatanUrunler(
      urunDonemBaslangici(urunDonemi),
      gorunur,
      PANEL_URUN_SAYISI,
    ),
  ]);

  const magazaToplami = satisToplami(magazaSatislari);
  const personelToplami = satisToplami(personelSatislari);

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
        <SayiKarti
          etiket="Toplam Stok"
          deger={`${toplamAdet}`}
          altBilgi="adet cihaz"
        />
        <SayiKarti
          etiket="Stok Değeri"
          deger={kurusuTLYazSembollu(toplamDeger)}
          altBilgi="alış fiyatı üzerinden"
        />
        <SayiKarti
          etiket="Bugün Satılan"
          deger={`${bugun.adet}`}
          altBilgi={
            bugun.adet > 0
              ? `${kurusuTLYazSembollu(bugun.ciroKurus)} ciro${
                  bugun.aktarimAdedi > 0
                    ? ` · ${bugun.aktarimAdedi} sat-geri al`
                    : ""
                }`
              : "bugün satış yok"
          }
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
                <span className="text-sm font-medium text-slate-800">
                  {o.ad}
                </span>
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
                {bugun.adet} cihaz · {kurusuTLYazSembollu(bugun.ciroKurus)} ciro
                ·{" "}
                <span
                  className={
                    bugun.karKurus >= 0 ? "text-emerald-700" : "text-red-600"
                  }
                >
                  {kurusuTLYazSembollu(bugun.karKurus)} kâr
                </span>
              </span>
            ) : null
          }
        >
          {bugun.adet === 0 ? (
            <p className="text-sm text-slate-500">
              Bugün henüz satış yapılmadı.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {bugun.kalemler.slice(0, 10).map((k) => (
                <li
                  key={k.anahtar}
                  data-test={
                    k.aktarimMi ? "bugun-aktarim-satisi" : "bugun-cihaz-satisi"
                  }
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/cihazlar/${k.cihazId}`}
                      className="truncate font-medium text-slate-800 underline-offset-2 hover:underline"
                    >
                      {k.marka} {k.model}
                    </Link>
                    {/* Aktarım satışında cihaz stokta kalıyor; cihaz
                        listesinde "satıldı" görünmediği için işaretleniyor. */}
                    {k.aktarimMi ? (
                      <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-800">
                        sat-geri al
                      </span>
                    ) : null}
                    <div className="text-xs text-slate-500">
                      {k.seriNo ? `${k.seriNo} · ` : ""}
                      {k.magazaAdi}
                      {k.musteriAdSoyad ? ` · ${k.musteriAdSoyad}` : ""}
                      {k.satanAdSoyad ? ` · ${k.satanAdSoyad}` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block font-medium text-slate-800 tabular-nums">
                      {kurusuTLYazSembollu(k.satisFiyatiKurus)}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {saatYaz(k.satisTarihi)}
                    </span>
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
                stoktan çıkanların tamamını görün
              </Link>
              . Sat-geri al işlemlerinde cihaz stokta kaldığı için o liste
              onları içermiyor.
            </p>
          ) : null}
        </Kart>

        <Kart baslik="Onay Bekleyen Sevkiyatlar">
          {bekleyen.length === 0 ? (
            <p className="text-sm text-slate-500">
              Onay bekleyen sevkiyat yok.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {bekleyen.slice(0, 8).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">
                      {t.kaynakMagaza.ad} → {t.hedefMagaza.ad}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t.transferNo} · {t._count.kalemler} cihaz ·{" "}
                      {t.gonderen.adSoyad}
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

      {/* ------------------------------------- satış dökümleri */}
      <div id="satislar" className="scroll-mt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">
            Satış Dökümü — {satisDonemi.baslik}
          </h2>
          <div className="flex flex-wrap gap-1" data-test="satis-donem-secici">
            {SATIS_DONEMLERI.map((d) => (
              <Link
                key={d.anahtar}
                href={`/panel?donem=${donem.anahtar}&satisDonem=${d.anahtar}#satislar`}
                aria-current={
                  d.anahtar === satisDonemi.anahtar ? "page" : undefined
                }
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  d.anahtar === satisDonemi.anahtar
                    ? "bg-slate-800 text-white"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {d.etiket}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Kart
            baslik="Personel Bazlı Satış"
            eylem={
              personelToplami.adet > 0 ? (
                <span className="text-xs text-slate-500">
                  {personelToplami.adet} cihaz ·{" "}
                  {kurusuTLYazSembollu(personelToplami.satisKurus)} ·{" "}
                  <span
                    className={
                      personelToplami.karKurus >= 0
                        ? "text-emerald-700"
                        : "text-red-600"
                    }
                  >
                    {kurusuTLYazSembollu(personelToplami.karKurus)} kâr
                  </span>
                </span>
              ) : null
            }
          >
            {personelSatislari.length === 0 ? (
              <p className="text-sm text-slate-500">
                {satisDonemi.baslik} satış yapılmadı.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table data-test="personel-satis" className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-medium">Personel</th>
                      <th className="py-2 pr-3 font-medium">Mağaza</th>
                      <th className="py-2 pr-3 text-right font-medium">Adet</th>
                      <th className="py-2 pr-3 text-right font-medium">
                        Satış
                      </th>
                      <th className="py-2 text-right font-medium">Kâr</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {personelSatislari.map((k) => (
                      <tr key={`${k.adSoyad}-${k.magaza}`}>
                        <td className="py-2 pr-3 font-medium text-slate-800">
                          {k.adSoyad}
                        </td>
                        <td className="py-2 pr-3 text-slate-600">{k.magaza}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {k.adet}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {kurusuTLYaz(k.satisKurus)}
                        </td>
                        <td
                          className={`py-2 text-right tabular-nums ${
                            k.karKurus < 0 ? "text-red-600" : "text-emerald-700"
                          }`}
                        >
                          {kurusuTLYaz(k.karKurus)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Kart>

          <Kart
            baslik="Mağaza Bazlı Satış"
            eylem={
              magazaToplami.adet > 0 ? (
                <span className="text-xs text-slate-500">
                  {magazaToplami.adet} cihaz ·{" "}
                  {kurusuTLYazSembollu(magazaToplami.satisKurus)} ·{" "}
                  <span
                    className={
                      magazaToplami.karKurus >= 0
                        ? "text-emerald-700"
                        : "text-red-600"
                    }
                  >
                    {kurusuTLYazSembollu(magazaToplami.karKurus)} kâr
                  </span>
                </span>
              ) : null
            }
          >
            {magazaSatislari.length === 0 ? (
              <p className="text-sm text-slate-500">
                {satisDonemi.baslik} satış yapılmadı.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table data-test="magaza-satis" className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-medium">Mağaza</th>
                      <th className="py-2 pr-3 text-right font-medium">Adet</th>
                      <th className="py-2 pr-3 text-right font-medium">
                        Satış
                      </th>
                      <th className="py-2 text-right font-medium">Kâr</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {magazaSatislari.map((m) => (
                      <tr key={m.ad}>
                        <td className="py-2 pr-3 font-medium text-slate-800">
                          {m.ad}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {m.adet}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {kurusuTLYaz(m.satisKurus)}
                        </td>
                        <td
                          className={`py-2 text-right tabular-nums ${
                            m.karKurus < 0 ? "text-red-600" : "text-emerald-700"
                          }`}
                        >
                          {kurusuTLYaz(m.karKurus)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Kart>
        </div>
      </div>

      <div id="grafik" className="scroll-mt-4">
        <Kart
          baslik={`${donem.baslik} — ${olcuEtiketleri(olcu).baslik}`}
          eylem={
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-1" data-test="olcu-secici">
                {GRAFIK_OLCULERI.map((o) => (
                  <Link
                    key={o.anahtar}
                    href={panelAdresi(
                      { ...secimler, olcu: o.anahtar },
                      "grafik",
                    )}
                    data-test={`olcu-${o.anahtar}`}
                    aria-current={o.anahtar === olcu ? "page" : undefined}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      o.anahtar === olcu
                        ? "bg-emerald-600 text-white"
                        : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {o.etiket}
                  </Link>
                ))}
              </div>
              <div className="flex flex-wrap gap-1" data-test="donem-secici">
                {GRAFIK_DONEMLERI.map((d) => (
                  <Link
                    key={d.anahtar}
                    href={panelAdresi(
                      { ...secimler, donem: d.anahtar },
                      "grafik",
                    )}
                    aria-current={
                      d.anahtar === donem.anahtar ? "page" : undefined
                    }
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
            </div>
          }
        >
          <HareketGrafigi kovalar={kovalar} olcu={olcu} />
        </Kart>
      </div>

      {/* Stokta ve satışta öne çıkan ürünler. "Ürün" burada marka + model:
          bir cihaz bir satır olduğu için soru ancak gruplanınca cevaplanıyor. */}
      <div
        id="urunler"
        className="grid scroll-mt-4 grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <Kart baslik="Stokta En Çok Bulunan Ürünler">
          {stoktakiUrunler.length === 0 ? (
            <p className="text-sm text-slate-500">Stokta cihaz yok.</p>
          ) : (
            <ol data-test="stokta-en-cok" className="space-y-2">
              {stoktakiUrunler.map((u, sira) => (
                <li
                  key={`${u.marka}|${u.model}`}
                  data-test="stokta-urun-satiri"
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="w-4 shrink-0 text-xs text-slate-400">
                      {sira + 1}.
                    </span>
                    <span className="truncate text-slate-700">
                      {urunAdi(u)}
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-slate-600">
                    <span data-test="urun-adet" className="font-medium">
                      {u.adet}
                    </span>{" "}
                    adet
                    <span className="ml-2 text-xs text-slate-400">
                      {kurusuTLYazSembollu(u.tutarKurus)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Kart>

        <Kart
          baslik="En Çok Satan Ürünler"
          eylem={
            <div className="flex flex-wrap gap-1" data-test="urun-donem-secici">
              {URUN_DONEMLERI.map((d) => (
                <Link
                  key={d.anahtar}
                  href={panelAdresi(
                    { ...secimler, urunDonem: d.anahtar },
                    "urunler",
                  )}
                  data-test={`urun-donem-${d.anahtar}`}
                  aria-current={
                    d.anahtar === urunDonemi.anahtar ? "page" : undefined
                  }
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    d.anahtar === urunDonemi.anahtar
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
          {satanUrunler.length === 0 ? (
            <p data-test="satan-urun-yok" className="text-sm text-slate-500">
              {urunDonemi.baslik.charAt(0).toUpperCase() +
                urunDonemi.baslik.slice(1)}{" "}
              satış yok.
            </p>
          ) : (
            <ol data-test="en-cok-satan" className="space-y-2">
              {satanUrunler.map((u, sira) => (
                <li
                  key={`${u.marka}|${u.model}`}
                  data-test="satan-urun-satiri"
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="w-4 shrink-0 text-xs text-slate-400">
                      {sira + 1}.
                    </span>
                    <span className="truncate text-slate-700">
                      {urunAdi(u)}
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-slate-600">
                    <span data-test="urun-adet" className="font-medium">
                      {u.adet}
                    </span>{" "}
                    adet
                    <span className="ml-2 text-xs text-slate-400">
                      {kurusuTLYazSembollu(u.tutarKurus)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
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
                        <span className="ml-1 text-xs text-slate-400">
                          {h.stokKalemi.seriNo}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-600">
                      {h.kaynakMagaza?.ad ?? "—"}
                      {h.hedefMagaza ? ` → ${h.hedefMagaza.ad}` : ""}
                    </td>
                    <td className="py-2 whitespace-nowrap text-slate-600">
                      {h.kullanici.adSoyad}
                    </td>
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
