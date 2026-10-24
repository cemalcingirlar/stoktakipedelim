import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Kart } from "@/bilesenler/Kart";
import { tarihSaatYaz } from "@/lib/tarih";
import { PartiGeriAlma } from "./PartiGeriAlma";
import { ENVANTER_BEKLENEN_SUTUNLAR } from "@/lib/envanterDosyasi";
import { adminSayfasi } from "@/lib/yetki";
import { EnvanterFormu } from "./EnvanterFormu";

export const metadata = {
  title: "Envanter Dökümü ile Stok Yükleme — Stok Takip",
};

export default async function EnvanterSayfasi() {
  await adminSayfasi();

  const [kategoriler, magazalar, partiler] = await Promise.all([
    prisma.kategori.findMany({
      where: { aktif: true },
      orderBy: { sira: "asc" },
      select: {
        id: true,
        ad: true,
        seriNoZorunlu: true,
        altKategoriler: {
          where: { aktif: true },
          orderBy: { sira: "asc" },
          select: { id: true, ad: true },
        },
      },
    }),
    prisma.magaza.findMany({
      where: { aktif: true },
      orderBy: { kod: "asc" },
      select: { id: true, ad: true, kod: true },
    }),
    prisma.iceAktarim.findMany({
      orderBy: { tarih: "desc" },
      take: 10,
      include: { kullanici: { select: { adSoyad: true } } },
    }),
  ]);

  // Telefon gibi seri no zorunlu bir kategori varsayılan olsun: döküm
  // çoğunlukla seri/lot takipli cihazları taşıyor.
  const varsayilan =
    kategoriler.find((k) => k.seriNoZorunlu) ?? kategoriler[0] ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Envanter Dökümü ile Stok Yükleme
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Muhasebe programından aldığınız “Seri/Lot Envanter Raporu” dosyasını
            olduğu gibi yükleyin. Mağaza her satırdaki ambar bilgisinden
            bulunur.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/cihazlar/ice-aktar"
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Şablonla yükleme
          </Link>
          <Link
            href="/cihazlar"
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            ← Cihazlar
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-800">Nasıl çalışır</h2>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-600">
          <li>
            <span className="font-medium text-slate-700">
              Dosyayı değiştirmenize gerek yok.
            </span>{" "}
            Başlık satırı nerede olursa olsun bulunur. Okunan sütunlar:{" "}
            {ENVANTER_BEKLENEN_SUTUNLAR.join(" · ")}
          </li>
          <li>
            <span className="font-medium text-slate-700">
              Mağaza dosyadan gelir.
            </span>{" "}
            Ambar Maliyet Grubu veya Ambar No. alanı mağaza adı/kodu ile
            eşleştirilir; eşleşmeyen satırlar listelenir ve atlanır.
          </li>
          <li>
            <span className="font-medium text-slate-700">
              Marka ve model tahmin edilir.
            </span>{" "}
            Malzeme açıklamasının ilk kelimesi marka, kalanı model sayılır.
            Önizlemede ikisini de görürsünüz.
          </li>
          <li>
            <span className="font-medium text-slate-700">
              Önizlemeyi kontrol edin.
            </span>{" "}
            Bu adımda hiçbir kayıt oluşmaz; hatalı satırları görüp dosyayı
            düzeltebilirsiniz.
          </li>
        </ol>
      </div>

      {kategoriler.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            Önce en az bir kategori ekleyin —{" "}
            <Link href="/ayarlar/kategoriler" className="font-medium underline">
              Ayarlar → Kategoriler
            </Link>
          </p>
        </div>
      ) : magazalar.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            Önce mağazalarınızı tanımlayın —{" "}
            <Link href="/ayarlar/magazalar" className="font-medium underline">
              Ayarlar → Mağazalar
            </Link>
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">
              Dökümdeki ambar adı şu mağazalarla eşleşir
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {magazalar.map((m) => (
                <span
                  key={m.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm text-slate-700"
                >
                  {m.ad} <span className="text-slate-400">({m.kod})</span>
                </span>
              ))}
            </div>
          </div>

          <EnvanterFormu
            kategoriler={kategoriler}
            varsayilanKategoriId={varsayilan?.id ?? null}
          />

          {/* Geçmiş yüklemeler. Yanlış bir döküm yüklendiğinde tek çare eski
              yedeği geri yüklemekti; o da aradaki bütün işi siler. */}
          {partiler.length > 0 ? (
            <Kart baslik="Son Yüklemeler">
              <ul
                data-test="parti-listesi"
                className="divide-y divide-slate-100"
              >
                {partiler.map((p) => (
                  <li
                    key={p.id}
                    data-test="parti-satiri"
                    className="flex flex-wrap items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        {p.adet} cihaz
                        {p.geriAlindi ? (
                          <span
                            data-test="parti-geri-alinmis"
                            className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                          >
                            Geri Alındı
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {tarihSaatYaz(p.tarih)} · {p.kullanici.adSoyad} ·{" "}
                        {p.aciklama}
                        {p.geriAlindi && p.geriAlmaGerekce
                          ? ` · geri alma gerekçesi: ${p.geriAlmaGerekce}`
                          : ""}
                      </p>
                    </div>
                    {p.geriAlindi ? null : (
                      <PartiGeriAlma partiId={p.id} adet={p.adet} />
                    )}
                  </li>
                ))}
              </ul>
            </Kart>
          ) : null}
        </>
      )}
    </div>
  );
}
