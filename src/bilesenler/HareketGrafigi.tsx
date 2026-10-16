import { cubukYuzdesi, enYuksekDeger, type GrafikKovasi } from "@/lib/grafikDonem";
import { kurusuTLYazSembollu } from "@/lib/para";

/** Çubuk alanının yüksekliği; etiket satırı bunun dışında. */
const ALAN_YUKSEKLIGI = 160;

/**
 * Seçilen dönemdeki giriş ve satış adetlerini gösteren basit çubuk grafik.
 * Harici grafik kütüphanesi kullanılmaz; ölçekleme en yüksek değere göre yapılır.
 * Sütunlar gün, hafta ya da ay olabilir — bileşen için fark etmez.
 *
 * Yerleşim notu: çubuklar ve etiketler iki ayrı satır. Önceden tek satırdaydı
 * ve sütun kutusu `items-end` yüzünden uzamadığı için yalnız etiket kadar
 * yükseliyordu; çubukların `height: %x` değeri otomatik yükseklikli bir
 * ebeveyne karşı hesaplanınca sıfıra çöküyor ve grafik boş görünüyordu.
 * Çubuk satırının yüksekliği artık kesin (piksel), yüzdeler ona göre çözülüyor.
 */
export function HareketGrafigi({ kovalar }: { kovalar: GrafikKovasi[] }) {
  if (kovalar.every((k) => k.giris === 0 && k.satis === 0)) {
    return <p className="py-6 text-center text-sm text-slate-500">Henüz hareket kaydı yok.</p>;
  }

  const enYuksek = enYuksekDeger(kovalar);
  const enAzGenislik = `${Math.max(520, kovalar.length * 26)}px`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> Giriş
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Satış
        </span>
        <span className="text-slate-400">en yüksek: {enYuksek}</span>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: enAzGenislik }}>
          {/* Çubuklar */}
          <div
            className="flex items-end gap-1.5 border-b border-slate-200 sm:gap-2"
            style={{ height: `${ALAN_YUKSEKLIGI}px` }}
          >
            {kovalar.map((k) => (
              <div
                key={k.anahtar}
                data-test="grafik-kovasi"
                // h-full: ebeveynin yüksekliği kesin olduğu için yüzde çözülüyor.
                className="flex h-full flex-1 items-end justify-center gap-0.5"
              >
                <div
                  data-test="grafik-giris"
                  data-deger={k.giris}
                  className="w-full max-w-[14px] rounded-t bg-blue-500"
                  style={{ height: `${cubukYuzdesi(k.giris, enYuksek)}%` }}
                  title={`${k.etiket}: ${k.giris} giriş`}
                />
                <div
                  data-test="grafik-satis"
                  data-deger={k.satis}
                  className="w-full max-w-[14px] rounded-t bg-emerald-500"
                  style={{ height: `${cubukYuzdesi(k.satis, enYuksek)}%` }}
                  title={`${k.etiket}: ${k.satis} satış · ${kurusuTLYazSembollu(k.ciroKurus)}`}
                />
              </div>
            ))}
          </div>

          {/* Etiketler */}
          <div className="mt-1 flex gap-1.5 sm:gap-2">
            {kovalar.map((k) => (
              <span
                key={k.anahtar}
                className="flex-1 whitespace-nowrap text-center text-[10px] text-slate-500"
              >
                {k.etiket}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
