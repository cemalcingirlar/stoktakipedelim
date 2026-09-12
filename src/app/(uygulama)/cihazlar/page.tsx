import Link from "next/link";
import { redirect } from "next/navigation";
import { CihazTablosu } from "@/bilesenler/CihazTablosu";
import { FiltreCubugu } from "@/bilesenler/FiltreCubugu";
import { Sayfalama } from "@/bilesenler/Sayfalama";
import {
  CIHAZ_ICERIK,
  SAYFA_BOYUTU,
  filtredenWhere,
  filtreyiCoz,
} from "@/lib/cihazFiltre";
import { kodNormalize } from "@/lib/metin";
import { kurusuTLYazSembollu } from "@/lib/para";
import { prisma } from "@/lib/prisma";
import { sutunlariSirala, sutunTercihiniCoz } from "@/lib/sutunlar";
import { oturumGerekli, stokEkleyebilirMi } from "@/lib/yetki";

export const metadata = { title: "Cihazlar — Stok Takip" };

export default async function CihazlarSayfasi({ searchParams }: PageProps<"/cihazlar">) {
  const oturum = await oturumGerekli();
  const params = await searchParams;
  const filtre = filtreyiCoz(params);
  const bugun = new Date();

  // Arama kutusuna tam bir seri no / barkod girildiyse doğrudan cihaz detayına git.
  if (filtre.ara) {
    const kod = kodNormalize(filtre.ara);
    if (kod.length >= 6) {
      const tamEslesme = await prisma.stokKalemi.findFirst({
        where: { OR: [{ seriNo: kod }, { barkod: kod }] },
        select: { id: true },
      });
      if (tamEslesme) redirect(`/cihazlar/${tamEslesme.id}`);
    }
  }

  const where = filtredenWhere(filtre, bugun);

  const [kategoriler, magazalar, altKategoriler, ozet, toplam, satirlar, kullanici] =
    await Promise.all([
      prisma.kategori.findMany({ where: { aktif: true }, orderBy: { sira: "asc" } }),
      prisma.magaza.findMany({ where: { aktif: true }, orderBy: { kod: "asc" } }),
      prisma.altKategori.findMany({
        where: { aktif: true, ...(filtre.kategoriId ? { kategoriId: filtre.kategoriId } : {}) },
        orderBy: [{ kategoriId: "asc" }, { sira: "asc" }],
      }),
      prisma.stokKalemi.aggregate({ where, _sum: { alisFiyatiKurus: true } }),
      prisma.stokKalemi.count({ where }),
      prisma.stokKalemi.findMany({
        where,
        include: CIHAZ_ICERIK,
        orderBy: [{ girisTarihi: "desc" }, { id: "desc" }],
        skip: (filtre.sayfa - 1) * SAYFA_BOYUTU,
        take: SAYFA_BOYUTU,
      }),
      prisma.kullanici.findUnique({
        where: { id: oturum.kullaniciId },
        select: { sutunTercihi: true },
      }),
    ]);

  const sutunlar = sutunlariSirala(sutunTercihiniCoz(kullanici?.sutunTercihi));
  const toplamSayfa = Math.max(1, Math.ceil(toplam / SAYFA_BOYUTU));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Cihazlar</h1>
        {stokEkleyebilirMi(oturum) ? (
          <Link
            href="/faturalar/yeni"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            + Yeni Alış Faturası
          </Link>
        ) : (
          <span className="text-xs text-slate-500">
            Stok girişi yalnızca yönetici tarafından yapılabilir.
          </span>
        )}
      </div>

      <FiltreCubugu
        filtre={filtre}
        params={params}
        kategoriler={kategoriler}
        altKategoriler={altKategoriler}
        magazalar={magazalar}
      />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-sm">
          <span className="font-medium text-slate-700">{toplam} cihaz</span>
          <span className="text-slate-500">
            Toplam alış değeri:{" "}
            <span className="font-medium text-slate-800">
              {kurusuTLYazSembollu(ozet._sum.alisFiyatiKurus ?? 0)}
            </span>
          </span>
        </div>

        <CihazTablosu satirlar={satirlar} sutunlar={sutunlar} bugun={bugun} />
        <Sayfalama sayfa={filtre.sayfa} toplamSayfa={toplamSayfa} params={params} />
      </div>
    </div>
  );
}
