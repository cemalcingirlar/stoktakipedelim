import { Link } from "@/bilesenler/Bag";

/**
 * Hiçbir adrese uymayan istekler.
 *
 * Kök düzenin içinde render ediliyor, yani uygulama menüsü yok — zaten
 * kullanıcı oturum açmamış da olabilir. Bu yüzden tek çıkış kapısı panele
 * gitmek; oturum yoksa giriş ekranı devralır.
 */
export const metadata = { title: "Sayfa bulunamadı — Stok Takip" };

export default function Bulunamadi() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <section
        data-test="adres-bulunamadi"
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm"
      >
        <p className="text-3xl font-semibold text-slate-300">404</p>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">
          Sayfa bulunamadı
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Böyle bir adres yok. Bağlantı yanlış yazılmış ya da sayfa kaldırılmış
          olabilir.
        </p>
        <Link
          href="/panel"
          className="mt-5 inline-block rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Panele Dön
        </Link>
      </section>
    </main>
  );
}
