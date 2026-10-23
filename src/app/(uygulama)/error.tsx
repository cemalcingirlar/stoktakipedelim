"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Uygulama içindeki beklenmedik hataların ekranı.
 *
 * Önceden hiç yoktu: bir sorguda hata çıktığında personel Next.js'in ham
 * İngilizce hata sayfasını görüyor, geri dönüş yolu bulamıyordu. Burada ne
 * olduğu Türkçe yazılıyor ve iki çıkış kapısı veriliyor: tekrar dene, panele
 * dön.
 *
 * Hata metninin kendisi gösterilmiyor; içinde sorgu parçası ya da dosya yolu
 * geçebilir. Yerine `digest` veriliyor: sunucu günlüğünde aynı kodla aranıp
 * bulunabilen, kendisi bilgi sızdırmayan bir kimlik.
 */
export default function Hata({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Uygulama hatası:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <section
        data-test="hata-ekrani"
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold text-slate-900">
          Bir şeyler ters gitti
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          İşlem tamamlanamadı. Kaydettiğiniz veriler etkilenmedi. Tekrar
          deneyebilir ya da panele dönebilirsiniz.
        </p>

        {error.digest ? (
          <p className="mt-3 text-xs text-slate-400">
            Hata kodu:{" "}
            <code className="rounded bg-slate-100 px-1">{error.digest}</code> —
            sorun sürerse bu kodu iletin.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => retry()}
            data-test="hata-tekrar"
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Tekrar Dene
          </button>
          <Link
            href="/panel"
            data-test="hata-panele-don"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Panele Dön
          </Link>
        </div>
      </section>
    </div>
  );
}
