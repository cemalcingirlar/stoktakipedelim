import { Link } from "@/bilesenler/Bag";
import { DonemSecici } from "@/bilesenler/DonemSecici";
import { Kart } from "@/bilesenler/Kart";
import { aktarimNotu } from "@/lib/cikisOzeti";
import { kurusuTLYazSembollu } from "@/lib/para";
import type { SatisDonemi } from "@/lib/satisDonemi";
import type { SatilanSatiri } from "@/lib/sorgular";
import { saatYaz, tarihYaz } from "@/lib/tarih";

export type CikisOzeti = {
  kalemler: SatilanSatiri[];
  adet: number;
  ciroKurus: number;
  karKurus: number;
  /** Dönemdeki mağaza içi aktarım satışı sayısı. */
  aktarimAdedi?: number;
  /** Aktarım satışları bu özetin dışında mı (stok görünümü)? */
  aktarimHaric?: boolean;
};

/**
 * Stoktan çıkanlar kartı: dönem düğmeleri, özet ve son satış satırları.
 *
 * İki ekranda birden duruyor — panelde ve satış ekranında. Satış yaparken
 * "bugün ne sattık, bu cihaz zaten satıldı mı" diye panele gidip dönmek
 * gerekiyordu. İki kopya yerine tek bileşen: biri düzeltilip diğeri
 * unutulmasın.
 */
export function CikisKarti({
  baslik,
  cihazListesiYolu,
  ozet,
  tekGun,
  bosNotu,
  secici,
}: {
  baslik: string;
  /** Kart başlığının ve "tamamını görün" bağlantısının gittiği yer. */
  cihazListesiYolu: string;
  ozet: CikisOzeti;
  /** Aralık tek güne mi ait? Satırda saat yerine tarih yazmak buna bağlı. */
  tekGun: boolean;
  bosNotu: string;
  secici: {
    donemler: SatisDonemi[];
    secili: SatisDonemi;
    testAdi: string;
    eylem: string;
    adres: (anahtar: string) => string;
    aralikFormu: {
      gizli: Record<string, string>;
      basAdi: string;
      bitAdi: string;
      bas: string;
      bit: string;
    };
  };
}) {
  const haricNotu = aktarimNotu({
    aktarimAdedi: ozet.aktarimAdedi ?? 0,
    aktarimHaric: ozet.aktarimHaric ?? false,
  });
  return (
    <Kart
      baslikYolu={cihazListesiYolu}
      baslik={baslik}
      eylem={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {ozet.adet > 0 ? (
            <span className="text-xs text-slate-500" data-test="cikis-ozeti">
              {ozet.adet} cihaz · {kurusuTLYazSembollu(ozet.ciroKurus)} ciro ·{" "}
              <span
                className={
                  ozet.karKurus >= 0 ? "text-emerald-700" : "text-red-600"
                }
              >
                {kurusuTLYazSembollu(ozet.karKurus)} kâr
              </span>
            </span>
          ) : null}
          <DonemSecici
            donemler={secici.donemler}
            secili={secici.secili}
            testAdi={secici.testAdi}
            eylem={secici.eylem}
            adres={secici.adres}
            aralikFormu={secici.aralikFormu}
          />
        </div>
      }
    >
      {haricNotu ? (
        // Stok görünümünde sayılmayan mağaza içi aktarım satışları: rakam
        // satış raporuyla tutmadığında nedenini söylüyor.
        <p
          data-test="aktarim-haric-notu"
          className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900"
        >
          {haricNotu}{" "}
          <Link href="/satis" className="font-medium underline underline-offset-2">
            Satış ekranı
          </Link>
        </p>
      ) : null}
      {ozet.adet === 0 ? (
        <p className="text-sm text-slate-500" data-test="cikis-bos">
          {bosNotu}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {ozet.kalemler.map((k) => (
            <li
              key={k.anahtar}
              data-test={
                k.aktarimMi ? "bugun-aktarim-satisi" : "bugun-cihaz-satisi"
              }
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <div className="min-w-0">
                {/* Satış kartı varsa oraya: aynı satışta satılan bütün
                    cihazlar müşteri bilgisiyle birlikte orada. Yoksa
                    (aktarım satışı, göç öncesi kayıt) cihaza. */}
                <Link
                  href={
                    k.satisId
                      ? `/satislar/${k.satisId}`
                      : `/cihazlar/${k.cihazId}`
                  }
                  data-test={
                    k.satisId ? "satis-karti-baglantisi" : "cihaz-baglantisi"
                  }
                  className="truncate font-medium text-slate-800 underline-offset-2 hover:underline"
                >
                  {k.marka} {k.model}
                </Link>
                {/* Mağaza içi aktarımda cihaz satılıp hemen geri alınıyor,
                    yani stokta kalıyor; cihaz listesinde "satıldı"
                    görünmediği için burada işaretleniyor. */}
                {k.aktarimMi ? (
                  <span
                    data-test="aktarim-rozeti"
                    className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-800"
                  >
                    mağaza içi aktarım
                  </span>
                ) : null}
                <div className="text-xs text-slate-500">
                  {/* Seri numarası cihazın kendi sayfasına: satışın fişi
                      başlıkta, cihazın hikâyesi (giriş, sevk, satış) ise
                      cihaz detayındaki tarihçede. */}
                  {k.seriNo ? (
                    <>
                      <Link
                        href={`/cihazlar/${k.cihazId}`}
                        data-test="cikis-seri-baglantisi"
                        className="underline-offset-2 hover:text-blue-700 hover:underline"
                      >
                        {k.seriNo}
                      </Link>
                      {" · "}
                    </>
                  ) : null}
                  {k.magazaAdi}
                  {k.musteriAdSoyad ? (
                    <>
                      {" · "}
                      {k.musteriId ? (
                        <Link
                          href={`/musteriler/${k.musteriId}`}
                          data-test="cikis-musteri-baglantisi"
                          className="underline-offset-2 hover:text-blue-700 hover:underline"
                        >
                          {k.musteriAdSoyad}
                        </Link>
                      ) : (
                        k.musteriAdSoyad
                      )}
                    </>
                  ) : null}
                  {k.satanAdSoyad ? ` · ${k.satanAdSoyad}` : ""}
                </div>
              </div>
              <span className="shrink-0 text-right">
                <span className="block font-medium text-slate-800 tabular-nums">
                  {kurusuTLYazSembollu(k.satisFiyatiKurus)}
                </span>
                <span className="block text-xs text-slate-500">
                  {tekGun ? saatYaz(k.satisTarihi) : tarihYaz(k.satisTarihi)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {ozet.adet > ozet.kalemler.length ? (
        <p className="mt-2 text-xs text-slate-500">
          İlk {ozet.kalemler.length} kayıt gösteriliyor;{" "}
          <Link
            href={cihazListesiYolu}
            className="text-sky-700 underline-offset-2 hover:underline"
          >
            stoktan çıkanların tamamını görün
          </Link>
          . Mağaza içi aktarımda cihaz satılıp hemen geri alındığı için stokta
          kalır; o liste onları içermiyor.
        </p>
      ) : null}
    </Kart>
  );
}
