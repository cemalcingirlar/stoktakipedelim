import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Kart } from "@/bilesenler/Kart";
import { Rozet } from "@/bilesenler/Rozet";
import { TransferRozeti } from "@/bilesenler/TransferRozeti";
import { kurusuTLYazSembollu } from "@/lib/para";
import { prisma } from "@/lib/prisma";
import { TRANSFER_DURUM, TRANSFER_KALEM_DURUM } from "@/lib/sabitler";
import { tarihSaatYaz } from "@/lib/tarih";
import { magazadaIslemYapabilirMi, oturumGerekli } from "@/lib/yetki";
import { IptalDugmesi } from "./IptalDugmesi";
import { KabulPaneli } from "./KabulPaneli";

export const metadata = { title: "Sevkiyat Detayı — Stok Takip" };

function Satir({ etiket, children }: { etiket: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <dt className="shrink-0 text-sm text-slate-500">{etiket}</dt>
      <dd className="text-right text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

export default async function SevkiyatDetaySayfasi({ params }: PageProps<"/sevkiyat/[id]">) {
  const oturum = await oturumGerekli();
  const { id } = await params;
  const transferId = Number(id);
  if (!Number.isInteger(transferId)) notFound();

  const transfer = await prisma.transfer.findUnique({
    where: { id: transferId },
    include: {
      kaynakMagaza: true,
      hedefMagaza: true,
      gonderen: { select: { adSoyad: true } },
      kabulEden: { select: { adSoyad: true } },
      kalemler: {
        orderBy: { id: "asc" },
        include: {
          stokKalemi: {
            include: { kategori: { select: { ad: true } }, magaza: { select: { ad: true } } },
          },
        },
      },
    },
  });
  if (!transfer) notFound();

  const kabulEdilen = transfer.kalemler.filter((k) => k.durum === TRANSFER_KALEM_DURUM.KABUL);
  const reddedilen = transfer.kalemler.filter((k) => k.durum === TRANSFER_KALEM_DURUM.RED);
  const bekleyen = transfer.kalemler.filter((k) => k.durum === TRANSFER_KALEM_DURUM.BEKLIYOR);
  const toplamDeger = transfer.kalemler.reduce((t, k) => t + k.stokKalemi.alisFiyatiKurus, 0);

  const acikMi =
    transfer.durum === TRANSFER_DURUM.BEKLIYOR || transfer.durum === TRANSFER_DURUM.KISMI_KABUL;
  const kabulEdebilir =
    acikMi && bekleyen.length > 0 && magazadaIslemYapabilirMi(oturum, transfer.hedefMagazaId);
  const geriCekebilir =
    transfer.durum === TRANSFER_DURUM.BEKLIYOR &&
    kabulEdilen.length === 0 &&
    magazadaIslemYapabilirMi(oturum, transfer.kaynakMagazaId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{transfer.transferNo}</h1>
            <TransferRozeti durum={transfer.durum} />
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {transfer.kaynakMagaza.ad} → {transfer.hedefMagaza.ad} ·{" "}
            {tarihSaatYaz(transfer.gonderimTarihi)}
          </p>
        </div>
        <Link
          href="/sevkiyat"
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ← Sevkiyatlar
        </Link>
      </div>

      {/*
         Kapanmış sevkiyatlarda durum bildirimi sunucudan gelir. İşlem butonları
         (kabul, red, geri çekme) işlem sonrası kaybolduğu için onların içindeki
         geçici mesajlar da kaybolurdu; kalıcı bildirim burada duruyor.
      */}
      {transfer.durum === TRANSFER_DURUM.IPTAL ? (
        <div className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
          Bu sevkiyat gönderen tarafından geri çekildi. {transfer.kalemler.length} cihaz{" "}
          <strong>{transfer.kaynakMagaza.ad}</strong> deposuna döndü.
        </div>
      ) : transfer.durum === TRANSFER_DURUM.RED ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Sevkiyat reddedildi{transfer.redNedeni ? `: ${transfer.redNedeni}` : ""}. Cihazlar{" "}
          <strong>{transfer.kaynakMagaza.ad}</strong> deposuna geri gönderildi.
        </div>
      ) : transfer.durum === TRANSFER_DURUM.KABUL ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Sevkiyat tamamen kabul edildi. {kabulEdilen.length} cihaz{" "}
          <strong>{transfer.hedefMagaza.ad}</strong> deposuna alındı.
        </div>
      ) : transfer.durum === TRANSFER_DURUM.KISMI_KABUL ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Kısmi kabul: {kabulEdilen.length} cihaz <strong>{transfer.hedefMagaza.ad}</strong>{" "}
          deposuna alındı
          {reddedilen.length > 0 ? (
            <>
              , {reddedilen.length} cihaz reddedilip <strong>{transfer.kaynakMagaza.ad}</strong>{" "}
              deposuna geri gönderildi
            </>
          ) : null}
          {bekleyen.length > 0 ? <>, {bekleyen.length} cihaz hâlâ okutulmayı bekliyor</> : null}.
          {transfer.redNedeni ? ` Red nedeni: ${transfer.redNedeni}` : ""}
        </div>
      ) : null}

      {kabulEdebilir ? (
        <KabulPaneli
          transferId={transfer.id}
          toplamAdet={transfer.kalemler.length}
          okutulanAdet={kabulEdilen.length}
          bekleyenAdet={bekleyen.length}
        />
      ) : acikMi ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Bu sevkiyatı yalnızca <strong>{transfer.hedefMagaza.ad}</strong> kullanıcıları kabul
          edebilir.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Kart baslik="Sevkiyat Bilgileri">
          <dl>
            <Satir etiket="Sevkiyat No">{transfer.transferNo}</Satir>
            <Satir etiket="Gönderen Mağaza">{transfer.kaynakMagaza.ad}</Satir>
            <Satir etiket="Hedef Mağaza">{transfer.hedefMagaza.ad}</Satir>
            <Satir etiket="Gönderen Kullanıcı">{transfer.gonderen.adSoyad}</Satir>
            <Satir etiket="Gönderim Zamanı">{tarihSaatYaz(transfer.gonderimTarihi)}</Satir>
            <Satir etiket="Kabul Eden">{transfer.kabulEden?.adSoyad ?? "—"}</Satir>
            <Satir etiket="Kabul Zamanı">
              {transfer.kabulTarihi ? tarihSaatYaz(transfer.kabulTarihi) : "—"}
            </Satir>
            <Satir etiket="Cihaz Adedi">{transfer.kalemler.length}</Satir>
            <Satir etiket="Toplam Alış Değeri">{kurusuTLYazSembollu(toplamDeger)}</Satir>
            {transfer.not ? <Satir etiket="Not">{transfer.not}</Satir> : null}
            {transfer.redNedeni ? (
              <Satir etiket="Red Nedeni">
                <span className="text-red-700">{transfer.redNedeni}</span>
              </Satir>
            ) : null}
          </dl>

          {geriCekebilir ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <IptalDugmesi transferId={transfer.id} />
            </div>
          ) : null}
        </Kart>

        <Kart baslik={`Cihazlar (${transfer.kalemler.length})`} className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">
            <Rozet ton="yesil">{kabulEdilen.length} kabul</Rozet>
            <Rozet ton="sari">{bekleyen.length} bekliyor</Rozet>
            {reddedilen.length > 0 ? <Rozet ton="kirmizi">{reddedilen.length} red</Rozet> : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[660px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Kategori</th>
                  <th className="py-2 pr-3 font-medium">Cihaz</th>
                  <th className="py-2 pr-3 font-medium">Seri No</th>
                  <th className="py-2 pr-3 font-medium">Şu an</th>
                  <th className="py-2 font-medium">Kabul Durumu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfer.kalemler.map((k) => (
                  <tr
                    key={k.id}
                    className={
                      k.durum === TRANSFER_KALEM_DURUM.KABUL
                        ? "bg-emerald-50"
                        : k.durum === TRANSFER_KALEM_DURUM.RED
                          ? "bg-red-50"
                          : ""
                    }
                  >
                    <td className="py-2 pr-3 text-slate-600">{k.stokKalemi.kategori.ad}</td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/cihazlar/${k.stokKalemi.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {k.stokKalemi.marka} {k.stokKalemi.model}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-700">
                      {k.stokKalemi.seriNo ?? k.stokKalemi.barkod ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{k.stokKalemi.magaza.ad}</td>
                    <td className="py-2">
                      {k.durum === TRANSFER_KALEM_DURUM.KABUL ? (
                        <Rozet ton="yesil">
                          Okutuldu{k.kabulTarihi ? ` · ${tarihSaatYaz(k.kabulTarihi)}` : ""}
                        </Rozet>
                      ) : k.durum === TRANSFER_KALEM_DURUM.RED ? (
                        <Rozet ton="kirmizi">Reddedildi{k.not ? ` · ${k.not}` : ""}</Rozet>
                      ) : (
                        <Rozet ton="sari">Bekliyor</Rozet>
                      )}
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
