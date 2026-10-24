"use client";

import { useActionState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { SIFRE_EN_AZ, sifreKuralOzeti } from "@/lib/sifrePolitikasi";
import { kendiSifremiDegistir, type SifreDurumu } from "./eylemler";

export function SifreFormu() {
  const [durum, degistir] = useActionState<SifreDurumu, FormData>(
    kendiSifremiDegistir,
    {},
  );

  return (
    <form action={degistir} data-test="sifre-formu" className="space-y-3">
      <div>
        <label
          htmlFor="mevcutSifre"
          className="mb-1 block text-xs font-medium text-slate-600"
        >
          Mevcut şifreniz
        </label>
        <input
          id="mevcutSifre"
          name="mevcutSifre"
          type="password"
          required
          autoComplete="current-password"
          className={GIRDI_SINIFI}
        />
      </div>
      <div>
        <label
          htmlFor="yeniSifre"
          className="mb-1 block text-xs font-medium text-slate-600"
        >
          Yeni şifre (en az {SIFRE_EN_AZ} karakter)
        </label>
        <input
          id="yeniSifre"
          name="yeniSifre"
          type="password"
          required
          minLength={SIFRE_EN_AZ}
          autoComplete="new-password"
          className={GIRDI_SINIFI}
        />
      </div>
      <div>
        <label
          htmlFor="yeniSifreTekrar"
          className="mb-1 block text-xs font-medium text-slate-600"
        >
          Yeni şifre (tekrar)
        </label>
        <input
          id="yeniSifreTekrar"
          name="yeniSifreTekrar"
          type="password"
          required
          minLength={SIFRE_EN_AZ}
          autoComplete="new-password"
          className={GIRDI_SINIFI}
        />
      </div>
      <p className="text-xs text-slate-500">{sifreKuralOzeti()}</p>
      <GonderDugmesi bekleyenMetin="Değiştiriliyor…">
        Şifreyi Değiştir
      </GonderDugmesi>
      {durum.hata ? (
        <p role="alert" data-test="sifre-hata" className="text-sm text-red-600">
          {durum.hata}
        </p>
      ) : null}
      {durum.basari ? (
        <p
          role="status"
          data-test="sifre-basari"
          className="text-sm text-emerald-700"
        >
          {durum.basari}
        </p>
      ) : null}
    </form>
  );
}
