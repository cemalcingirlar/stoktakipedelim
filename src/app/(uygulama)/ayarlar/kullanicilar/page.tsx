import Link from "next/link";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { EylemFormu } from "@/bilesenler/EylemFormu";
import { Kart } from "@/bilesenler/Kart";
import { Rozet } from "@/bilesenler/Rozet";
import { prisma } from "@/lib/prisma";
import { ROLLER, ROL_ETIKET, type Rol } from "@/lib/sabitler";
import { tarihSaatYaz } from "@/lib/tarih";
import { adminSayfasi } from "@/lib/yetki";
import { kullaniciEkle, kullaniciGuncelle, kullaniciSil, sifreSifirla } from "../eylemler";

export const metadata = { title: "Kullanıcılar — Stok Takip" };

const KUCUK_ETIKET = "mb-1 block text-xs font-medium text-slate-600";

export default async function KullanicilarSayfasi() {
  const oturum = await adminSayfasi();

  const [kullanicilar, magazalar] = await Promise.all([
    prisma.kullanici.findMany({
      orderBy: [{ aktif: "desc" }, { rol: "asc" }, { kullaniciAdi: "asc" }],
      include: {
        magaza: { select: { ad: true } },
        ekMagazalar: { select: { id: true, ad: true }, orderBy: { kod: "asc" } },
      },
    }),
    prisma.magaza.findMany({ where: { aktif: true }, orderBy: { kod: "asc" } }),
  ]);

  const aktifAdminSayisi = kullanicilar.filter(
    (k) => k.rol === ROLLER.ADMIN && k.aktif,
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Kullanıcılar ve Roller</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Yönetici tüm mağazalarda işlem yapar. Sorumlu ve personel yalnız yetkili olduğu
            mağazalarda sevkiyat, kabul ve satış yapabilir; stok girişi ve silme yetkisi yoktur.
            Bir kişi birden çok şubede çalışıyorsa ana mağazasının yanında diğerlerini de
            işaretleyin.
          </p>
        </div>
        <Link
          href="/ayarlar"
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ← Ayarlar
        </Link>
      </div>

      <Kart baslik="Yeni Kullanıcı">
        <EylemFormu eylem={kullaniciEkle}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label htmlFor="yeniKullaniciAdi" className={KUCUK_ETIKET}>
                Kullanıcı adı *
              </label>
              <input
                id="yeniKullaniciAdi"
                name="kullaniciAdi"
                required
                maxLength={30}
                placeholder="personel4"
                className={GIRDI_SINIFI}
              />
            </div>
            <div>
              <label htmlFor="yeniAdSoyad" className={KUCUK_ETIKET}>
                Ad Soyad *
              </label>
              <input id="yeniAdSoyad" name="adSoyad" required maxLength={80} className={GIRDI_SINIFI} />
            </div>
            <div>
              <label htmlFor="yeniRol" className={KUCUK_ETIKET}>
                Rol *
              </label>
              <select id="yeniRol" name="rol" required defaultValue={ROLLER.MAGAZA_PERSONELI} className={GIRDI_SINIFI}>
                {Object.values(ROLLER).map((r) => (
                  <option key={r} value={r}>
                    {ROL_ETIKET[r as Rol]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="yeniMagaza" className={KUCUK_ETIKET}>
                Mağaza
              </label>
              <select id="yeniMagaza" name="magazaId" className={GIRDI_SINIFI}>
                <option value="">Yönetici için boş</option>
                {magazalar.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.ad}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="yeniSifre" className={KUCUK_ETIKET}>
                Şifre * (en az 8)
              </label>
              <input
                id="yeniSifre"
                name="sifre"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={GIRDI_SINIFI}
              />
            </div>
            <div>
              <label htmlFor="yeniSifreTeyit" className={KUCUK_ETIKET}>
                Şifre (tekrar) *
              </label>
              <input
                id="yeniSifreTeyit"
                name="sifreTekrar"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={GIRDI_SINIFI}
              />
            </div>
          </div>
          <div className="mt-3">
            <span className={KUCUK_ETIKET}>Ek mağazalar (isteğe bağlı)</span>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {magazalar.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="ekMagazalar"
                    value={m.id}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {m.ad}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <GonderDugmesi bekleyenMetin="Ekleniyor…">Kullanıcı Ekle</GonderDugmesi>
          </div>
        </EylemFormu>
      </Kart>

      <div className="space-y-3">
        {kullanicilar.map((k) => (
          <div key={k.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Rozet ton={k.aktif ? "yesil" : "nötr"}>{k.aktif ? "Aktif" : "Pasif"}</Rozet>
              <Rozet ton={k.rol === ROLLER.ADMIN ? "mor" : "mavi"}>
                {ROL_ETIKET[k.rol as Rol] ?? k.rol}
              </Rozet>
              <Rozet>{k.magaza?.ad ?? "Tüm mağazalar"}</Rozet>
              {k.ekMagazalar.map((m) => (
                <Rozet key={m.id} ton="mavi">
                  + {m.ad}
                </Rozet>
              ))}
              {k.id === oturum.kullaniciId ? <Rozet ton="sari">Bu sizsiniz</Rozet> : null}
              <span className="text-xs text-slate-400">
                Son giriş: {k.sonGiris ? tarihSaatYaz(k.sonGiris) : "—"}
              </span>
            </div>

            <EylemFormu eylem={kullaniciGuncelle}>
              <input type="hidden" name="id" value={k.id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className={KUCUK_ETIKET}>Kullanıcı adı *</label>
                  <input
                    key={`ka-${k.kullaniciAdi}`}
                    name="kullaniciAdi"
                    defaultValue={k.kullaniciAdi}
                    required
                    maxLength={30}
                    className={GIRDI_SINIFI}
                  />
                </div>
                <div>
                  <label className={KUCUK_ETIKET}>Ad Soyad *</label>
                  <input
                    key={`as-${k.adSoyad}`}
                    name="adSoyad"
                    defaultValue={k.adSoyad}
                    required
                    maxLength={80}
                    className={GIRDI_SINIFI}
                  />
                </div>
                <div>
                  <label className={KUCUK_ETIKET}>Rol *</label>
                  <select
                    key={`rol-${k.rol}`}
                    name="rol"
                    defaultValue={k.rol}
                    required
                    className={GIRDI_SINIFI}
                  >
                    {Object.values(ROLLER).map((r) => (
                      <option key={r} value={r}>
                        {ROL_ETIKET[r as Rol]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={KUCUK_ETIKET}>Mağaza</label>
                  <select
                    key={`mag-${k.magazaId}`}
                    name="magazaId"
                    defaultValue={k.magazaId ?? ""}
                    className={GIRDI_SINIFI}
                  >
                    <option value="">Yönetici için boş</option>
                    {magazalar.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.ad}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <span className={KUCUK_ETIKET}>Ek mağazalar</span>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {magazalar.map((m) => {
                    const secili = k.ekMagazalar.some((e) => e.id === m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 text-sm text-slate-700"
                      >
                        <input
                          key={`ek-${k.id}-${m.id}-${secili}`}
                          type="checkbox"
                          name="ekMagazalar"
                          value={m.id}
                          defaultChecked={secili}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        {m.ad}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Ana mağaza yukarıdaki listeden seçilir; burada yalnız ek şubeler işaretlenir.
                  Yönetici rolünde bu seçimler yok sayılır.
                </p>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    key={`aktif-${k.aktif}`}
                    type="checkbox"
                    name="aktif"
                    defaultChecked={k.aktif}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Aktif (pasif kullanıcı giriş yapamaz)
                </label>
                <GonderDugmesi tur="ikincil" bekleyenMetin="Kaydediliyor…">
                  Kaydet
                </GonderDugmesi>
                {k.rol === ROLLER.ADMIN && aktifAdminSayisi === 1 ? (
                  <span className="text-xs text-amber-700">
                    Tek aktif yönetici — rolü veya aktifliği değiştirilemez.
                  </span>
                ) : null}
              </div>
            </EylemFormu>

            <div className="mt-3 border-t border-slate-100 pt-3">
              <EylemFormu eylem={sifreSifirla}>
                <input type="hidden" name="id" value={k.id} />
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px]">
                    <label htmlFor={`sifre-${k.id}`} className={KUCUK_ETIKET}>
                      Yeni şifre (en az 8 karakter)
                    </label>
                    <input
                      id={`sifre-${k.id}`}
                      name="yeniSifre"
                      type="password"
                      minLength={8}
                      autoComplete="new-password"
                      className={GIRDI_SINIFI}
                    />
                  </div>
                  <div className="min-w-[200px]">
                    <label htmlFor={`sifre-tekrar-${k.id}`} className={KUCUK_ETIKET}>
                      Yeni şifre (tekrar)
                    </label>
                    <input
                      id={`sifre-tekrar-${k.id}`}
                      name="yeniSifreTekrar"
                      type="password"
                      minLength={8}
                      autoComplete="new-password"
                      className={GIRDI_SINIFI}
                    />
                  </div>
                  <GonderDugmesi tur="ikincil" bekleyenMetin="Kaydediliyor…">
                    Şifreyi Sıfırla
                  </GonderDugmesi>
                </div>
              </EylemFormu>
            </div>

            {k.id === oturum.kullaniciId ? null : (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <EylemFormu eylem={kullaniciSil}>
                  <input type="hidden" name="id" value={k.id} />
                  <GonderDugmesi tur="tehlike" bekleyenMetin="Siliniyor…">
                    Kullanıcıyı Sil
                  </GonderDugmesi>
                  <p className="mt-1.5 text-xs text-slate-500">
                    İşlem kaydı olan hesap silinmez, pasife alınır — fatura, sevkiyat ve satış
                    kayıtlarında kimin yaptığı bilgisi korunur.
                  </p>
                </EylemFormu>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
