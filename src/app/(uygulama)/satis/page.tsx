import { CikisKarti } from "@/bilesenler/CikisKarti";
import { gorunurMagazaIdleri } from "@/lib/gorunurluk";
import { prisma } from "@/lib/prisma";
import {
  CIKIS_DONEMLERI,
  cikisDonemiCoz,
  donemBasligi,
  satisDonemAraligi,
  tekGunMu,
} from "@/lib/satisDonemi";
import { satilanlar } from "@/lib/sorgular";
import { formTarihiCevir, inputTarih } from "@/lib/tarih";
import { saticiAdaylari, type SaticiAdayi } from "@/lib/satici";
import { oturumGerekli, yetkiliMagazalar } from "@/lib/yetki";
import { SatisFormu } from "./SatisFormu";

export const metadata = { title: "Satış — Stok Takip" };

export default async function SatisSayfasi({
  searchParams,
}: PageProps<"/satis">) {
  const oturum = await oturumGerekli();

  // Satış yaparken "bugün ne sattık, bu cihaz zaten satıldı mı" diye panele
  // gidip dönmek gerekiyordu; aynı kart burada da duruyor.
  const params = await searchParams;
  const tek = (ad: string) => {
    const deger = params[ad];
    return Array.isArray(deger) ? deger[0] : deger;
  };
  const simdi = new Date();
  const donem = cikisDonemiCoz(tek("donem"));
  const ozel = {
    bas: formTarihiCevir(tek("bas")),
    bit: formTarihiCevir(tek("bit")),
  };
  const aralik = satisDonemAraligi(donem, simdi, ozel);
  const sonSatislar = await satilanlar(gorunurMagazaIdleri(oturum), aralik);

  const araligiYaz = donemBasligi(donem, aralik);
  const cihazListesiYolu = `/cihazlar?durum=SATILDI&satisBas=${inputTarih(aralik.baslangic)}&satisBit=${inputTarih(aralik.bitis)}`;

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
        bugun={inputTarih(simdi)}
        saticilar={saticilar.map((s) => ({ id: s.id, adSoyad: s.adSoyad }))}
        varsayilanSaticiId={oturum.kullaniciId}
      />

      <CikisKarti
        baslik={
          donem.anahtar === "aralik"
            ? `Son Satışlar — ${araligiYaz}`
            : `Son Satışlar — ${donem.baslik}`
        }
        cihazListesiYolu={cihazListesiYolu}
        ozet={sonSatislar}
        tekGun={tekGunMu(aralik)}
        bosNotu={
          donem.anahtar === "gun"
            ? "Bugün henüz satış yapılmadı."
            : `Seçilen dönemde (${araligiYaz}) satış yok.`
        }
        secici={{
          donemler: CIKIS_DONEMLERI,
          secili: donem,
          testAdi: "satis-cikis-secici",
          eylem: "/satis",
          adres: (anahtar) => `/satis?donem=${anahtar}`,
          aralikFormu: {
            gizli: { donem: "aralik" },
            basAdi: "bas",
            bitAdi: "bit",
            bas: ozel.bas ? inputTarih(ozel.bas) : inputTarih(aralik.baslangic),
            bit: ozel.bit ? inputTarih(ozel.bit) : inputTarih(aralik.bitis),
          },
        }}
      />
    </div>
  );
}
