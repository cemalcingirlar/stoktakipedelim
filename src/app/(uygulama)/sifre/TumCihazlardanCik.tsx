"use client";

import { useState } from "react";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { tumCihazlardanCik } from "./eylemler";

/**
 * "Tüm cihazlardan çık" — iki adımlı.
 *
 * Tek tıkla çalışsaydı, kendi oturumunu da kapattığı için yanlışlıkla
 * basıldığında insanı dışarı atardı.
 */
export function TumCihazlardanCik() {
  const [acik, setAcik] = useState(false);

  if (!acik) {
    return (
      <button
        type="button"
        onClick={() => setAcik(true)}
        data-test="tum-cihazlardan-cik-ac"
        className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Tüm cihazlardan çık
      </button>
    );
  }

  return (
    <form action={tumCihazlardanCik} data-test="tum-cihazlardan-cik-formu">
      <p className="mb-2 text-sm text-slate-700">
        Bu hesabın bütün oturumları kapanacak — telefon, tablet ve bu ekran
        dahil. Tekrar giriş yapmanız gerekecek.
      </p>
      <div className="flex gap-2">
        <GonderDugmesi>Evet, hepsinden çık</GonderDugmesi>
        <button
          type="button"
          onClick={() => setAcik(false)}
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Vazgeç
        </button>
      </div>
    </form>
  );
}
