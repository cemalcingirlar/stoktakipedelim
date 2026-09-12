import Link from "next/link";
import { Kart, SayiKarti } from "@/bilesenler/Kart";
import { kurusuTLYazSembollu } from "@/lib/para";
import { HAREKET_TIP_ETIKET, type HareketTip } from "@/lib/sabitler";
import {
  bekleyenSevkiyatlar,
  magazaStokOzeti,
  sonHareketler,
  vadesiGecenFaturalar,
} from "@/lib/sorgular";
import { tarihSaatYaz, tarihYaz } from "@/lib/tarih";
import { adminMi, oturumGerekli } from "@/lib/yetki";

export const metadata = { title: "Panel — Stok Takip" };

export default async function PanelSayfasi() {
  const oturum = await oturumGerekli();
  const yonetici = adminMi(oturum);

  const [ozetler, vadesiGecen, bekleyen, hareketler] = await Promise.all([
    magazaStokOzeti(),
    vadesiGecenFaturalar(),
    bekleyenSevkiyatlar(yonetici ? null : oturum.magazaId),
    sonHareketler(10),
  ]);

  const toplamAdet = ozetler.reduce((t, o) => t + o.adet, 0);
  const toplamDeger = ozetler.reduce((t, o) => t + o.degerKurus, 0);
  const vadesiGecenCihaz = vadesiGecen.reduce((t, f) => t + f._count.kalemler, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Panel</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Hoş geldiniz, {oturum.adSoyad}
          {oturum.magazaAdi ? ` · ${oturum.magazaAdi}` : " · Tüm mağazalar"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SayiKarti etiket="Toplam Stok" deger={`${toplamAdet}`} altBilgi="adet cihaz" />
        <SayiKarti etiket="Stok Değeri" deger={kurusuTLYazSembollu(toplamDeger)} altBilgi="alış fiyatı üzerinden" />
        <SayiKarti
          etiket="Vadesi Geçen"
          deger={`${vadesiGecen.length}`}
          altBilgi={`${vadesiGecenCihaz} cihaz · ödenmemiş fatura`}
          vurgu={vadesiGecen.length > 0 ? "tehlike" : "normal"}
        />
        <SayiKarti
          etiket="Bekleyen Sevkiyat"
          deger={`${bekleyen.length}`}
          altBilgi="onayınızı bekliyor"
          vurgu={bekleyen.length > 0 ? "uyari" : "normal"}
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
        <Kart baslik="Vadesi Geçen Faturalar">
          {vadesiGecen.length === 0 ? (
            <p className="text-sm text-slate-500">Vadesi geçmiş ödenmemiş fatura yok.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {vadesiGecen.slice(0, 8).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">{f.tedarikci.ad}</div>
                    <div className="text-xs text-slate-500">
                      {f.faturaNo} · {f._count.kalemler} cihaz · {f.magaza.ad}
                    </div>
                  </div>
                  <span className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    {tarihYaz(f.vadeTarihi)}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
