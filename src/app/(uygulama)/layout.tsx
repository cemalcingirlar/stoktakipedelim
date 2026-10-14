import { cikisYap } from "@/app/giris/eylemler";
import { UstMenu, type MenuOgesi } from "@/bilesenler/UstMenu";
import { aktarimaUygunKaynaklar } from "@/lib/dukkan";
import { prisma } from "@/lib/prisma";
import { ROL_ETIKET } from "@/lib/sabitler";
import { adminMi } from "@/lib/yetki";
import { oturumGerekli } from "@/lib/yetki";

const TEMEL_MENU: MenuOgesi[] = [
  { etiket: "Panel", yol: "/panel" },
  { etiket: "Cihazlar", yol: "/cihazlar" },
  { etiket: "Satış", yol: "/satis" },
  { etiket: "Mağazalar Arası Sevk", yol: "/sevkiyat" },
  { etiket: "Müşteriler", yol: "/musteriler" },
  { etiket: "Sayım", yol: "/sayim" },
  { etiket: "Rapor", yol: "/rapor" },
];

export default async function UygulamaDuzeni({ children }: LayoutProps<"/">) {
  const oturum = await oturumGerekli();

  const [ayar, magazalar] = await Promise.all([
    prisma.ayar.findUnique({ where: { anahtar: "firma_adi" } }),
    prisma.magaza.findMany({ where: { aktif: true }, select: { id: true, dukkanKodu: true } }),
  ]);

  // Dükkân içi aktarım yalnız aynı dükkân kodunu taşıyan iki mağazada da
  // yetkili olanlar için anlamlı; kurulmamışsa menüde yer kaplamasın.
  const aktarimVar = aktarimaUygunKaynaklar(oturum, magazalar).length > 0;
  const temel = aktarimVar
    ? TEMEL_MENU.flatMap((o) =>
        o.yol === "/sevkiyat" ? [o, { etiket: "Mağaza İçi Aktarım", yol: "/aktarim" }] : [o],
      )
    : TEMEL_MENU;

  // Alış faturaları ve ayarlar yalnızca yöneticinin menüsünde.
  const menu = adminMi(oturum)
    ? [...temel, { etiket: "Faturalar", yol: "/faturalar" }, { etiket: "Ayarlar", yol: "/ayarlar" }]
    : temel;

  return (
    <div className="flex min-h-dvh flex-col">
      <UstMenu
        firmaAdi={ayar?.deger ?? "Stok Takip"}
        ogeler={menu}
        kullaniciAdi={oturum.adSoyad}
        rolEtiketi={ROL_ETIKET[oturum.rol]}
        magazaAdi={oturum.magazaAdi}
        cikisEylemi={cikisYap}
      />
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
