import { Link } from "@/bilesenler/Bag";
import type { SatisDonemi } from "@/lib/satisDonemi";

const DUGME = "rounded-md px-2.5 py-1 text-xs font-medium transition";
const SECILI = "bg-slate-800 text-white";
const BOS = "border border-slate-200 text-slate-600 hover:bg-slate-50";

/**
 * Panel kartlarının dönem düğmeleri ve serbest tarih aralığı formu.
 *
 * İki kart (stoktan çıkanlar, satış dökümü) aynı davranışı istiyor; düğmeler
 * birer bağlantı, aralık ise GET formu. Form JavaScript'siz çalışıyor ve
 * diğer seçimleri gizli alanlarla taşıyor — biri unutulursa o seçim sessizce
 * varsayılana döner.
 */
export function DonemSecici({
  donemler,
  secili,
  adres,
  testAdi,
  aralikFormu,
}: {
  donemler: SatisDonemi[];
  secili: SatisDonemi;
  /** Dönem düğmesinin adresi. */
  adres: (anahtar: string) => string;
  testAdi: string;
  /** Serbest aralık seçiliyken gösterilen form. */
  aralikFormu: {
    /** Formla birlikte taşınacak diğer seçimler. */
    gizli: Record<string, string>;
    basAdi: string;
    bitAdi: string;
    bas: string;
    bit: string;
  };
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" data-test={testAdi}>
      {donemler.map((d) => (
        <Link
          key={d.anahtar}
          href={adres(d.anahtar)}
          data-test={`${testAdi}-${d.anahtar}`}
          aria-current={d.anahtar === secili.anahtar ? "page" : undefined}
          className={`${DUGME} ${d.anahtar === secili.anahtar ? SECILI : BOS}`}
        >
          {d.etiket}
        </Link>
      ))}

      {secili.anahtar === "aralik" ? (
        <form
          method="get"
          action="/panel"
          data-test={`${testAdi}-form`}
          className="flex flex-wrap items-center gap-1"
        >
          {Object.entries(aralikFormu.gizli).map(([ad, deger]) => (
            <input key={ad} type="hidden" name={ad} value={deger} />
          ))}
          <input
            type="date"
            name={aralikFormu.basAdi}
            defaultValue={aralikFormu.bas}
            aria-label="Başlangıç tarihi"
            data-test={`${testAdi}-bas`}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
          />
          <span className="text-xs text-slate-400">–</span>
          <input
            type="date"
            name={aralikFormu.bitAdi}
            defaultValue={aralikFormu.bit}
            aria-label="Bitiş tarihi"
            data-test={`${testAdi}-bit`}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
          />
          <button
            type="submit"
            data-test={`${testAdi}-uygula`}
            className={`${DUGME} bg-slate-800 text-white hover:bg-slate-900`}
          >
            Uygula
          </button>
        </form>
      ) : null}
    </div>
  );
}
