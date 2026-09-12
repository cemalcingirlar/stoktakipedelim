"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

const TURLER = {
  birincil: "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500",
  ikincil:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400",
  tehlike: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
  basari: "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500",
} as const;

export type DugmeTuru = keyof typeof TURLER;

const TEMEL =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60";

/** Form gönderimi sırasında kendini kilitleyen buton. */
export function GonderDugmesi({
  children,
  bekleyenMetin,
  tur = "birincil",
  className = "",
  ...kalan
}: {
  children: ReactNode;
  bekleyenMetin?: string;
  tur?: DugmeTuru;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || kalan.disabled}
      {...kalan}
      className={`${TEMEL} ${TURLER[tur]} ${className}`}
    >
      {pending && bekleyenMetin ? bekleyenMetin : children}
    </button>
  );
}

export { TEMEL as DUGME_TEMEL, TURLER as DUGME_TURLERI };
