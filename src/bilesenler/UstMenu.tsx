"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type MenuOgesi = { etiket: string; yol: string };

export function UstMenu({
  firmaAdi,
  ogeler,
  kullaniciAdi,
  rolEtiketi,
  magazaAdi,
  cikisEylemi,
}: {
  firmaAdi: string;
  ogeler: MenuOgesi[];
  kullaniciAdi: string;
  rolEtiketi: string;
  magazaAdi: string | null;
  cikisEylemi: () => Promise<void>;
}) {
  const yol = usePathname();
  const [acik, setAcik] = useState(false);

  function aktifMi(hedef: string) {
    return yol === hedef || yol.startsWith(`${hedef}/`);
  }

  return (
    <header className="bg-slate-900 text-slate-200">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/panel" className="text-base font-semibold tracking-tight text-white">
          {firmaAdi}
        </Link>

        <button
          type="button"
          onClick={() => setAcik((o) => !o)}
          aria-expanded={acik}
          aria-label="Menüyü aç/kapat"
          className="ml-auto rounded-md p-1.5 hover:bg-slate-800 sm:hidden"
        >
          <span className="block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
        </button>

        <nav
          className={`${acik ? "flex" : "hidden"} w-full flex-col gap-1 sm:flex sm:w-auto sm:flex-row sm:items-center`}
        >
          {ogeler.map((oge) => (
            <Link
              key={oge.yol}
              href={oge.yol}
              onClick={() => setAcik(false)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                aktifMi(oge.yol)
                  ? "bg-slate-700 font-medium text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {oge.etiket}
            </Link>
          ))}
        </nav>

        <div
          className={`${acik ? "flex" : "hidden"} w-full flex-col gap-2 sm:ml-auto sm:flex sm:w-auto sm:flex-row sm:items-center sm:gap-4`}
        >
          <div className="text-right text-xs leading-tight">
            <div className="font-medium text-white">{kullaniciAdi}</div>
            <div className="text-slate-400">
              {rolEtiketi}
              {magazaAdi ? ` · ${magazaAdi}` : ""}
            </div>
          </div>
          <form action={cikisEylemi}>
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-sm text-red-300 transition hover:bg-slate-800 hover:text-red-200"
            >
              Çıkış
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
