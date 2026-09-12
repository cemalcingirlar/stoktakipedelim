"use client";

import { useActionState } from "react";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { vadeOdemesiDegistir, type OdemeDurumu } from "../eylemler";

export function VadeDugmesi({ faturaId, odendi }: { faturaId: number; odendi: boolean }) {
  const [durum, eylem] = useActionState<OdemeDurumu, FormData>(vadeOdemesiDegistir, {});

  return (
    <form action={eylem} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="faturaId" value={faturaId} />
      <input type="hidden" name="odendi" value={odendi ? "0" : "1"} />
      <GonderDugmesi
        tur={odendi ? "ikincil" : "basari"}
        bekleyenMetin="Kaydediliyor…"
      >
        {odendi ? "Ödenmedi olarak işaretle" : "Ödendi olarak işaretle"}
      </GonderDugmesi>
      {durum.hata ? (
        <span role="alert" className="text-sm text-red-600">
          {durum.hata}
        </span>
      ) : null}
    </form>
  );
}
