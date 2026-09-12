import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Kart } from "@/bilesenler/Kart";
import { DurumRozeti, Rozet } from "@/bilesenler/Rozet";
import { kurusuTLYazSembollu } from "@/lib/para";
import { prisma } from "@/lib/prisma";
import {
  HAREKET_TIP,
  HAREKET_TIP_ETIKET,
  ODEME_TIPI_ETIKET,
  VADE_ETIKET,
  type HareketTip,
  type OdemeTipi,
} from "@/lib/sabitler";
import { beklemeGunu, karKurus } from "@/lib/sutunlar";
import { tarihSaatYaz, tarihYaz } from "@/lib/tarih";
import { vadeDurumu } from "@/lib/vade";
import { oturumGerekli } from "@/lib/yetki";
import { CIHAZ_ICERIK } from "@/lib/cihazFiltre";

export const metadata = { title: "Cihaz Detayı — Stok Takip" };

function Satir({ etiket, children }: { etiket: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <dt className="shrink-0 text-sm text-slate-500">{etiket}</dt>
      <dd className="text-right text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

const HAREKET_NOKTASI: Record<HareketTip, string> = {
  [HAREKET_TIP.GIRIS]: "bg-blue-500",
  [HAREKET_TIP.TRANSFER_GONDERIM]: "bg-violet-500",
  [HAREKET_TIP.TRANSFER_KABUL]: "bg-emerald-500",
  [HAREKET_TIP.TRANSFER_RED]: "bg-red-500",
  [HAREKET_TIP.SATIS]: "bg-emerald-600",
  [HAREKET_TIP.IADE]: "bg-amber-500",
  [HAREKET_TIP.DUZELTME]: "bg-slate-400",
  [HAREKET_TIP.SAYIM_FARK]: "bg-amber-600",
};

export default async function CihazDetaySayfasi({ params }: PageProps<"/cihazlar/[id]">) {
  await oturumGerekli();
  const { id } = await params;
  const cihazId = Number(id);
  if (!Number.isInteger(cihazId)) notFound();

  const [cihaz, hareketler] = await Promise.all([
    prisma.stokKalemi.findUnique({ where: { id: cihazId }, include: CIHAZ_ICERIK }),
    prisma.stokHareketi.findMany({
      where: { stokKalemiId: cihazId },
      orderBy: [{ tarih: "asc" }, { id: "asc" }],
      include: {
        kullanici: { select: { adSoyad: true } },
        kaynakMagaza: { select: { ad: true } },
        hedefMagaza: { select: { ad: true } },
        transfer: { select: { id: true, transferNo: true, durum: true } },
      },
    }),
  ]);

  if (!cihaz) notFound();

  const bugun = new Date();
  const vade = vadeDurumu(cihaz.alisFaturasi, bugun);
  const kar = karKurus(cihaz);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">
              {cihaz.marka} {cihaz.model}
            </h1>
            <DurumRozeti durum={cihaz.durum} />
            {vade.durum === "GECTI" || vade.durum === "YAKLASIYOR" ? (
              <Rozet ton={vade.durum === "GECTI" ? "kirmizi" : "sari"}>Vade: {vade.etiket}</Rozet>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {cihaz.seriNo ? (
              <span className="font-mono">{cihaz.seriNo}</span>
            ) : (
              "Seri numarası yok"
            )}
            {" · "}
            {cihaz.magaza.ad}
          </p>
        </div>
        <Link
          href="/cihazlar"
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ← Cihazlar
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Kart baslik="Künye">
            <dl>
              <Satir etiket="Kategori">
                {cihaz.kategori.ad}
                {cihaz.altKategori ? ` / ${cihaz.altKategori.ad}` : ""}
              </Satir>
              <Satir etiket="Marka / Model">
                {cihaz.marka} {cihaz.model}
              </Satir>
              {cihaz.renk ? <Satir etiket="Renk">{cihaz.renk}</Satir> : null}
              {cihaz.kapasite ? <Satir etiket="Kapasite">{cihaz.kapasite}</Satir> : null}
              <Satir etiket="Seri No / IMEI">
                {cihaz.seriNo ? (
                  <span className="font-mono">{cihaz.seriNo}</span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </Satir>
              <Satir etiket="Barkod">
                {cihaz.barkod ? (
                  <span className="font-mono">{cihaz.barkod}</span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </Satir>
              <Satir etiket="Bulunduğu Depo">{cihaz.magaza.ad}</Satir>
              <Satir etiket="Stokta Bekleme">{beklemeGunu(cihaz, bugun)} gün</Satir>
              {cihaz.not ? <Satir etiket="Not">{cihaz.not}</Satir> : null}
            </dl>
          </Kart>

          <Kart baslik="Alış Bilgileri">
            <dl>
              <Satir etiket="Giriş Tarihi">{tarihYaz(cihaz.girisTarihi)}</Satir>
              <Satir etiket="Tedarikçi">{cihaz.tedarikci?.ad ?? "—"}</Satir>
              <Satir etiket="Alış Fiyatı">{kurusuTLYazSembollu(cihaz.alisFiyatiKurus)}</Satir>
              <Satir etiket="Fatura">
                {cihaz.alisFaturasi ? (
                  <Link
                    href={`/faturalar/${cihaz.alisFaturasi.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {cihaz.alisFaturasi.faturaNo}
                  </Link>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </Satir>
              <Satir etiket="Vade">
                {cihaz.alisFaturasi?.vadeGun ? (
                  <>
                    {VADE_ETIKET[cihaz.alisFaturasi.vadeGun]} ·{" "}
                    {tarihYaz(cihaz.alisFaturasi.vadeTarihi)}
                  </>
                ) : (
                  <span className="text-slate-400">Vadesiz</span>
                )}
              </Satir>
              {cihaz.alisFaturasi?.vadeGun ? (
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
            </dl>
          </Kart>
        </div>

        <div className="space-y-5 lg:col-span-2">
          {cihaz.durum === "SATILDI" ? (
            <Kart baslik="Satış ve Müşteri Bilgileri">
              <dl>
                <Satir etiket="Satış Tarihi">{tarihYaz(cihaz.satisTarihi)}</Satir>
                <Satir etiket="Satış Fiyatı">{kurusuTLYazSembollu(cihaz.satisFiyatiKurus)}</Satir>
                <Satir etiket="Kâr">
                  {kar === null ? (
                    "—"
                  ) : (
                    <span className={kar < 0 ? "text-red-600" : "text-emerald-700"}>
                      {kurusuTLYazSembollu(kar)}
                    </span>
                  )}
                </Satir>
                <Satir etiket="Ödeme Tipi">
                  {cihaz.odemeTipi
                    ? (ODEME_TIPI_ETIKET[cihaz.odemeTipi as OdemeTipi] ?? cihaz.odemeTipi)
                    : "—"}
                </Satir>
                <Satir etiket="Satan Kullanıcı">{cihaz.satanKullanici?.adSoyad ?? "—"}</Satir>
                <Satir etiket="Müşteri">{cihaz.musteri?.adSoyad ?? "—"}</Satir>
                {cihaz.musteri?.telefon ? (
                  <Satir etiket="Müşteri Telefonu">{cihaz.musteri.telefon}</Satir>
                ) : null}
              </dl>
            </Kart>
          ) : null}

          <Kart baslik="Sevkiyat ve Hareket Tarihçesi">
            {hareketler.length === 0 ? (
              <p className="text-sm text-slate-500">Bu cihaz için hareket kaydı yok.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {hareketler.map((h) => (
                  <li key={h.id} className="relative">
                    <span
                      aria-hidden
                      className={`absolute -left-[1.55rem] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                        HAREKET_NOKTASI[h.tip as HareketTip] ?? "bg-slate-400"
                      }`}
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800">
                        {HAREKET_TIP_ETIKET[h.tip as HareketTip] ?? h.tip}
                      </span>
                      <span className="text-xs text-slate-500">{tarihSaatYaz(h.tarih)}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {h.kaynakMagaza && h.hedefMagaza
                        ? `${h.kaynakMagaza.ad} → ${h.hedefMagaza.ad}`
                        : (h.hedefMagaza?.ad ?? h.kaynakMagaza?.ad ?? "")}
                      {h.transfer ? (
                        <Link
                          href={`/sevkiyat/${h.transfer.id}`}
                          className="ml-2 text-blue-600 hover:underline"
                        >
                          {h.transfer.transferNo}
                        </Link>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {h.kullanici.adSoyad}
                      {h.aciklama ? ` · ${h.aciklama}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Kart>
        </div>
      </div>
    </div>
  );
}
