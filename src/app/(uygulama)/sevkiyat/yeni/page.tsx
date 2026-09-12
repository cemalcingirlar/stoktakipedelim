import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { adminMi, oturumGerekli } from "@/lib/yetki";
import { SevkiyatFormu } from "./SevkiyatFormu";

export const metadata = { title: "Yeni Sevkiyat — Stok Takip" };

export default async function YeniSevkiyatSayfasi() {
  const oturum = await oturumGerekli();
  const yonetici = adminMi(oturum);

  const magazalar = await prisma.magaza.findMany({
    where: { aktif: true },
    orderBy: { kod: "asc" },
    include: { _count: { select: { kullanicilar: { where: { aktif: true } } } } },
  });

  // Yönetici her mağazadan sevk edebilir; diğer roller yalnız kendi mağazasından.
  const kaynakMagazalar = yonetici
    ? magazalar.map((m) => ({ id: m.id, ad: m.ad }))
    : magazalar.filter((m) => m.id === oturum.magazaId).map((m) => ({ id: m.id, ad: m.ad }));

  if (kaynakMagazalar.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-lg font-semibold text-amber-900">Sevkiyat yapılamıyor</h1>
        <p className="mt-1 text-sm text-amber-800">
          Hesabınız bir mağazaya bağlı değil. Yönetici ile görüşün.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Yeni Sevkiyat</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Okuttuğunuz cihazlar hedef mağaza onaylayana kadar &quot;Transferde&quot; kalır.
          </p>
        </div>
        <Link
          href="/sevkiyat"
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ← Sevkiyatlar
        </Link>
      </div>

      <SevkiyatFormu
        kaynakMagazalar={kaynakMagazalar}
        hedefMagazalar={magazalar.map((m) => ({
          id: m.id,
          ad: m.ad,
          kullaniciSayisi: m._count.kullanicilar,
        }))}
        varsayilanKaynakId={oturum.magazaId}
        kaynakSecilebilir={yonetici}
      />
    </div>
  );
}
