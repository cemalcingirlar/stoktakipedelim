import Link from "next/link";
import { Kart } from "@/bilesenler/Kart";
import { aktarimaUygunKaynaklar } from "@/lib/dukkan";
import { prisma } from "@/lib/prisma";
import { adminMi, oturumGerekli } from "@/lib/yetki";
import { AktarimFormu } from "./AktarimFormu";

export const metadata = { title: "Dükkân İçi Aktarım — Stok Takip" };

export default async function AktarimSayfasi() {
  const oturum = await oturumGerekli();

  const magazalar = await prisma.magaza.findMany({
    where: { aktif: true },
    orderBy: { kod: "asc" },
    select: { id: true, ad: true, dukkanKodu: true },
  });

  const uygun = aktarimaUygunKaynaklar(oturum, magazalar);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dükkân İçi Aktarım</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Aynı dükkânda duran iki kayıt arasında cihazı tek adımda taşır — sevkiyat açılmaz,
          kabul beklenmez. Farklı dükkânlar arasında <Link href="/sevkiyat/yeni" className="text-sky-700 underline-offset-2 hover:underline">Sevkiyat</Link> kullanılır,
          çünkü orada mal fiziken yolda ve karşı tarafın teslim aldığını onaylaması gerekir.
        </p>
      </div>

      {uygun.length === 0 ? (
        <Kart baslik="Önce dükkân grubu tanımlanmalı">
          <p className="text-sm text-slate-700">
            Aktarım yapabilmek için aynı dükkânda duran mağazaların <strong>aynı dükkân
            kodunu</strong> taşıması ve sizin ikisinde de yetkili olmanız gerekiyor. Şu anda
            böyle bir eşleşme yok.
          </p>
          {adminMi(oturum) ? (
            <p className="mt-2 text-sm text-slate-700">
              <Link
                href="/ayarlar/magazalar"
                className="font-medium text-sky-700 underline-offset-2 hover:underline"
              >
                Ayarlar → Mağazalar
              </Link>{" "}
              ekranında, örneğin bir dükkânın kasa ve depo kaydına ikisine de{" "}
              <code className="rounded bg-slate-100 px-1">KOZAN</code> yazın; aralarında aktarım
              açılır.
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-700">
              Yöneticinizden mağazalara dükkân kodu tanımlamasını isteyin.
            </p>
          )}
        </Kart>
      ) : (
        <AktarimFormu magazalar={uygun} varsayilanKaynakId={oturum.magazaId} />
      )}
    </div>
  );
}
