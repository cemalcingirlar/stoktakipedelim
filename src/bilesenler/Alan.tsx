import type { ReactNode } from "react";

export const GIRDI_SINIFI =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500";

export const ETIKET_SINIFI = "mb-1.5 block text-sm font-medium text-slate-700";

export function Alan({
  etiket,
  htmlFor,
  ipucu,
  hata,
  gerekli,
  children,
  className = "",
}: {
  etiket: string;
  htmlFor?: string;
  ipucu?: string;
  hata?: string;
  gerekli?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={ETIKET_SINIFI}>
        {etiket}
        {gerekli ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      {children}
      {ipucu && !hata ? <p className="mt-1 text-xs text-slate-500">{ipucu}</p> : null}
      {hata ? <p className="mt-1 text-xs text-red-600">{hata}</p> : null}
    </div>
  );
}
