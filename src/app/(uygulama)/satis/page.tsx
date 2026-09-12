import { SatisFormu } from "./SatisFormu";
import { oturumGerekli } from "@/lib/yetki";

export const metadata = { title: "Satış — Stok Takip" };

export default async function SatisSayfasi() {
  const oturum = await oturumGerekli();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Satış</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {oturum.magazaAdi
            ? `${oturum.magazaAdi} deposundaki cihazları satabilirsiniz.`
            : "Tüm mağazalardaki cihazları satabilirsiniz."}
        </p>
      </div>
      <SatisFormu />
    </div>
  );
}
