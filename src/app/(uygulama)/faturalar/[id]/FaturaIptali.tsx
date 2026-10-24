"use client";

import { useActionState, useState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { GEREKCE_EN_AZ, GEREKCE_EN_COK } from "@/lib/kayitIptali";
import { faturayiIptalEt, type FaturaIptalDurumu } from "../eylemler";

/**
 * Yanlış girilmiş alış faturasının iptali.
 *
 * İki adımlı: önce düğme, sonra gerekçe ve onay. Fatura iptali bir cihazdan
 * fazlasını etkiliyor, tek tıkla olmamalı.
 */
export function FaturaIptali({
  faturaId,
  kalemAdedi,
  engel,
}: {
  faturaId: number;
  kalemAdedi: number;
  engel: string | null;
}) {
  const [acik, setAcik] = useState(false);
  const [durum, iptalEt] = useActionState<FaturaIptalDurumu, FormData>(
    faturayiIptalEt,
    {},
  );

  if (engel) {
    return (
      <p data-test="fatura-iptal-engeli" className="text-sm text-slate-600">
        {engel}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">
        Fatura yanlış girildiyse iptal edin. Kayıt silinmez: faturadaki{" "}
        <strong>{kalemAdedi} cihaz</strong> iptal edilir, tutar vade ve borç
        raporlarından düşer, fatura numarası yeniden kullanılabilir hale gelir.
      </p>

      {!acik ? (
        <button
          type="button"
          data-test="fatura-iptal-ac"
          onClick={() => setAcik(true)}
          className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
        >
          Faturayı İptal Et
        </button>
      ) : (
        <form
          action={iptalEt}
          className="space-y-2"
          data-test="fatura-iptal-formu"
        >
          <input type="hidden" name="faturaId" value={faturaId} />
          <div>
            <label
              htmlFor="faturaGerekce"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              İptal gerekçesi (en az {GEREKCE_EN_AZ} karakter)
            </label>
            <input
              id="faturaGerekce"
              name="gerekce"
              required
              minLength={GEREKCE_EN_AZ}
              maxLength={GEREKCE_EN_COK}
              placeholder="Örn: Fatura iki kez girilmiş"
              className={GIRDI_SINIFI}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <GonderDugmesi bekleyenMetin="İptal ediliyor…">
              Evet, Faturayı İptal Et
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
        <p
          role="alert"
          data-test="fatura-iptal-hata"
          className="text-sm text-red-600"
        >
          {durum.hata}
        </p>
      ) : null}
      {durum.basari ? (
        <p role="status" className="text-sm text-emerald-700">
          {durum.basari}
        </p>
      ) : null}
    </div>
  );
}
