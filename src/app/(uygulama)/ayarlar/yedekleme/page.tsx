import Link from "next/link";
import { Kart } from "@/bilesenler/Kart";
import { Rozet } from "@/bilesenler/Rozet";
import { prisma } from "@/lib/prisma";
import { tarihSaatYaz } from "@/lib/tarih";
import { adminSayfasi } from "@/lib/yetki";
import { veritabaniYolu, yedekAyariniOku } from "@/lib/yedek";
import { YedekDugmeleri } from "./YedekDugmeleri";

export const metadata = { title: "Yedekleme — Stok Takip" };

/**
 * Son başarılı yedeğin üzerinden kaç saat geçtiğini döner.
 * Render gövdesinde doğrudan Date.now() çağırmamak için ayrı fonksiyonda.
 */
function gecenSaat(tarih: Date | null | undefined): number | null {
  if (!tarih) return null;
  return Math.floor((Date.now() - new Date(tarih).getTime()) / 3_600_000);
}

function boyutYaz(bayt: number): string {
  if (bayt <= 0) return "—";
  if (bayt < 1024) return `${bayt} B`;
  if (bayt < 1024 * 1024) return `${Math.round(bayt / 1024)} KB`;
  return `${(bayt / 1024 / 1024).toFixed(1)} MB`;
}

const YONTEM_ETIKET = {
  OAUTH: "Kendi Google hesabınız (OAuth)",
  SERVIS_HESABI: "Servis hesabı (Ortak Drive gerekir)",
  YOK: "Yapılandırılmadı",
} as const;

export default async function YedeklemeSayfasi() {
  await adminSayfasi();

  const ayar = yedekAyariniOku();
  const yapilandirildi = ayar.yontem !== "YOK";

  const [yedekler, sonBasarili, hataSayisi] = await Promise.all([
    prisma.yedek.findMany({ orderBy: { id: "desc" }, take: 30 }),
    prisma.yedek.findFirst({ where: { durum: "BASARILI" }, orderBy: { id: "desc" } }),
    prisma.yedek.count({ where: { durum: "HATA" } }),
  ]);

  const saklama = Number(process.env.YEDEK_SAKLAMA ?? 14);
  const cronAnahtariVar = Boolean(process.env.YEDEK_ANAHTARI && process.env.YEDEK_ANAHTARI.length >= 16);

  // Son başarılı yedeğin üzerinden 48 saatten fazla geçtiyse uyar.
  const gecikme = gecenSaat(sonBasarili?.tarih);
  const gecikmeUyarisi = gecikme !== null && gecikme > 48;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Google Drive Yedekleme</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Veritabanının tutarlı bir kopyası sıkıştırılıp Drive&apos;a yüklenir.
          </p>
        </div>
        <Link
          href="/ayarlar"
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ← Ayarlar
        </Link>
      </div>

      {!yapilandirildi ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Yedekleme kapalı.</strong> Eksik ortam değişkenleri:{" "}
          <code className="rounded bg-amber-100 px-1">{ayar.eksik.join(", ")}</code>. Kurulum
          adımları aşağıda.
        </div>
      ) : gecikmeUyarisi ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Son başarılı yedeğin üzerinden {gecikme} saat geçti.</strong> Zamanlanmış görevin
          çalıştığını kontrol edin.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Kart baslik="Durum" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Yöntem</dt>
              <dd className="text-right font-medium text-slate-800">
                {YONTEM_ETIKET[ayar.yontem]}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Hedef klasör</dt>
              <dd className="text-right font-mono text-xs text-slate-700">
                {ayar.yontem !== "YOK" && ayar.klasorId ? ayar.klasorId : "Drive kökü"}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Saklanan yedek</dt>
              <dd className="text-right font-medium text-slate-800">son {saklama} dosya</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Cron anahtarı</dt>
              <dd className="text-right">
                <Rozet ton={cronAnahtariVar ? "yesil" : "sari"}>
                  {cronAnahtariVar ? "Tanımlı" : "Tanımsız"}
                </Rozet>
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Son başarılı yedek</dt>
              <dd className="text-right font-medium text-slate-800">
                {sonBasarili ? tarihSaatYaz(sonBasarili.tarih) : "Henüz yok"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Başarısız deneme</dt>
              <dd className="text-right">
                <Rozet ton={hataSayisi > 0 ? "kirmizi" : "nötr"}>{hataSayisi}</Rozet>
              </dd>
            </div>
          </dl>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <YedekDugmeleri yapilandirildi={yapilandirildi} />
          </div>
        </Kart>

        <Kart baslik="Yedek Geçmişi" className="lg:col-span-2">
          {yedekler.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Henüz yedek alınmamış.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-medium">Zaman</th>
                    <th className="py-2 pr-3 font-medium">Dosya</th>
                    <th className="py-2 pr-3 text-right font-medium">Boyut</th>
                    <th className="py-2 font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {yedekler.map((y) => (
                    <tr key={y.id} className={y.durum === "HATA" ? "bg-red-50" : "hover:bg-slate-50"}>
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-500">
                        {tarihSaatYaz(y.tarih)}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-700">{y.dosyaAdi}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-700">
                        {boyutYaz(y.boyutBayt)}
                      </td>
                      <td className="py-2">
                        {y.durum === "BASARILI" ? (
                          <Rozet ton="yesil">Başarılı</Rozet>
                        ) : (
                          <Rozet ton="kirmizi">{y.hata?.slice(0, 80) ?? "Hata"}</Rozet>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Kart>
      </div>

      <Kart baslik="Kurulum">
        <div className="space-y-4 text-sm text-slate-700">
          <div>
            <h3 className="mb-1 font-semibold text-slate-900">1. Google Cloud projesi ve izin</h3>
            <ol className="list-inside list-decimal space-y-1 text-slate-600">
              <li>
                <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  console.cloud.google.com
                </a>{" "}
                adresinde bir proje oluşturun.
              </li>
              <li>&quot;APIs &amp; Services → Library&quot; bölümünden <strong>Google Drive API</strong>&apos;yi etkinleştirin.</li>
              <li>&quot;OAuth consent screen&quot; ekranını doldurun, kendi Google hesabınızı test kullanıcısı olarak ekleyin.</li>
              <li>&quot;Credentials → Create credentials → OAuth client ID → Desktop app&quot; ile istemci oluşturun; Client ID ve Client Secret&apos;ı not alın.</li>
            </ol>
          </div>

          <div>
            <h3 className="mb-1 font-semibold text-slate-900">2. Yenileme jetonu alın</h3>
            <p className="text-slate-600">Sunucuda bir kez çalıştırın; tarayıcıda izin verdikten sonra jetonu ekrana yazar:</p>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
{`GOOGLE_ISTEMCI_ID=... GOOGLE_ISTEMCI_SIRRI=... \\
  node betikler/drive-jeton-al.mjs`}
            </pre>
          </div>

          <div>
            <h3 className="mb-1 font-semibold text-slate-900">3. .env dosyasına ekleyin</h3>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
{`GOOGLE_ISTEMCI_ID="..."
GOOGLE_ISTEMCI_SIRRI="..."
GOOGLE_YENILEME_JETONU="..."
GOOGLE_DRIVE_KLASOR_ID="..."   # Drive'da klasör açıp URL'deki kimliği yazın
YEDEK_SAKLAMA="14"
YEDEK_ANAHTARI="openssl rand -hex 24 çıktısı"`}
            </pre>
          </div>

          <div>
            <h3 className="mb-1 font-semibold text-slate-900">4. Günlük otomatik yedek</h3>
            <p className="text-slate-600">Sunucuda <code className="rounded bg-slate-100 px-1">crontab -e</code> ile her gece 03:00&apos;te çalışacak satırı ekleyin:</p>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
{`0 3 * * * curl -fsS -X POST -H "X-Yedek-Anahtari: ANAHTARINIZ" \\
  http://127.0.0.1:3000/api/yedek >> /var/log/stok-yedek.log 2>&1`}
            </pre>
          </div>

          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <strong>Not:</strong> Servis hesabı yöntemi de destekleniyor
            (<code>GOOGLE_SERVIS_HESABI_JSON</code>) ama servis hesaplarının kendi depolama kotası
            olmadığı için yalnız <strong>Ortak Drive</strong> klasörlerine yükleyebilir; bu da Google
            Workspace hesabı gerektirir. Kişisel Gmail kullanıyorsanız yukarıdaki OAuth yöntemini
            kullanın.
          </p>

          <p className="text-xs text-slate-500">
            Yedeklenen veritabanı dosyası: <code className="rounded bg-slate-100 px-1">{veritabaniYolu()}</code>
          </p>
        </div>
      </Kart>
    </div>
  );
}
