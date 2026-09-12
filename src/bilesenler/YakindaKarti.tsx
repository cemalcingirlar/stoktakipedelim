import { Kart } from "./Kart";

/** Henüz yazılmamış modüller için yer tutucu. Yol haritasındaki fazı gösterir. */
export function YakindaKarti({
  baslik,
  faz,
  maddeler,
}: {
  baslik: string;
  faz: string;
  maddeler: string[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{baslik}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{faz} kapsamında geliştiriliyor.</p>
      </div>
      <Kart baslik="Bu ekranda neler olacak?">
        <ul className="space-y-2">
          {maddeler.map((madde) => (
            <li key={madde} className="flex gap-2 text-sm text-slate-700">
              <span aria-hidden className="mt-0.5 text-slate-400">
                •
              </span>
              <span>{madde}</span>
            </li>
          ))}
        </ul>
      </Kart>
    </div>
  );
}
