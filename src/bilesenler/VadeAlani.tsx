"use client";

import { useState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { VADE_ETIKET, VADE_SECENEKLERI } from "@/lib/sabitler";

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

/**
 * Tedarikçi vadesi alanı: hazır gün seçenekleri veya elle yazılan vade tarihi.
 *
 * "Özel tarih" seçilince `vadeTarihi` alanı forma eklenir; sunucu tarafı gün
 * sayısını bu tarihten hesaplar, böylece gün ile tarih asla çelişmez.
 */
export function VadeAlani({ faturaTarihi }: { faturaTarihi?: string }) {
  const [secim, setSecim] = useState("0");
  const ozel = secim === "ozel";

  return (
    <>
      <div>
        <label htmlFor="vadeGun" className={KUCUK_ETIKET}>
          Vade (tedarikçinin uyguladığı)
        </label>
        <select
          id="vadeGun"
          name="vadeGun"
          value={secim}
          onChange={(e) => setSecim(e.target.value)}
          className={GIRDI_SINIFI}
        >
          {VADE_SECENEKLERI.map((v) => (
            <option key={v} value={v}>
              {VADE_ETIKET[v]}
            </option>
          ))}
          <option value="ozel">Özel tarih…</option>
        </select>
      </div>

      {ozel ? (
        <div>
          <label htmlFor="vadeTarihi" className={KUCUK_ETIKET}>
            Vade tarihi *
          </label>
          <input
            id="vadeTarihi"
            name="vadeTarihi"
            type="date"
            required
            min={faturaTarihi}
            className={GIRDI_SINIFI}
          />
          <p className="mt-1 text-xs text-slate-500">
            Gün sayısı fatura tarihine göre kendiliğinden hesaplanır.
          </p>
        </div>
      ) : null}
    </>
  );
}
