import Link from "next/link";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { EylemFormu } from "@/bilesenler/EylemFormu";
import { Kart } from "@/bilesenler/Kart";
import { Rozet } from "@/bilesenler/Rozet";
import { kurusuTLYazSembollu } from "@/lib/para";
import { prisma } from "@/lib/prisma";
import { ROLLER, ROL_ETIKET, STOK_DURUM, type Rol } from "@/lib/sabitler";
import { adminSayfasi } from "@/lib/yetki";
import {
  magazaEkle,
  magazaGuncelle,
  magazaSil,
  magazaYetkileriGuncelle,
} from "../eylemler";

export const metadata = { title: "Mağazalar — Stok Takip" };

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

export default async function MagazalarSayfasi() {
  await adminSayfasi();

  const [magazalar, kullanicilar, stokOzeti] = await Promise.all([
    prisma.magaza.findMany({
      orderBy: [{ aktif: "desc" }, { kod: "asc" }],
      include: {
        kullanicilar: { where: { aktif: true }, select: { id: true } },
        ekYetkililer: { where: { aktif: true }, select: { id: true } },
        _count: { select: { alisFaturalari: true, sayimlar: true } },
      },
    }),
    prisma.kullanici.findMany({
      where: { aktif: true },
      orderBy: [{ rol: "asc" }, { adSoyad: "asc" }],
      select: { id: true, adSoyad: true, rol: true, magazaId: true },
    }),
    prisma.stokKalemi.groupBy({
      by: ["magazaId"],
      where: { durum: STOK_DURUM.STOKTA },
      _count: { _all: true },
      _sum: { alisFiyatiKurus: true },
    }),
  ]);

  const stokHarita = new Map(stokOzeti.map((s) => [s.magazaId, s]));
  // Yönetici her mağazada yetkili olduğu için kutu listesine girmez.
  const yoneticiler = kullanicilar.filter((k) => k.rol === ROLLER.ADMIN);
  const personel = kullanicilar.filter((k) => k.rol !== ROLLER.ADMIN);

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
          const ekYetkili = new Set(m.ekYetkililer.map((k) => k.id));
          const yetkiliSayisi = new Set([
            ...m.kullanicilar.map((k) => k.id),
            ...m.ekYetkililer.map((k) => k.id),
          ]).size;
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
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Yetkili Kullanıcılar
                  </h3>
                  <Link
                    href="/ayarlar/kullanicilar"
                    className="text-xs font-medium text-sky-700 underline-offset-2 hover:underline"
                  >
                    + Yeni kullanıcı oluştur
                  </Link>
                </div>

                {personel.length === 0 ? (
                  <p className="text-sm text-amber-700">
                    Henüz mağaza personeli yok — önce kullanıcı ekranından hesap oluşturun.
                  </p>
                ) : (
                  <EylemFormu eylem={magazaYetkileriGuncelle}>
                    <input type="hidden" name="id" value={m.id} />
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {personel.map((k) => {
                        const anaMagazasi = k.magazaId === m.id;
                        const yetkili = anaMagazasi || ekYetkili.has(k.id);
                        return (
                          <label
                            key={k.id}
                            className={`flex items-center gap-2 text-sm ${
                              anaMagazasi ? "text-slate-500" : "text-slate-700"
                            }`}
                          >
                            <input
                              key={`yetki-${m.id}-${k.id}-${yetkili}`}
                              type="checkbox"
                              name="yetkililer"
                              value={k.id}
                              defaultChecked={yetkili}
                              disabled={anaMagazasi}
                              className="h-4 w-4 rounded border-slate-300 disabled:opacity-60"
                            />
                            {k.adSoyad}
                            <span className="text-xs text-slate-500">
                              {anaMagazasi ? "ana mağazası" : (ROL_ETIKET[k.rol as Rol] ?? k.rol)}
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    {yetkiliSayisi === 0 ? (
                      <p className="mt-2 text-sm text-amber-700">
                        Bu mağazada yetkili kullanıcı yok — sevkiyat kabulü yapılamaz.
                      </p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <GonderDugmesi tur="ikincil" bekleyenMetin="Kaydediliyor…">
                        Yetkileri Kaydet
                      </GonderDugmesi>
                      <p className="text-xs text-slate-500">
                        Ana mağazası burası olan kişinin yetkisi buradan kaldırılamaz; ana
                        mağaza değişikliği kullanıcı ekranından yapılır.
                        {yoneticiler.length > 0
                          ? ` Yönetici (${yoneticiler
                              .map((y) => y.adSoyad)
                              .join(", ")}) her mağazada yetkilidir.`
                          : ""}
                      </p>
                    </div>
                  </EylemFormu>
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
