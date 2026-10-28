import { Link } from "@/bilesenler/Bag";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { Kart } from "@/bilesenler/Kart";
import { Sayfalama } from "@/bilesenler/Sayfalama";
import { gorunurMagazaIdleri, magazaKosulu } from "@/lib/gorunurluk";
import {
  SAYFA_BOYUTU,
  atlanacak,
  gecerliSayfa,
  listeFiltresiniCoz,
  toplamSayfa,
} from "@/lib/listeFiltre";
import { kurusuTLYazSembollu } from "@/lib/para";
import { prisma } from "@/lib/prisma";
import { aramaNormalize } from "@/lib/metin";
import { STOK_DURUM } from "@/lib/sabitler";
import { tarihYaz } from "@/lib/tarih";
import { adminMi, oturumGerekli } from "@/lib/yetki";
import { MusteriDuzenleme } from "./MusteriDuzenleme";

export const metadata = { title: "Müşteriler — Stok Takip" };

export default async function MusterilerSayfasi({
  searchParams,
}: PageProps<"/musteriler">) {
  const oturum = await oturumGerekli();
  // Müşteri kaydının kendisi mağazalar arasında ortak — aynı telefon tek kayda
  // bağlanıyor ve her mağaza yeni satışta onu bulmalı. Kısıtlanan, müşterinin
  // satın aldıkları: başka mağazanın hangi cihazı kaça sattığı o mağazanın
  // satış dökümüdür, burada görünmemeli.
  const gorunur = gorunurMagazaIdleri(oturum);
  const params = await searchParams;
  const ham = typeof params.ara === "string" ? params.ara.trim() : "";
  const rakamlar = ham.replace(/\D/g, "");

  const silebilir = adminMi(oturum);

  // Liste eskiden en yeni 200 müşteriyi tek seferde çekiyordu. İki sorunu
  // vardı. Birincisi görünürlük: 200'den eski müşteri ekrandan erişilemiyor,
  // ancak arayarak bulunabiliyordu. İkincisi hız — ölçüldü: 400 müşterilik
  // veriyle sayfa her açılışta ağdan 105 KB (açılmış 312 KB) indiriyordu,
  // uygulamanın en ağır sayfası. Faturalar ve sevkiyat listelerindeki
  // sayfalamanın aynısı uygulanıyor.
  const where = ham
    ? {
        OR: [
          { adSoyad: { contains: ham } },
          { adSoyad: { contains: aramaNormalize(ham) } },
          ...(rakamlar.length >= 3
            ? [{ telefon: { contains: rakamlar } }]
            : []),
          ...(rakamlar.length >= 3
            ? [{ tcknVkn: { contains: rakamlar } }]
            : []),
        ],
      }
    : {};

  const toplam = await prisma.musteri.count({ where });
  const sayfa = gecerliSayfa(listeFiltresiniCoz(params).sayfa, toplam);

  const musteriler = await prisma.musteri.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: atlanacak(sayfa),
    take: SAYFA_BOYUTU,
    include: {
      _count: { select: { satinAlinanlar: true, aktarimSatislari: true } },
      satinAlinanlar: {
        where: { durum: STOK_DURUM.SATILDI, ...magazaKosulu(gorunur) },
        orderBy: { satisTarihi: "desc" },
        select: {
          id: true,
          marka: true,
          model: true,
          seriNo: true,
          satisTarihi: true,
          satisFiyatiKurus: true,
        },
      },
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Müşteriler</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Müşteri kayıtları satış ekranından oluşur. Aynı telefon numarası tek
            kayda bağlanır.
          </p>
        </div>
        {/* Birden çok cihazlı satıştan sonra bu sayfaya düşülüyor. */}
        <Link
          href="/satis"
          data-test="yeni-satis"
          className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          + Yeni Satış
        </Link>
      </div>

      <form method="get" action="/musteriler" className="flex flex-wrap gap-2">
        <input
          name="ara"
          type="search"
          defaultValue={ham}
          placeholder="Ad, telefon veya TCKN ile ara"
          className={`min-w-0 flex-1 sm:max-w-md ${GIRDI_SINIFI}`}
        />
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900"
        >
          Ara
        </button>
        {ham ? (
          <Link
            href="/musteriler"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Temizle
          </Link>
        ) : null}
      </form>

      <Kart baslik={`${toplam.toLocaleString("tr-TR")} müşteri`}>
        {musteriler.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {ham
              ? "Aramanıza uyan müşteri bulunamadı."
              : "Henüz müşteri kaydı yok."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {musteriler.map((m) => {
              const toplam = m.satinAlinanlar.reduce(
                (t, c) => t + (c.satisFiyatiKurus ?? 0),
                0,
              );
              return (
                <li key={m.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="font-medium text-slate-900">
                        {m.adSoyad}
                      </span>
                      {m.telefon ? (
                        <span className="ml-2 text-sm text-slate-600">
                          {m.telefon}
                        </span>
                      ) : null}
                      {m.tcknVkn ? (
                        <span className="ml-2 text-xs text-slate-400">
                          {m.tcknVkn}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm text-slate-600">
                      {m.satinAlinanlar.length} cihaz ·{" "}
                      <span className="font-medium text-slate-800">
                        {kurusuTLYazSembollu(toplam)}
                      </span>
                    </div>
                  </div>
                  {m.adres ? (
                    <p className="mt-0.5 text-xs text-slate-500">{m.adres}</p>
                  ) : null}
                  {m.not ? (
                    <p className="mt-0.5 text-xs text-slate-500">{m.not}</p>
                  ) : null}
                  {/* Satış adedi görünür mağaza kısıtından bağımsız: başka
                      mağazada satışı olan müşteri "satışı yok" sayılıp
                      tamamen silinmemeli. */}
                  <MusteriDuzenleme
                    musteri={{
                      id: m.id,
                      adSoyad: m.adSoyad,
                      telefon: m.telefon,
                      tcknVkn: m.tcknVkn,
                      adres: m.adres,
                      not: m.not,
                    }}
                    satisAdedi={
                      m._count.satinAlinanlar + m._count.aktarimSatislari
                    }
                    silebilir={silebilir}
                  />
                  {m.satinAlinanlar.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {m.satinAlinanlar.map((c) => (
                        <li key={c.id}>
                          <Link
                            href={`/cihazlar/${c.id}`}
                            className="inline-block rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
                          >
                            {c.marka} {c.model}
                            <span className="ml-1.5 text-slate-400">
                              {tarihYaz(c.satisTarihi)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <Sayfalama
          sayfa={sayfa}
          toplamSayfa={toplamSayfa(toplam)}
          params={params}
          temelYol="/musteriler"
        />
      </Kart>
    </div>
  );
}
