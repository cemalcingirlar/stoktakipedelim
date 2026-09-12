"use client";

import { useActionState, useState, useTransition } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { OkutmaKutusu, type OkutmaGeriBildirimi } from "@/bilesenler/OkutmaKutusu";
import { kurusuTLYaz, kurusuTLYazSembollu, tlyiKurusaCevir } from "@/lib/para";
import { ODEME_TIPI, ODEME_TIPI_ETIKET, type OdemeTipi } from "@/lib/sabitler";
import { inputTarih } from "@/lib/tarih";
import {
  musteriAra,
  satisCihaziOkut,
  satisKaydet,
  type MusteriOzeti,
  type SatisDurumu,
} from "./eylemler";

type Cihaz = {
  id: number;
  marka: string;
  model: string;
  renk: string | null;
  kapasite: string | null;
  seriNo: string | null;
  barkod: string | null;
  kategori: string;
  magazaAdi: string;
  alisFiyatiKurus: number;
};

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

export function SatisFormu() {
  const [durum, eylem] = useActionState<SatisDurumu, FormData>(satisKaydet, {});
  const [cihaz, setCihaz] = useState<Cihaz | null>(null);
  const [satisFiyati, setSatisFiyati] = useState("");
  const [odemeTipi, setOdemeTipi] = useState<string>(ODEME_TIPI.NAKIT);
  const [satisTarihi, setSatisTarihi] = useState(inputTarih(new Date()));
  const [not, setNot] = useState("");

  const [musteriSorgu, setMusteriSorgu] = useState("");
  const [sonuclar, setSonuclar] = useState<MusteriOzeti[]>([]);
  const [seciliMusteri, setSeciliMusteri] = useState<MusteriOzeti | null>(null);
  const [araniyor, aramaBasla] = useTransition();

  const [yeniAd, setYeniAd] = useState("");
  const [yeniTelefon, setYeniTelefon] = useState("");
  const [yeniTckn, setYeniTckn] = useState("");
  const [yeniAdres, setYeniAdres] = useState("");

  async function okut(kod: string): Promise<OkutmaGeriBildirimi> {
    const sonuc = await satisCihaziOkut(kod);
    if (sonuc.durum === "HATA") return { tur: "hata", mesaj: sonuc.mesaj };
    setCihaz(sonuc.cihaz);
    return {
      tur: "basari",
      mesaj: `${sonuc.cihaz.marka} ${sonuc.cihaz.model} seçildi. Satış bilgilerini doldurun.`,
    };
  }

  function musteriAramayiCalistir() {
    const sorgu = musteriSorgu.trim();
    if (sorgu.length < 2) {
      setSonuclar([]);
      return;
    }
    aramaBasla(async () => {
      setSonuclar(await musteriAra(sorgu));
    });
  }

  const satisKurus = tlyiKurusaCevir(satisFiyati);
  const kar = cihaz && satisKurus !== null ? satisKurus - cihaz.alisFiyatiKurus : null;

  function veriyiHazirla(): FormData {
    const yuk = {
      cihazId: cihaz?.id ?? 0,
      satisFiyatiKurus: satisKurus ?? -1,
      odemeTipi,
      satisTarihi,
      musteriId: seciliMusteri?.id ?? null,
      musteriAdSoyad: seciliMusteri ? null : yeniAd.trim() || null,
      musteriTelefon: seciliMusteri ? null : yeniTelefon.trim() || null,
      musteriTcknVkn: seciliMusteri ? null : yeniTckn.trim() || null,
      musteriAdres: seciliMusteri ? null : yeniAdres.trim() || null,
      not: not.trim() || null,
    };
    const form = new FormData();
    form.set("veri", JSON.stringify(yuk));
    return form;
  }

  const kaydedebilir = Boolean(cihaz) && satisKurus !== null && (seciliMusteri || yeniAd.trim());

  return (
    <div className="space-y-5">
      {durum.hata ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {durum.hata}
        </p>
      ) : null}

      <OkutmaKutusu
        etiket="Satılacak Cihazı Okut"
        ipucu="Cihaz kendi mağazanızda ve stokta olmalı."
        okut={okut}
      />

      {!cihaz ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          Satışa başlamak için cihazı okutun.
        </p>
      ) : (
        <form action={() => eylem(veriyiHazirla())} className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {cihaz.marka} {cihaz.model}
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  {[cihaz.kategori, cihaz.renk, cihaz.kapasite].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate-600">
                  {cihaz.seriNo ?? cihaz.barkod ?? "seri no yok"} · {cihaz.magazaAdi}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Alış fiyatı</div>
                <div className="text-lg font-semibold tabular-nums text-slate-800">
                  {kurusuTLYazSembollu(cihaz.alisFiyatiKurus)}
                </div>
                <button
                  type="button"
                  onClick={() => setCihaz(null)}
                  className="mt-1 text-xs font-medium text-red-600 hover:underline"
                >
                  Başka cihaz okut
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Satış Bilgileri</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="satisFiyati" className={KUCUK_ETIKET}>
                  Satış Fiyatı (TL) *
                </label>
                <input
                  id="satisFiyati"
                  value={satisFiyati}
                  onChange={(e) => setSatisFiyati(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  className={`${GIRDI_SINIFI} text-right tabular-nums`}
                />
              </div>
              <div>
                <label htmlFor="odemeTipi" className={KUCUK_ETIKET}>
                  Ödeme Tipi *
                </label>
                <select
                  id="odemeTipi"
                  value={odemeTipi}
                  onChange={(e) => setOdemeTipi(e.target.value)}
                  className={GIRDI_SINIFI}
                >
                  {Object.values(ODEME_TIPI).map((t) => (
                    <option key={t} value={t}>
                      {ODEME_TIPI_ETIKET[t as OdemeTipi]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="satisTarihi" className={KUCUK_ETIKET}>
                  Satış Tarihi *
                </label>
                <input
                  id="satisTarihi"
                  type="date"
                  value={satisTarihi}
                  onChange={(e) => setSatisTarihi(e.target.value)}
                  className={GIRDI_SINIFI}
                />
              </div>
              <div>
                <span className={KUCUK_ETIKET}>Kâr</span>
                <div
                  className={`rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm font-semibold tabular-nums ${
                    kar === null ? "text-slate-400" : kar < 0 ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {kar === null ? "—" : `${kurusuTLYaz(kar)} TL`}
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label htmlFor="satisNotu" className={KUCUK_ETIKET}>
                  Not
                </label>
                <input
                  id="satisNotu"
                  value={not}
                  onChange={(e) => setNot(e.target.value)}
                  maxLength={300}
                  className={GIRDI_SINIFI}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Müşteri Bilgileri</h2>

            <div className="mb-3">
              <label htmlFor="musteriSorgu" className={KUCUK_ETIKET}>
                Kayıtlı müşteri ara (ad veya telefon)
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="musteriSorgu"
                  value={musteriSorgu}
                  onChange={(e) => setMusteriSorgu(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      musteriAramayiCalistir();
                    }
                  }}
                  placeholder="En az 2 karakter"
                  className={`min-w-0 flex-1 ${GIRDI_SINIFI}`}
                />
                <button
                  type="button"
                  onClick={musteriAramayiCalistir}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {araniyor ? "Aranıyor…" : "Ara"}
                </button>
              </div>

              {sonuclar.length > 0 ? (
                <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {sonuclar.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSeciliMusteri(m);
                          setSonuclar([]);
                          setMusteriSorgu("");
                        }}
                        className="w-full px-3 py-2 text-left text-sm transition hover:bg-blue-50"
                      >
                        <span className="font-medium text-slate-800">{m.adSoyad}</span>
                        {m.telefon ? (
                          <span className="ml-2 text-slate-500">{m.telefon}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {seciliMusteri ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium text-emerald-900">{seciliMusteri.adSoyad}</span>
                  {seciliMusteri.telefon ? (
                    <span className="ml-2 text-emerald-800">{seciliMusteri.telefon}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setSeciliMusteri(null)}
                  className="text-xs font-medium text-emerald-800 hover:underline"
                >
                  Kaldır
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor="yeniAd" className={KUCUK_ETIKET}>
                    Ad Soyad *
                  </label>
                  <input
                    id="yeniAd"
                    value={yeniAd}
                    onChange={(e) => setYeniAd(e.target.value)}
                    maxLength={80}
                    className={GIRDI_SINIFI}
                  />
                </div>
                <div>
                  <label htmlFor="yeniTelefon" className={KUCUK_ETIKET}>
                    Telefon
                  </label>
                  <input
                    id="yeniTelefon"
                    value={yeniTelefon}
                    onChange={(e) => setYeniTelefon(e.target.value)}
                    maxLength={30}
                    className={GIRDI_SINIFI}
                  />
                </div>
                <div>
                  <label htmlFor="yeniTckn" className={KUCUK_ETIKET}>
                    TCKN / VKN
                  </label>
                  <input
                    id="yeniTckn"
                    value={yeniTckn}
                    onChange={(e) => setYeniTckn(e.target.value)}
                    maxLength={20}
                    className={GIRDI_SINIFI}
                  />
                </div>
                <div>
                  <label htmlFor="yeniAdres" className={KUCUK_ETIKET}>
                    Adres
                  </label>
                  <input
                    id="yeniAdres"
                    value={yeniAdres}
                    onChange={(e) => setYeniAdres(e.target.value)}
                    maxLength={200}
                    className={GIRDI_SINIFI}
                  />
                </div>
                <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">
                  Aynı telefon numarasıyla kayıtlı müşteri varsa yeniden oluşturulmaz, mevcut kayda bağlanır.
                </p>
              </div>
            )}
          </section>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
            <div className="text-sm text-slate-600">
              {satisKurus !== null ? (
                <>
                  Satış: <span className="font-semibold text-slate-900">{kurusuTLYaz(satisKurus)} TL</span>
                  {kar !== null ? (
                    <>
                      {" · Kâr: "}
                      <span className={kar < 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-700"}>
                        {kurusuTLYaz(kar)} TL
                      </span>
                    </>
                  ) : null}
                </>
              ) : (
                "Satış fiyatı girin"
              )}
            </div>
            <GonderDugmesi tur="basari" bekleyenMetin="Kaydediliyor…" disabled={!kaydedebilir}>
              Satışı Kaydet
            </GonderDugmesi>
          </div>
        </form>
      )}
    </div>
  );
}
