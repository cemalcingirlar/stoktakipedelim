"use client";

import { useActionState } from "react";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import {
  baglantiSina,
  provaYap,
  simdiYedekle,
  type YedekEylemDurumu,
} from "./eylemler";

function Sonuc({ durum }: { durum: YedekEylemDurumu }) {
  if (durum.hata) {
    return (
      <p
        role="alert"
        className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {durum.hata}
      </p>
    );
  }
  if (durum.basari) {
    return (
      <p
        role="status"
        className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
      >
        {durum.basari}
      </p>
    );
  }
  return null;
}

export function YedekDugmeleri({
  yapilandirildi,
}: {
  yapilandirildi: boolean;
}) {
  const [yedekDurumu, yedekEylem] = useActionState<YedekEylemDurumu, FormData>(
    simdiYedekle,
    {},
  );
  const [sinaDurumu, sinaEylem] = useActionState<YedekEylemDurumu, FormData>(
    baglantiSina,
    {},
  );
  // Geri yükleme provası: yedeğin alınması ile açılabilmesi ayrı şeyler.
  const [provaDurumu, provaEylem] = useActionState<YedekEylemDurumu, FormData>(
    provaYap,
    {},
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <form action={sinaEylem}>
          <GonderDugmesi
            tur="ikincil"
            bekleyenMetin="Sınanıyor…"
            disabled={!yapilandirildi}
          >
            Bağlantıyı Sına
          </GonderDugmesi>
        </form>
        <form action={yedekEylem}>
          <GonderDugmesi
            bekleyenMetin="Yedekleniyor…"
            disabled={!yapilandirildi}
          >
            Şimdi Yedekle
          </GonderDugmesi>
        </form>
        {/* Yedeğin alınması ile geri yüklenebilmesi ayrı şeyler: prova,
            Drive'daki dosyayı geri indirip açıyor. */}
        <form action={provaEylem} data-test="prova-formu">
          <GonderDugmesi
            tur="ikincil"
            bekleyenMetin="Prova yapılıyor…"
            disabled={!yapilandirildi}
          >
            Geri Yükleme Provası
          </GonderDugmesi>
        </form>
      </div>
      <Sonuc durum={sinaDurumu} />
      <Sonuc durum={yedekDurumu} />
      <Sonuc durum={provaDurumu} />
      {!yapilandirildi ? (
        <p className="text-sm text-amber-700">
          Google Drive yapılandırılmadan yedek alınamaz. Aşağıdaki adımları
          izleyin.
        </p>
      ) : null}
    </div>
  );
}
