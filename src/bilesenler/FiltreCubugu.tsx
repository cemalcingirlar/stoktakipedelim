import Link from "next/link";
import { GIRDI_SINIFI } from "./Alan";
import { filtreyiSorguyaCevir, type CihazFiltresi } from "@/lib/cihazFiltre";
import { STOK_DURUM, STOK_DURUM_ETIKET } from "@/lib/sabitler";
import { inputTarih } from "@/lib/tarih";

type Secenek = { id: number; ad: string };

const CIP_TEMEL =
  "rounded-md border px-3 py-1.5 text-sm transition whitespace-nowrap";
const CIP_AKTIF = "border-blue-600 bg-blue-600 font-medium text-white";
const CIP_PASIF = "border-slate-300 bg-white text-slate-700 hover:bg-slate-50";

function Cipler({
  baslik,
  secenekler,
  aktifDeger,
  parametre,
  params,
}: {
  baslik: string;
  secenekler: { deger: string; etiket: string }[];
  aktifDeger: string;
  parametre: string;
  params: Record<string, string | string[] | undefined>;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-slate-500">{baslik}</div>
      <div className="flex flex-wrap gap-1.5">
        {secenekler.map((s) => (
          <Link
            key={s.deger || "tumu"}
            href={`/cihazlar${filtreyiSorguyaCevir(params, { [parametre]: s.deger || null, sayfa: null })}`}
            className={`${CIP_TEMEL} ${aktifDeger === s.deger ? CIP_AKTIF : CIP_PASIF}`}
          >
            {s.etiket}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function FiltreCubugu({
  filtre,
  params,
  kategoriler,
  altKategoriler,
  magazalar,
}: {
  filtre: CihazFiltresi;
  params: Record<string, string | string[] | undefined>;
  kategoriler: Secenek[];
  altKategoriler: Secenek[];
  magazalar: { id: number; kod: string; ad: string }[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <Cipler
          baslik="Kategori"
          parametre="kategori"
          params={params}
          aktifDeger={filtre.kategoriId ? String(filtre.kategoriId) : ""}
          secenekler={[
            { deger: "", etiket: "Tümü" },
            ...kategoriler.map((k) => ({ deger: String(k.id), etiket: k.ad })),
          ]}
        />
        <Cipler
          baslik="Durum"
          parametre="durum"
          params={params}
          aktifDeger={filtre.durum}
          secenekler={[
            { deger: "", etiket: "Tümü" },
            { deger: STOK_DURUM.STOKTA, etiket: STOK_DURUM_ETIKET.STOKTA },
            { deger: STOK_DURUM.TRANSFERDE, etiket: STOK_DURUM_ETIKET.TRANSFERDE },
            { deger: STOK_DURUM.SATILDI, etiket: STOK_DURUM_ETIKET.SATILDI },
          ]}
        />
        <Cipler
          baslik="Depo"
          parametre="magaza"
          params={params}
          aktifDeger={filtre.magazaId ? String(filtre.magazaId) : ""}
          secenekler={[
            { deger: "", etiket: "Tümü" },
            ...magazalar.map((m) => ({ deger: String(m.id), etiket: m.ad })),
          ]}
        />
      </div>

      {/* Arama ve tarih filtreleri — JavaScript olmadan da çalışan GET formu. */}
      <form method="get" action="/cihazlar" className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        {filtre.durum ? <input type="hidden" name="durum" value={filtre.durum} /> : null}
        {filtre.kategoriId ? <input type="hidden" name="kategori" value={filtre.kategoriId} /> : null}
        {filtre.magazaId ? <input type="hidden" name="magaza" value={filtre.magazaId} /> : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label htmlFor="ara" className="mb-1 block text-xs font-medium text-slate-600">
              Ara (model, IMEI, barkod, satıcı, alıcı, not)
            </label>
            <input
              id="ara"
              name="ara"
              type="search"
              defaultValue={filtre.ara}
              placeholder="IMEI okutun veya yazın…"
              className={GIRDI_SINIFI}
            />
          </div>

          <div>
            <label htmlFor="altKategori" className="mb-1 block text-xs font-medium text-slate-600">
              Alt kategori
            </label>
            <select
              id="altKategori"
              name="altKategori"
              defaultValue={filtre.altKategoriId ?? ""}
              className={GIRDI_SINIFI}
            >
              <option value="">Tümü</option>
              {altKategoriler.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.ad}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="vade" className="mb-1 block text-xs font-medium text-slate-600">
              Vade
            </label>
            <select id="vade" name="vade" defaultValue={filtre.vade} className={GIRDI_SINIFI}>
              <option value="">Tümü</option>
              <option value="gecen">Vadesi geçenler</option>
              <option value="yaklasan">Vadesi yaklaşanlar (7 gün)</option>
              <option value="odenmemis">Ödenmemiş vadeli</option>
            </select>
          </div>

          <div>
            <label htmlFor="alisBas" className="mb-1 block text-xs font-medium text-slate-600">
              Alış (başlangıç)
            </label>
            <input id="alisBas" name="alisBas" type="date" defaultValue={inputTarih(filtre.alisBas)} className={GIRDI_SINIFI} />
          </div>
          <div>
            <label htmlFor="alisBit" className="mb-1 block text-xs font-medium text-slate-600">
              Alış (bitiş)
            </label>
            <input id="alisBit" name="alisBit" type="date" defaultValue={inputTarih(filtre.alisBit)} className={GIRDI_SINIFI} />
          </div>
          <div>
            <label htmlFor="satisBas" className="mb-1 block text-xs font-medium text-slate-600">
              Satış (başlangıç)
            </label>
            <input id="satisBas" name="satisBas" type="date" defaultValue={inputTarih(filtre.satisBas)} className={GIRDI_SINIFI} />
          </div>
          <div>
            <label htmlFor="satisBit" className="mb-1 block text-xs font-medium text-slate-600">
              Satış (bitiş)
            </label>
            <input id="satisBit" name="satisBit" type="date" defaultValue={inputTarih(filtre.satisBit)} className={GIRDI_SINIFI} />
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900"
          >
            Filtrele
          </button>
          <Link
            href="/cihazlar"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Temizle
          </Link>
        </div>
      </form>
    </div>
  );
}
