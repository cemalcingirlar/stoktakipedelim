import { IskeletKutu, YuklemeDurumu } from "@/bilesenler/Iskelet";

/** Cihaz listesi binlerce kayıt arasından süzüyor; tablonun kabası gösteriliyor. */
export default function CihazlarYukleniyor() {
  return (
    <div className="space-y-4">
      <YuklemeDurumu metin="Cihazlar yükleniyor…" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <IskeletKutu className="h-7 w-32" />
        <IskeletKutu className="h-9 w-48" />
      </div>
      <IskeletKutu className="h-20 w-full" />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <IskeletKutu className="h-10 w-full rounded-none" />
        <div className="space-y-px p-px">
          {Array.from({ length: 10 }, (_, i) => (
            <IskeletKutu key={i} className="h-11 w-full rounded-none" />
          ))}
        </div>
      </div>
    </div>
  );
}
