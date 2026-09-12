import Link from "next/link";
import { Kart } from "@/bilesenler/Kart";
import { TransferRozeti } from "@/bilesenler/TransferRozeti";
import { prisma } from "@/lib/prisma";
import { TRANSFER_DURUM, TRANSFER_KALEM_DURUM } from "@/lib/sabitler";
import { tarihSaatYaz } from "@/lib/tarih";
import { adminMi, oturumGerekli } from "@/lib/yetki";

export const metadata = { title: "Sevkiyatlar — Stok Takip" };

export default async function SevkiyatlarSayfasi() {
  const oturum = await oturumGerekli();
  const yonetici = adminMi(oturum);

  const transferler = await prisma.transfer.findMany({
    orderBy: [{ gonderimTarihi: "desc" }, { id: "desc" }],
    take: 100,
    include: {
      kaynakMagaza: { select: { id: true, ad: true } },
      hedefMagaza: { select: { id: true, ad: true } },
      gonderen: { select: { adSoyad: true } },
      kabulEden: { select: { adSoyad: true } },
      kalemler: { select: { durum: true } },
    },
  });

  const bekleyenlerim = transferler.filter(
    (t) =>
      (t.durum === TRANSFER_DURUM.BEKLIYOR || t.durum === TRANSFER_DURUM.KISMI_KABUL) &&
      (yonetici || t.hedefMagazaId === oturum.magazaId),
  );

  function kalemOzeti(kalemler: { durum: string }[]) {
    const kabul = kalemler.filter((k) => k.durum === TRANSFER_KALEM_DURUM.KABUL).length;
    const red = kalemler.filter((k) => k.durum === TRANSFER_KALEM_DURUM.RED).length;
    const bekleyen = kalemler.length - kabul - red;
    return { kabul, red, bekleyen, toplam: kalemler.length };
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sevkiyatlar</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Gönderilen cihazlar hedef mağaza okutup onaylayana kadar yolda sayılır.
          </p>
        </div>
        <Link
          href="/sevkiyat/yeni"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          + Yeni Sevkiyat
        </Link>
      </div>

      {bekleyenlerim.length > 0 ? (
        <Kart baslik={`Onayınızı Bekleyenler (${bekleyenlerim.length})`}>
          <ul className="divide-y divide-slate-100">
            {bekleyenlerim.map((t) => {
              const ozet = kalemOzeti(t.kalemler);
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800">
                      {t.kaynakMagaza.ad} → {t.hedefMagaza.ad}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t.transferNo} · {ozet.bekleyen} cihaz bekliyor · {t.gonderen.adSoyad} ·{" "}
                      {tarihSaatYaz(t.gonderimTarihi)}
                    </div>
                  </div>
                  <Link
                    href={`/sevkiyat/${t.id}`}
                    className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700"
                  >
                    Kabul Et
                  </Link>
                </li>
              );
            })}
          </ul>
        </Kart>
      ) : null}

      <Kart baslik="Tüm Sevkiyatlar">
        {transferler.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Henüz sevkiyat yapılmamış.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Sevkiyat No</th>
                  <th className="py-2 pr-3 font-medium">Güzergâh</th>
                  <th className="py-2 pr-3 text-right font-medium">Cihaz</th>
                  <th className="py-2 pr-3 font-medium">Durum</th>
                  <th className="py-2 pr-3 font-medium">Gönderen</th>
                  <th className="py-2 pr-3 font-medium">Kabul Eden</th>
                  <th className="py-2 font-medium">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transferler.map((t) => {
                  const ozet = kalemOzeti(t.kalemler);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="py-2 pr-3">
                        <Link
                          href={`/sevkiyat/${t.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {t.transferNo}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-slate-700">
                        {t.kaynakMagaza.ad} → {t.hedefMagaza.ad}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-700">
                        {ozet.toplam}
                        {ozet.toplam !== ozet.kabul ? (
                          <span className="ml-1 text-xs text-slate-400">
                            ({ozet.kabul} kabul{ozet.red ? `, ${ozet.red} red` : ""})
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">
                        <TransferRozeti durum={t.durum} />
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-600">
                        {t.gonderen.adSoyad}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-600">
                        {t.kabulEden?.adSoyad ?? "—"}
                      </td>
                      <td className="py-2 whitespace-nowrap text-slate-500">
                        {tarihSaatYaz(t.gonderimTarihi)}
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
