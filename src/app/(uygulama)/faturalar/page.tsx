import Link from "next/link";
import { Kart } from "@/bilesenler/Kart";
import { Rozet } from "@/bilesenler/Rozet";
import { gorunurMagazaIdleri, magazaKosulu } from "@/lib/gorunurluk";
import { kurusuTLYazSembollu } from "@/lib/para";
import { prisma } from "@/lib/prisma";
import { vadeEtiketi } from "@/lib/vade";
import { tarihYaz } from "@/lib/tarih";
import { vadeDurumu } from "@/lib/vade";
import { adminMi, oturumGerekli } from "@/lib/yetki";

export const metadata = { title: "Alış Faturaları — Stok Takip" };

export default async function FaturalarSayfasi() {
  const oturum = await oturumGerekli();
  const bugun = new Date();

  // Fatura, girişinin yapıldığı depoya ait: kullanıcı yalnız kendi
  // mağazalarının alışlarını görür, başka mağazanın maliyetlerini görmez.
  const faturalar = await prisma.alisFaturasi.findMany({
    where: magazaKosulu(gorunurMagazaIdleri(oturum)),
    orderBy: [{ faturaTarihi: "desc" }, { id: "desc" }],
    take: 100,
    include: {
      tedarikci: { select: { ad: true } },
      magaza: { select: { ad: true } },
      olusturan: { select: { adSoyad: true } },
      kalemler: { select: { alisFiyatiKurus: true } },
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">
          Alış Faturaları
        </h1>
        {adminMi(oturum) ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Tedarikçi dosyasını buradan da yüklenebilsin: fatura girmeye
                gelen kullanıcı önce bu ekrana bakıyor, Cihazlar'a dönmek
                gereksiz bir adımdı. */}
            <Link
              href="/cihazlar/tedarikci-faturasi"
              data-test="tedarikci-faturasi-yukle"
              className="rounded-lg border border-blue-300 bg-blue-50 px-3.5 py-2 text-sm font-medium text-blue-800 transition hover:bg-blue-100"
            >
              Tedarikçi Faturası Yükle
            </Link>
            <Link
              href="/faturalar/yeni"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              + Yeni Alış Faturası
            </Link>
          </div>
        ) : null}
      </div>

      <Kart>
        {faturalar.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Henüz alış faturası girilmemiş.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Tarih</th>
                  <th className="py-2 pr-3 font-medium">Fatura No</th>
                  <th className="py-2 pr-3 font-medium">Tedarikçi</th>
                  <th className="py-2 pr-3 font-medium">Depo</th>
                  <th className="py-2 pr-3 text-right font-medium">Cihaz</th>
                  <th className="py-2 pr-3 text-right font-medium">Tutar</th>
                  <th className="py-2 pr-3 font-medium">Vade</th>
                  <th className="py-2 font-medium">Giren</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {faturalar.map((f) => {
                  const vade = vadeDurumu(f, bugun);
                  const tutar = f.kalemler.reduce(
                    (t, k) => t + k.alisFiyatiKurus,
                    0,
                  );
                  return (
                    <tr
                      key={f.id}
                      className={vade.satirSinifi || "hover:bg-slate-50"}
                    >
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-600">
                        {tarihYaz(f.faturaTarihi)}
                      </td>
                      <td className="py-2 pr-3">
                        <Link
                          href={`/faturalar/${f.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {f.faturaNo}
                        </Link>
                        {/* İptal edilen fatura listede canlı görünmemeli:
                            tutarı raporlara girmiyor, kullanıcı da bunu
                            listede anlayabilmeli. */}
                        {f.iptalEdildi ? (
                          <span
                            data-test="fatura-iptal-rozeti"
                            className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                          >
                            İptal
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">
                        {f.tedarikci.ad}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">
                        {f.magaza.ad}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-700">
                        {f.kalemler.length}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-800">
                        {kurusuTLYazSembollu(tutar)}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {f.vadeGun === 0 ? (
                          <span className="text-slate-400">Vadesiz</span>
                        ) : (
                          <>
                            <Rozet
                              ton={
                                vade.durum === "GECTI"
                                  ? "kirmizi"
                                  : vade.durum === "YAKLASIYOR"
                                    ? "sari"
                                    : vade.durum === "ODENDI"
                                      ? "yesil"
                                      : "nötr"
                              }
                            >
                              {vade.etiket}
                            </Rozet>
                            <span className="ml-1 text-xs text-slate-400">
                              {vadeEtiketi(f.vadeGun)}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="py-2 whitespace-nowrap text-slate-600">
                        {f.olusturan.adSoyad}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Kart>
    </div>
  );
}
