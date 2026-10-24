import Link from "next/link";
import { GIRDI_SINIFI } from "@/bilesenler/Alan";
import { GonderDugmesi } from "@/bilesenler/Dugme";
import { EylemFormu } from "@/bilesenler/EylemFormu";
import { Kart } from "@/bilesenler/Kart";
import { prisma } from "@/lib/prisma";
import { adminSayfasi } from "@/lib/yetki";
import {
  SAAT_DILIMI_SECENEKLERI,
  mevcutSaatDilimi,
  saatDilimiDurumu,
  saatDilimiOzeti,
  saatDilimiUyarisi,
} from "@/lib/saatDilimi";
import { secilenSaatDilimi } from "@/lib/saatDilimiAyari";
import { sistemOlcumu } from "@/lib/sistemOlcumu";
import { firmaAdiGuncelle, saatDiliminiGuncelle } from "./eylemler";

export const metadata = { title: "Ayarlar — Stok Takip" };

type BolumProps = {
  baslik: string;
  aciklama: string;
  yol?: string;
  sayi?: string;
  faz?: string;
};

function Bolum({ baslik, aciklama, yol, sayi, faz }: BolumProps) {
  const icerik = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">{baslik}</h2>
        {sayi ? (
          <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {sayi}
          </span>
        ) : null}
        {faz ? (
          <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
            {faz}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-slate-500">{aciklama}</p>
    </>
  );

  if (!yol) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 opacity-70">
        {icerik}
      </div>
    );
  }

  return (
    <Link
      href={yol}
      className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
    >
      {icerik}
    </Link>
  );
}

export default async function AyarlarSayfasi() {
  await adminSayfasi();

  const [
    kategoriSayisi,
    tedarikciSayisi,
    magazaSayisi,
    kullaniciSayisi,
    logSayisi,
    yedekSayisi,
    firmaAdi,
  ] = await Promise.all([
    prisma.kategori.count({ where: { aktif: true } }),
    prisma.tedarikci.count({ where: { aktif: true } }),
    prisma.magaza.count({ where: { aktif: true } }),
    prisma.kullanici.count({ where: { aktif: true } }),
    prisma.log.count(),
    prisma.yedek.count({ where: { durum: "BASARILI" } }),
    prisma.ayar.findUnique({ where: { anahtar: "firma_adi" } }),
  ]);

  // Saat dilimi yöneticinin seçtiği ayar; yanlışsa gün sınırına yakın
  // satışlar yanlış güne yazılır. Sessiz bir günlük satırı yerine
  // yöneticinin göreceği yere konuyor, çünkü düzeltmesi gereken kişi o.
  //
  // Durum, sürecin o an kullandığı dilimi SEÇİLENLE karşılaştırıyor: ikisi
  // ayrıysa seçim sürece uygulanamamış demektir (uygulama src/lib/
  // saatDilimiAyari.ts, istek başında).
  // Disk, veritabanı boyutu ve yedek yaşı hiçbir yerde görünmüyordu. Disk
  // dolduğunda SQLite yazamaz ve bu, satış ekranında sebebi yazmayan bir
  // "işlem tamamlanamadı" olarak çıkar.
  const sistem = await sistemOlcumu();
  const secilen = await secilenSaatDilimi();
  const saatDurumu = saatDilimiDurumu(mevcutSaatDilimi(), secilen);
  const saatUyarisi = saatDilimiUyarisi(saatDurumu);
  const saatOzeti = saatDilimiOzeti(saatDurumu);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Ayarlar</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Yalnızca yönetici erişebilir.
          </p>
        </div>

        {/* Dilim her durumda yazılı. Yalnız sorun varken bir şey göstermek,
            sessizliği iki anlamlı bırakıyordu: ya ayar doğru ya da güncelleme
            inmemiş. */}
        <span
          data-test="saat-dilimi-bilgisi"
          data-dogru={saatOzeti.dogru ? "evet" : "hayir"}
          title={
            saatOzeti.dogru
              ? "Gün, hafta ve ay hesapları bu dilime göre yapılıyor."
              : "Beklenen dilimden farklı; ayrıntı aşağıda."
          }
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
            saatOzeti.dogru
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          <span aria-hidden>{saatOzeti.dogru ? "✓" : "!"}</span>
          {saatOzeti.metin}
        </span>
      </div>

      {/* Banda bilerek ARIA rolü verilmiyor. Sayfa açılışında zaten duruyor,
          dinamik bir duyuru değil; ekran okuyucu belge sırasında okuyor.
          role="alert" ya da role="status" verildiğinde sayfadaki ilk canlı
          bölge o oluyor ve formların hata/başarı mesajlarını gölgeliyordu. */}
      {saatUyarisi ? (
        <div
          data-test="saat-dilimi-uyarisi"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold">
            Çalışan dilim, seçilen dilimden farklı
          </p>
          <p className="mt-1">{saatUyarisi}</p>
          <p className="mt-2 text-xs">
            Seçim her isteğin başında sürece uygulanıyor; bu uyarı duruyorsa
            sayfayı yenileyin. Geçmezse sunucuda{" "}
            <code className="rounded bg-amber-100 px-1">
              sudo systemctl restart stok
            </code>{" "}
            çalıştırmak yeter.
          </p>
        </div>
      ) : null}

      <Kart baslik="Sistem Durumu">
        <ul
          data-test="sistem-durumu"
          data-siddet={sistem.durum}
          className="space-y-2"
        >
          {sistem.satirlar.map((satir) => (
            <li
              key={satir.etiket}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0"
            >
              <span className="text-sm text-slate-600">{satir.etiket}</span>
              <span className="flex items-center gap-2 text-sm">
                <span
                  className={
                    satir.siddet === "kritik"
                      ? "font-medium text-red-700"
                      : satir.siddet === "uyari"
                        ? "font-medium text-amber-700"
                        : "text-slate-800"
                  }
                >
                  {satir.deger}
                </span>
                {satir.siddet !== "iyi" ? (
                  <span
                    aria-hidden
                    className={
                      satir.siddet === "kritik"
                        ? "rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
                        : "rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                    }
                  >
                    {satir.siddet === "kritik" ? "kritik" : "dikkat"}
                  </span>
                ) : null}
              </span>
              {satir.oneri ? (
                <span className="w-full text-xs text-slate-500">
                  {satir.oneri}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </Kart>

      <Kart baslik="Firma Adı">
        <EylemFormu eylem={firmaAdiGuncelle}>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[260px] flex-1">
              <label
                htmlFor="firmaAdi"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Üst menüde ve sayfa başlıklarında görünen ad
              </label>
              <input
                id="firmaAdi"
                name="firmaAdi"
                key={firmaAdi?.deger}
                defaultValue={firmaAdi?.deger ?? ""}
                required
                maxLength={60}
                className={GIRDI_SINIFI}
              />
            </div>
            <GonderDugmesi tur="ikincil" bekleyenMetin="Kaydediliyor…">
              Kaydet
            </GonderDugmesi>
          </div>
        </EylemFormu>
      </Kart>

      <Kart baslik="Saat Dilimi">
        {/* Gün/hafta/ay hesapları bu dilime göre: "bugün satılanlar", panel
            grafiği, vade günleri ve fatura formunun varsayılan tarihi. */}
        <EylemFormu eylem={saatDiliminiGuncelle}>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[260px] flex-1">
              <label
                htmlFor="saatDilimi"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Gün, hafta ve ay hesaplarının yapılacağı dilim
              </label>
              <select
                id="saatDilimi"
                name="saatDilimi"
                data-test="saat-dilimi-secimi"
                key={secilen}
                defaultValue={secilen}
                className={GIRDI_SINIFI}
              >
                {/* Seçili dilim listede yoksa (elle girilmiş bir ad)
                    kaybolmasın: başa kendisi ekleniyor. */}
                {SAAT_DILIMI_SECENEKLERI.some(
                  (s) => s.deger === secilen,
                ) ? null : (
                  <option value={secilen}>{secilen}</option>
                )}
                {SAAT_DILIMI_SECENEKLERI.map((s) => (
                  <option key={s.deger} value={s.deger}>
                    {s.etiket}
                  </option>
                ))}
              </select>
            </div>
            <GonderDugmesi tur="ikincil" bekleyenMetin="Kaydediliyor…">
              Kaydet
            </GonderDugmesi>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Şu an çalışan dilim: <strong>{saatDurumu.mevcut}</strong> · yerel
            saat <strong>{saatDurumu.yerelSaat}</strong>. Yanlış dilim, gece
            yapılan satışların bir önceki güne yazılmasına yol açar.
          </p>
        </EylemFormu>
      </Kart>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Bolum
          baslik="Kategoriler"
          aciklama="Kategori ve alt kategori ağacını düzenleyin, IMEI zorunluluğunu belirleyin."
          yol="/ayarlar/kategoriler"
          sayi={`${kategoriSayisi} kategori`}
        />
        <Bolum
          baslik="Tedarikçiler"
          aciklama="Alış faturalarında seçilen tedarikçileri yönetin."
          yol="/ayarlar/tedarikciler"
          sayi={`${tedarikciSayisi} tedarikçi`}
        />
        <Bolum
          baslik="Mağazalar"
          aciklama="Yeni şube ekleyin, mağaza bilgilerini ve merkez depoyu düzenleyin."
          yol="/ayarlar/magazalar"
          sayi={`${magazaSayisi} mağaza`}
        />
        <Bolum
          baslik="Kullanıcılar ve Roller"
          aciklama="Kullanıcı ekleme, rol ve mağaza ataması, şifre sıfırlama."
          yol="/ayarlar/kullanicilar"
          sayi={`${kullaniciSayisi} aktif`}
        />
        <Bolum
          baslik="İşlem Logları"
          aciklama="Kim ne zaman hangi işlemi yaptı. Kayıtlar silinmez."
          yol="/ayarlar/loglar"
          sayi={`${logSayisi} kayıt`}
        />
        <Bolum
          baslik="Google Drive Yedekleme"
          aciklama="Günlük otomatik yedek, bağlantı sınama ve yedek geçmişi."
          yol="/ayarlar/yedekleme"
          sayi={yedekSayisi > 0 ? `${yedekSayisi} yedek` : "kurulum gerekli"}
        />
      </div>
    </div>
  );
}
