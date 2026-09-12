import Link from "next/link";
import { filtreyiSorguyaCevir } from "@/lib/cihazFiltre";

export function Sayfalama({
  sayfa,
  toplamSayfa,
  params,
  temelYol = "/cihazlar",
}: {
  sayfa: number;
  toplamSayfa: number;
  params: Record<string, string | string[] | undefined>;
  temelYol?: string;
}) {
  if (toplamSayfa <= 1) return null;

  const baglanti = (hedef: number) =>
    `${temelYol}${filtreyiSorguyaCevir(params, { sayfa: hedef === 1 ? null : hedef })}`;

  const sinif =
    "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50";

  return (
    <nav className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
      <span className="text-sm text-slate-500">
        Sayfa {sayfa} / {toplamSayfa}
      </span>
      <div className="flex gap-2">
        {sayfa > 1 ? (
          <Link href={baglanti(sayfa - 1)} className={sinif}>
            ← Önceki
          </Link>
        ) : (
          <span className={`${sinif} cursor-not-allowed opacity-40`}>← Önceki</span>
        )}
        {sayfa < toplamSayfa ? (
          <Link href={baglanti(sayfa + 1)} className={sinif}>
            Sonraki →
          </Link>
        ) : (
          <span className={`${sinif} cursor-not-allowed opacity-40`}>Sonraki →</span>
        )}
      </div>
    </nav>
  );
}
