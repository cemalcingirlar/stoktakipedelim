"use client";

import { useState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { OkutmaKutusu, type OkutmaGeriBildirimi } from "@/bilesenler/OkutmaKutusu";
import { Rozet } from "@/bilesenler/Rozet";
import { ayniDukkandakiler, type DukkanMagazasi } from "@/lib/dukkan";
import { ODEME_TIPI, ODEME_TIPI_ETIKET, type OdemeTipi } from "@/lib/sabitler";
import type { MusteriOzeti } from "../satis/eylemler";
import { dukkanIciAktar } from "./eylemler";
import { FiyatDuzeltme } from "./FiyatDuzeltme";
import { MusteriBlogu } from "./MusteriBlogu";
import { inputTarih } from "@/lib/tarih";
import { SatGeriAl, type SatisBasligi } from "./SatGeriAl";

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
  alisFiyatiKurus: number;
  not: string | null;
};

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

export function AktarimFormu({
  magazalar,
  varsayilanKaynakId,
  saticilar,
  varsayilanSaticiId,
}: {
  magazalar: Magaza[];
  varsayilanKaynakId: number | null;
  /** Satışı yapan olarak seçilebilecek kişiler. */
  saticilar: { id: number; adSoyad: string }[];
  varsayilanSaticiId: number;
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
  // Tek tarih hem aktarım hareketine hem sat-geri al satışına yazılıyor:
  // ikisi aynı işlemin parçası, ayrı tarih tutmak tarihçeyi tutarsız yapardı.
  const [islemTarihi, setIslemTarihi] = useState(inputTarih(new Date()));

  // ---------------------------------------------- müşteriye sat, geri al
  // Dükkân içinde cihaz taşınırken ürün fiilen müşteriye satılıp geri
  // alınıyor. Varsayılan kapalı: ekran düz taşıma için de kullanılıyor ve
  // o akışta müşteri sorusu gecikme olurdu.
  const [satisModu, setSatisModu] = useState(false);
  const [odemeTipi, setOdemeTipi] = useState<string>(ODEME_TIPI.NAKIT);
  const [satanId, setSatanId] = useState(varsayilanSaticiId);
  const [seciliMusteri, setSeciliMusteri] = useState<MusteriOzeti | null>(null);
  const [yeniAd, setYeniAd] = useState("");
  const [yeniTelefon, setYeniTelefon] = useState("");

  const musteriHazir = seciliMusteri !== null || yeniAd.trim().length > 0;
  const satisBasligi: SatisBasligi = {
    satisTarihi: islemTarihi,
    odemeTipi,
    satanKullaniciId: satanId,
    musteriId: seciliMusteri?.id ?? null,
    musteriAdSoyad: seciliMusteri ? null : yeniAd.trim() || null,
    musteriTelefon: seciliMusteri ? null : yeniTelefon.trim() || null,
  };

  /** Yön değiştir: kaynak ile hedefi takas eder. */
  function yonuCevir() {
    if (!kaynak || !hedef) return;
    setKaynakId(hedef.id);
    setElleHedefId(kaynak.id);
  }

  async function okut(kod: string): Promise<OkutmaGeriBildirimi> {
    if (!kaynak || !hedef) return { tur: "hata", mesaj: "Önce mağazaları seçin." };

    const sonuc = await dukkanIciAktar(kod, kaynak.id, hedef.id, not, islemTarihi);
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
        alisFiyatiKurus: sonuc.cihaz.alisFiyatiKurus,
        not: sonuc.cihaz.not,
      },
      ...mevcut.filter((s) => s.anahtar !== sonuc.cihaz.id),
    ]);
    return { tur: "basari", mesaj: `${sonuc.mesaj} — aktarıldı` };
  }

  async function geriAl(satir: Satir) {
    if (!satir.kod) return;
    setGeriAlinan(satir.anahtar);
    const sonuc = await dukkanIciAktar(
      satir.kod,
      satir.hedefId,
      satir.kaynakId,
      "Geri alındı",
      islemTarihi,
    );
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
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_11rem]">
          <div>
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
          {/* Geçmişe dönük kayıt: dün yapılan aktarım bugün olmuş gibi
              görünmesin. Aynı tarih sat-geri al satışına da yazılıyor. */}
          <div>
            <label htmlFor="aktarimTarihi" className="mb-1 block text-xs font-medium text-slate-600">
              İşlem Tarihi
            </label>
            <input
              id="aktarimTarihi"
              data-test="aktarim-tarihi"
              type="date"
              value={islemTarihi}
              onChange={(e) => setIslemTarihi(e.target.value)}
              className={GIRDI_SINIFI}
            />
          </div>
        </div>

        {/* Sat-geri al: cihaz dükkânda kalıyor ama kasaya satış giriyor.
            Müşteri, ödeme tipi ve satışı yapan bir kez burada seçiliyor;
            fiyatlar cihaz başına, aşağıdaki satırlarda. */}
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50/60 p-3">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              data-test="satis-modu"
              checked={satisModu}
              onChange={(e) => setSatisModu(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-400"
            />
            <span className="text-sm">
              <span className="font-medium text-amber-900">
                Alış Fiyatını Revize Et
              </span>
              <span className="block text-xs text-amber-800">
                Okutulan her cihaz için yeni alış fiyatı sorulur. Müşteriye satıp geri
                aldıysanız satış fiyatını da yazın — o zaman satış, paneldeki mağaza ve
                personel satış raporlarına yansır. Satış fiyatı boş bırakılırsa yalnız alış
                fiyatı güncellenir. Cihaz her durumda stokta kalır.
              </span>
            </span>
          </label>

          {satisModu ? (
            <div className="mt-3 space-y-3 border-t border-amber-200 pt-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label htmlFor="aktarimOdemeTipi" className={KUCUK_ETIKET}>
                    Ödeme Tipi
                  </label>
                  <select
                    id="aktarimOdemeTipi"
                    data-test="odeme-tipi"
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
                  <label htmlFor="aktarimSatan" className={KUCUK_ETIKET}>
                    Satışı Yapan
                  </label>
                  <select
                    id="aktarimSatan"
                    data-test="satisi-yapan"
                    value={satanId}
                    onChange={(e) => setSatanId(Number(e.target.value))}
                    className={GIRDI_SINIFI}
                  >
                    {saticilar.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.adSoyad}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <MusteriBlogu
                secili={seciliMusteri}
                setSecili={setSeciliMusteri}
                yeniAd={yeniAd}
                setYeniAd={setYeniAd}
                yeniTelefon={yeniTelefon}
                setYeniTelefon={setYeniTelefon}
              />

              {!musteriHazir ? (
                <p
                  data-test="musteri-eksik"
                  className="rounded border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-medium text-amber-900"
                >
                  Satışı kaydetmek için müşteri seçin veya ad soyad girin.
                </p>
              ) : null}
            </div>
          ) : null}
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
                data-test="aktarilan-satir"
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
                {s.geriAlindi ? null : satisModu ? (
                  musteriHazir ? (
                    <SatGeriAl
                      cihazId={s.anahtar}
                      kaynakMagazaId={s.kaynakId}
                      etiket={s.etiket}
                      baslangicAlisKurus={s.alisFiyatiKurus}
                      baslik={satisBasligi}
                      not={not.trim() || null}
                    />
                  ) : null
                ) : (
                  <FiyatDuzeltme
                    cihazId={s.anahtar}
                    baslangicFiyatiKurus={s.alisFiyatiKurus}
                    baslangicNotu={s.not}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
