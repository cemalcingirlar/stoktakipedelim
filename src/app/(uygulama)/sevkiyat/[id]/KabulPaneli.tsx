"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { OkutmaKutusu, type OkutmaGeriBildirimi } from "@/bilesenler/OkutmaKutusu";
import {
  kabulCihaziOkut,
  kabuluTamamla,
  sevkiyatiReddet,
  type KabulDurumu,
} from "../eylemler";

export function KabulPaneli({
  transferId,
  bekleyenAdet,
  okutulanAdet,
  toplamAdet,
}: {
  transferId: number;
  bekleyenAdet: number;
  okutulanAdet: number;
  toplamAdet: number;
}) {
  const router = useRouter();
  const [tamamlaDurumu, tamamlaEylem] = useActionState<KabulDurumu, FormData>(kabuluTamamla, {});
  const [redDurumu, redEylem] = useActionState<KabulDurumu, FormData>(sevkiyatiReddet, {});
  const [redAcik, setRedAcik] = useState(false);

  async function okut(kod: string): Promise<OkutmaGeriBildirimi> {
    const sonuc = await kabulCihaziOkut(transferId, kod);
    // Sunucu kalemi işaretledi; listedeki durumların tazelenmesi için sayfayı yenile.
    if (sonuc.durum === "KABUL") router.refresh();
    if (sonuc.durum === "KABUL") return { tur: "basari", mesaj: sonuc.mesaj };
    if (sonuc.durum === "ZATEN_OKUTULDU") return { tur: "uyari", mesaj: sonuc.mesaj };
    return { tur: "hata", mesaj: sonuc.mesaj };
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Toplam</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
            {toplamAdet}
          </div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
          <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">
            Okutulan
          </div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums text-emerald-700">
            {okutulanAdet}
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
          <div className="text-xs font-medium uppercase tracking-wide text-amber-700">Bekleyen</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums text-amber-700">
            {bekleyenAdet}
          </div>
        </div>
      </div>

      <OkutmaKutusu
        etiket="Gelen Cihazı Okut"
        ipucu="Paketten çıkan her cihazı okutun. Listede olmayan bir cihaz okutulursa uyarır."
        okut={okut}
        devreDisi={bekleyenAdet === 0}
      />

      <form action={tamamlaEylem} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <input type="hidden" name="transferId" value={transferId} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            {bekleyenAdet === 0
              ? "Tüm cihazlar okutuldu. Kabulü tamamlayın."
              : `${okutulanAdet} cihaz okutuldu, ${bekleyenAdet} cihaz bekliyor. Şimdi tamamlarsanız sevkiyat kısmi kabul olur.`}
          </p>
          <GonderDugmesi tur="basari" bekleyenMetin="Kaydediliyor…" disabled={okutulanAdet === 0}>
            Kabulü Tamamla
          </GonderDugmesi>
        </div>
        {tamamlaDurumu.hata ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {tamamlaDurumu.hata}
          </p>
        ) : null}
        {tamamlaDurumu.basari ? (
          <p role="status" className="mt-2 text-sm font-medium text-emerald-700">
            {tamamlaDurumu.basari}
          </p>
        ) : null}
      </form>

      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        {!redAcik ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-red-800">
              Gelmeyen veya yanlış gönderilen cihazlar varsa gönderen mağazaya geri yollayın.
            </p>
            <button
              type="button"
              onClick={() => setRedAcik(true)}
              className="rounded-lg border border-red-300 bg-white px-3.5 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
            >
              Okutulmayanları Reddet
            </button>
          </div>
        ) : (
          <form action={redEylem}>
            <input type="hidden" name="transferId" value={transferId} />
            <label htmlFor="redNedeni" className="mb-1 block text-sm font-medium text-red-900">
              Red nedeni *
            </label>
            <input
              id="redNedeni"
              name="redNedeni"
              required
              minLength={3}
              maxLength={200}
              placeholder="Örn. paketten çıkmadı, hasarlı geldi"
              className={GIRDI_SINIFI}
            />
            <p className="mt-1.5 text-xs text-red-800">
              Okutulmayan {bekleyenAdet} cihaz gönderen mağazanın stoğuna geri döner.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <GonderDugmesi tur="tehlike" bekleyenMetin="Gönderiliyor…">
                Reddet ve Geri Gönder
              </GonderDugmesi>
              <button
                type="button"
                onClick={() => setRedAcik(false)}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Vazgeç
              </button>
            </div>
            {redDurumu.hata ? (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {redDurumu.hata}
              </p>
            ) : null}
            {redDurumu.basari ? (
              <p role="status" className="mt-2 text-sm font-medium text-emerald-700">
                {redDurumu.basari}
              </p>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
