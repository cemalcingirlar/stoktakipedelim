import Link from "next/link";

/**
 * Aranan kaydın bulunamadığı durum.
 *
 * `notFound()` yalnız kayıt yokken değil, kullanıcının göremeyeceği bir
 * mağazanın kaydına eriştiğinde de çağrılıyor. Bu yüzden metin "silinmiş
 * olabilir" demiyor, iki ihtimali birden anlatıyor — yetki sınırını
 * "bu kayıt var ama senin değil" diye sızdırmadan.
 */
export default function Bulunamadi() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <section
        data-test="bulunamadi-ekrani"
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm"
      >
        <p className="text-3xl font-semibold text-slate-300">404</p>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">
          Kayıt bulunamadı
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Aradığınız kayıt silinmiş olabilir ya da erişim yetkiniz bulunmuyor.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            href="/cihazlar"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cihazlar
          </Link>
          <Link
            href="/panel"
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Panele Dön
          </Link>
        </div>
      </section>
    </div>
  );
}
