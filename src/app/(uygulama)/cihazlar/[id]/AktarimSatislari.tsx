"use client";

import { useActionState, useState } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { GEREKCE_EN_AZ, GEREKCE_EN_COK } from "@/lib/kayitIptali";
import { kurusuTLYaz, kurusuTLYazSembollu, tlyiKurusaCevir } from "@/lib/para";
import { ODEME_TIPI, ODEME_TIPI_ETIKET, type OdemeTipi } from "@/lib/sabitler";
import {
  aktarimSatisiniDuzelt,
  aktarimSatisiniGeriAl,
  type SatisDuzenlemeDurumu,
} from "./eylemler";

const ETIKET = "mb-1 block text-xs font-medium text-slate-600";

export type AktarimSatisSatiri = {
  id: number;
  /** Görüntü için hazır metinler (sunucunun saat diliminde). */
  tarihYazi: string;
  satisGunu: string;
  magazaAdi: string;
  musteriId: number | null;
  musteriAdi: string | null;
  satanKullaniciId: number;
  satanAdi: string;
  odemeTipi: string;
  satisFiyatiKurus: number;
  maliyetKurus: number;
  yeniAlisFiyatiKurus: number;
  not: string | null;
};

type Secenekler = {
  bugun: string;
  kullanicilar: { id: number; adSoyad: string; aktif: boolean }[];
  musteriler: { id: number; adSoyad: string; telefon: string | null }[];
};

/**
 * Cihazın mağaza içi aktarım satışları: liste, yöneticiye düzeltme ve geri
 * alma.
 *
 * Bu satışların düzeltilecek bir yeri yoktu; tek seçenek cihazı iptal etmekti
 * ve kullanıcı satışı düzeltmek isterken cihazı stoktan düşürdü. Yetki sunucu
 * eyleminde sınanıyor; düğmelerin görünmemesi koruma sayılmıyor.
 */
export function AktarimSatislari({
  satislar,
  yonetici,
  secenekler,
}: {
  satislar: AktarimSatisSatiri[];
  yonetici: boolean;
  secenekler: Secenekler;
}) {
  return (
    <div className="space-y-3" data-test="aktarim-satislari">
      <p className="text-sm text-slate-600">
        Cihaz müşteriye satılıp geri alındı; mağazadan çıkmadı, stokta duruyor.
        Satış, satış raporlarına giriyor.
      </p>
      {satislar.map((s) => (
        <AktarimSatisi key={s.id} satis={s} yonetici={yonetici} secenekler={secenekler} />
      ))}
    </div>
  );
}

function AktarimSatisi({
  satis,
  yonetici,
  secenekler,
}: {
  satis: AktarimSatisSatiri;
  yonetici: boolean;
  secenekler: Secenekler;
}) {
  // Hangi form açık; açıldığı andaki eylem durumu tutuluyor ki başarılı bir
  // sonuç gelince form kapansın, hata gelince açık kalsın.
  const [acik, setAcik] = useState<
    { tur: "duzelt" | "geri"; durum: SatisDuzenlemeDurumu } | null
  >(null);
  const [duzeltDurumu, duzelt] = useActionState<SatisDuzenlemeDurumu, FormData>(
    aktarimSatisiniDuzelt,
    {},
  );
  const [geriDurumu, geriAl] = useActionState<SatisDuzenlemeDurumu, FormData>(
    aktarimSatisiniGeriAl,
    {},
  );
  const etkin = acik?.tur === "geri" ? geriDurumu : duzeltDurumu;
  const formAcik =
    acik !== null && !(etkin !== acik.durum && etkin.basari !== undefined);
  const kar = satis.satisFiyatiKurus - satis.maliyetKurus;
  const basari = duzeltDurumu.basari ?? geriDurumu.basari;

  return (
    <div data-test="aktarim-satisi" className="rounded-lg border border-slate-200 p-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-slate-500">Tarih</dt><dd>{satis.tarihYazi}</dd></div>
        <div><dt className="text-xs text-slate-500">Müşteri</dt><dd data-test="aktarim-satis-musteri">{satis.musteriAdi ?? "—"}</dd></div>
        <div><dt className="text-xs text-slate-500">Satışı yapan</dt><dd>{satis.satanAdi}</dd></div>
        <div><dt className="text-xs text-slate-500">Ödeme</dt><dd data-test="aktarim-satis-odeme">{ODEME_TIPI_ETIKET[satis.odemeTipi as OdemeTipi] ?? satis.odemeTipi}</dd></div>
        <div><dt className="text-xs text-slate-500">Satış fiyatı</dt><dd data-test="aktarim-satis-fiyat">{kurusuTLYazSembollu(satis.satisFiyatiKurus)}</dd></div>
        <div>
          <dt className="text-xs text-slate-500">Kâr</dt>
          <dd className={kar < 0 ? "text-red-600" : "text-emerald-700"}>{kurusuTLYazSembollu(kar)}</dd>
        </div>
        <div className="col-span-2 sm:col-span-3 text-xs text-slate-500">
          {satis.magazaAdi} · satış anındaki alış {kurusuTLYazSembollu(satis.maliyetKurus)} · geri alış{" "}
          {kurusuTLYazSembollu(satis.yeniAlisFiyatiKurus)}
          {satis.not ? ` · not: ${satis.not}` : ""}
        </div>
      </dl>

      {yonetici && !formAcik ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-test="aktarim-satis-duzelt"
            onClick={() => setAcik({ tur: "duzelt", durum: duzeltDurumu })}
            className="text-sm font-medium text-blue-700 underline underline-offset-2"
          >
            Satışı düzelt
          </button>
          <button
            type="button"
            data-test="aktarim-satis-geri-al"
            onClick={() => setAcik({ tur: "geri", durum: geriDurumu })}
            className="text-sm font-medium text-red-700 underline underline-offset-2"
          >
            Satışı geri al
          </button>
          {basari ? (
            <span role="status" data-test="aktarim-satis-basari" className="text-sm text-emerald-700">
              {basari}
            </span>
          ) : null}
        </div>
      ) : null}

      {yonetici && formAcik && acik?.tur === "duzelt" ? (
        <DuzeltmeFormu
          satis={satis}
          secenekler={secenekler}
          hata={duzeltDurumu.hata}
          eylem={duzelt}
          kapat={() => setAcik(null)}
        />
      ) : null}

      {yonetici && formAcik && acik?.tur === "geri" ? (
        <form action={geriAl} data-test="aktarim-geri-formu" className="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <input type="hidden" name="aktarimSatisId" value={satis.id} />
          <p className="text-sm text-red-900">
            Satış kaydı silinir ve satış raporlarından düşer. Cihaz stokta kalır.
            {satis.yeniAlisFiyatiKurus !== satis.maliyetKurus
              ? ` Alış fiyatı satış öncesine (${kurusuTLYazSembollu(satis.maliyetKurus)}) döner — sonradan ayrıca değiştirilmediyse.`
              : ""}
          </p>
          <label htmlFor={`geriGerekce${satis.id}`} className={ETIKET}>
            Gerekçe (en az {GEREKCE_EN_AZ} karakter)
          </label>
          <input
            id={`geriGerekce${satis.id}`}
            name="gerekce"
            data-test="aktarim-geri-gerekce"
            required
            minLength={GEREKCE_EN_AZ}
            maxLength={GEREKCE_EN_COK}
            className={GIRDI_SINIFI}
          />
          {geriDurumu.hata ? (
            <p role="alert" data-test="aktarim-satis-hata" className="text-sm text-red-700">{geriDurumu.hata}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <GonderDugmesi bekleyenMetin="Geri alınıyor…">Evet, Satışı Geri Al</GonderDugmesi>
            <button type="button" onClick={() => setAcik(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
              Vazgeç
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function DuzeltmeFormu({
  satis,
  secenekler,
  hata,
  eylem,
  kapat,
}: {
  satis: AktarimSatisSatiri;
  secenekler: Secenekler;
  hata: string | undefined;
  eylem: (form: FormData) => void;
  kapat: () => void;
}) {
  const [musteriId, setMusteriId] = useState<number | "">(satis.musteriId ?? "");
  const [satanId, setSatanId] = useState(satis.satanKullaniciId);
  const [odemeTipi, setOdemeTipi] = useState(satis.odemeTipi);
  const [gun, setGun] = useState(satis.satisGunu);
  const [fiyat, setFiyat] = useState(kurusuTLYaz(satis.satisFiyatiKurus));
  const [not, setNot] = useState(satis.not ?? "");
  const [aciklama, setAciklama] = useState("");
  const kurus = tlyiKurusaCevir(fiyat);

  // Satışın kendi müşterisi seçim listesinin dışında kalmışsa eklenir: form
  // müşteriyi sessizce değiştirmemeli.
  const musteriler =
    satis.musteriId === null || secenekler.musteriler.some((m) => m.id === satis.musteriId)
      ? secenekler.musteriler
      : [{ id: satis.musteriId, adSoyad: satis.musteriAdi ?? "", telefon: null }, ...secenekler.musteriler];

  function veri(): FormData {
    const form = new FormData();
    form.set(
      "veri",
      JSON.stringify({
        aktarimSatisId: satis.id,
        musteriId: musteriId === "" ? null : Number(musteriId),
        satanKullaniciId: Number(satanId) || 0,
        odemeTipi,
        satisTarihi: gun,
        satisFiyatiKurus: kurus ?? -1,
        not: not.trim() || null,
        aciklama: aciklama.trim() || null,
      }),
    );
    return form;
  }

  return (
    <form action={() => eylem(veri())} data-test="aktarim-duzelt-formu" className="mt-3 space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
      {hata ? (
        <p role="alert" data-test="aktarim-satis-hata" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{hata}</p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={ETIKET} htmlFor={`am${satis.id}`}>Müşteri</label>
          <select id={`am${satis.id}`} data-test="aktarim-duzen-musteri" value={musteriId} onChange={(e) => setMusteriId(e.target.value === "" ? "" : Number(e.target.value))} className={GIRDI_SINIFI}>
            {satis.musteriId === null ? <option value="">(müşterisiz)</option> : null}
            {musteriler.map((m) => (
              <option key={m.id} value={m.id}>{m.adSoyad}{m.telefon ? ` · ${m.telefon}` : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={ETIKET} htmlFor={`as${satis.id}`}>Satışı yapan</label>
          <select id={`as${satis.id}`} data-test="aktarim-duzen-satan" value={satanId} onChange={(e) => setSatanId(Number(e.target.value))} className={GIRDI_SINIFI}>
            {secenekler.kullanicilar.map((k) => (
              <option key={k.id} value={k.id}>{k.adSoyad}{k.aktif ? "" : " (pasif)"}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={ETIKET} htmlFor={`ao${satis.id}`}>Ödeme tipi</label>
          <select id={`ao${satis.id}`} data-test="aktarim-duzen-odeme" value={odemeTipi} onChange={(e) => setOdemeTipi(e.target.value)} className={GIRDI_SINIFI}>
            {Object.values(ODEME_TIPI).map((t) => (
              <option key={t} value={t}>{ODEME_TIPI_ETIKET[t as OdemeTipi]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={ETIKET} htmlFor={`at${satis.id}`}>Satış tarihi</label>
          <input id={`at${satis.id}`} data-test="aktarim-duzen-tarih" type="date" max={secenekler.bugun} value={gun} onChange={(e) => setGun(e.target.value)} required className={GIRDI_SINIFI} />
        </div>
        <div>
          <label className={ETIKET} htmlFor={`af${satis.id}`}>Satış fiyatı (TL)</label>
          <input id={`af${satis.id}`} data-test="aktarim-duzen-fiyat" inputMode="decimal" autoComplete="off" value={fiyat} onChange={(e) => setFiyat(e.target.value)} className={`${GIRDI_SINIFI} font-mono`} />
        </div>
        <div>
          <label className={ETIKET} htmlFor={`an${satis.id}`}>Satış notu</label>
          <input id={`an${satis.id}`} data-test="aktarim-duzen-not" value={not} maxLength={300} onChange={(e) => setNot(e.target.value)} className={GIRDI_SINIFI} />
        </div>
      </div>
      <div>
        <label className={ETIKET} htmlFor={`aa${satis.id}`}>Düzeltme açıklaması (isteğe bağlı, işlem kaydına yazılır)</label>
        <input id={`aa${satis.id}`} data-test="aktarim-duzen-aciklama" value={aciklama} maxLength={300} onChange={(e) => setAciklama(e.target.value)} className={GIRDI_SINIFI} />
      </div>
      <p className="text-xs text-slate-600">
        Neyin neyden neye değiştiği işlem kaydına ve cihazın tarihçesine yazılır.
        Cihazın alış fiyatı buradan değişmez; onun için Alış Bilgileri kartını kullanın.
      </p>
      <div className="flex flex-wrap gap-2">
        <GonderDugmesi bekleyenMetin="Kaydediliyor…" disabled={kurus === null || kurus <= 0}>Değişiklikleri Kaydet</GonderDugmesi>
        <button type="button" onClick={kapat} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700">Kapat</button>
      </div>
    </form>
  );
}
