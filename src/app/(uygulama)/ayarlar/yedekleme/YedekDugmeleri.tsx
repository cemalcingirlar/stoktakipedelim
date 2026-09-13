"use client";

import { useActionState } from "react";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { baglantiSina, simdiYedekle, type YedekEylemDurumu } from "./eylemler";

function Sonuc({ durum }: { durum: YedekEylemDurumu }) {
  if (durum.hata) {
    return (
      <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {durum.hata}
      </p>
    );
  }
  if (durum.basari) {
    return (
      <p role="status" className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {durum.basari}
      </p>
    );
  }
  return null;
}

export function YedekDugmeleri({ yapilandirildi }: { yapilandirildi: boolean }) {
  const [yedekDurumu, yedekEylem] = useActionState<YedekEylemDurumu, FormData>(simdiYedekle, {});
  const [sinaDurumu, sinaEylem] = useActionState<YedekEylemDurumu, FormData>(baglantiSina, {});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <form action={sinaEylem}>
          <GonderDugmesi tur="ikincil" bekleyenMetin="Sınanıyor…" disabled={!yapilandirildi}>
            Bağlantıyı Sına
          </GonderDugmesi>
        </form>
        <form action={yedekEylem}>
          <GonderDugmesi bekleyenMetin="Yedekleniyor…" disabled={!yapilandirildi}>
            Şimdi Yedekle
          </GonderDugmesi>
        </form>
      </div>
      <Sonuc durum={sinaDurumu} />
      <Sonuc durum={yedekDurumu} />
      {!yapilandirildi ? (
        <p className="text-sm text-amber-700">
          Google Drive yapılandırılmadan yedek alınamaz. Aşağıdaki adımları izleyin.
        </p>
      ) : null}
    </div>
  );
}
