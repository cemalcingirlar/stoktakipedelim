"use client";

import { useActionState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { sayimBaslat, type SayimDurumu } from "./eylemler";

export function SayimBaslatFormu({
  magazalar,
  varsayilanId,
}: {
  magazalar: { id: number; ad: string; stokAdedi: number; acikSayimVar: boolean }[];
  varsayilanId: number | null;
}) {
  const [durum, eylem] = useActionState<SayimDurumu, FormData>(sayimBaslat, {});

  return (
    <form action={eylem}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="magazaId" className="mb-1 block text-xs font-medium text-slate-600">
            Sayılacak mağaza
          </label>
          <select
            id="magazaId"
            name="magazaId"
            required
            defaultValue={varsayilanId ?? ""}
            className={GIRDI_SINIFI}
          >
            <option value="">Seçin…</option>
            {magazalar.map((m) => (
              <option key={m.id} value={m.id} disabled={m.acikSayimVar}>
                {m.ad} — {m.stokAdedi} cihaz
                {m.acikSayimVar ? " (devam eden sayım var)" : ""}
              </option>
            ))}
          </select>
        </div>
        <GonderDugmesi bekleyenMetin="Başlatılıyor…">Sayımı Başlat</GonderDugmesi>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Sayım o mağazanın stoğunu başlangıç anında fotoğraflar. Diğer mağazalar etkilenmez.
      </p>
      {durum.hata ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {durum.hata}
        </p>
      ) : null}
    </form>
  );
}
