"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { girisYap, type GirisDurumu } from "./eylemler";

function GirisDugmesi() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Giriş yapılıyor…" : "Giriş Yap"}
    </button>
  );
}

export function GirisFormu({ devam }: { devam: string }) {
  const [durum, eylem] = useActionState<GirisDurumu, FormData>(girisYap, { deneme: 0 });
  const sifreRef = useRef<HTMLInputElement>(null);

  // Başarısız denemeden sonra imleç şifre alanına gelsin.
  useEffect(() => {
    if (durum.hata) sifreRef.current?.focus();
  }, [durum]);

  return (
    <form action={eylem} className="space-y-4">
      <input type="hidden" name="devam" value={devam} />

      <div>
        <label htmlFor="kullaniciAdi" className="mb-1.5 block text-sm font-medium text-slate-700">
          Kullanıcı adı
        </label>
        {/*
          React 19 form action tamamlandığında formu sıfırlar. Hatalı girişte
          kullanıcı adının kaybolmaması için alan her denemede `key` ile yeniden
          kurulur ve sunucudan dönen değerle doldurulur.
        */}
        <input
          key={`kullanici-${durum.deneme}`}
          id="kullaniciAdi"
          name="kullaniciAdi"
          type="text"
          autoComplete="username"
          autoFocus={!durum.hata}
          required
          defaultValue={durum.kullaniciAdi ?? ""}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="sifre" className="mb-1.5 block text-sm font-medium text-slate-700">
          Şifre
        </label>
        <input
          id="sifre"
          name="sifre"
          ref={sifreRef}
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {durum.hata ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {durum.hata}
        </p>
      ) : null}

      <GirisDugmesi />
    </form>
  );
}
