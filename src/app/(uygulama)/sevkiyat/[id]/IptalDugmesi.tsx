"use client";

import { useActionState } from "react";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { sevkiyatiIptalEt, type KabulDurumu } from "../eylemler";

export function IptalDugmesi({ transferId }: { transferId: number }) {
  const [durum, eylem] = useActionState<KabulDurumu, FormData>(sevkiyatiIptalEt, {});

  return (
    <form action={eylem}>
      <input type="hidden" name="transferId" value={transferId} />
      <GonderDugmesi tur="ikincil" bekleyenMetin="Geri çekiliyor…">
        Sevkiyatı Geri Çek
      </GonderDugmesi>
      <p className="mt-1.5 text-xs text-slate-500">
        Hedef mağaza okutmaya başlamadıysa cihazlar mağazanıza döner.
      </p>
      {durum.hata ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {durum.hata}
        </p>
      ) : null}
      {durum.basari ? (
        <p role="status" className="mt-2 text-sm font-medium text-emerald-700">
          {durum.basari}
        </p>
      ) : null}
    </form>
  );
}
