import Link from "next/link";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { EylemFormu } from "@/bilesenler/EylemFormu";
import { Kart } from "@/bilesenler/Kart";
import { Rozet } from "@/bilesenler/Rozet";
import { kurusuTLYazSembollu } from "@/lib/para";
import { prisma } from "@/lib/prisma";
import { ROL_ETIKET, STOK_DURUM, type Rol } from "@/lib/sabitler";
import { adminSayfasi } from "@/lib/yetki";
import { magazaEkle, magazaGuncelle, magazaSil } from "../eylemler";

export const metadata = { title: "Mağazalar — Stok Takip" };

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

export default async function MagazalarSayfasi() {
  await adminSayfasi();

  const [magazalar, stokOzeti] = await Promise.all([
    prisma.magaza.findMany({
      orderBy: [{ aktif: "desc" }, { kod: "asc" }],
      include: {
        kullanicilar: {
          where: { aktif: true },
          select: { id: true, adSoyad: true, rol: true },
          orderBy: { rol: "asc" },
        },
        _count: { select: { alisFaturalari: true, sayimlar: true } },
      },
    }),
    prisma.stokKalemi.groupBy({
      by: ["magazaId"],
      where: { durum: STOK_DURUM.STOKTA },
      _count: { _all: true },
      _sum: { alisFiyatiKurus: true },
    }),
  ]);

  const stokHarita = new Map(stokOzeti.map((s) => [s.magazaId, s]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Mağazalar</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Yeni şube açtığınızda buradan ekleyin; sevkiyat, sayım ve raporlarda hemen görünür.
          </p>
        </div>
        <Link
          href="/ayarlar"
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ← Ayarlar
        </Link>
      </div>

      <Kart baslik="Yeni Mağaza">
        <EylemFormu eylem={magazaEkle}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="yeniKod" className={KUCUK_ETIKET}>
                Kod *
              </label>
              <input
                id="yeniKod"
                name="kod"
                required
                maxLength={10}
                placeholder="M4"
                className={`${GIRDI_SINIFI} uppercase`}
              />
            </div>
            <div>
              <label htmlFor="yeniAd" className={KUCUK_ETIKET}>
                Mağaza adı *
              </label>
              <input
                id="yeniAd"
                name="ad"
                required
                maxLength={60}
                placeholder="4 Nolu Mağaza"
                className={GIRDI_SINIFI}
              />
            </div>
            <div>
              <label htmlFor="yeniTelefon" className={KUCUK_ETIKET}>
                Telefon
              </label>
              <input id="yeniTelefon" name="telefon" maxLength={30} className={GIRDI_SINIFI} />
            </div>
            <div>
              <label htmlFor="yeniAdres" className={KUCUK_ETIKET}>
                Adres
              </label>
              <input id="yeniAdres" name="adres" maxLength={200} className={GIRDI_SINIFI} />
            </div>
          </div>
          <div className="mt-3">
            <GonderDugmesi bekleyenMetin="Ekleniyor…">Mağaza Ekle</GonderDugmesi>
          </div>
        </EylemFormu>
      </Kart>

      <div className="space-y-3">
        {magazalar.map((m) => {
          const stok = stokHarita.get(m.id);
          return (
            <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Rozet ton="mavi">{m.kod}</Rozet>
                <Rozet ton={m.aktif ? "yesil" : "nötr"}>{m.aktif ? "Aktif" : "Pasif"}</Rozet>
                {m.merkezMi ? <Rozet ton="mor">Merkez</Rozet> : null}
                <Rozet>{stok?._count._all ?? 0} cihaz stokta</Rozet>
                <Rozet>{kurusuTLYazSembollu(stok?._sum.alisFiyatiKurus ?? 0)}</Rozet>
                <Rozet>{m._count.alisFaturalari} fatura</Rozet>
              </div>

              <EylemFormu eylem={magazaGuncelle}>
                <input type="hidden" name="id" value={m.id} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className={KUCUK_ETIKET}>Kod *</label>
                    <input
                      key={`kod-${m.kod}`}
                      name="kod"
                      defaultValue={m.kod}
                      required
                      maxLength={10}
                      className={`${GIRDI_SINIFI} uppercase`}
                    />
                  </div>
                  <div>
                    <label className={KUCUK_ETIKET}>Mağaza adı *</label>
                    <input
                      key={`ad-${m.ad}`}
                      name="ad"
                      defaultValue={m.ad}
                      required
                      maxLength={60}
                      className={GIRDI_SINIFI}
                    />
                  </div>
                  <div>
                    <label className={KUCUK_ETIKET}>Telefon</label>
                    <input
                      key={`tel-${m.telefon}`}
                      name="telefon"
                      defaultValue={m.telefon ?? ""}
                      maxLength={30}
                      className={GIRDI_SINIFI}
                    />
                  </div>
                  <div>
                    <label className={KUCUK_ETIKET}>Adres</label>
                    <input
                      key={`adres-${m.adres}`}
                      name="adres"
                      defaultValue={m.adres ?? ""}
                      maxLength={200}
                      className={GIRDI_SINIFI}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      key={`aktif-${m.aktif}`}
                      type="checkbox"
                      name="aktif"
                      defaultChecked={m.aktif}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Aktif
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      key={`merkez-${m.merkezMi}`}
                      type="checkbox"
                      name="merkezMi"
                      defaultChecked={m.merkezMi}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Merkez depo
                  </label>
                  <GonderDugmesi tur="ikincil" bekleyenMetin="Kaydediliyor…">
                    Kaydet
                  </GonderDugmesi>
                </div>
              </EylemFormu>

              <div className="mt-3 border-t border-slate-100 pt-3">
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Kullanıcılar
                </h3>
                {m.kullanicilar.length === 0 ? (
                  <p className="text-sm text-amber-700">
                    Bu mağazaya bağlı kullanıcı yok — sevkiyat kabulü yapılamaz.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {m.kullanicilar.map((k) => (
                      <li
                        key={k.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm text-slate-700"
                      >
                        {k.adSoyad}
                        <span className="ml-1.5 text-xs text-slate-500">
                          {ROL_ETIKET[k.rol as Rol] ?? k.rol}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-3 border-t border-slate-100 pt-3">
                <EylemFormu eylem={magazaSil}>
                  <input type="hidden" name="id" value={m.id} />
                  <GonderDugmesi tur="tehlike" bekleyenMetin="Siliniyor…">
                    Mağazayı Sil
                  </GonderDugmesi>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Stoğu olan mağaza silinemez. Geçmiş kaydı olan mağaza silinmez, pasife alınır.
                  </p>
                </EylemFormu>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
