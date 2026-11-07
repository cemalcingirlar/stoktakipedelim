import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Link } from "@/bilesenler/Bag";
import { Kart } from "@/bilesenler/Kart";
import { Rozet } from "@/bilesenler/Rozet";
import { gorunurMagazaIdleri, magazaKosulu } from "@/lib/gorunurluk";
import {
  alimlariSirala,
  ozetleriBirlestir,
  type MusteriAlimi,
} from "@/lib/musteriAlimlari";
import { kurusuTLYazSembollu } from "@/lib/para";
import { prisma } from "@/lib/prisma";
import { STOK_DURUM } from "@/lib/sabitler";
import { tarihYaz } from "@/lib/tarih";
import { oturumGerekli } from "@/lib/yetki";

export const metadata = { title: "Müşteri Kartı — Stok Takip" };

/**
 * Kartta listelenen en çok alım.
 *
 * Toplamlar bu sınırdan etkilenmiyor; onlar ayrı toplama sorgusundan
 * geliyor. Sınır yalnız ekranı koruyor: binlerce satırlık bir kart hem
 * yavaş hem okunmaz.
 */
const EN_COK_ALIM = 200;

function Satir({ etiket, children }: { etiket: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <dt className="shrink-0 text-sm text-slate-500">{etiket}</dt>
      <dd className="text-right text-sm font-medium text-slate-800">
        {children}
      </dd>
    </div>
  );
}

/**
 * Müşteri kartı: bugüne kadar aldığı her şey, tarihiyle.
 *
 * Müşteri listesinde yalnız son birkaç cihaz görünüyor; "bu müşteri bizden
 * neler aldı" sorusunun tam cevabı burada. Alımlar iki kaynaktan geliyor
 * (normal satış ve mağaza içi aktarım satışı) ve tek listede birleşiyor.
 */
export default async function MusteriKartiSayfasi({
  params,
}: PageProps<"/musteriler/[id]">) {
  const oturum = await oturumGerekli();
  const { id } = await params;
  const musteriId = Number(id);
  if (!Number.isInteger(musteriId)) notFound();

  // Müşteri kaydının kendisi mağazalar arasında ortak; kısıtlanan, satın
  // aldıkları. Başka mağazanın hangi cihazı kaça sattığı o mağazanın satış
  // dökümü (müşteriler listesindeki kuralın aynısı).
  const gorunur = gorunurMagazaIdleri(oturum);

  const cihazKosulu = {
    musteriId,
    durum: STOK_DURUM.SATILDI,
    ...magazaKosulu(gorunur),
  };
  const aktarimKosulu = { musteriId, ...magazaKosulu(gorunur) };

  const [musteri, cihazlar, aktarimlar, cihazToplam, aktarimToplam] =
    await Promise.all([
    prisma.musteri.findUnique({ where: { id: musteriId } }),
    prisma.stokKalemi.findMany({
      where: cihazKosulu,
      orderBy: { satisTarihi: "desc" },
      take: EN_COK_ALIM,
      select: {
        id: true,
        marka: true,
        model: true,
        seriNo: true,
        barkod: true,
        satisTarihi: true,
        satisFiyatiKurus: true,
        satisId: true,
        magaza: { select: { ad: true } },
        satis: { select: { satisNo: true } },
      },
    }),
    prisma.aktarimSatisi.findMany({
      where: aktarimKosulu,
      orderBy: { satisTarihi: "desc" },
      take: EN_COK_ALIM,
      select: {
        id: true,
        satisTarihi: true,
        satisFiyatiKurus: true,
        magaza: { select: { ad: true } },
        stokKalemi: {
          select: { id: true, marka: true, model: true, seriNo: true, barkod: true },
        },
      },
    }),
    // Adet, tutar ve ilk/son alış listeden değil toplamadan: liste kesilse
    // bile özet doğru kalmalı.
    prisma.stokKalemi.aggregate({
      where: cihazKosulu,
      _count: { _all: true },
      _sum: { satisFiyatiKurus: true },
      _min: { satisTarihi: true },
      _max: { satisTarihi: true },
    }),
    prisma.aktarimSatisi.aggregate({
      where: aktarimKosulu,
      _count: { _all: true },
      _sum: { satisFiyatiKurus: true },
      _min: { satisTarihi: true },
      _max: { satisTarihi: true },
    }),
  ]);
  if (!musteri) notFound();

  const alimlar: MusteriAlimi[] = alimlariSirala([
    ...cihazlar.map((c) => ({
      anahtar: `cihaz-${c.id}`,
      cihazId: c.id,
      marka: c.marka,
      model: c.model,
      seriNo: c.seriNo,
      barkod: c.barkod,
      magazaAdi: c.magaza.ad,
      tarih: c.satisTarihi,
      tutarKurus: c.satisFiyatiKurus ?? 0,
      satisId: c.satisId,
      satisNo: c.satis?.satisNo ?? null,
      aktarimMi: false,
    })),
    ...aktarimlar.map((a) => ({
      anahtar: `aktarim-${a.id}`,
      cihazId: a.stokKalemi.id,
      marka: a.stokKalemi.marka,
      model: a.stokKalemi.model,
      seriNo: a.stokKalemi.seriNo,
      barkod: a.stokKalemi.barkod,
      magazaAdi: a.magaza.ad,
      tarih: a.satisTarihi,
      tutarKurus: a.satisFiyatiKurus,
      satisId: null,
      satisNo: null,
      aktarimMi: true,
    })),
  ]);
  const ozet = ozetleriBirlestir([
    {
      adet: cihazToplam._count._all,
      toplamKurus: cihazToplam._sum.satisFiyatiKurus ?? 0,
      ilkTarih: cihazToplam._min.satisTarihi,
      sonTarih: cihazToplam._max.satisTarihi,
    },
    {
      adet: aktarimToplam._count._all,
      toplamKurus: aktarimToplam._sum.satisFiyatiKurus ?? 0,
      ilkTarih: aktarimToplam._min.satisTarihi,
      sonTarih: aktarimToplam._max.satisTarihi,
    },
  ]);
  const kesildi = ozet.adet > alimlar.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">
              {musteri.adSoyad}
            </h1>
            <Rozet ton={ozet.adet > 0 ? "yesil" : "nötr"}>
              {ozet.adet} cihaz
            </Rozet>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {musteri.telefon ?? "telefon yok"}
            {ozet.sonTarih ? ` · son alış ${tarihYaz(ozet.sonTarih)}` : ""}
          </p>
        </div>
        <Link
          href="/musteriler"
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ← Müşteriler
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Kart baslik="Müşteri">
          <dl>
            <Satir etiket="Ad Soyad">{musteri.adSoyad}</Satir>
            <Satir etiket="Telefon">{musteri.telefon ?? "—"}</Satir>
            <Satir etiket="TCKN / VKN">{musteri.tcknVkn ?? "—"}</Satir>
            <Satir etiket="Adres">{musteri.adres ?? "—"}</Satir>
            <Satir etiket="Toplam Cihaz">{ozet.adet}</Satir>
            <Satir etiket="Toplam Tutar">
              {kurusuTLYazSembollu(ozet.toplamKurus)}
            </Satir>
            <Satir etiket="İlk Alış">
              {ozet.ilkTarih ? tarihYaz(ozet.ilkTarih) : "—"}
            </Satir>
            <Satir etiket="Son Alış">
              {ozet.sonTarih ? tarihYaz(ozet.sonTarih) : "—"}
            </Satir>
            {musteri.not ? <Satir etiket="Not">{musteri.not}</Satir> : null}
          </dl>
        </Kart>

        <Kart
          baslik={`Satın Alınanlar (${ozet.adet})`}
          className="lg:col-span-2"
        >
          {alimlar.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Bu müşteriye ait görebileceğiniz bir satış yok.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[640px] text-sm"
                data-test="musteri-alimlari"
              >
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-medium">Tarih</th>
                    <th className="py-2 pr-3 font-medium">Cihaz</th>
                    <th className="py-2 pr-3 font-medium">Seri No</th>
                    <th className="py-2 pr-3 font-medium">Mağaza</th>
                    <th className="py-2 pr-3 font-medium">Satış</th>
                    <th className="py-2 text-right font-medium">Tutar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {alimlar.map((a) => (
                    <tr key={a.anahtar} data-test="musteri-alimi">
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-600">
                        {a.tarih ? tarihYaz(a.tarih) : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <Link
                          href={`/cihazlar/${a.cihazId}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {a.marka} {a.model}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-700">
                        {a.seriNo ?? a.barkod ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{a.magazaAdi}</td>
                      <td className="py-2 pr-3 text-xs">
                        {a.satisId ? (
                          <Link
                            href={`/satislar/${a.satisId}`}
                            data-test="alim-satis-karti"
                            className="text-sky-700 underline-offset-2 hover:underline"
                          >
                            {a.satisNo}
                          </Link>
                        ) : a.aktarimMi ? (
                          <span className="text-slate-500">
                            mağaza içi aktarım
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-800">
                        {kurusuTLYazSembollu(a.tutarKurus)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200">
                    <td
                      colSpan={5}
                      className="py-2 pr-3 text-right font-medium text-slate-700"
                    >
                      Toplam
                    </td>
                    <td
                      data-test="musteri-alim-toplami"
                      className="py-2 text-right font-semibold tabular-nums text-slate-900"
                    >
                      {kurusuTLYazSembollu(ozet.toplamKurus)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {kesildi ? (
            <p className="mt-2 text-xs text-slate-500" data-test="alim-kesildi">
              Son {alimlar.length} alım gösteriliyor; toplam {ozet.adet} alım
              var. Tamamı için{" "}
              <Link
                href={`/cihazlar?durum=SATILDI&musteri=${encodeURIComponent(musteri.adSoyad)}`}
                className="text-sky-700 underline-offset-2 hover:underline"
              >
                cihaz listesinde bu müşteriyi süzün
              </Link>
              .
            </p>
          ) : null}
        </Kart>
      </div>
    </div>
  );
}
