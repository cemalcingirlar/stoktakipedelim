import { IskeletKart, IskeletKutu, YuklemeDurumu } from "@/bilesenler/Iskelet";

/** Rapor ekranı toplamları tüm stok üzerinden hesaplıyor. */
export default function RaporYukleniyor() {
  return (
    <div className="space-y-5">
      <YuklemeDurumu metin="Rapor hazırlanıyor…" />
      <IskeletKutu className="h-7 w-36" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <IskeletKart key={i} satir={2} />
        ))}
      </div>
      <IskeletKart satir={8} />
    </div>
  );
}
