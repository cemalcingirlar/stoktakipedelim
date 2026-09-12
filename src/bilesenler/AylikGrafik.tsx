import { kurusuTLYazSembollu } from "@/lib/para";

export type AyVerisi = {
  anahtar: string;
  etiket: string;
  giris: number;
  satis: number;
  ciroKurus: number;
};

/**
 * Son aylardaki giriş ve satış adetlerini gösteren basit çubuk grafik.
 * Harici grafik kütüphanesi kullanılmaz; ölçekleme en yüksek değere göre yapılır.
 */
export function AylikGrafik({ aylar }: { aylar: AyVerisi[] }) {
  const enYuksek = Math.max(1, ...aylar.map((a) => Math.max(a.giris, a.satis)));

  if (aylar.every((a) => a.giris === 0 && a.satis === 0)) {
    return <p className="py-6 text-center text-sm text-slate-500">Henüz hareket kaydı yok.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> Giriş
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Satış
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[520px] items-end gap-2" style={{ height: "160px" }}>
          {aylar.map((ay) => (
            <div key={ay.anahtar} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-full w-full items-end justify-center gap-0.5">
                <div
                  className="w-full max-w-[14px] rounded-t bg-blue-500"
                  style={{ height: `${(ay.giris / enYuksek) * 100}%` }}
                  title={`${ay.etiket}: ${ay.giris} giriş`}
                />
                <div
                  className="w-full max-w-[14px] rounded-t bg-emerald-500"
                  style={{ height: `${(ay.satis / enYuksek) * 100}%` }}
                  title={`${ay.etiket}: ${ay.satis} satış · ${kurusuTLYazSembollu(ay.ciroKurus)}`}
                />
              </div>
              <span className="whitespace-nowrap text-[10px] text-slate-500">{ay.etiket}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
