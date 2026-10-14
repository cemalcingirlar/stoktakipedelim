import Link from "next/link";
import type { ReactNode } from "react";

export function Kart({
  baslik,
  baslikYolu,
  eylem,
  children,
  className = "",
}: {
  baslik?: string;
  /** Verilirse başlık tıklanabilir olur; karttaki özetin tam listesine götürür. */
  baslikYolu?: string;
  eylem?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const basligiYaz = () => {
    if (!baslik) return <span />;
    const metin = <h2 className="text-sm font-semibold text-slate-800">{baslik}</h2>;
    if (!baslikYolu) return metin;
    return (
      <Link
        href={baslikYolu}
        className="group inline-flex items-center gap-1 text-slate-800 underline-offset-2 hover:underline"
      >
        {metin}
        <span aria-hidden className="text-xs text-slate-400 group-hover:text-slate-600">
          →
        </span>
      </Link>
    );
  };

  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {baslik || eylem ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          {basligiYaz()}
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
  yol,
}: {
  etiket: string;
  deger: string;
  altBilgi?: string;
  vurgu?: "normal" | "uyari" | "tehlike" | "basari";
  /** Verilirse kart tıklanabilir olur; sayının geldiği listeye götürür. */
  yol?: string;
}) {
  const renk = {
    normal: "text-slate-900",
    uyari: "text-amber-600",
    tehlike: "text-red-600",
    basari: "text-emerald-600",
  }[vurgu];

  const icerik = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{etiket}</div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${renk}`}>{deger}</div>
      {altBilgi ? <div className="mt-1 text-xs text-slate-500">{altBilgi}</div> : null}
    </>
  );

  const kutu = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
  if (!yol) return <div className={kutu}>{icerik}</div>;

  return (
    <Link href={yol} className={`${kutu} block transition hover:border-blue-300 hover:bg-blue-50`}>
      {icerik}
    </Link>
  );
}
