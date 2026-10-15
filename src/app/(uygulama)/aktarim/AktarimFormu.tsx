"use client";

import { useState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { OkutmaKutusu, type OkutmaGeriBildirimi } from "@/bilesenler/OkutmaKutusu";
import { Rozet } from "@/bilesenler/Rozet";
import { ayniDukkandakiler, type DukkanMagazasi } from "@/lib/dukkan";
import { dukkanIciAktar } from "./eylemler";

type Magaza = DukkanMagazasi & { ad: string };

type Satir = {
  anahtar: number;
  etiket: string;
  /** Geri almak için yeniden okutulacak kod. */
  kod: string | null;
  kaynakId: number;
  kaynakAd: string;
  hedefId: number;
  hedefAd: string;
  geriAlindi: boolean;
};

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

export function AktarimFormu({
  magazalar,
  varsayilanKaynakId,
}: {
  magazalar: Magaza[];
  varsayilanKaynakId: number | null;
}) {
  const ilkKaynak =
    varsayilanKaynakId && magazalar.some((m) => m.id === varsayilanKaynakId)
      ? varsayilanKaynakId
      : (magazalar[0]?.id ?? 0);

  const [kaynakId, setKaynakId] = useState(ilkKaynak);
  const kaynak = magazalar.find((m) => m.id === kaynakId) ?? null;
  const hedefler = kaynak ? ayniDukkandakiler(kaynak, magazalar) : [];

  // Tek hedef varsa seçim sorusu anlamsız; doğrudan onu kullan.
  const [elleHedefId, setElleHedefId] = useState(0);
  const hedefId =
    hedefler.some((h) => h.id === elleHedefId) ? elleHedefId : (hedefler[0]?.id ?? 0);
  const hedef = hedefler.find((h) => h.id === hedefId) ?? null;

  const [satirlar, setSatirlar] = useState<Satir[]>([]);
  const [geriAlinan, setGeriAlinan] = useState<number | null>(null);

  function kaynakDegistir(yeni: number) {
    setKaynakId(yeni);
    setElleHedefId(0);
  }

  /** Aktarımın nedeni; cihazın tarihçesine yazılıyor. */
  const [not, setNot] = useState("");

  /** Yön değiştir: kaynak ile hedefi takas eder. */
  function yonuCevir() {
    if (!kaynak || !hedef) return;
    setKaynakId(hedef.id);
    setElleHedefId(kaynak.id);
  }

  async function okut(kod: string): Promise<OkutmaGeriBildirimi> {
    if (!kaynak || !hedef) return { tur: "hata", mesaj: "Önce mağazaları seçin." };

    const sonuc = await dukkanIciAktar(kod, kaynak.id, hedef.id, not);
    if (sonuc.durum === "HATA") return { tur: "hata", mesaj: sonuc.mesaj };

    setSatirlar((mevcut) => [
      {
        anahtar: sonuc.cihaz.id,
        etiket: `${sonuc.cihaz.marka} ${sonuc.cihaz.model}`,
        kod: sonuc.cihaz.seriNo ?? sonuc.cihaz.barkod,
        kaynakId: kaynak.id,
        kaynakAd: kaynak.ad,
        hedefId: hedef.id,
        hedefAd: hedef.ad,
        geriAlindi: false,
      },
      ...mevcut.filter((s) => s.anahtar !== sonuc.cihaz.id),
    ]);
    return { tur: "basari", mesaj: `${sonuc.mesaj} — aktarıldı` };
  }

  async function geriAl(satir: Satir) {
    if (!satir.kod) return;
    setGeriAlinan(satir.anahtar);
    const sonuc = await dukkanIciAktar(satir.kod, satir.hedefId, satir.kaynakId, "Geri alındı");
    setGeriAlinan(null);
    if (sonuc.durum === "TAMAM") {
      setSatirlar((mevcut) =>
        mevcut.map((s) => (s.anahtar === satir.anahtar ? { ...s, geriAlindi: true } : s)),
      );
    }
  }

  const aktarilan = satirlar.filter((s) => !s.geriAlindi).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div>
            <label htmlFor="kaynak" className={KUCUK_ETIKET}>
              Nereden
            </label>
            <select
              id="kaynak"
              value={kaynakId}
              onChange={(e) => kaynakDegistir(Number(e.target.value))}
              className={GIRDI_SINIFI}
            >
              {magazalar.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.ad}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end justify-center pb-1">
            <button
              type="button"
              onClick={yonuCevir}
              disabled={!hedef}
              title="Yönü değiştir"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              ⇄
            </button>
          </div>

          <div>
            <label htmlFor="hedef" className={KUCUK_ETIKET}>
              Nereye
            </label>
            {hedefler.length === 1 ? (
              <input
                id="hedef"
                readOnly
                value={hedefler[0].ad}
                className={`${GIRDI_SINIFI} bg-slate-50 text-slate-600`}
              />
            ) : (
              <select
                id="hedef"
                value={hedefId}
                onChange={(e) => setElleHedefId(Number(e.target.value))}
                className={GIRDI_SINIFI}
              >
                {hedefler.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.ad}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          Okuttuğun cihaz <strong>anında</strong> taşınır; sevkiyat açılmaz, karşı tarafın
          kabulü beklenmez. Yanlış okutursan aşağıdaki <strong>Geri al</strong> düğmesi cihazı
          yerine döndürür.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {/* Not okutmadan önce yazılıyor; o andan sonra okutulan cihazların
            tarihçesine geçiyor. Aktarımın nedeni sonradan okunabilsin. */}
        <div className="mb-3">
          <label htmlFor="aktarimNotu" className="mb-1 block text-xs font-medium text-slate-600">
            Not (bu aktarıma ait açıklama)
          </label>
          <input
            id="aktarimNotu"
            data-test="aktarim-notu"
            value={not}
            onChange={(e) => setNot(e.target.value)}
            maxLength={200}
            placeholder="Örn. müşteri siparişi, vitrin değişimi"
            className={GIRDI_SINIFI}
          />
          <p className="mt-1 text-xs text-slate-500">
            Yazdığınız not, bundan sonra okuttuğunuz cihazların tarihçesine eklenir.
          </p>
        </div>

        <OkutmaKutusu
          odakVer
          etiket="Seri No / Barkod Okut"
          ipucu={
            kaynak && hedef
              ? `${kaynak.ad} → ${hedef.ad}`
              : "Aktarım için iki mağaza gerekli."
          }
          okut={okut}
          devreDisi={!kaynak || !hedef}
        />
      </div>

      {satirlar.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Bu oturumda aktarılanlar{" "}
            <span className="font-normal text-slate-500">({aktarilan} cihaz)</span>
          </h2>
          <ul className="space-y-2">
            {satirlar.map((s) => (
              <li
                key={s.anahtar}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-slate-900">{s.etiket}</span>
                  {s.kod ? (
                    <span className="ml-2 font-mono text-xs text-slate-500">{s.kod}</span>
                  ) : null}
                  <span className="ml-2 text-xs text-slate-500">
                    {s.geriAlindi ? `${s.hedefAd} → ${s.kaynakAd}` : `${s.kaynakAd} → ${s.hedefAd}`}
                  </span>
                </div>
                {s.geriAlindi ? (
                  <Rozet ton="sari">Geri alındı</Rozet>
                ) : s.kod ? (
                  <button
                    type="button"
                    onClick={() => geriAl(s)}
                    disabled={geriAlinan === s.anahtar}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {geriAlinan === s.anahtar ? "Geri alınıyor…" : "Geri al"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
