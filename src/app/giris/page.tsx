import { GirisFormu } from "./GirisFormu";

export const metadata = { title: "Giriş — Stok Takip" };

export default async function GirisSayfasi({ searchParams }: PageProps<"/giris">) {
  const { devam } = await searchParams;
  const hedef = typeof devam === "string" ? devam : "";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Stok Takip</h1>
          <p className="mt-1 text-sm text-slate-500">Devam etmek için giriş yapın</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <GirisFormu devam={hedef} />
        </div>
      </div>
    </main>
  );
}
