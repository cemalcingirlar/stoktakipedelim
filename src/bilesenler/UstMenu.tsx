"use client";

import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Link } from "@/bilesenler/Bag";

/**
 * Tıklanan menü ögesinin yanında görünen nokta.
 *
 * Sayfanın üstündeki bekleme çizgisi ortak bağlantı bileşeninde
 * (src/bilesenler/Bag.tsx); bu nokta hangi ögeye tıklandığını gösteriyor.
 */
function BeklemeNoktasi() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="ml-1.5 inline-block h-1.5 w-1.5 animate-ping rounded-full bg-sky-300 align-middle"
    />
  );
}

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
        <Link
          href="/panel"
          className="text-base font-semibold tracking-tight text-white"
        >
          {firmaAdi}
        </Link>

        {/* Hızlı seri numarası arama.
            Menüdeki "Panel" girdisi logoyla aynı yere gidiyordu; yeri bu
            kutuya verildi. Cihazlar sayfasına girip aramak yerine tam bir
            seri numarası yazıldığında liste doğrudan o cihazın detayına
            atlıyor. Form JavaScript'siz çalışıyor. */}
        <form
          method="get"
          action="/cihazlar"
          data-test="hizli-seri-arama"
          className="order-last flex w-full items-center gap-1 sm:order-none sm:w-auto"
        >
          <input
            type="search"
            name="ara"
            required
            placeholder="Seri no / IMEI ara"
            aria-label="Seri numarası ara"
            data-test="hizli-seri-kutusu"
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-sm text-slate-100 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none sm:w-52"
          />
          <button
            type="submit"
            data-test="hizli-seri-dugmesi"
            className="shrink-0 rounded-md bg-slate-700 px-2.5 py-1 text-sm font-medium text-white transition hover:bg-slate-600"
          >
            Ara
          </button>
        </form>

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
              <BeklemeNoktasi />
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
          {/* Kendi şifresini değiştirme yolu: geçici şifre kalıcı olmasın. */}
          <Link
            href="/sifre"
            data-test="sifre-baglantisi"
            className="rounded-md px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            Şifre
            <BeklemeNoktasi />
          </Link>
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
