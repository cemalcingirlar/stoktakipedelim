import Link from "next/link";
import { Kart } from "@/bilesenler/Kart";
import { Rozet } from "@/bilesenler/Rozet";
import { prisma } from "@/lib/prisma";
import { SAYIM_DURUM, STOK_DURUM } from "@/lib/sabitler";
import { tarihSaatYaz } from "@/lib/tarih";
import { adminMi, oturumGerekli } from "@/lib/yetki";
import { SayimBaslatFormu } from "./SayimBaslatFormu";

export const metadata = { title: "Stok Sayımı — Stok Takip" };

export default async function SayimSayfasi() {
  const oturum = await oturumGerekli();
  const yonetici = adminMi(oturum);

  const [magazalar, sayimlar, stokGruplari] = await Promise.all([
    prisma.magaza.findMany({
      where: {
        aktif: true,
        ...(yonetici ? {} : { id: oturum.magazaId ?? -1 }),
      },
      orderBy: { kod: "asc" },
    }),
    prisma.sayim.findMany({
      orderBy: [{ baslangicTarihi: "desc" }, { id: "desc" }],
      take: 50,
      include: {
        magaza: { select: { ad: true } },
        baslatan: { select: { adSoyad: true } },
        kapatan: { select: { adSoyad: true } },
        kalemler: { select: { beklenen: true, sayildi: true } },
      },
    }),
    prisma.stokKalemi.groupBy({
      by: ["magazaId"],
      where: { durum: STOK_DURUM.STOKTA },
      _count: { _all: true },
    }),
  ]);

  const stokHarita = new Map(stokGruplari.map((g) => [g.magazaId, g._count._all]));
  const acikSayimlar = new Set(
    sayimlar.filter((s) => s.durum === SAYIM_DURUM.DEVAM).map((s) => s.magazaId),
  );

  function ozet(kalemler: { beklenen: boolean; sayildi: boolean }[]) {
    const beklenen = kalemler.filter((k) => k.beklenen);
    return {
      toplam: beklenen.length,
      sayilan: beklenen.filter((k) => k.sayildi).length,
      eksik: beklenen.filter((k) => !k.sayildi).length,
      fazla: kalemler.length - beklenen.length,
    };
  }

  const devamEdenler = sayimlar.filter((s) => s.durum === SAYIM_DURUM.DEVAM);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Stok Sayımı</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Her mağaza kendi sayımını bağımsız yapar; bir mağazanın sayımı diğerini etkilemez.
        </p>
      </div>

      {devamEdenler.length > 0 ? (
        <Kart baslik="Devam Eden Sayımlar">
          <ul className="divide-y divide-slate-100">
            {devamEdenler.map((s) => {
              const o = ozet(s.kalemler);
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="font-medium text-slate-800">{s.magaza.ad}</div>
                    <div className="text-xs text-slate-500">
                      {o.sayilan}/{o.toplam} okutuldu · {o.fazla} fazla · {s.baslatan.adSoyad} ·{" "}
                      {tarihSaatYaz(s.baslangicTarihi)}
                    </div>
                  </div>
                  <Link
                    href={`/sayim/${s.id}`}
                    className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700"
                  >
                    Sayıma Devam Et
                  </Link>
                </li>
              );
            })}
          </ul>
        </Kart>
      ) : null}

      <Kart baslik="Yeni Sayım Başlat">
        {magazalar.length === 0 ? (
          <p className="text-sm text-amber-700">
            Hesabınız bir mağazaya bağlı değil; sayım başlatamazsınız.
          </p>
        ) : (
          <SayimBaslatFormu
            magazalar={magazalar.map((m) => ({
              id: m.id,
              ad: m.ad,
              stokAdedi: stokHarita.get(m.id) ?? 0,
              acikSayimVar: acikSayimlar.has(m.id),
            }))}
            varsayilanId={oturum.magazaId ?? magazalar[0]?.id ?? null}
          />
        )}
      </Kart>

      <Kart baslik="Sayım Geçmişi">
        {sayimlar.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Henüz sayım yapılmamış.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Mağaza</th>
                  <th className="py-2 pr-3 font-medium">Durum</th>
                  <th className="py-2 pr-3 text-right font-medium">Beklenen</th>
                  <th className="py-2 pr-3 text-right font-medium">Sayılan</th>
                  <th className="py-2 pr-3 text-right font-medium">Eksik</th>
                  <th className="py-2 pr-3 text-right font-medium">Fazla</th>
                  <th className="py-2 pr-3 font-medium">Başlatan</th>
                  <th className="py-2 font-medium">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sayimlar.map((s) => {
                  const o = ozet(s.kalemler);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-2 pr-3">
                        <Link
                          href={`/sayim/${s.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {s.magaza.ad}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">
                        <Rozet
                          ton={
                            s.durum === SAYIM_DURUM.DEVAM
                              ? "sari"
                              : s.durum === SAYIM_DURUM.TAMAMLANDI
                                ? "yesil"
                                : "nötr"
                          }
                        >
                          {s.durum === SAYIM_DURUM.DEVAM
                            ? "Devam ediyor"
                            : s.durum === SAYIM_DURUM.TAMAMLANDI
                              ? "Tamamlandı"
                              : "İptal"}
                        </Rozet>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{o.toplam}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-emerald-700">
                        {o.sayilan}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-amber-700">{o.eksik}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-violet-700">{o.fazla}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-600">
                        {s.baslatan.adSoyad}
                      </td>
                      <td className="py-2 whitespace-nowrap text-slate-500">
                        {tarihSaatYaz(s.baslangicTarihi)}
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
