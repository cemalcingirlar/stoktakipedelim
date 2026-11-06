import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Link } from "@/bilesenler/Bag";
import { Kart } from "@/bilesenler/Kart";
import { Rozet } from "@/bilesenler/Rozet";
import { gorebilirMi, gorunurMagazaIdleri } from "@/lib/gorunurluk";
import { kurusuTLYazSembollu } from "@/lib/para";
import { prisma } from "@/lib/prisma";
import { ODEME_TIPI_ETIKET, type OdemeTipi } from "@/lib/sabitler";
import { tarihYaz } from "@/lib/tarih";
import { oturumGerekli } from "@/lib/yetki";

export const metadata = { title: "Satış Kartı — Stok Takip" };

function Satir({ etiket, children }: { etiket: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <dt className="shrink-0 text-sm text-slate-500">{etiket}</dt>
      <dd className="text-right text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

/**
 * Satış kartı: bir satışta satılan cihazların tamamı, müşteri ve ödeme
 * bilgisiyle birlikte.
 *
 * Eskiden satış diye ortak bir kayıt yoktu; bir müşteriye aynı anda üç cihaz
 * satıldığında ortada üç ayrı cihaz kaydı oluyor ve hangilerinin birlikte
 * satıldığı anlaşılmıyordu. Kullanıcı hepsini tek tek açmak zorundaydı.
 */
export default async function SatisKartiSayfasi({ params }: PageProps<"/satislar/[id]">) {
  const oturum = await oturumGerekli();
  const { id } = await params;
  const satisId = Number(id);
  if (!Number.isInteger(satisId)) notFound();

  const satis = await prisma.satis.findUnique({
    where: { id: satisId },
    include: {
      musteri: true,
      satanKullanici: { select: { adSoyad: true } },
      kalemler: {
        orderBy: { id: "asc" },
        include: {
          kategori: { select: { ad: true } },
          magaza: { select: { id: true, ad: true } },
        },
      },
    },
  });
  if (!satis) notFound();

  // Satışta birden çok mağazanın cihazı olabiliyor. Hiçbiri görünür değilse
  // bu satış kullanıcıyı ilgilendirmiyor; başka şubenin satış dökümü.
  const gorunur = gorunurMagazaIdleri(oturum);
  if (!satis.kalemler.some((k) => gorebilirMi(gorunur, k.magazaId))) notFound();

  const toplam = satis.kalemler.reduce((t, k) => t + (k.satisFiyatiKurus ?? 0), 0);
  const magazalar = [...new Set(satis.kalemler.map((k) => k.magaza.ad))];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{satis.satisNo}</h1>
            <Rozet ton="yesil">{satis.kalemler.length} cihaz</Rozet>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {satis.musteri.adSoyad} · {tarihYaz(satis.satisTarihi)} ·{" "}
            {ODEME_TIPI_ETIKET[satis.odemeTipi as OdemeTipi] ?? satis.odemeTipi}
          </p>
        </div>
        <Link
          href={`/musteriler?ara=${encodeURIComponent(satis.musteri.adSoyad)}`}
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Müşteri Kaydı →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Kart baslik="Müşteri ve Satış">
          <dl>
            <Satir etiket="Satış No">{satis.satisNo}</Satir>
            <Satir etiket="Müşteri">{satis.musteri.adSoyad}</Satir>
            <Satir etiket="Telefon">{satis.musteri.telefon ?? "—"}</Satir>
            <Satir etiket="TCKN / VKN">{satis.musteri.tcknVkn ?? "—"}</Satir>
            <Satir etiket="Adres">{satis.musteri.adres ?? "—"}</Satir>
            <Satir etiket="Satışı Yapan">{satis.satanKullanici.adSoyad}</Satir>
            <Satir etiket="Ödeme Tipi">
              {ODEME_TIPI_ETIKET[satis.odemeTipi as OdemeTipi] ?? satis.odemeTipi}
            </Satir>
            <Satir etiket="Satış Tarihi">{tarihYaz(satis.satisTarihi)}</Satir>
            <Satir etiket="Mağaza">{magazalar.join(", ")}</Satir>
            <Satir etiket="Cihaz Adedi">{satis.kalemler.length}</Satir>
            <Satir etiket="Toplam Tutar">{kurusuTLYazSembollu(toplam)}</Satir>
            {satis.not ? <Satir etiket="Not">{satis.not}</Satir> : null}
          </dl>
        </Kart>

        <Kart baslik={`Satılan Cihazlar (${satis.kalemler.length})`} className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm" data-test="satis-kalemleri">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Kategori</th>
                  <th className="py-2 pr-3 font-medium">Cihaz</th>
                  <th className="py-2 pr-3 font-medium">Seri No</th>
                  <th className="py-2 pr-3 font-medium">Mağaza</th>
                  <th className="py-2 text-right font-medium">Satış</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {satis.kalemler.map((k) => (
                  <tr key={k.id} data-test="satis-kalemi">
                    <td className="py-2 pr-3 text-slate-600">{k.kategori.ad}</td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/cihazlar/${k.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {k.marka} {k.model}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-700">
                      {k.seriNo ?? k.barkod ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{k.magaza.ad}</td>
                    <td className="py-2 text-right tabular-nums text-slate-800">
                      {kurusuTLYazSembollu(k.satisFiyatiKurus ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td colSpan={4} className="py-2 pr-3 text-right font-medium text-slate-700">
                    Toplam
                  </td>
                  <td
                    data-test="satis-toplam"
                    className="py-2 text-right font-semibold tabular-nums text-slate-900"
                  >
                    {kurusuTLYazSembollu(toplam)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Kart>
      </div>
    </div>
  );
}
