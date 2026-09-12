import Link from "next/link";
import { DurumRozeti, Rozet } from "./Rozet";
import type { CihazSatiri } from "@/lib/cihazFiltre";
import { kurusuTLYaz } from "@/lib/para";
import { VADE_ETIKET } from "@/lib/sabitler";
import { beklemeGunu, karKurus, SUTUNLAR, type SutunAnahtari } from "@/lib/sutunlar";
import { vadeDurumu } from "@/lib/vade";

function BeklemeRozeti({ gun }: { gun: number }) {
  const ton = gun >= 180 ? "kirmizi" : gun >= 60 ? "sari" : "nötr";
  return <Rozet ton={ton}>{gun} gün</Rozet>;
}

/** Varsayılan metin dışında özel gösterim isteyen sütunlar. */
function Hucre({
  anahtar,
  satir,
  bugun,
}: {
  anahtar: SutunAnahtari;
  satir: CihazSatiri;
  bugun: Date;
}) {
  switch (anahtar) {
    case "model":
      return (
        <Link href={`/cihazlar/${satir.id}`} className="font-medium text-blue-600 hover:underline">
          {`${satir.marka} ${satir.model}`.trim()}
        </Link>
      );
    case "seriNo":
      return satir.seriNo ? (
        <span className="font-mono text-xs text-slate-700">{satir.seriNo}</span>
      ) : (
        <span className="text-slate-300">—</span>
      );
    case "barkod":
      return satir.barkod ? (
        <span className="font-mono text-xs text-slate-700">{satir.barkod}</span>
      ) : (
        <span className="text-slate-300">—</span>
      );
    case "durum":
      return <DurumRozeti durum={satir.durum} />;
    case "bekleme":
      return <BeklemeRozeti gun={beklemeGunu(satir, bugun)} />;
    case "vade": {
      const v = vadeDurumu(satir.alisFaturasi, bugun);
      if (v.durum === "YOK") return <span className="text-slate-300">—</span>;
      return (
        <span className="whitespace-nowrap">
          <Rozet ton={v.durum === "GECTI" ? "kirmizi" : v.durum === "YAKLASIYOR" ? "sari" : v.durum === "ODENDI" ? "yesil" : "nötr"}>
            {v.etiket}
          </Rozet>
          <span className="ml-1 text-xs text-slate-400">
            {VADE_ETIKET[satir.alisFaturasi?.vadeGun ?? 0]}
          </span>
        </span>
      );
    }
    case "kar": {
      const k = karKurus(satir);
      if (k === null) return <span className="text-slate-300">—</span>;
      return (
        <span className={k < 0 ? "text-red-600" : "text-emerald-700"}>{kurusuTLYaz(k)}</span>
      );
    }
    case "not":
      return satir.not ? (
        <span className="text-slate-600">{satir.not}</span>
      ) : (
        <span className="text-xs italic text-slate-300">+ not</span>
      );
    default: {
      const metin = SUTUNLAR[anahtar].metin(satir, bugun);
      return metin ? <>{metin}</> : <span className="text-slate-300">—</span>;
    }
  }
}

export function CihazTablosu({
  satirlar,
  sutunlar,
  bugun,
}: {
  satirlar: CihazSatiri[];
  sutunlar: SutunAnahtari[];
  bugun: Date;
}) {
  if (satirlar.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-slate-500">
        Bu filtrelere uyan cihaz bulunamadı.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            {sutunlar.map((a) => (
              <th
                key={a}
                className={`whitespace-nowrap px-3 py-2.5 font-medium ${SUTUNLAR[a].sagaYasli ? "text-right" : ""}`}
              >
                {SUTUNLAR[a].baslik}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {satirlar.map((satir) => {
            const vade = vadeDurumu(satir.alisFaturasi, bugun);
            return (
              <tr
                key={satir.id}
                className={vade.satirSinifi || "hover:bg-slate-50"}
              >
                {sutunlar.map((a) => (
                  <td
                    key={a}
                    className={`px-3 py-2.5 align-top ${SUTUNLAR[a].sagaYasli ? "text-right tabular-nums" : ""}`}
                  >
                    <Hucre anahtar={a} satir={satir} bugun={bugun} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
