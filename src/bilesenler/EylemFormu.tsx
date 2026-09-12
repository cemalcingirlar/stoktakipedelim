"use client";

import { useActionState, type ReactNode } from "react";
import type { AyarDurumu } from "@/app/(uygulama)/ayarlar/eylemler";

/**
 * Sonucu (hata / başarı) kendi içinde gösteren küçük server-action formu.
 * Ayarlar ekranlarındaki tekrarı önler.
 */
export function EylemFormu({
  eylem,
  children,
  className = "",
  sonucuGizle = false,
}: {
  eylem: (onceki: AyarDurumu, form: FormData) => Promise<AyarDurumu>;
  children: ReactNode;
  className?: string;
  sonucuGizle?: boolean;
}) {
  const [durum, gonder] = useActionState<AyarDurumu, FormData>(eylem, {});

  return (
    <form action={gonder} className={className}>
      {children}
      {!sonucuGizle && durum.hata ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {durum.hata}
        </p>
      ) : null}
      {!sonucuGizle && durum.basari ? (
        <p role="status" className="mt-2 text-sm text-emerald-700">
          {durum.basari}
        </p>
      ) : null}
    </form>
  );
}
