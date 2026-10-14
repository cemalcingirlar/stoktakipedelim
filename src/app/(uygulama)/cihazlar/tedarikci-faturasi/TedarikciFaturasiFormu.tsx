"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { TedarikciSecici } from "@/bilesenler/TedarikciSecici";
import { VadeAlani } from "@/bilesenler/VadeAlani";
import {
  duzenlemeSorunlari,
  duzenlenmisSeri,
  duzenlenmisUrun,
  seriAnahtari,
  type SeriUstYazim,
  type UrunUstYazim,
} from "@/lib/faturaDuzenleme";
import {
  baskinSecim,
  tumuneUygula,
  urunSecimi,
  type Secim,
} from "@/lib/kategoriSecim";
import { kurusuTLYaz, tlyiKurusaCevir } from "@/lib/para";
import { inputTarih } from "@/lib/tarih";
import type { TedarikciUrunGrubu } from "@/lib/tedarikciDosyasi";
import type { FaturaSatiriGirdisi } from "../../faturalar/dogrulama";
import {
  tedarikciDosyasiniOnizle,
  tedarikciFaturasiniKaydet,
  type KayitDurumu,
  type OnizlemeDurumu,
} from "./eylemler";

export type KategoriSecimi = {
  id: number;
  ad: string;
  seriNoZorunlu: boolean;
  altKategoriler: { id: number; ad: string }[];
};

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

export function TedarikciFaturasiFormu({
  kategoriler,
  varsayilanKategoriId,
  tedarikciler,
  magazalar,
  varsayilanMagazaId,
}: {
  kategoriler: KategoriSecimi[];
  /** Kategori seçilmeyen ürünlerin gideceği "Sınıflandırılmamış" kategori. */
  varsayilanKategoriId: number;
  tedarikciler: { id: number; ad: string }[];
  magazalar: { id: number; ad: string }[];
  varsayilanMagazaId: number | null;
}) {
  const yonlendirici = useRouter();
  const [onizleme, onizleEylem] = useActionState<OnizlemeDurumu, FormData>(
    tedarikciDosyasiniOnizle,
    {},
  );
  const [kayit, kaydetEylem] = useActionState<KayitDurumu, FormData>(
    tedarikciFaturasiniKaydet,
    {},
  );

  // Seçimler props'tan türetilir; durumda yalnızca kullanıcının değiştirdikleri
  // tutulur. Böylece yeni dosya yüklendiğinde durumu effect ile eşitlemek
  // gerekmiyor — barkod geçmişi zaten varsayılan olarak geliyor.
  const [seciliNo, setSeciliNo] = useState<string | null>(null);
  const [tarihUstYazim, setTarihUstYazim] = useState<Record<string, string>>({});
  const [secimUstYazim, setSecimUstYazim] = useState<Record<string, Secim>>({});
  // Dosyadan okunan değerler yanlış çıkabiliyor; kullanıcının düzelttikleri
  // burada tutuluyor, dokunulmayan alanlar okunan değerde kalıyor.
  const [urunUstYazim, setUrunUstYazim] = useState<Record<string, UrunUstYazim>>({});
  const [seriUstYazim, setSeriUstYazim] = useState<Record<string, SeriUstYazim>>({});

  const faturalar = onizleme.faturalar ?? [];
  const fatura = faturalar.find((f) => f.faturaNo === seciliNo) ?? faturalar[0];

  const kayitliSeriNolar = useMemo(
    () => new Set(onizleme.kayitliSeriNolar ?? []),
    [onizleme.kayitliSeriNolar],
  );
  const gecmisHarita = useMemo(
    () => new Map((onizleme.gecmis ?? []).map((g) => [g.barkod, g])),
    [onizleme.gecmis],
  );

  const barkodlar = useMemo(
    () => (fatura ? fatura.gruplar.map((g) => g.barkod) : []),
    [fatura],
  );

  /**
   * Faturadaki baskın kategori: bir fatura genelde tek tür mal taşıdığı için
   * geçmişi olmayan ürünler de bu kategoriye düşüyor, kullanıcı her satırı tek
   * tek seçmek zorunda kalmıyor.
   */
  const baskin = useMemo(
    () => baskinSecim(barkodlar, gecmisHarita),
    [barkodlar, gecmisHarita],
  );

  /** Bir barkodun yürürlükteki kategori seçimi. Kurallar: src/lib/kategoriSecim.ts */
  function secimiOku(barkod: string): Secim {
    return urunSecimi(barkod, {
      ustYazim: secimUstYazim,
      gecmis: gecmisHarita,
      baskin,
      varsayilanKategoriId,
    });
  }

  /** Üstteki seçiciyle tüm ürünlere aynı kategoriyi yazar. */
  function hepsineYaz(secim: Secim) {
    setSecimUstYazim((m) => ({ ...m, ...tumuneUygula(barkodlar, secim) }));
  }

  // Toplu seçicide görünen değer: kullanıcı bir şey seçtiyse tüm ürünler aynı
  // olduğunda onu gösteriyor, karışıksa boş kalıyor.
  const ortakSecim: Secim | null = (() => {
    if (barkodlar.length === 0) return null;
    const ilk = secimiOku(barkodlar[0]);
    return barkodlar.every((b) => {
      const s = secimiOku(b);
      return s.kat === ilk.kat && s.alt === ilk.alt;
    })
      ? ilk
      : null;
  })();

  const dosyadanTarih = fatura?.tarih
    ? inputTarih(new Date(fatura.tarih))
    : inputTarih(new Date());
  const faturaTarihi = (fatura && tarihUstYazim[fatura.faturaNo]) || dosyadanTarih;
  const setFaturaTarihi = (deger: string) => {
    if (fatura) setTarihUstYazim((m) => ({ ...m, [fatura.faturaNo]: deger }));
  };

  useEffect(() => {
    if (kayit.faturaId) yonlendirici.push(`/faturalar/${kayit.faturaId}`);
  }, [kayit.faturaId, yonlendirici]);

  /** Bir ürünün düzeltmeler uygulanmış hali. */
  function urunuOku(grup: TedarikciUrunGrubu) {
    return duzenlenmisUrun(grup, urunUstYazim[grup.barkod]);
  }

  /** Bir cihazın düzeltmeler uygulanmış seri numarası ve çıkarılma durumu. */
  function seriyiOku(grup: TedarikciUrunGrubu, indeks: number) {
    return duzenlenmisSeri(
      grup.cihazlar[indeks]?.seriNo ?? null,
      seriUstYazim[seriAnahtari(grup.barkod, indeks)],
    );
  }

  /** Seçili faturayı tek tek cihaz satırlarına açar. */
  function satirlariUret(): FaturaSatiriGirdisi[] {
    if (!fatura) return [];
    return fatura.gruplar.flatMap<FaturaSatiriGirdisi>((g) => {
      const secim = secimiOku(g.barkod);
      const alanlar = urunuOku(g);
      const ortak = {
        kategoriId: Number(secim.kat) || 0,
        altKategoriId: Number(secim.alt) || null,
        marka: alanlar.marka || "—",
        model: alanlar.model,
        renk: null,
        kapasite: null,
        barkod: alanlar.barkod || null,
        alisFiyatiKurus: alanlar.alisFiyatiKurus,
        not: null,
      };
      return g.cihazlar
        .map((_, i) => seriyiOku(g, i))
        .filter((s) => !s.cikarildi)
        .filter((s) => !s.seriNo || !kayitliSeriNolar.has(s.seriNo))
        .map((s) => ({ ...ortak, seriNo: s.seriNo }));
    });
  }

  const satirlar = satirlariUret();
  const toplamKurus = satirlar.reduce((t, s) => t + s.alisFiyatiKurus, 0);

  // Elle düzeltmeden sonra kalan sorunlar: boş marka/model, geçersiz fiyat,
  // elle yazılırken tekrarlanan seri no.
  const sorunlar = fatura
    ? duzenlemeSorunlari(
        fatura.gruplar.map((g) => ({ alanlar: urunuOku(g), urunAdi: g.urunAdi })),
        satirlar.map((s) => ({ urunAdi: `${s.marka} ${s.model}`.trim(), seriNo: s.seriNo })),
      )
    : [];
  const sinifIandirilmamislar = fatura
    ? fatura.gruplar.filter((g) => Number(secimiOku(g.barkod).kat) === varsayilanKategoriId)
    : [];

  /** Seri no zorunlu kategori seçilmiş ama dosyada seri numarası olmayan cihaz var. */
  const uyumsuzlar = fatura
    ? fatura.gruplar.filter((g) => {
        const kat = kategoriler.find((k) => String(k.id) === secimiOku(g.barkod).kat);
        if (!kat?.seriNoZorunlu) return false;
        return g.cihazlar.some((c) => !c.seriNo);
      })
    : [];
  const elenen = fatura ? fatura.cihazSayisi - satirlar.length : 0;

  function veriyiHazirla(form: FormData): FormData {
    const yuk = {
      tedarikciId: Number(form.get("tedarikciId")) || 0,
      magazaId: Number(form.get("magazaId")) || 0,
      faturaNo: String(form.get("faturaNo") ?? ""),
      faturaTarihi: String(form.get("faturaTarihi") ?? ""),
      vadeGun: Number(form.get("vadeGun")) || 0,
      vadeTarihi: String(form.get("vadeTarihi") ?? "").trim() || null,
      // Sipariş numarası dosyadan gelir; kullanıcının yazdığı notla birleştirilir.
      not:
        [
          fatura?.siparisNo ? `Sipariş no: ${fatura.siparisNo}` : "",
          String(form.get("not") ?? "").trim(),
        ]
          .filter(Boolean)
          .join(" · ") || null,
      satirlar,
    };
    const yeni = new FormData();
    yeni.set("veri", JSON.stringify(yuk));
    return yeni;
  }

  return (
    <div className="space-y-5">
      {/* ------------------------------------------- 1. Dosya */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">
          1. Tedarikçiden gelen Excel dosyasını yükleyin
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          İki dosya türü de olur: tedarikçinizin gönderdiği{" "}
          <strong>e-Fatura PDF&apos;i</strong> ya da portaldaki{" "}
          <strong>Seri No Kontrolü</strong> ekranından{" "}
          <strong>Excel&apos;e Aktar</strong> ile indirdiğiniz dosya. Olduğu gibi yükleyin;
          dosya yüklendiğinde hiçbir kayıt oluşmaz.
        </p>

        <form action={onizleEylem} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="dosya" className={KUCUK_ETIKET}>
              Dosya (.pdf · .xlsx)
            </label>
            <input
              id="dosya"
              name="dosya"
              type="file"
              accept=".pdf,.xlsx"
              required
              className="block w-full max-w-sm text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
            />
          </div>
          <GonderDugmesi tur="ikincil" bekleyenMetin="Okunuyor…">
            Dosyayı Oku
          </GonderDugmesi>
        </form>

        {onizleme.hata ? (
          <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-800">{onizleme.hata}</p>
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------- 2. Fatura seçimi ve ürünler */}
      {fatura ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-slate-800">2. Okunan fatura</h2>
            <p className="mb-3 text-sm text-slate-500">
              <span className="font-medium text-slate-700">{onizleme.dosyaAdi}</span> ·{" "}
              {faturalar.length === 1
                ? "1 fatura"
                : `${faturalar.length} fatura bulundu, birer birer kaydedilir`}
            </p>
            <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">Fatura no (e-fatura)</dt>
                <dd className="font-mono text-slate-900">{fatura.faturaNo}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Sipariş no</dt>
                <dd className="font-mono text-slate-900">{fatura.siparisNo || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Cihaz</dt>
                <dd className="text-slate-900">{fatura.cihazSayisi} adet</dd>
              </div>
            </dl>

            {faturalar.length > 1 ? (
              <div className="mb-3">
                <label htmlFor="faturaSecimi" className={KUCUK_ETIKET}>
                  Kaydedilecek fatura
                </label>
                <select
                  id="faturaSecimi"
                  value={fatura.faturaNo}
                  onChange={(e) => setSeciliNo(e.target.value)}
                  className={GIRDI_SINIFI}
                >
                  {faturalar.map((f) => (
                    <option key={f.faturaNo} value={f.faturaNo}>
                      {f.faturaNo} · {f.cihazSayisi} cihaz · {kurusuTLYaz(f.toplamKurus)} TL
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {onizleme.hatalar?.length ? (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-800">
                  Aşağıdaki satırlar atlanacak:
                </p>
                <ul className="mt-2 max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto text-sm text-red-700">
                  {onizleme.hatalar.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {elenen > 0 ? (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-900">
                  {elenen} cihazın seri numarası sistemde zaten kayıtlı, bunlar atlanacak.
                </p>
              </div>
            ) : null}

            {sinifIandirilmamislar.length > 0 ? (
              <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-600">
                  {sinifIandirilmamislar.length} ürün <strong>Sınıflandırılmamış</strong> olarak
                  kaydedilecek. İstersen şimdi kategori seç, istersen sonra cihaz sayfasından
                  düzelt — seçtiğin kategori sonraki faturalarda otomatik gelir.
                </p>
              </div>
            ) : null}

            {uyumsuzlar.length > 0 ? (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-800">
                  {uyumsuzlar.length} ürüne seri no zorunlu bir kategori seçildi ama dosyada
                  seri numarası yok:
                </p>
                <ul className="mt-1 list-inside list-disc text-sm text-red-700">
                  {uyumsuzlar.map((g) => (
                    <li key={g.barkod}>{g.urunAdi}</li>
                  ))}
                </ul>
                <p className="mt-1 text-sm text-red-700">
                  Aksesuar gibi seri numarası olmayan ürünler için seri no zorunlu olmayan bir
                  kategori seçin.
                </p>
              </div>
            ) : null}

            {sorunlar.length > 0 ? (
              <div
                data-test="duzenleme-sorunlari"
                className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
              >
                <p className="text-sm font-medium text-red-800">
                  Düzelttiğiniz alanlarda sorun var:
                </p>
                <ul className="mt-1 list-inside list-disc text-sm text-red-700">
                  {sorunlar.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Fatura genelde tek tür mal taşıyor: tek seçimle hepsini ayarla. */}
            <div
              data-test="toplu-kategori"
              className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              <p className="mb-2 text-sm font-medium text-slate-700">
                Tümüne uygula
                <span className="ml-1 font-normal text-slate-500">
                  — buradan seçtiğiniz kategori {fatura.gruplar.length} ürünün hepsine yazılır,
                  tek tek değiştirebilirsiniz
                </span>
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label htmlFor="topluKategori" className={KUCUK_ETIKET}>
                    Kategori
                  </label>
                  <select
                    id="topluKategori"
                    value={ortakSecim?.kat ?? ""}
                    onChange={(e) =>
                      e.target.value ? hepsineYaz({ kat: e.target.value, alt: "" }) : undefined
                    }
                    className={GIRDI_SINIFI}
                  >
                    {ortakSecim ? null : <option value="">(ürünlerde farklı)</option>}
                    {kategoriler.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.id === varsayilanKategoriId ? `${k.ad} (sonra düzeltilebilir)` : k.ad}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="topluAltKategori" className={KUCUK_ETIKET}>
                    Alt Kategori
                  </label>
                  <select
                    id="topluAltKategori"
                    value={ortakSecim?.alt ?? ""}
                    disabled={!ortakSecim}
                    onChange={(e) =>
                      ortakSecim
                        ? hepsineYaz({ kat: ortakSecim.kat, alt: e.target.value })
                        : undefined
                    }
                    className={GIRDI_SINIFI}
                  >
                    <option value="">—</option>
                    {(kategoriler.find((k) => String(k.id) === ortakSecim?.kat)?.altKategoriler ??
                      []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.ad}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {fatura.gruplar.map((grup) => (
                <UrunSatiri
                  key={grup.barkod}
                  grup={grup}
                  kategoriler={kategoriler}
                  varsayilanKategoriId={varsayilanKategoriId}
                  secim={secimiOku(grup.barkod)}
                  degistir={(yeni) =>
                    setSecimUstYazim((m) => ({ ...m, [grup.barkod]: yeni }))
                  }
                  alanlar={urunuOku(grup)}
                  alanDegistir={(alan, deger) =>
                    setUrunUstYazim((m) => ({
                      ...m,
                      [grup.barkod]: { ...m[grup.barkod], [alan]: deger },
                    }))
                  }
                  seriyiOku={(i) => seriyiOku(grup, i)}
                  seriDegistir={(i, yeni) =>
                    setSeriUstYazim((m) => ({
                      ...m,
                      [seriAnahtari(grup.barkod, i)]: {
                        ...m[seriAnahtari(grup.barkod, i)],
                        ...yeni,
                      },
                    }))
                  }
                  kayitliSeriNolar={kayitliSeriNolar}
                />
              ))}
            </div>
          </section>

          {/* ------------------------------------------- 3. Fatura bilgileri */}
          <form action={(form) => kaydetEylem(veriyiHazirla(form))}>
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-1 text-sm font-semibold text-slate-800">
                3. Fatura bilgileri ve kayıt
              </h2>
              <p className="mb-3 text-sm text-slate-500">
                Fatura numarası ve tarihi dosyadan geldi. Tedarikçi ve depoyu siz seçin.
                {fatura.vadeTarihi ? " Vade tarihi de faturada yazıyordu, hazır geldi." : " Vadeyi siz seçin."}
              </p>

              {kayit.hata ? (
                <div
                  role="alert"
                  className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
                >
                  <p className="text-sm font-medium text-red-800">{kayit.hata}</p>
                  {kayit.alanHatalari?.length ? (
                    <ul className="mt-2 max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto text-sm text-red-700">
                      {kayit.alanHatalari.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <TedarikciSecici baslangic={tedarikciler} />

                <div>
                  <label htmlFor="faturaNo" className={KUCUK_ETIKET}>
                    Fatura No *
                  </label>
                  <input
                    id="faturaNo"
                    name="faturaNo"
                    key={`fno-${fatura.faturaNo}`}
                    defaultValue={fatura.faturaNo}
                    required
                    maxLength={40}
                    className={GIRDI_SINIFI}
                  />
                </div>

                <div>
                  <label htmlFor="faturaTarihi" className={KUCUK_ETIKET}>
                    Fatura Tarihi *
                  </label>
                  <input
                    id="faturaTarihi"
                    name="faturaTarihi"
                    type="date"
                    required
                    value={faturaTarihi}
                    onChange={(e) => setFaturaTarihi(e.target.value)}
                    className={GIRDI_SINIFI}
                  />
                </div>

                <div>
                  <label htmlFor="magazaId" className={KUCUK_ETIKET}>
                    Giriş Yapılacak Depo *
                  </label>
                  <select
                    id="magazaId"
                    name="magazaId"
                    required
                    defaultValue={varsayilanMagazaId ?? ""}
                    className={GIRDI_SINIFI}
                  >
                    <option value="">Seçin…</option>
                    {magazalar.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.ad}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Fatura değişince vade seçimi de sıfırlansın. */}
                <VadeAlani
                  key={`vade-${fatura.faturaNo}`}
                  faturaTarihi={faturaTarihi}
                  baslangicVadeTarihi={
                    fatura.vadeTarihi ? inputTarih(new Date(fatura.vadeTarihi)) : undefined
                  }
                />

                <div>
                  <label htmlFor="not" className={KUCUK_ETIKET}>
                    Fatura Notu
                  </label>
                  <input id="not" name="not" maxLength={400} className={GIRDI_SINIFI} />
                  <p className="mt-1 text-xs text-slate-500">
                    Sipariş no ({fatura.siparisNo || "—"}) nota otomatik eklenir.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
                {/* Sorun varken düğme çizilmiyor: GonderDugmesi'ne disabled
                    geçmek bekleme kilidini de etkisizleştiriyor. */}
                {sorunlar.length > 0 ? (
                  <span className="text-sm font-medium text-red-800">
                    Yukarıdaki sorunlar giderilmeden kaydedilemez.
                  </span>
                ) : (
                  <GonderDugmesi bekleyenMetin="Kaydediliyor…">
                    {satirlar.length} Cihazı Kaydet
                  </GonderDugmesi>
                )}
                <span className="text-sm text-slate-500">
                  Toplam alış tutarı {kurusuTLYaz(toplamKurus)} TL (KDV hariç)
                </span>
                {uyumsuzlar.length > 0 ? (
                  <span className="text-sm font-medium text-red-800">
                    Seri no uyuşmazlığı giderilmeden kaydedilemez.
                  </span>
                ) : null}
              </div>
            </section>
          </form>
        </>
      ) : null}
    </div>
  );
}

/** Bir ürün grubu: dosyadan okunan bilgiler, kategori seçimi ve elle düzeltme. */
function UrunSatiri({
  grup,
  kategoriler,
  varsayilanKategoriId,
  secim,
  degistir,
  alanlar,
  alanDegistir,
  seriyiOku,
  seriDegistir,
  kayitliSeriNolar,
}: {
  grup: TedarikciUrunGrubu;
  kategoriler: KategoriSecimi[];
  varsayilanKategoriId: number;
  secim: { kat: string; alt: string };
  degistir: (yeni: { kat: string; alt: string }) => void;
  alanlar: { marka: string; model: string; barkod: string; alisFiyatiKurus: number };
  alanDegistir: (alan: keyof UrunUstYazim, deger: string | number) => void;
  seriyiOku: (indeks: number) => { seriNo: string | null; cikarildi: boolean };
  seriDegistir: (indeks: number, yeni: SeriUstYazim) => void;
  kayitliSeriNolar: Set<string>;
}) {
  const [acik, setAcik] = useState(false);
  const [duzenle, setDuzenle] = useState(false);
  // Fiyat kutusu yazarken serbest kalmalı ("8.270," gibi yarım değerler);
  // bu yüzden metin olarak tutuluyor, kuruşa çevirme onChange'de yapılıyor.
  const [fiyatMetni, setFiyatMetni] = useState<string | null>(null);

  const kategori = kategoriler.find((k) => String(k.id) === secim.kat);

  const cihazDurumlari = grup.cihazlar.map((_, i) => seriyiOku(i));
  const alinacak = cihazDurumlari.filter(
    (c) => !c.cikarildi && (!c.seriNo || !kayitliSeriNolar.has(c.seriNo)),
  );
  const seriNoEksik =
    Boolean(kategori?.seriNoZorunlu) &&
    cihazDurumlari.some((c) => !c.cikarildi && !c.seriNo);

  const okunanAd = `${grup.urunAdi}`;
  const degistirilmis =
    alanlar.barkod !== grup.barkod ||
    `${alanlar.marka} ${alanlar.model}`.trim() !== okunanAd.trim() ||
    alanlar.alisFiyatiKurus !== grup.alisFiyatiKurus;

  return (
    <div data-test="urun-satiri" className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
          {alanlar.barkod || "(barkod yok)"}
        </span>
        <span className="font-medium text-slate-900">
          {`${alanlar.marka} ${alanlar.model}`.trim() || "(ürün adı yok)"}
        </span>
        <span className="text-slate-500">
          {alinacak.length} adet × {kurusuTLYaz(alanlar.alisFiyatiKurus)} TL
        </span>
        {degistirilmis ? (
          <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
            elle düzeltildi
          </span>
        ) : null}
        {grup.fiyatFarkliMi ? (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            satırlarda farklı birim tutar var
          </span>
        ) : null}
        {seriNoEksik ? (
          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
            bu üründe seri no yok — {kategori?.ad} kategorisi seri no istiyor
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setDuzenle((o) => !o)}
          className="ml-auto text-sm font-medium text-slate-600 underline hover:text-slate-900"
        >
          {duzenle ? "Düzeltmeyi kapat" : "Bilgileri düzelt"}
        </button>
      </div>

      {duzenle ? (
        <div
          data-test="urun-duzeltme"
          className="mb-2 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div>
            <label className={KUCUK_ETIKET}>Marka</label>
            <input
              data-test="duzelt-marka"
              value={alanlar.marka}
              onChange={(e) => alanDegistir("marka", e.target.value)}
              maxLength={60}
              className={GIRDI_SINIFI}
            />
          </div>
          <div>
            <label className={KUCUK_ETIKET}>Model</label>
            <input
              data-test="duzelt-model"
              value={alanlar.model}
              onChange={(e) => alanDegistir("model", e.target.value)}
              maxLength={80}
              className={GIRDI_SINIFI}
            />
          </div>
          <div>
            <label className={KUCUK_ETIKET}>Barkod</label>
            <input
              data-test="duzelt-barkod"
              value={alanlar.barkod}
              onChange={(e) => alanDegistir("barkod", e.target.value)}
              maxLength={40}
              className={`${GIRDI_SINIFI} font-mono`}
            />
          </div>
          <div>
            <label className={KUCUK_ETIKET}>Birim Alış Fiyatı (TL)</label>
            <input
              data-test="duzelt-fiyat"
              value={fiyatMetni ?? kurusuTLYaz(alanlar.alisFiyatiKurus)}
              onChange={(e) => {
                setFiyatMetni(e.target.value);
                const kurus = tlyiKurusaCevir(e.target.value);
                alanDegistir("alisFiyatiKurus", kurus ?? NaN);
              }}
              onBlur={() => setFiyatMetni(null)}
              inputMode="decimal"
              className={`${GIRDI_SINIFI} text-right tabular-nums`}
            />
          </div>
          <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">
            Dosyadan okunan: <span className="font-mono">{grup.barkod}</span> · {okunanAd} ·{" "}
            {kurusuTLYaz(grup.alisFiyatiKurus)} TL
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className={KUCUK_ETIKET}>Kategori</label>
          <select
            value={secim.kat}
            onChange={(e) => degistir({ kat: e.target.value, alt: "" })}
            className={GIRDI_SINIFI}
          >
            {kategoriler.map((k) => (
              <option key={k.id} value={k.id}>
                {k.id === varsayilanKategoriId ? `${k.ad} (sonra düzeltilebilir)` : k.ad}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={KUCUK_ETIKET}>Alt Kategori</label>
          <select
            value={secim.alt}
            onChange={(e) => degistir({ ...secim, alt: e.target.value })}
            disabled={!kategori}
            className={GIRDI_SINIFI}
          >
            <option value="">—</option>
            {kategori?.altKategoriler.map((a) => (
              <option key={a.id} value={a.id}>
                {a.ad}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => setAcik((o) => !o)}
            className="text-sm font-medium text-slate-600 underline hover:text-slate-900"
          >
            {acik
              ? "Seri numaralarını gizle"
              : `Seri numaralarını göster / düzelt (${grup.cihazlar.length})`}
          </button>
        </div>
      </div>

      {acik ? (
        <ul
          data-test="seri-listesi"
          className="mt-2 grid max-h-60 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3"
        >
          {grup.cihazlar.map((c, i) => {
            const durum = seriyiOku(i);
            const kayitli = durum.seriNo ? kayitliSeriNolar.has(durum.seriNo) : false;
            return (
              <li key={seriAnahtari(grup.barkod, i)} className="flex items-center gap-1">
                <input
                  data-test="seri-kutusu"
                  value={durum.seriNo ?? ""}
                  onChange={(e) => seriDegistir(i, { seriNo: e.target.value })}
                  disabled={durum.cikarildi}
                  placeholder="(seri no yok)"
                  maxLength={40}
                  title={
                    kayitli
                      ? "Sistemde zaten kayıtlı, atlanacak"
                      : c.seriNo && c.seriNo !== durum.seriNo
                        ? `Dosyadan okunan: ${c.seriNo}`
                        : undefined
                  }
                  className={`w-full rounded border px-2 py-1 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    durum.cikarildi
                      ? "border-slate-200 bg-slate-100 text-slate-400 line-through"
                      : kayitli
                        ? "border-red-200 bg-red-50 text-red-700 line-through"
                        : "border-slate-200 bg-white text-slate-700"
                  }`}
                />
                <button
                  type="button"
                  data-test="seri-cikar"
                  onClick={() => seriDegistir(i, { cikarildi: !durum.cikarildi })}
                  title={durum.cikarildi ? "Faturaya geri al" : "Bu cihazı faturadan çıkar"}
                  className="shrink-0 rounded px-1.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  {durum.cikarildi ? "geri al" : "×"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
