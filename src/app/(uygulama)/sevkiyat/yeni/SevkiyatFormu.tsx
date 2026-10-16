"use client";

import { useActionState, useState, useTransition } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { OkutmaKutusu, type OkutmaGeriBildirimi } from "@/bilesenler/OkutmaKutusu";
import { kurusuTLYazSembollu } from "@/lib/para";
import { adayEtiketi, secimBasligi, type AdayCihaz } from "@/lib/cihazSecimi";
import { kabulUyarisi, type KabulDurumu } from "@/lib/sevkiyatKabul";
import {
  sevkiyatCihaziOkut,
  sevkiyatCihaziniSec,
  sevkiyatGonder,
  type SevkiyatDurumu,
} from "../eylemler";

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
  hedefMagazalar: { id: number; ad: string; kabulDurumu: KabulDurumu }[];
  varsayilanKaynakId: number | null;
  kaynakSecilebilir: boolean;
}) {
  const [durum, eylem] = useActionState<SevkiyatDurumu, FormData>(sevkiyatGonder, {});
  const [kaynakId, setKaynakId] = useState<string>(
    varsayilanKaynakId ? String(varsayilanKaynakId) : (kaynakMagazalar[0]?.id.toString() ?? ""),
  );
  const [hedefId, setHedefId] = useState("");
  const [cihazlar, setCihazlar] = useState<Cihaz[]>([]);

  // Okutulan barkod birden çok cihaza denk geldiğinde seçim listesi.
  const [secim, setSecim] = useState<{ aranan: string; adaylar: AdayCihaz[] } | null>(null);
  const [secimHatasi, setSecimHatasi] = useState<string | null>(null);
  const [secimBekliyor, secimBasla] = useTransition();

  /** Bulunan cihazı listeye ekler. */
  function listeyeAl(cihaz: Cihaz): OkutmaGeriBildirimi {
    if (cihazlar.some((c) => c.id === cihaz.id)) {
      return { tur: "uyari", mesaj: `${cihaz.marka} ${cihaz.model} listede zaten var.` };
    }
    setCihazlar((mevcut) => [cihaz, ...mevcut]);
    setSecim(null);
    return {
      tur: "basari",
      mesaj: `${cihaz.marka} ${cihaz.model} eklendi. (${cihazlar.length + 1} cihaz)`,
    };
  }

  async function okut(kod: string): Promise<OkutmaGeriBildirimi> {
    if (!kaynakId) return { tur: "hata", mesaj: "Önce kaynak mağazayı seçin." };

    const sonuc = await sevkiyatCihaziOkut(
      kod,
      Number(kaynakId),
      cihazlar.map((c) => c.id),
    );
    if (sonuc.durum === "HATA") {
      setSecim(null);
      return { tur: "hata", mesaj: sonuc.mesaj };
    }

    // Aynı barkodta birden çok uygun cihaz: hangisinin sevk edileceği
    // kullanıcıya soruluyor.
    if (sonuc.durum === "SECIM") {
      setSecim({ aranan: sonuc.aranan, adaylar: sonuc.adaylar });
      return { tur: "uyari", mesaj: secimBasligi(sonuc.aranan, sonuc.adaylar.length) };
    }

    return listeyeAl(sonuc.cihaz);
  }

  /** Seçim listesinden bir cihaz seçildi. */
  function adaySec(adayId: number) {
    secimBasla(async () => {
      const sonuc = await sevkiyatCihaziniSec(
        adayId,
        Number(kaynakId),
        cihazlar.map((c) => c.id),
      );
      if (sonuc.durum === "BULUNDU") {
        listeyeAl(sonuc.cihaz);
        return;
      }
      setSecimHatasi(sonuc.durum === "HATA" ? sonuc.mesaj : "Cihaz seçilemedi.");
    });
  }

  function cikar(id: number) {
    setCihazlar((mevcut) => mevcut.filter((c) => c.id !== id));
  }

  const toplamKurus = cihazlar.reduce((t, c) => t + c.alisFiyatiKurus, 0);
  const secilenHedef = hedefMagazalar.find((m) => String(m.id) === hedefId);
  const hedefUyarisi = secilenHedef
    ? kabulUyarisi(secilenHedef.kabulDurumu, secilenHedef.ad)
    : null;

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
              <p className="mt-1 text-xs text-slate-500">
                Yalnız yetkili olduğunuz mağazadan sevk edebilirsiniz.
              </p>
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
            {/* Kendi yetkilisi olmayan mağaza engel değil: yönetici kabul
                edebiliyor. Kırmızı hata yalnız gerçekten kimse kalmadığında. */}
            {hedefUyarisi ? (
              <p
                data-test="hedef-uyarisi"
                className={`mt-1 text-xs font-medium ${
                  secilenHedef?.kabulDurumu === "KIMSE_YOK"
                    ? "text-red-600"
                    : "text-amber-700"
                }`}
              >
                {hedefUyarisi}
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
        odakVer
        etiket="Sevk Edilecek Cihazı Okut"
        ipucu="Cihaz gönderen mağazada ve stokta olmalı. Aynı cihaz iki kez okutulursa uyarır."
        okut={okut}
        devreDisi={!kaynakId}
      />

      {/* Barkod birden çok cihaza denk geldi: hangisi sevk edilecek? */}
      {secim ? (
        <div
          data-test="cihaz-secimi"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4"
        >
          <p className="mb-2 text-sm font-medium text-amber-900">
            {secimBasligi(secim.aranan, secim.adaylar.length)}
          </p>
          <ul className="space-y-1.5">
            {secim.adaylar.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  data-test="secim-adayi"
                  data-cihaz-id={a.id}
                  disabled={secimBekliyor}
                  onClick={() => adaySec(a.id)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-sm transition hover:border-amber-400 hover:bg-amber-50 disabled:opacity-50"
                >
                  <span className="font-mono text-xs font-medium text-slate-800">
                    {adayEtiketi(a)}
                  </span>
                  <span className="text-slate-700">
                    {a.marka} {a.model}
                  </span>
                  <span className="ml-auto text-xs tabular-nums text-slate-500">
                    alış {kurusuTLYazSembollu(a.alisFiyatiKurus)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {secimHatasi ? (
            <p data-test="secim-hatasi" role="alert" className="mt-2 text-sm font-medium text-red-700">
              {secimHatasi}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setSecim(null);
              setSecimHatasi(null);
            }}
            className="mt-2 text-xs font-medium text-amber-800 underline hover:text-amber-900"
          >
            Vazgeç
          </button>
        </div>
      ) : null}

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
