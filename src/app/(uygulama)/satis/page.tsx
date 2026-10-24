import { prisma } from "@/lib/prisma";
import { inputTarih } from "@/lib/tarih";
import { saticiAdaylari, type SaticiAdayi } from "@/lib/satici";
import { oturumGerekli, yetkiliMagazalar } from "@/lib/yetki";
import { SatisFormu } from "./SatisFormu";

export const metadata = { title: "Satış — Stok Takip" };

export default async function SatisSayfasi() {
  const oturum = await oturumGerekli();

  // Satışı fiilen yapan kişi seçilebiliyor: yönetici ve muhasebeci de kayıt
  // giriyor, personel bazlı satış raporu doğru çıksın.
  const kullanicilar = await prisma.kullanici.findMany({
    where: { aktif: true },
    orderBy: { adSoyad: "asc" },
    select: {
      id: true,
      adSoyad: true,
      rol: true,
      aktif: true,
      magazaId: true,
      ekMagazalar: { select: { id: true } },
    },
  });

  const adaylar: SaticiAdayi[] = kullanicilar.map((k) => ({
    id: k.id,
    adSoyad: k.adSoyad,
    rol: k.rol as SaticiAdayi["rol"],
    aktif: k.aktif,
    magazaIdleri: [
      ...(k.magazaId === null ? [] : [k.magazaId]),
      ...k.ekMagazalar.map((m) => m.id),
    ],
  }));

  const saticilar = saticiAdaylari(
    {
      kullaniciId: oturum.kullaniciId,
      rol: oturum.rol,
      magazaIdleri: yetkiliMagazalar(oturum),
    },
    adaylar,
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Satış</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {oturum.magazaAdlari.length > 0
            ? `${oturum.magazaAdlari.join(", ")} ${
                oturum.magazaAdlari.length > 1 ? "depolarındaki" : "deposundaki"
              } cihazları satabilirsiniz.`
            : "Tüm mağazalardaki cihazları satabilirsiniz."}
        </p>
      </div>
      <SatisFormu
        bugun={inputTarih(new Date())}
        saticilar={saticilar.map((s) => ({ id: s.id, adSoyad: s.adSoyad }))}
        varsayilanSaticiId={oturum.kullaniciId}
      />
    </div>
  );
}
