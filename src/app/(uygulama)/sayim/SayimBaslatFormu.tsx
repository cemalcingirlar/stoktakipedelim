"use client";

import { useActionState, useState } from "react";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { kapsamEtiketi } from "@/lib/sayimKapsami";
import { sayimBaslat, type SayimDurumu } from "./eylemler";

type SecilebilirMagaza = {
  id: number;
  ad: string;
  stokAdedi: number;
  acikSayimVar: boolean;
};

/**
 * Sayım başlatma: bir ya da birden çok mağaza seçilir.
 *
 * Aynı dükkânda duran kasa ve depo kayıtları fiziken iç içe; ayrı sayıldığında
 * her sayım diğerinin cihazlarını "fazla" gösteriyordu. Bu yüzden seçim tek
 * mağaza değil kutu listesi: kullanıcı birlikte sayacaklarını işaretliyor.
 *
 * Varsayılan tek mağaza (kullanıcının ana mağazası): sayımların çoğu hâlâ tek
 * mağazalı ve her açılışta seçim yapmak zorunda kalmamalı.
 */
export function SayimBaslatFormu({
  magazalar,
  varsayilanId,
}: {
  magazalar: SecilebilirMagaza[];
  varsayilanId: number | null;
}) {
  const [durum, eylem] = useActionState<SayimDurumu, FormData>(sayimBaslat, {});
  const [secili, setSecili] = useState<number[]>(() => {
    const uygun = magazalar.filter((m) => !m.acikSayimVar);
    const varsayilan = uygun.find((m) => m.id === varsayilanId);
    return varsayilan ? [varsayilan.id] : [];
  });

  function degistir(id: number, isaretli: boolean) {
    setSecili((mevcut) =>
      isaretli ? [...new Set([...mevcut, id])] : mevcut.filter((x) => x !== id),
    );
  }

  const seciliAdlar = magazalar.filter((m) => secili.includes(m.id)).map((m) => m.ad);
  const seciliStok = magazalar
    .filter((m) => secili.includes(m.id))
    .reduce((t, m) => t + m.stokAdedi, 0);

  return (
    <form action={eylem}>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-slate-600">
          Sayılacak mağaza(lar)
        </legend>
        <div className="flex flex-wrap gap-2">
          {magazalar.map((m) => {
            const isaretli = secili.includes(m.id);
            return (
              <label
                key={m.id}
                data-test="sayim-magaza-secimi"
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  m.acikSayimVar
                    ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                    : isaretli
                      ? "border-blue-400 bg-blue-50 text-blue-900"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  name="magazaIdleri"
                  value={m.id}
                  checked={isaretli}
                  disabled={m.acikSayimVar}
                  onChange={(e) => degistir(m.id, e.target.checked)}
                  className="h-4 w-4"
                />
                <span>
                  {m.ad}{" "}
                  <span className="text-xs text-slate-500">
                    — {m.stokAdedi} cihaz
                    {m.acikSayimVar ? " (devam eden sayım var)" : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <GonderDugmesi bekleyenMetin="Başlatılıyor…">Sayımı Başlat</GonderDugmesi>
        {secili.length > 0 ? (
          <span data-test="sayim-kapsam-ozeti" className="text-sm text-slate-600">
            {kapsamEtiketi(seciliAdlar)} · {seciliStok} cihaz beklenecek
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Sayım, seçilen mağazaların stoğunu başlangıç anında fotoğraflar. Birden çok mağaza
        seçerseniz aralarındaki cihazlar &quot;fazla&quot; sayılmaz — aynı dükkânda duran kasa
        ve depo kayıtları için bunu kullanın. Seçilmeyen mağazalar etkilenmez.
      </p>

      {durum.hata ? (
        <p role="alert" data-test="sayim-hata" className="mt-2 text-sm text-red-600">
          {durum.hata}
        </p>
      ) : null}
    </form>
  );
}
