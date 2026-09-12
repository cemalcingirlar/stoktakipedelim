import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { adminSayfasi } from "@/lib/yetki";
import { FaturaFormu } from "./FaturaFormu";

export const metadata = { title: "Yeni Alış Faturası — Stok Takip" };

export default async function YeniFaturaSayfasi() {
  // Stok girişi yalnızca yöneticide.
  const oturum = await adminSayfasi();

  const [kategoriler, tedarikciler, magazalar] = await Promise.all([
    prisma.kategori.findMany({
      where: { aktif: true },
      orderBy: { sira: "asc" },
      include: {
        altKategoriler: { where: { aktif: true }, orderBy: { sira: "asc" } },
      },
    }),
    prisma.tedarikci.findMany({ where: { aktif: true }, orderBy: { ad: "asc" } }),
    prisma.magaza.findMany({ where: { aktif: true }, orderBy: { kod: "asc" } }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Yeni Alış Faturası</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Faturadaki her cihaz ayrı bir stok kaydı olarak depoya girer.
          </p>
        </div>
        <Link
          href="/faturalar"
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Faturalar
        </Link>
      </div>

      <FaturaFormu
        kategoriler={kategoriler.map((k) => ({
          id: k.id,
          ad: k.ad,
          seriNoZorunlu: k.seriNoZorunlu,
          altKategoriler: k.altKategoriler.map((a) => ({ id: a.id, ad: a.ad })),
        }))}
        tedarikciler={tedarikciler.map((t) => ({ id: t.id, ad: t.ad }))}
        magazalar={magazalar.map((m) => ({ id: m.id, kod: m.kod, ad: m.ad }))}
        varsayilanMagazaId={oturum.magazaId}
      />
    </div>
  );
}
