import Link from "next/link";
import { notFound } from "next/navigation";
import { Kart } from "@/bilesenler/Kart";
import { DurumRozeti, Rozet } from "@/bilesenler/Rozet";
import { kurusuTLYazSembollu } from "@/lib/para";
import { prisma } from "@/lib/prisma";
import { VADE_ETIKET } from "@/lib/sabitler";
import { tarihSaatYaz, tarihYaz } from "@/lib/tarih";
import { vadeDurumu } from "@/lib/vade";
import { adminMi, oturumGerekli } from "@/lib/yetki";
import { VadeDugmesi } from "./VadeDugmesi";

export const metadata = { title: "Fatura Detayı — Stok Takip" };

function Satir({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <dt className="text-sm text-slate-500">{etiket}</dt>
      <dd className="text-right text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

export default async function FaturaDetaySayfasi({ params }: PageProps<"/faturalar/[id]">) {
  const oturum = await oturumGerekli();
  const { id } = await params;
  const faturaId = Number(id);
  if (!Number.isInteger(faturaId)) notFound();

  const fatura = await prisma.alisFaturasi.findUnique({
    where: { id: faturaId },
    include: {
      tedarikci: true,
      magaza: true,
      olusturan: { select: { adSoyad: true } },
      kalemler: {
        include: {
          kategori: { select: { ad: true } },
          altKategori: { select: { ad: true } },
          magaza: { select: { ad: true } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!fatura) notFound();

  const bugun = new Date();
  const vade = vadeDurumu(fatura, bugun);
  const toplam = fatura.kalemler.reduce((t, k) => t + k.alisFiyatiKurus, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Fatura {fatura.faturaNo}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {fatura.tedarikci.ad} · {tarihYaz(fatura.faturaTarihi)}
          </p>
        </div>
        <Link
          href="/faturalar"
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ← Faturalar
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Kart baslik="Fatura Bilgileri" className="lg:col-span-1">
          <dl>
            <Satir etiket="Tedarikçi">{fatura.tedarikci.ad}</Satir>
            <Satir etiket="Fatura No">{fatura.faturaNo}</Satir>
            <Satir etiket="Fatura Tarihi">{tarihYaz(fatura.faturaTarihi)}</Satir>
            <Satir etiket="Giriş Deposu">{fatura.magaza.ad}</Satir>
            <Satir etiket="Cihaz Adedi">{fatura.kalemler.length}</Satir>
            <Satir etiket="Toplam Tutar">{kurusuTLYazSembollu(toplam)}</Satir>
            <Satir etiket="Vade">
              {fatura.vadeGun === 0 ? (
                <span className="text-slate-400">Vadesiz</span>
              ) : (
                <>
                  {VADE_ETIKET[fatura.vadeGun]} · {tarihYaz(fatura.vadeTarihi)}
                </>
              )}
            </Satir>
            {fatura.vadeGun > 0 ? (
              <Satir etiket="Vade Durumu">
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
              </Satir>
            ) : null}
            {fatura.odemeTarihi ? (
              <Satir etiket="Ödeme Tarihi">{tarihYaz(fatura.odemeTarihi)}</Satir>
            ) : null}
            <Satir etiket="Girişi Yapan">{fatura.olusturan.adSoyad}</Satir>
            <Satir etiket="Kayıt Zamanı">{tarihSaatYaz(fatura.createdAt)}</Satir>
            {fatura.not ? <Satir etiket="Not">{fatura.not}</Satir> : null}
          </dl>

          {adminMi(oturum) && fatura.vadeGun > 0 ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <VadeDugmesi faturaId={fatura.id} odendi={fatura.vadeOdendi} />
            </div>
          ) : null}
        </Kart>

        <Kart baslik={`Cihazlar (${fatura.kalemler.length})`} className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Kategori</th>
                  <th className="py-2 pr-3 font-medium">Cihaz</th>
                  <th className="py-2 pr-3 font-medium">Seri No</th>
                  <th className="py-2 pr-3 font-medium">Depo</th>
                  <th className="py-2 pr-3 text-right font-medium">Alış</th>
                  <th className="py-2 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fatura.kalemler.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-3 text-slate-600">
                      {k.kategori.ad}
                      {k.altKategori ? (
                        <span className="block text-xs text-slate-400">{k.altKategori.ad}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/cihazlar/${k.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {k.marka} {k.model}
                      </Link>
                      {k.renk || k.kapasite ? (
                        <span className="block text-xs text-slate-400">
                          {[k.renk, k.kapasite].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-700">
                      {k.seriNo ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{k.magaza.ad}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-800">
                      {kurusuTLYazSembollu(k.alisFiyatiKurus)}
                    </td>
                    <td className="py-2">
                      <DurumRozeti durum={k.durum} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Kart>
      </div>
    </div>
  );
}
