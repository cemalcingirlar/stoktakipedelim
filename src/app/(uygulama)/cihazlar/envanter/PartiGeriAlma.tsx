"use client";

import { useActionState, useState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { GEREKCE_EN_AZ, GEREKCE_EN_COK } from "@/lib/kayitIptali";
import { partiyiGeriAl, type PartiGeriAlmaDurumu } from "./eylemler";

/**
 * Bir yükleme partisinin topluca geri alınması.
 *
 * İki adımlı: yüzlerce cihazı etkileyen bir işlem tek tıkla olmamalı.
 */
export function PartiGeriAlma({
  partiId,
  adet,
}: {
  partiId: number;
  adet: number;
}) {
  const [acik, setAcik] = useState(false);
  const [durum, geriAl] = useActionState<PartiGeriAlmaDurumu, FormData>(
    partiyiGeriAl,
    {},
  );

  return (
    <div className="space-y-2">
      {!acik ? (
        <button
          type="button"
          data-test="parti-geri-al"
          onClick={() => setAcik(true)}
          className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50"
        >
          Bu Yüklemeyi Geri Al
        </button>
      ) : (
        <form
          action={geriAl}
          className="space-y-2"
          data-test="parti-geri-al-formu"
        >
          <input type="hidden" name="partiId" value={partiId} />
          <p className="text-xs text-slate-600">
            Bu yüklemedeki <strong>{adet} cihaz</strong> iptal edilecek;
            kayıtlar silinmez, stok toplamlarından düşer.
          </p>
          <input
            name="gerekce"
            required
            minLength={GEREKCE_EN_AZ}
            maxLength={GEREKCE_EN_COK}
            placeholder="Geri alma gerekçesi"
            className={GIRDI_SINIFI}
          />
          <div className="flex flex-wrap gap-2">
            <GonderDugmesi bekleyenMetin="Geri alınıyor…">
              Evet, Geri Al
            </GonderDugmesi>
            <button
              type="button"
              onClick={() => setAcik(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Vazgeç
            </button>
          </div>
        </form>
      )}
      {durum.hata ? (
        <p role="alert" data-test="parti-hata" className="text-xs text-red-600">
          {durum.hata}
        </p>
      ) : null}
      {durum.basari ? (
        <p role="status" className="text-xs text-emerald-700">
          {durum.basari}
        </p>
      ) : null}
    </div>
  );
}
