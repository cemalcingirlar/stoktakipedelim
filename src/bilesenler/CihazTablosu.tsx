import Link from "next/link";
import { DurumRozeti, Rozet } from "./Rozet";
import { KunyeDuzenleyici, type KategoriSecenegi } from "./KunyeDuzenleyici";
import { SutunFiltresi, type FiltreSecenekleri } from "./SutunFiltresi";
import type { CihazSatiri } from "@/lib/cihazFiltre";
import {
  SIRALANABILIR,
  siralamaIsareti,
  sonrakiSiralama,
  type Siralama,
} from "@/lib/cihazSiralama";
import { kurusuTLYaz } from "@/lib/para";
import { vadeEtiketi } from "@/lib/vade";
import { beklemeGunu, karKurus, SUTUNLAR, type SutunAnahtari } from "@/lib/sutunlar";
import { vadeDurumu } from "@/lib/vade";

function BeklemeRozeti({ gun }: { gun: number }) {
  const ton = gun >= 180 ? "kirmizi" : gun >= 60 ? "sari" : "nötr";
  return <Rozet ton={ton}>{gun} gün</Rozet>;
}

/** Varsayılan metin dışında özel gösterim isteyen sütunlar. */
function Hucre({
  anahtar,
  satir,
  bugun,
  duzenleme,
}: {
  anahtar: SutunAnahtari;
  satir: CihazSatiri;
  bugun: Date;
  /** Künye düzeltme açıksa gereken bilgiler; kapalıysa undefined. */
  duzenleme?: { kategoriler: KategoriSecenegi[]; ayniBarkodAdedi: number };
}) {
  // Marka ve kategori hücreleri yerinde düzeltilebiliyor: yanlış kategori en
  // sık buradan fark ediliyor, cihaz sayfasına gidip dönmek zaman kaybı.
  if (duzenleme && (anahtar === "marka" || anahtar === "kategori" || anahtar === "altKategori")) {
    const etiket =
      anahtar === "marka"
        ? satir.marka
        : anahtar === "kategori"
          ? satir.kategori.ad
          : (satir.altKategori?.ad ?? "");
    return (
      <KunyeDuzenleyici
        cihaz={{
          id: satir.id,
          marka: satir.marka,
          model: satir.model,
          barkod: satir.barkod,
          kategoriId: satir.kategoriId,
          altKategoriId: satir.altKategoriId,
          ayniBarkodAdedi: duzenleme.ayniBarkodAdedi,
        }}
        kategoriler={duzenleme.kategoriler}
        etiket={etiket}
      />
    );
  }

  switch (anahtar) {
    case "model":
      return (
        <Link href={`/cihazlar/${satir.id}`} className="font-medium text-blue-600 hover:underline">
          {`${satir.marka} ${satir.model}`.trim()}
        </Link>
      );
    case "seriNo":
      return satir.seriNo ? (
        <span className="font-mono text-xs text-slate-700">{satir.seriNo}</span>
      ) : (
        <span className="text-slate-300">—</span>
      );
    case "barkod":
      return satir.barkod ? (
        <span className="font-mono text-xs text-slate-700">{satir.barkod}</span>
      ) : (
        <span className="text-slate-300">—</span>
      );
    case "durum":
      return <DurumRozeti durum={satir.durum} />;
    case "bekleme":
      return <BeklemeRozeti gun={beklemeGunu(satir, bugun)} />;
    case "vade": {
      const v = vadeDurumu(satir.alisFaturasi, bugun);
      if (v.durum === "YOK") return <span className="text-slate-300">—</span>;
      return (
        <span className="whitespace-nowrap">
          <Rozet ton={v.durum === "GECTI" ? "kirmizi" : v.durum === "YAKLASIYOR" ? "sari" : v.durum === "ODENDI" ? "yesil" : "nötr"}>
            {v.etiket}
          </Rozet>
          <span className="ml-1 text-xs text-slate-400">
            {vadeEtiketi(satir.alisFaturasi?.vadeGun)}
          </span>
        </span>
      );
    }
    case "kar": {
      const k = karKurus(satir);
      if (k === null) return <span className="text-slate-300">—</span>;
      return (
        <span className={k < 0 ? "text-red-600" : "text-emerald-700"}>{kurusuTLYaz(k)}</span>
      );
    }
    case "not":
      return satir.not ? (
        <span className="text-slate-600">{satir.not}</span>
      ) : (
        <span className="text-xs italic text-slate-300">+ not</span>
      );
    default: {
      const metin = SUTUNLAR[anahtar].metin(satir, bugun);
      return metin ? <>{metin}</> : <span className="text-slate-300">—</span>;
    }
  }
}

/** Sıralanabilen sütunun tıklanabilir başlığı. */
function Baslik({
  anahtar,
  siralama,
  sorguUret,
}: {
  anahtar: SutunAnahtari;
  siralama: Siralama;
  sorguUret: (degisiklikler: Record<string, string | null>) => string;
}) {
  const tanim = SUTUNLAR[anahtar];
  const siraAnahtari = SIRALANABILIR[anahtar];

  if (!siraAnahtari) return <>{tanim.baslik}</>;

  const sonraki = sonrakiSiralama(siralama, siraAnahtari);
  const isaret = siralamaIsareti(siralama, siraAnahtari);

  return (
    <Link
      href={sorguUret({
        sirala: sonraki.anahtar,
        yon: sonraki.anahtar ? sonraki.yon : null,
        sayfa: null,
      })}
      data-test={`sirala-${anahtar}`}
      className="inline-flex items-center gap-1 hover:text-slate-900"
      title="Sıralamak için tıklayın"
    >
      {tanim.baslik}
      <span className={isaret ? "text-blue-600" : "text-slate-300"}>{isaret || "⇅"}</span>
    </Link>
  );
}

export function CihazTablosu({
  satirlar,
  sutunlar,
  bugun,
  siralama,
  sorguUret,
  filtreDegerleri,
  filtreSecenekleri,
  kunyeDuzenlenebilir = false,
  kategoriler = [],
  barkodAdetleri = {},
}: {
  satirlar: CihazSatiri[];
  sutunlar: SutunAnahtari[];
  bugun: Date;
  siralama: Siralama;
  /** Başlık bağlantılarının URL'si — sayfa mevcut parametreleri koruyor. */
  sorguUret: (degisiklikler: Record<string, string | null>) => string;
  /** Filtre kutularının mevcut değerleri (URL'den). */
  filtreDegerleri: Record<string, string>;
  filtreSecenekleri: FiltreSecenekleri;
  /** Künye düzeltme yalnız yöneticide açık. */
  kunyeDuzenlenebilir?: boolean;
  kategoriler?: KategoriSecenegi[];
  /** Barkod -> o barkodu taşıyan toplam cihaz sayısı. */
  barkodAdetleri?: Record<string, number>;
}) {
  // Sonuç boş olsa bile filtre satırı duruyor: kullanıcı daralttığı filtreyi
  // gevşetebilmeli, yoksa tek çıkış yolu geri tuşu olurdu.
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            {sutunlar.map((a) => (
              <th
                key={a}
                className={`whitespace-nowrap px-3 py-2.5 font-medium ${SUTUNLAR[a].sagaYasli ? "text-right" : ""}`}
              >
                <Baslik anahtar={a} siralama={siralama} sorguUret={sorguUret} />
              </th>
            ))}
          </tr>
          <tr className="border-b border-slate-200 bg-white" data-test="filtre-satiri">
            {sutunlar.map((a) => (
              <th key={a} className="px-2 py-1.5 font-normal">
                <SutunFiltresi
                  anahtar={a}
                  degerler={filtreDegerleri}
                  secenekler={filtreSecenekleri}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {satirlar.length === 0 ? (
            <tr>
              <td colSpan={sutunlar.length} className="px-4 py-10 text-center text-sm text-slate-500">
                Bu filtrelere uyan cihaz bulunamadı. Yukarıdaki filtre satırından
                daraltmayı gevşetebilirsiniz.
              </td>
            </tr>
          ) : null}
          {satirlar.map((satir) => {
            const vade = vadeDurumu(satir.alisFaturasi, bugun);
            return (
              <tr
                key={satir.id}
                className={vade.satirSinifi || "hover:bg-slate-50"}
              >
                {sutunlar.map((a) => (
                  <td
                    key={a}
                    className={`px-3 py-2.5 align-top ${SUTUNLAR[a].sagaYasli ? "text-right tabular-nums" : ""}`}
                  >
                    <Hucre
                      anahtar={a}
                      satir={satir}
                      bugun={bugun}
                      duzenleme={
                        kunyeDuzenlenebilir
                          ? {
                              kategoriler,
                              ayniBarkodAdedi: satir.barkod
                                ? (barkodAdetleri[satir.barkod] ?? 1)
                                : 1,
                            }
                          : undefined
                      }
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
