import { cikisYap } from "@/app/giris/eylemler";
import { UstMenu, type MenuOgesi } from "@/bilesenler/UstMenu";
import { prisma } from "@/lib/prisma";
import { ROL_ETIKET } from "@/lib/sabitler";
import { adminMi } from "@/lib/yetki";
import { oturumGerekli } from "@/lib/yetki";

const TEMEL_MENU: MenuOgesi[] = [
  { etiket: "Panel", yol: "/panel" },
  { etiket: "Cihazlar", yol: "/cihazlar" },
  { etiket: "Satış", yol: "/satis" },
  { etiket: "Sevkiyat", yol: "/sevkiyat" },
  { etiket: "Müşteriler", yol: "/musteriler" },
  { etiket: "Sayım", yol: "/sayim" },
  { etiket: "Rapor", yol: "/rapor" },
];

export default async function UygulamaDuzeni({ children }: LayoutProps<"/">) {
  const oturum = await oturumGerekli();

  const ayar = await prisma.ayar.findUnique({ where: { anahtar: "firma_adi" } });
  // Alış faturaları ve ayarlar yalnızca yöneticinin menüsünde.
  const menu = adminMi(oturum)
    ? [...TEMEL_MENU, { etiket: "Faturalar", yol: "/faturalar" }, { etiket: "Ayarlar", yol: "/ayarlar" }]
    : TEMEL_MENU;

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
