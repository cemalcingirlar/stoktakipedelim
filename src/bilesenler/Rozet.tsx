import type { ReactNode } from "react";

const TONLAR = {
  nötr: "bg-slate-100 text-slate-700",
  mavi: "bg-blue-100 text-blue-700",
  yesil: "bg-emerald-100 text-emerald-700",
  sari: "bg-amber-100 text-amber-700",
  kirmizi: "bg-red-100 text-red-700",
  mor: "bg-violet-100 text-violet-700",
} as const;

export type RozetTonu = keyof typeof TONLAR;

export function Rozet({
  ton = "nötr",
  children,
  className = "",
}: {
  ton?: RozetTonu;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${TONLAR[ton]} ${className}`}
    >
      {children}
    </span>
  );
}

import { STOK_DURUM, STOK_DURUM_ETIKET, type StokDurum } from "@/lib/sabitler";

const DURUM_TONU: Record<StokDurum, RozetTonu> = {
  [STOK_DURUM.STOKTA]: "mavi",
  [STOK_DURUM.TRANSFERDE]: "mor",
  [STOK_DURUM.SATILDI]: "yesil",
  [STOK_DURUM.IADE]: "sari",
  [STOK_DURUM.ARIZALI]: "kirmizi",
};

export function DurumRozeti({ durum }: { durum: string }) {
  const bilinen = durum as StokDurum;
  return (
    <Rozet ton={DURUM_TONU[bilinen] ?? "nötr"}>{STOK_DURUM_ETIKET[bilinen] ?? durum}</Rozet>
  );
}
