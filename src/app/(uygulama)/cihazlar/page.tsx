import Link from "next/link";
import { redirect } from "next/navigation";
import { CihazTablosu } from "@/bilesenler/CihazTablosu";
import { FiltreCubugu } from "@/bilesenler/FiltreCubugu";
import { Sayfalama } from "@/bilesenler/Sayfalama";
import { SutunSecici } from "@/bilesenler/SutunSecici";
import {
  CIHAZ_ICERIK,
  SAYFA_BOYUTU,
  SUTUN_FILTRE_PARAMETRELERI,
  etkinSutunFiltresiSayisi,
  filtredenWhere,
  filtreyiCoz,
  filtreyiSorguyaCevir,
} from "@/lib/cihazFiltre";
import { siralamaOrderBy } from "@/lib/cihazSiralama";
import { gorunurMagazaIdleri, magazaKosulu } from "@/lib/gorunurluk";
import { kodNormalize } from "@/lib/metin";
import { kurusuTLYazSembollu } from "@/lib/para";
import { prisma } from "@/lib/prisma";
import { sutunlariSirala, sutunTercihiniCoz } from "@/lib/sutunlar";
import { oturumGerekli, stokEkleyebilirMi } from "@/lib/yetki";

export const metadata = { title: "Cihazlar — Stok Takip" };

export default async function CihazlarSayfasi({
  searchParams,
}: PageProps<"/cihazlar">) {
  const oturum = await oturumGerekli();
  const params = await searchParams;
  const filtre = filtreyiCoz(params);
  const bugun = new Date();
  // Kullanıcı yalnız yetkili olduğu mağazaların cihazlarını görür; yönetici
  // için kısıt yok. Bu sayfadaki her sorgu aynı kısıttan geçmek zorunda —
  // listeyi kısıtlayıp özetleri kısıtlamamak, görünmeyen stoku toplamda
  // sızdırırdı.
  const gorunur = gorunurMagazaIdleri(oturum);

  // Arama kutusuna tam bir seri no / barkod girildiyse doğrudan cihaz detayına
  // git — ama YALNIZ tek cihaza denk geliyorsa.
  //
  // Kısayol seri numarası için yazılmıştı: bir kod bir cihaz demek. Aynı
  // barkodu paylaşan onlarca aksesuarda ise rastgele birine atlıyor ve
  // kullanıcı aradığı listeyi hiç göremiyordu. Birden çok eşleşmede liste
  // gösteriliyor; arama metni barkodu taşıdığı için hepsi listeleniyor.
  if (filtre.ara) {
    const kod = kodNormalize(filtre.ara);
    if (kod.length >= 6) {
      const eslesmeler = await prisma.stokKalemi.findMany({
        // Görünmeyen mağazadaki cihaza atlamak, detay sayfası onu 404'leyecek
        // olsa bile "bu kod sistemde var" bilgisini sızdırırdı.
        where: {
          OR: [{ seriNo: kod }, { barkod: kod }],
          ...magazaKosulu(gorunur),
        },
        select: { id: true },
        // İkiden fazlasını saymaya gerek yok: karar "tek mi, değil mi".
        take: 2,
      });
      if (eslesmeler.length === 1) redirect(`/cihazlar/${eslesmeler[0].id}`);
    }
  }

  const where = filtredenWhere(filtre, gorunur, bugun);

  const [
    kategoriler,
    magazalar,
    altKategoriler,
    ozet,
    toplam,
    satirlar,
    kullanici,
    markaSatirlari,
    tedarikciler,
    saticilar,
  ] = await Promise.all([
    prisma.kategori.findMany({
      where: { aktif: true },
      orderBy: { sira: "asc" },
    }),
    prisma.magaza.findMany({
      where: {
        aktif: true,
        // Filtre çubuğundaki mağaza seçenekleri de kısıtlı: seçilemeyen bir
        // mağazayı listelemenin anlamı yok.
        ...(gorunur === null ? {} : { id: { in: gorunur } }),
      },
      orderBy: { kod: "asc" },
    }),
    // Filtre çubuğu seçili kategorinin altlarını gösteriyor ama künye
    // düzeltmede her kategorinin altları gerekiyor; hepsi çekilip ekranda
    // ayrıştırılıyor.
    prisma.altKategori.findMany({
      where: { aktif: true },
      orderBy: [{ kategoriId: "asc" }, { sira: "asc" }],
    }),
    prisma.stokKalemi.aggregate({ where, _sum: { alisFiyatiKurus: true } }),
    prisma.stokKalemi.count({ where }),
    prisma.stokKalemi.findMany({
      where,
      include: CIHAZ_ICERIK,
      orderBy: siralamaOrderBy(filtre.siralama),
      skip: (filtre.sayfa - 1) * SAYFA_BOYUTU,
      take: SAYFA_BOYUTU,
    }),
    prisma.kullanici.findUnique({
      where: { id: oturum.kullaniciId },
      select: { sutunTercihi: true },
    }),
    // Marka listesi filtre açılırından geliyor; stokta hangi markalar varsa
    // yalnız onlar gösteriliyor, boş seçenek bırakmanın anlamı yok.
    prisma.stokKalemi.findMany({
      where: magazaKosulu(gorunur),
      distinct: ["marka"],
      select: { marka: true },
      orderBy: { marka: "asc" },
    }),
    prisma.tedarikci.findMany({
      where: { aktif: true },
      select: { id: true, ad: true },
      orderBy: { ad: "asc" },
    }),
    prisma.kullanici.findMany({
      where: { aktif: true },
      select: { id: true, adSoyad: true },
      orderBy: { adSoyad: "asc" },
    }),
  ]);

  // Künye düzeltmede "bu barkodtaki hepsine uygulansın mı" diye sorabilmek
  // için sayfadaki her barkodun kaç cihaz taşıdığı gerekiyor. Yalnız görünen
  // barkodlar sorgulanıyor; tüm tabloyu saymanın anlamı yok.
  const sayfaBarkodlari = [
    ...new Set(satirlar.map((s) => s.barkod).filter(Boolean)),
  ] as string[];
  const barkodGruplari = sayfaBarkodlari.length
    ? await prisma.stokKalemi.groupBy({
        by: ["barkod"],
        where: { barkod: { in: sayfaBarkodlari }, ...magazaKosulu(gorunur) },
        _count: { _all: true },
      })
    : [];
  const barkodAdetleri = Object.fromEntries(
    barkodGruplari.map((g) => [g.barkod ?? "", g._count._all]),
  );

  const sutunlar = sutunlariSirala(sutunTercihiniCoz(kullanici?.sutunTercihi));
  const toplamSayfa = Math.max(1, Math.ceil(toplam / SAYFA_BOYUTU));

  // Filtre kutularının değerleri URL'den okunuyor; sunucuda çözülen filtre
  // nesnesi değil ham metin lazım, kullanıcı ne yazdıysa onu görmeli.
  const tekDeger = (ad: string) => {
    const v = params[ad];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const filtreDegerleri = Object.fromEntries(
    SUTUN_FILTRE_PARAMETRELERI.map((ad) => [ad, tekDeger(ad)]),
  );
  const etkinFiltre = etkinSutunFiltresiSayisi(filtre);
  const filtreSecenekleri = {
    markalar: markaSatirlari.map((m) => m.marka).filter(Boolean),
    tedarikciler,
    saticilar,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Cihazlar</h1>
        <div className="flex flex-wrap items-center gap-2">
          <SutunSecici secili={sutunlar} />
          {/* Dışa aktarma o anki filtreyi ve seçili sütunları aynen kullanır. */}
          <a
            href={`/cihazlar/excel${filtreyiSorguyaCevir(params, { sayfa: null })}`}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
          >
            Excel&apos;e Aktar
          </a>
          {stokEkleyebilirMi(oturum) ? (
            <>
              <Link
                href="/cihazlar/tedarikci-faturasi"
                className="rounded-lg border border-blue-300 bg-blue-50 px-3.5 py-2 text-sm font-medium text-blue-800 transition hover:bg-blue-100"
              >
                Tedarikçi Faturası Yükle
              </Link>
              <Link
                href="/cihazlar/envanter"
                className="rounded-lg border border-blue-300 bg-blue-50 px-3.5 py-2 text-sm font-medium text-blue-800 transition hover:bg-blue-100"
              >
                Envanter Dökümü Yükle
              </Link>
              <Link
                href="/cihazlar/ice-aktar"
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Kendi Şablonumla Yükle
              </Link>
              <Link
                href="/faturalar/yeni"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                + Yeni Alış Faturası
              </Link>
            </>
          ) : (
            <span className="text-xs text-slate-500">
              Stok girişi yalnızca yöneticide.
            </span>
          )}
        </div>
      </div>

      <FiltreCubugu
        filtre={filtre}
        params={params}
        kategoriler={kategoriler}
        // Filtre çubuğu yalnız seçili kategorinin altlarını göstermeli.
        altKategoriler={altKategoriler.filter(
          (a) => !filtre.kategoriId || a.kategoriId === filtre.kategoriId,
        )}
        magazalar={magazalar}
      />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-sm">
          <span className="font-medium text-slate-700">
            {toplam} cihaz
            {etkinFiltre > 0 ? (
              <>
                {" "}
                <Link
                  href={`/cihazlar${filtreyiSorguyaCevir(
                    params,
                    Object.fromEntries([
                      ...SUTUN_FILTRE_PARAMETRELERI.map((ad) => [ad, null]),
                      ["sayfa", null],
                    ]),
                  )}`}
                  data-test="sutun-filtrelerini-temizle"
                  className="ml-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-normal text-slate-600 hover:bg-slate-50"
                >
                  {etkinFiltre} sütun filtresi · temizle
                </Link>
              </>
            ) : null}
          </span>
          <span className="text-slate-500">
            Toplam alış değeri:{" "}
            <span className="font-medium text-slate-800">
              {kurusuTLYazSembollu(ozet._sum.alisFiyatiKurus ?? 0)}
            </span>
          </span>
        </div>

        <CihazTablosu
          satirlar={satirlar}
          sutunlar={sutunlar}
          bugun={bugun}
          siralama={filtre.siralama}
          sorguUret={(degisiklikler) =>
            `/cihazlar${filtreyiSorguyaCevir(params, degisiklikler)}`
          }
          filtreDegerleri={filtreDegerleri}
          filtreSecenekleri={filtreSecenekleri}
          kunyeDuzenlenebilir={stokEkleyebilirMi(oturum)}
          kategoriler={kategoriler.map((k) => ({
            id: k.id,
            ad: k.ad,
            altKategoriler: altKategoriler
              .filter((a) => a.kategoriId === k.id)
              .map((a) => ({ id: a.id, ad: a.ad })),
          }))}
          barkodAdetleri={barkodAdetleri}
        />
        <Sayfalama
          sayfa={filtre.sayfa}
          toplamSayfa={toplamSayfa}
          params={params}
        />
      </div>
    </div>
  );
}
