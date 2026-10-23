import {
  cubukYuzdesi,
  enYuksekDeger,
  kovaDegerleri,
  olcuEtiketleri,
  veriVarMi,
  type GrafikKovasi,
  type GrafikOlcusu,
} from "@/lib/grafikDonem";
import { kurusuTLYazSembollu } from "@/lib/para";

/** Çubuk alanının yüksekliği; etiket satırı bunun dışında. */
const ALAN_YUKSEKLIGI = 160;

/**
 * Seçilen dönemdeki giriş ve satışları gösteren basit çubuk grafik.
 * Harici grafik kütüphanesi kullanılmaz; ölçekleme en yüksek değere göre yapılır.
 * Sütunlar gün, hafta ya da ay olabilir — bileşen için fark etmez.
 *
 * Ölçü adet ya da ciro olabiliyor. Tek eksende iki birim gösterilemediği için
 * ciroya geçildiğinde iki çubuk birden paraya dönüyor: giriş alış tutarını,
 * satış ciroyu gösteriyor. İpucu metni her iki ölçüde de adet ile tutarı
 * birlikte veriyor — biri seçiliyken diğerini görmek için ölçü değiştirmek
 * gerekmesin.
 *
 * Yerleşim notu: çubuklar ve etiketler iki ayrı satır. Önceden tek satırdaydı
 * ve sütun kutusu `items-end` yüzünden uzamadığı için yalnız etiket kadar
 * yükseliyordu; çubukların `height: %x` değeri otomatik yükseklikli bir
 * ebeveyne karşı hesaplanınca sıfıra çöküyor ve grafik boş görünüyordu.
 * Çubuk satırının yüksekliği artık kesin (piksel), yüzdeler ona göre çözülüyor.
 */
export function HareketGrafigi({
  kovalar,
  olcu = "adet",
}: {
  kovalar: GrafikKovasi[];
  olcu?: GrafikOlcusu;
}) {
  if (!veriVarMi(kovalar, olcu)) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        {olcu === "ciro"
          ? "Bu dönemde tutar kaydı yok."
          : "Henüz hareket kaydı yok."}
      </p>
    );
  }

  const enYuksek = enYuksekDeger(kovalar, olcu);
  const enAzGenislik = `${Math.max(520, kovalar.length * 26)}px`;
  const adlar = olcuEtiketleri(olcu);
  const yaz = (kurus: number) => kurusuTLYazSembollu(kurus);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-blue-500" />{" "}
          {adlar.giris}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />{" "}
          {adlar.satis}
        </span>
        <span data-test="grafik-en-yuksek" className="text-slate-400">
          en yüksek: {olcu === "ciro" ? yaz(enYuksek) : enYuksek}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: enAzGenislik }}>
          {/* Çubuklar */}
          <div
            className="flex items-end gap-1.5 border-b border-slate-200 sm:gap-2"
            style={{ height: `${ALAN_YUKSEKLIGI}px` }}
          >
            {kovalar.map((k) => {
              const { giris, satis } = kovaDegerleri(k, olcu);
              return (
                <div
                  key={k.anahtar}
                  data-test="grafik-kovasi"
                  // h-full: ebeveynin yüksekliği kesin olduğu için yüzde çözülüyor.
                  className="flex h-full flex-1 items-end justify-center gap-0.5"
                >
                  <div
                    data-test="grafik-giris"
                    data-deger={giris}
                    className="w-full max-w-[14px] rounded-t bg-blue-500"
                    style={{ height: `${cubukYuzdesi(giris, enYuksek)}%` }}
                    title={`${k.etiket}: ${k.giris} giriş · ${yaz(k.girisKurus)}`}
                  />
                  <div
                    data-test="grafik-satis"
                    data-deger={satis}
                    className="w-full max-w-[14px] rounded-t bg-emerald-500"
                    style={{ height: `${cubukYuzdesi(satis, enYuksek)}%` }}
                    title={`${k.etiket}: ${k.satis} satış · ${yaz(k.ciroKurus)}`}
                  />
                </div>
              );
            })}
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
