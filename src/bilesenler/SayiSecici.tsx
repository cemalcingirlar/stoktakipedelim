import { Link } from "@/bilesenler/Bag";

/**
 * "Kaç satır gösterilsin" düğmeleri (5 / 10).
 *
 * Dönem seçicinin kardeşi; iki kartta birden kullanılıyor ve seçimi adreste
 * taşıyor, böylece bağlantı paylaşıldığında aynı görünüm açılıyor.
 */
export function SayiSecici({
  sayilar,
  secili,
  adres,
  testAdi,
}: {
  sayilar: readonly number[];
  secili: number;
  adres: (sayi: number) => string;
  testAdi: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" data-test={testAdi}>
      {sayilar.map((sayi) => (
        <Link
          key={sayi}
          href={adres(sayi)}
          data-test={`${testAdi}-${sayi}`}
          aria-current={sayi === secili ? "page" : undefined}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            sayi === secili
              ? "bg-slate-800 text-white"
              : "border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {sayi}
        </Link>
      ))}
    </div>
  );
}
