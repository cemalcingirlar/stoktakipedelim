import { IskeletKart, IskeletKutu, YuklemeDurumu } from "@/bilesenler/Iskelet";

/** Panel tek açılışta yirmiye yakın sorgu çalıştırıyor; boş ekran göstermiyoruz. */
export default function PanelYukleniyor() {
  return (
    <div className="space-y-5">
      <YuklemeDurumu metin="Panel yükleniyor…" />
      <IskeletKutu className="h-7 w-40" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <IskeletKart key={i} satir={2} />
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <IskeletKutu className="h-4 w-48" />
        <IskeletKutu className="mt-4 h-40 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IskeletKart satir={5} />
        <IskeletKart satir={5} />
      </div>
    </div>
  );
}
