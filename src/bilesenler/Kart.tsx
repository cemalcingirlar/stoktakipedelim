import type { ReactNode } from "react";

export function Kart({
  baslik,
  eylem,
  children,
  className = "",
}: {
  baslik?: string;
  eylem?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {baslik || eylem ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          {baslik ? <h2 className="text-sm font-semibold text-slate-800">{baslik}</h2> : <span />}
          {eylem}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function SayiKarti({
  etiket,
  deger,
  altBilgi,
  vurgu = "normal",
}: {
  etiket: string;
  deger: string;
  altBilgi?: string;
  vurgu?: "normal" | "uyari" | "tehlike" | "basari";
}) {
  const renk = {
    normal: "text-slate-900",
    uyari: "text-amber-600",
    tehlike: "text-red-600",
    basari: "text-emerald-600",
  }[vurgu];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{etiket}</div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${renk}`}>{deger}</div>
      {altBilgi ? <div className="mt-1 text-xs text-slate-500">{altBilgi}</div> : null}
    </div>
  );
}
