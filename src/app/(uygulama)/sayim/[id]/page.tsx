import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { Kart } from "@/bilesenler/Kart";
import { Rozet, type RozetTonu } from "@/bilesenler/Rozet";
import { kurusuTLYazSembollu } from "@/lib/para";
import { prisma } from "@/lib/prisma";
import {
  SAYIM_DURUM,
  SAYIM_SONUC,
  SAYIM_SONUC_ETIKET,
  type SayimSonuc,
} from "@/lib/sabitler";
import { tarihSaatYaz } from "@/lib/tarih";
import { magazadaIslemYapabilirMi, oturumGerekli } from "@/lib/yetki";
import { SayimPaneli } from "./SayimPaneli";

export const metadata = { title: "Sayım Detayı — Stok Takip" };

const KALEM_ICERIK = {
  okutan: { select: { adSoyad: true } },
  stokKalemi: {
    include: {
      kategori: { select: { ad: true } },
      magaza: { select: { ad: true } },
    },
  },
} satisfies Prisma.SayimKalemiInclude;

type SayimKalemiSatiri = Prisma.SayimKalemiGetPayload<{ include: typeof KALEM_ICERIK }>;

const SONUC_TONU: Record<SayimSonuc, RozetTonu> = {
  BULUNDU: "yesil",
  BASKA_MAGAZADA: "mor",
  SATILMIS: "mor",
  KAYITSIZ: "kirmizi",
  EKSIK: "sari",
};

/** Sayım kalemlerini tek biçimde listeler; eksik, fazla ve sayılan tabloları bunu kullanır. */
function KalemTablosu({
baslik,
kalemler,
bos,
}: {
baslik: string;
kalemler: SayimKalemiSatiri[];
bos: string;
}) {
  if (kalemler.length === 0) {
    return (
      <Kart baslik={baslik}>
        <p className="text-sm text-slate-500">{bos}</p>
      </Kart>
    );
  }
  return (
    <Kart baslik={`${baslik} (${kalemler.length})`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Sonuç</th>
              <th className="py-2 pr-3 font-medium">Kategori</th>
              <th className="py-2 pr-3 font-medium">Cihaz</th>
              <th className="py-2 pr-3 font-medium">Seri No / Kod</th>
              <th className="py-2 pr-3 font-medium">Kayıtlı Depo</th>
              <th className="py-2 pr-3 text-right font-medium">Alış</th>
              <th className="py-2 font-medium">Okutma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {kalemler.map((k) => {
              const sonuc = (k.sonuc ?? (k.sayildi ? SAYIM_SONUC.BULUNDU : "")) as SayimSonuc;
              return (
                <tr key={k.id} className="hover:bg-slate-50">
                  <td className="py-2 pr-3">
                    {sonuc ? (
                      <Rozet ton={SONUC_TONU[sonuc] ?? "nötr"}>
                        {SAYIM_SONUC_ETIKET[sonuc] ?? sonuc}
                      </Rozet>
                    ) : (
                      <Rozet ton="sari">Bekliyor</Rozet>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">
                    {k.stokKalemi?.kategori.ad ?? "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {k.stokKalemi ? (
                      <Link
                        href={`/cihazlar/${k.stokKalemi.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {k.stokKalemi.marka} {k.stokKalemi.model}
                      </Link>
                    ) : (
                      <span className="text-slate-400">Sistemde kayıtlı değil</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-slate-700">
                    {k.stokKalemi?.seriNo ?? k.okutulanKod ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{k.stokKalemi?.magaza.ad ?? "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-700">
                    {k.stokKalemi ? kurusuTLYazSembollu(k.stokKalemi.alisFiyatiKurus) : "—"}
                  </td>
                  <td className="py-2 whitespace-nowrap text-xs text-slate-500">
                    {k.okutmaTarihi ? (
                      <>
                        {tarihSaatYaz(k.okutmaTarihi)}
                        {k.okutan ? ` · ${k.okutan.adSoyad}` : ""}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Kart>
  );
}

export default async function SayimDetaySayfasi({ params }: PageProps<"/sayim/[id]">) {
  const oturum = await oturumGerekli();
  const { id } = await params;
  const sayimId = Number(id);
  if (!Number.isInteger(sayimId)) notFound();

  const sayim = await prisma.sayim.findUnique({
    where: { id: sayimId },
    include: {
      magaza: true,
      baslatan: { select: { adSoyad: true } },
      kapatan: { select: { adSoyad: true } },
      kalemler: {
        orderBy: [{ beklenen: "desc" }, { sayildi: "asc" }, { id: "asc" }],
        include: KALEM_ICERIK,
      },
    },
  });
  if (!sayim) notFound();

  const beklenenler = sayim.kalemler.filter((k) => k.beklenen);
  const sayilanlar = beklenenler.filter((k) => k.sayildi);
  const eksikler = beklenenler.filter((k) => !k.sayildi);
  const fazlalar = sayim.kalemler.filter((k) => !k.beklenen);

  const devamEdiyor = sayim.durum === SAYIM_DURUM.DEVAM;
  const sayabilir = devamEdiyor && magazadaIslemYapabilirMi(oturum, sayim.magazaId);

  const eksikDeger = eksikler.reduce((t, k) => t + (k.stokKalemi?.alisFiyatiKurus ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{sayim.magaza.ad} Sayımı</h1>
            <Rozet
              ton={
                sayim.durum === SAYIM_DURUM.DEVAM
                  ? "sari"
                  : sayim.durum === SAYIM_DURUM.TAMAMLANDI
                    ? "yesil"
                    : "nötr"
              }
            >
              {sayim.durum === SAYIM_DURUM.DEVAM
                ? "Devam ediyor"
                : sayim.durum === SAYIM_DURUM.TAMAMLANDI
                  ? "Tamamlandı"
                  : "İptal"}
            </Rozet>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {sayim.baslatan.adSoyad} başlattı · {tarihSaatYaz(sayim.baslangicTarihi)}
            {sayim.bitisTarihi ? ` · ${tarihSaatYaz(sayim.bitisTarihi)} kapandı` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sayim.durum === SAYIM_DURUM.TAMAMLANDI ? (
            <a
              href={`/sayim/${sayim.id}/excel`}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
            >
              Excel&apos;e Aktar
            </a>
          ) : null}
          <Link
            href="/sayim"
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            ← Sayımlar
          </Link>
        </div>
      </div>

      {sayabilir ? (
        <SayimPaneli
          sayimId={sayim.id}
          toplam={beklenenler.length}
          okutulan={sayilanlar.length}
          fazla={fazlalar.length}
        />
      ) : devamEdiyor ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Bu sayımı yalnızca <strong>{sayim.magaza.ad}</strong> kullanıcıları yürütebilir.
        </div>
      ) : sayim.durum === SAYIM_DURUM.TAMAMLANDI ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Beklenen</div>
            <div className="mt-0.5 text-3xl font-semibold tabular-nums text-slate-900">
              {beklenenler.length}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Sayılan</div>
            <div className="mt-0.5 text-3xl font-semibold tabular-nums text-emerald-700">
              {sayilanlar.length}
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-amber-700">Eksik</div>
            <div className="mt-0.5 text-3xl font-semibold tabular-nums text-amber-700">
              {eksikler.length}
            </div>
            {eksikDeger > 0 ? (
              <div className="mt-0.5 text-xs text-amber-700">{kurusuTLYazSembollu(eksikDeger)}</div>
            ) : null}
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-violet-700">Fazla</div>
            <div className="mt-0.5 text-3xl font-semibold tabular-nums text-violet-700">
              {fazlalar.length}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
          Bu sayım iptal edildi. Stok kayıtlarına dokunulmadı.
        </div>
      )}

      <KalemTablosu
        baslik="Eksikler"
        kalemler={eksikler}
        bos="Eksik cihaz yok — beklenen her cihaz okutuldu."
      />
      <KalemTablosu
        baslik="Fazlalar"
        kalemler={fazlalar}
        bos="Fazla okutma yok."
      />
      <KalemTablosu
        baslik="Sayılanlar"
        kalemler={sayilanlar}
        bos="Henüz cihaz okutulmadı."
      />
    </div>
  );
}
