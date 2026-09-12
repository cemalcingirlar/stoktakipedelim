"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { GonderDugmesi } from "./Dugme";
import {
  SUTUNLAR,
  SUTUN_ANAHTARLARI,
  type SutunAnahtari,
} from "@/lib/sutunlar";
import { sutunTercihiKaydet, type SutunDurumu } from "@/app/(uygulama)/cihazlar/eylemler";

/** "Sütunlar" menüsü: listede hangi sütunların görüneceğini kullanıcı seçer. */
export function SutunSecici({ secili }: { secili: SutunAnahtari[] }) {
  const [acik, setAcik] = useState(false);
  const [durum, eylem] = useActionState<SutunDurumu, FormData>(sutunTercihiKaydet, {});
  const kapsayiciRef = useRef<HTMLDivElement>(null);

  // Menü dışına tıklayınca kapansın.
  useEffect(() => {
    if (!acik) return;
    function disariTiklandi(olay: MouseEvent) {
      if (!kapsayiciRef.current?.contains(olay.target as Node)) setAcik(false);
    }
    document.addEventListener("mousedown", disariTiklandi);
    return () => document.removeEventListener("mousedown", disariTiklandi);
  }, [acik]);

  const seciliKume = new Set(secili);

  return (
    <div ref={kapsayiciRef} className="relative">
      <button
        type="button"
        onClick={() => setAcik((o) => !o)}
        aria-expanded={acik}
        className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Sütunlar ({secili.length}) ▾
      </button>

      {acik ? (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <form action={eylem}>
            <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
              {SUTUN_ANAHTARLARI.map((anahtar) => (
                <label
                  key={anahtar}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    name="sutun"
                    value={anahtar}
                    defaultChecked={seciliKume.has(anahtar)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {SUTUNLAR[anahtar].baslik}
                </label>
              ))}
            </div>
            {durum.hata ? (
              <p role="alert" className="mt-2 text-xs text-red-600">
                {durum.hata}
              </p>
            ) : null}
            <div className="mt-3 border-t border-slate-100 pt-3">
              <GonderDugmesi bekleyenMetin="Kaydediliyor…" className="w-full">
                Uygula
              </GonderDugmesi>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
