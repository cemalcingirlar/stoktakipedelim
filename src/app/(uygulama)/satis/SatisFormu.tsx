"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { OkutmaKutusu, type OkutmaGeriBildirimi } from "@/bilesenler/OkutmaKutusu";
import { kurusuTLYaz, kurusuTLYazSembollu } from "@/lib/para";
import {
  cihazKari,
  fiyatiYaz,
  sepetOzeti,
  sepetSatirlari,
  sepetSorunlari,
  sepeteEkle,
  sepettenCikar,
  type SepetCihazi,
} from "@/lib/satisSepeti";
import { ODEME_TIPI, ODEME_TIPI_ETIKET, type OdemeTipi } from "@/lib/sabitler";
import { inputTarih } from "@/lib/tarih";
import {
  musteriAra,
  satisCihaziOkut,
  satisKaydet,
  type MusteriOzeti,
  type SatisDurumu,
} from "./eylemler";

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

export function SatisFormu() {
  const [durum, eylem] = useActionState<SatisDurumu, FormData>(satisKaydet, {});
  // Bir müşteri birden çok cihaz alabiliyor; okutulan her cihaz listeye ekleniyor.
  const [sepet, setSepet] = useState<SepetCihazi[]>([]);
  /**
   * Okutma bir geçiş (transition) içinde çalışıyor ve okutma kutusu geri
   * çağrımı bir önceki render'dan kalmış olabiliyor. Barkod okuyucu iki kodu
   * arka arkaya gönderdiğinde ikinci okutma eski sepeti görüp ilk cihazı
   * düşürüyordu; güncel sepet bu yüzden ref'te tutuluyor.
   */
  const sepetRef = useRef(sepet);
  useEffect(() => {
    sepetRef.current = sepet;
  }, [sepet]);
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

    const eklenen = sepeteEkle(sepetRef.current, sonuc.cihaz);
    if ("hata" in eklenen) return { tur: "hata", mesaj: eklenen.hata };
    sepetRef.current = eklenen.sepet;
    setSepet(eklenen.sepet);

    const adet = eklenen.sepet.length;
    return {
      tur: "basari",
      mesaj:
        adet === 1
          ? `${sonuc.cihaz.marka} ${sonuc.cihaz.model} eklendi. Satış fiyatını girin.`
          : `${sonuc.cihaz.marka} ${sonuc.cihaz.model} eklendi — listede ${adet} cihaz var.`,
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

  const ozet = sepetOzeti(sepet);
  const musteriVarMi = Boolean(seciliMusteri || yeniAd.trim());
  const sorunlar = sepetSorunlari(sepet, musteriVarMi);

  function veriyiHazirla(): FormData {
    const yuk = {
      satirlar: sepetSatirlari(sepet) ?? [],
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

  const kaydedebilir = sorunlar.length === 0;

  return (
    <div className="space-y-5">
      {durum.hata ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {durum.hata}
        </p>
      ) : null}

      <OkutmaKutusu
        etiket={sepet.length === 0 ? "Satılacak Cihazı Okut" : "Başka Cihaz Okut"}
        ipucu={
          sepet.length === 0
            ? "Cihaz kendi mağazanızda ve stokta olmalı."
            : "Aynı müşteriye satılacak diğer cihazları da buradan okutun."
        }
        okut={okut}
      />

      {sepet.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          Satışa başlamak için cihazı okutun. Aynı müşteriye birden çok cihaz satıyorsanız
          hepsini sırayla okutun.
        </p>
      ) : (
        <form action={() => eylem(veriyiHazirla())} className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">
                Satılacak Cihazlar ({ozet.adet})
              </h2>
              <span className="text-xs text-slate-500">
                Yukarıdaki kutudan okutarak bu listeye cihaz ekleyebilirsiniz.
              </span>
            </div>

            <ul data-test="satis-sepeti" className="space-y-2">
              {sepet.map((c) => {
                const kar = cihazKari(c);
                return (
                  <li
                    key={c.id}
                    data-test="sepet-satiri"
                    className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">
                        {c.marka} {c.model}
                      </div>
                      <div className="truncate font-mono text-xs text-slate-500">
                        {c.seriNo ?? c.barkod ?? "seri no yok"} · {c.magazaAdi}
                      </div>
                      <div className="text-xs text-slate-500">
                        Alış {kurusuTLYazSembollu(c.alisFiyatiKurus)}
                      </div>
                    </div>

                    <div className="sm:w-36">
                      <label className={KUCUK_ETIKET} htmlFor={`fiyat-${c.id}`}>
                        Satış Fiyatı (TL) *
                      </label>
                      <input
                        id={`fiyat-${c.id}`}
                        data-test="sepet-fiyat"
                        value={c.satisFiyati}
                        onChange={(e) => setSepet((o) => fiyatiYaz(o, c.id, e.target.value))}
                        inputMode="decimal"
                        placeholder="0,00"
                        className={`${GIRDI_SINIFI} text-right tabular-nums`}
                      />
                    </div>

                    <div className="sm:w-28">
                      <span className={KUCUK_ETIKET}>Kâr</span>
                      <div
                        className={`rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm font-semibold tabular-nums ${
                          kar === null
                            ? "text-slate-400"
                            : kar < 0
                              ? "text-red-600"
                              : "text-emerald-700"
                        }`}
                      >
                        {kar === null ? "—" : kurusuTLYaz(kar)}
                      </div>
                    </div>

                    <button
                      type="button"
                      data-test="sepet-cikar"
                      onClick={() => setSepet((o) => sepettenCikar(o, c.id))}
                      title="Bu cihazı satıştan çıkar"
                      className="justify-self-end rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-red-700"
                    >
                      Çıkar
                    </button>
                  </li>
                );
              })}
            </ul>

            {ozet.adet > 1 ? (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-sm">
                <span className="text-slate-600">
                  Toplam satış:{" "}
                  <span className="font-semibold tabular-nums text-slate-900">
                    {kurusuTLYaz(ozet.satisKurus)} TL
                  </span>
                </span>
                <span className="text-slate-600">
                  Toplam kâr:{" "}
                  <span
                    className={`font-semibold tabular-nums ${
                      ozet.karKurus < 0 ? "text-red-600" : "text-emerald-700"
                    }`}
                  >
                    {kurusuTLYaz(ozet.karKurus)} TL
                  </span>
                </span>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Satış Bilgileri</h2>
            <p className="mb-3 text-xs text-slate-500">
              Bu bilgiler listedeki {ozet.adet} cihazın hepsine uygulanır.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            {/* Toplam her zaman görünüyor: fiyatları girerken eksik bilgi
                yüzünden tutarın kaybolması kullanıcıyı şaşırtıyordu. */}
            <div className="text-sm text-slate-600">
              <div data-test="satis-toplami">
                {ozet.adet} cihaz · Satış:{" "}
                <span className="font-semibold text-slate-900">
                  {kurusuTLYaz(ozet.satisKurus)} TL
                </span>
                {" · Kâr: "}
                <span
                  className={
                    ozet.karKurus < 0
                      ? "font-semibold text-red-600"
                      : "font-semibold text-emerald-700"
                  }
                >
                  {kurusuTLYaz(ozet.karKurus)} TL
                </span>
                {ozet.fiyatiEksik > 0 ? (
                  <span className="text-slate-400">
                    {" "}
                    ({ozet.fiyatiEksik} cihazın fiyatı girilmedi)
                  </span>
                ) : null}
              </div>
              {sorunlar.length > 0 ? (
                <div data-test="satis-sorunlari" className="mt-0.5 font-medium text-red-700">
                  {sorunlar[0]}
                  {sorunlar.length > 1 ? ` (+${sorunlar.length - 1} eksik daha)` : ""}
                </div>
              ) : null}
            </div>
            <GonderDugmesi tur="basari" bekleyenMetin="Kaydediliyor…" disabled={!kaydedebilir}>
              {ozet.adet > 1 ? `${ozet.adet} Cihazı Sat` : "Satışı Kaydet"}
            </GonderDugmesi>
          </div>
        </form>
      )}
    </div>
  );
}
