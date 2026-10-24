"use client";

import { useState, useTransition } from "react";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import {
  OkutmaKutusu,
  type OkutmaGeriBildirimi,
} from "@/bilesenler/OkutmaKutusu";
import { Rozet } from "@/bilesenler/Rozet";
import { ayniDukkandakiler, type DukkanMagazasi } from "@/lib/dukkan";
import { ODEME_TIPI, ODEME_TIPI_ETIKET, type OdemeTipi } from "@/lib/sabitler";
import type { MusteriOzeti } from "../satis/eylemler";
import { aktarimUrunleriniAra, dukkanIciAktar } from "./eylemler";
import { FiyatDuzeltme } from "./FiyatDuzeltme";
import { MusteriBlogu } from "./MusteriBlogu";
import { inputTarih } from "@/lib/tarih";
import {
  aramaYeterliMi,
  grupAciklamasi,
  grupEtiketi,
  grupFiyatMetni,
  sonucYokMesaji,
  type UrunGrubu,
  kesintiUyarisi,
} from "@/lib/urunArama";
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
  const hedefId = hedefler.some((h) => h.id === elleHedefId)
    ? elleHedefId
    : (hedefler[0]?.id ?? 0);
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

  /**
   * Cihazı aktarır ve listeye ekler. `cihazId` verilirse kodla değil kimlikle
   * aranır: listeden seçimde kullanıcının seçtiği cihaz gelmeli, aynı
   * barkodtaki "ilk" cihaz değil.
   */
  async function aktarVeEkle(
    kod: string,
    cihazId?: number,
  ): Promise<OkutmaGeriBildirimi> {
    if (!kaynak || !hedef)
      return { tur: "hata", mesaj: "Önce mağazaları seçin." };

    const sonuc = await dukkanIciAktar(
      kod,
      kaynak.id,
      hedef.id,
      not,
      islemTarihi,
      cihazId,
    );
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

  const okut = (kod: string) => aktarVeEkle(kod);

  // Listeden seç: barkodu okutmak her zaman mümkün olmuyor, bazı ürünü adıyla
  // bulmak daha kolay. Okutma yolunu kapatmıyor, yanına ekleniyor.
  const [listeAcik, setListeAcik] = useState(false);
  const [urunSorgu, setUrunSorgu] = useState("");
  const [urunler, setUrunler] = useState<UrunGrubu[] | null>(null);
  // Arama sınıra dayandıysa söylenmeli; sessizce kesilince kullanıcı
  // "ürün yok" sanıyor.
  const [aramaKesildi, setAramaKesildi] = useState(false);
  const [urunAraniyor, urunAramaBasla] = useTransition();
  const [listeHatasi, setListeHatasi] = useState<string | null>(null);

  function urunAramayiCalistir() {
    const sorgu = urunSorgu.trim();
    if (!kaynak || !aramaYeterliMi(sorgu)) {
      setUrunler(null);
      setAramaKesildi(false);
      return;
    }
    urunAramaBasla(async () => {
      const sonuc = await aktarimUrunleriniAra(
        sorgu,
        kaynak.id,
        satirlar.filter((s) => !s.geriAlindi).map((s) => s.anahtar),
      );
      setUrunler(sonuc.gruplar);
      setAramaKesildi(sonuc.kesildi);
    });
  }

  /** Listeden bir ürün seçildi: gruptaki ilk uygun cihaz aktarılır. */
  function urunSec(grup: UrunGrubu) {
    setListeHatasi(null);
    urunAramaBasla(async () => {
      const sonuc = await aktarVeEkle(
        grup.barkod ?? `${grup.marka} ${grup.model}`,
        grup.cihazIdleri[0],
      );
      if (sonuc?.tur === "hata") {
        setListeHatasi(sonuc.mesaj);
        return;
      }
      // Liste açık kalıyor: arka arkaya birkaç ürün aktarmak yaygın.
      urunAramayiCalistir();
    });
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
        mevcut.map((s) =>
          s.anahtar === satir.anahtar ? { ...s, geriAlindi: true } : s,
        ),
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
          Okuttuğun cihaz <strong>anında</strong> taşınır; sevkiyat açılmaz,
          karşı tarafın kabulü beklenmez. Yanlış okutursan aşağıdaki{" "}
          <strong>Geri al</strong> düğmesi cihazı yerine döndürür.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {/* Not okutmadan önce yazılıyor; o andan sonra okutulan cihazların
            tarihçesine geçiyor. Aktarımın nedeni sonradan okunabilsin. */}
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_11rem]">
          <div>
            <label
              htmlFor="aktarimNotu"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
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
              Yazdığınız not, bundan sonra okuttuğunuz cihazların tarihçesine
              eklenir.
            </p>
          </div>
          {/* Geçmişe dönük kayıt: dün yapılan aktarım bugün olmuş gibi
              görünmesin. Aynı tarih sat-geri al satışına da yazılıyor. */}
          <div>
            <label
              htmlFor="aktarimTarihi"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
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
                Okutulan her cihaz için yeni alış fiyatı sorulur. Müşteriye
                satıp geri aldıysanız satış fiyatını da yazın — o zaman satış,
                paneldeki mağaza ve personel satış raporlarına yansır. Satış
                fiyatı boş bırakılırsa yalnız alış fiyatı güncellenir. Cihaz her
                durumda stokta kalır.
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

        {/* Listeden seç: barkodu okutmak her zaman mümkün olmuyor ve bazı
            ürünü adıyla bulmak daha kolay. Kaynak mağazanın stoğunda arar. */}
        <div className="mt-3">
          <button
            type="button"
            data-test="aktarim-liste-ac"
            disabled={!kaynak || !hedef}
            onClick={() => {
              const yeni = !listeAcik;
              setListeAcik(yeni);
              if (!yeni) {
                setUrunSorgu("");
                setUrunler(null);
                setListeHatasi(null);
              }
            }}
            className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline disabled:opacity-50 disabled:no-underline"
          >
            {listeAcik ? "− Listeyi kapat" : "☰ Ürün Listesinden Ekle"}
          </button>

          {listeAcik ? (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-2">
                <input
                  data-test="aktarim-urun-sorgu"
                  value={urunSorgu}
                  onChange={(e) => setUrunSorgu(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      urunAramayiCalistir();
                    }
                  }}
                  placeholder="Ürün adı, marka veya model (en az 2 harf)"
                  className={`min-w-0 flex-1 ${GIRDI_SINIFI}`}
                />
                <button
                  type="button"
                  data-test="aktarim-urun-bul"
                  onClick={urunAramayiCalistir}
                  disabled={urunAraniyor}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:opacity-60"
                >
                  {urunAraniyor ? "Aranıyor…" : "Bul"}
                </button>
              </div>

              {listeHatasi ? (
                <p
                  data-test="aktarim-liste-hatasi"
                  role="alert"
                  className="text-sm font-medium text-red-700"
                >
                  {listeHatasi}
                </p>
              ) : null}

              {urunler === null ? (
                <p className="text-xs text-slate-500">
                  {kaynak?.ad} stoğunda arar. Aynı üründen birden çok varsa tek
                  satırda toplanır; seçtiğinizde biri aktarılır.
                </p>
              ) : urunler.length === 0 ? (
                <p
                  data-test="aktarim-urun-sonuc-yok"
                  className="text-sm text-slate-500"
                >
                  {sonucYokMesaji(urunSorgu)}
                </p>
              ) : (
                <ul
                  data-test="aktarim-urun-listesi"
                  className="divide-y divide-slate-100"
                >
                  {aramaKesildi ? (
                    <li
                      data-test="arama-kesildi"
                      className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"
                    >
                      {kesintiUyarisi({ kesildi: true })}
                    </li>
                  ) : null}
                  {urunler.map((g) => (
                    <li key={g.anahtar}>
                      <button
                        type="button"
                        data-test="aktarim-urun-satiri"
                        onClick={() => urunSec(g)}
                        disabled={urunAraniyor}
                        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 text-left transition hover:bg-blue-50 disabled:opacity-50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">
                            {grupEtiketi(g)}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {grupAciklamasi(g)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-xs text-slate-600">
                          <span className="block">
                            alış {grupFiyatMetni(g)}
                          </span>
                          <span className="block font-medium text-blue-700">
                            + Aktar
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {satirlar.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Bu oturumda aktarılanlar{" "}
            <span className="font-normal text-slate-500">
              ({aktarilan} cihaz)
            </span>
          </h2>
          <ul className="space-y-2">
            {satirlar.map((s) => (
              <li
                key={s.anahtar}
                data-test="aktarilan-satir"
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-slate-900">
                    {s.etiket}
                  </span>
                  {s.kod ? (
                    <span className="ml-2 font-mono text-xs text-slate-500">
                      {s.kod}
                    </span>
                  ) : null}
                  <span className="ml-2 text-xs text-slate-500">
                    {s.geriAlindi
                      ? `${s.hedefAd} → ${s.kaynakAd}`
                      : `${s.kaynakAd} → ${s.hedefAd}`}
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
                {/* Satış modu açık ve müşteri girilmişse sat-geri al formu;
                    aksi halde yalnız alış fiyatını düzeltme. Müşteri yokken
                    hiçbir şey göstermemek, "alış fiyatını revize edeceğim"
                    diye kutuyu işaretleyen kullanıcıyı fiyat alanı olmadan
                    bırakıyordu — oysa satış için müşteri gerekir, fiyat
                    düzeltmek için gerekmez. */}
                {s.geriAlindi ? null : satisModu && musteriHazir ? (
                  <SatGeriAl
                    cihazId={s.anahtar}
                    kaynakMagazaId={s.kaynakId}
                    etiket={s.etiket}
                    baslangicAlisKurus={s.alisFiyatiKurus}
                    baslik={satisBasligi}
                    not={not.trim() || null}
                  />
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
