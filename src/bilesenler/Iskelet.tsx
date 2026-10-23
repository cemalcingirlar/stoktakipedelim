/**
 * Yükleniyor ekranlarının ortak parçaları.
 *
 * Boş ekran yerine sayfanın kabası gösteriliyor: kullanıcı neyin geldiğini
 * görüyor ve ekran "donmuş" hissi vermiyor. Panel tek açılışta yirmiye yakın
 * sorgu çalıştırıyor, en çok bekleten yer orası.
 */
export function IskeletKutu({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-lg bg-slate-200 ${className}`}
    />
  );
}

export function IskeletKart({ satir = 3 }: { satir?: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <IskeletKutu className="h-4 w-32" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: satir }, (_, i) => (
          <IskeletKutu key={i} className="h-3 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Ekran okuyucular için: görsel iskelet onlara bir şey anlatmıyor. */
export function YuklemeDurumu({ metin = "Yükleniyor…" }: { metin?: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="sr-only"
      data-test="yukleniyor"
    >
      {metin}
    </p>
  );
}
