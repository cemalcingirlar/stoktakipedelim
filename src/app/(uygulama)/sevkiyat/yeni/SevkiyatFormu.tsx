"use client";

import { useActionState, useState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { OkutmaKutusu, type OkutmaGeriBildirimi } from "@/bilesenler/OkutmaKutusu";
import { kurusuTLYazSembollu } from "@/lib/para";
import { sevkiyatCihaziOkut, sevkiyatGonder, type SevkiyatDurumu } from "../eylemler";

type Cihaz = {
  id: number;
  marka: string;
  model: string;
  seriNo: string | null;
  barkod: string | null;
  kategori: string;
  alisFiyatiKurus: number;
};

export function SevkiyatFormu({
  kaynakMagazalar,
  hedefMagazalar,
  varsayilanKaynakId,
  kaynakSecilebilir,
}: {
  kaynakMagazalar: { id: number; ad: string }[];
  hedefMagazalar: { id: number; ad: string; kullaniciSayisi: number }[];
  varsayilanKaynakId: number | null;
  kaynakSecilebilir: boolean;
}) {
  const [durum, eylem] = useActionState<SevkiyatDurumu, FormData>(sevkiyatGonder, {});
  const [kaynakId, setKaynakId] = useState<string>(
    varsayilanKaynakId ? String(varsayilanKaynakId) : (kaynakMagazalar[0]?.id.toString() ?? ""),
  );
  const [hedefId, setHedefId] = useState("");
  const [cihazlar, setCihazlar] = useState<Cihaz[]>([]);

  async function okut(kod: string): Promise<OkutmaGeriBildirimi> {
    if (!kaynakId) return { tur: "hata", mesaj: "Önce kaynak mağazayı seçin." };

    const sonuc = await sevkiyatCihaziOkut(kod, Number(kaynakId));
    if (sonuc.durum === "HATA") return { tur: "hata", mesaj: sonuc.mesaj };

    if (cihazlar.some((c) => c.id === sonuc.cihaz.id)) {
      return { tur: "uyari", mesaj: `${sonuc.cihaz.marka} ${sonuc.cihaz.model} listede zaten var.` };
    }

    setCihazlar((mevcut) => [sonuc.cihaz, ...mevcut]);
    return {
      tur: "basari",
      mesaj: `${sonuc.cihaz.marka} ${sonuc.cihaz.model} eklendi. (${cihazlar.length + 1} cihaz)`,
    };
  }

  function cikar(id: number) {
    setCihazlar((mevcut) => mevcut.filter((c) => c.id !== id));
  }

  const toplamKurus = cihazlar.reduce((t, c) => t + c.alisFiyatiKurus, 0);
  const secilenHedef = hedefMagazalar.find((m) => String(m.id) === hedefId);

  function veriyiHazirla(): FormData {
    const yuk = {
      kaynakMagazaId: Number(kaynakId) || 0,
      hedefMagazaId: Number(hedefId) || 0,
      not: null as string | null,
      cihazIdleri: cihazlar.map((c) => c.id),
    };
    const notAlani = document.querySelector<HTMLInputElement>("#sevkiyatNotu");
    yuk.not = notAlani?.value.trim() || null;

    const form = new FormData();
    form.set("veri", JSON.stringify(yuk));
    return form;
  }

  return (
    <div className="space-y-5">
      {durum.hata ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {durum.hata}
        </p>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Sevkiyat Bilgileri</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="kaynak" className="mb-1 block text-xs font-medium text-slate-600">
              Gönderen mağaza *
            </label>
            <select
              id="kaynak"
              value={kaynakId}
              disabled={!kaynakSecilebilir}
              onChange={(e) => {
                setKaynakId(e.target.value);
                setCihazlar([]);
              }}
              className={GIRDI_SINIFI}
            >
              {kaynakMagazalar.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.ad}
                </option>
              ))}
            </select>
            {!kaynakSecilebilir ? (
              <p className="mt-1 text-xs text-slate-500">Yalnız kendi mağazanızdan sevk edebilirsiniz.</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="hedef" className="mb-1 block text-xs font-medium text-slate-600">
              Hedef mağaza *
            </label>
            <select
              id="hedef"
              value={hedefId}
              onChange={(e) => setHedefId(e.target.value)}
              className={GIRDI_SINIFI}
            >
              <option value="">Seçin…</option>
              {hedefMagazalar
                .filter((m) => String(m.id) !== kaynakId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.ad}
                  </option>
                ))}
            </select>
            {secilenHedef && secilenHedef.kullaniciSayisi === 0 ? (
              <p className="mt-1 text-xs font-medium text-red-600">
                Bu mağazada kullanıcı yok; sevkiyatı kabul edecek kimse olmaz.
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="sevkiyatNotu" className="mb-1 block text-xs font-medium text-slate-600">
              Not
            </label>
            <input id="sevkiyatNotu" maxLength={500} className={GIRDI_SINIFI} />
          </div>
        </div>
      </section>

      <OkutmaKutusu
        etiket="Sevk Edilecek Cihazı Okut"
        ipucu="Cihaz gönderen mağazada ve stokta olmalı. Aynı cihaz iki kez okutulursa uyarır."
        okut={okut}
        devreDisi={!kaynakId}
      />

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-800">
            Sevk Listesi <span className="font-normal text-slate-500">({cihazlar.length} cihaz)</span>
          </h2>
          <span className="text-sm text-slate-600">
            Toplam alış değeri:{" "}
            <span className="font-medium text-slate-900">{kurusuTLYazSembollu(toplamKurus)}</span>
          </span>
        </div>

        {cihazlar.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            Henüz cihaz okutulmadı.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Kategori</th>
                  <th className="px-3 py-2 font-medium">Cihaz</th>
                  <th className="px-3 py-2 font-medium">Seri No</th>
                  <th className="px-3 py-2 text-right font-medium">Alış</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cihazlar.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 text-slate-600">{c.kategori}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {c.marka} {c.model}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">
                      {c.seriNo ?? c.barkod ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {kurusuTLYazSembollu(c.alisFiyatiKurus)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => cikar(c.id)}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                      >
                        Çıkar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form
        action={() => eylem(veriyiHazirla())}
        className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg"
      >
        <div className="text-sm text-slate-600">
          {cihazlar.length} cihaz{" "}
          {secilenHedef ? (
            <>
              → <span className="font-medium text-slate-900">{secilenHedef.ad}</span>
            </>
          ) : null}
        </div>
        <GonderDugmesi
          bekleyenMetin="Gönderiliyor…"
          disabled={cihazlar.length === 0 || !hedefId}
        >
          Sevkiyatı Gönder
        </GonderDugmesi>
      </form>
    </div>
  );
}
