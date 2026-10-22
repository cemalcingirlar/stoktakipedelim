import Link from "next/link";
import { Kart } from "@/bilesenler/Kart";
import { aktarimEngeli, aktarimaUygunKaynaklar } from "@/lib/dukkan";
import { prisma } from "@/lib/prisma";
import { saticiAdaylari, type SaticiAdayi } from "@/lib/satici";
import { adminMi, oturumGerekli, yetkiliMagazalar } from "@/lib/yetki";
import { AktarimFormu } from "./AktarimFormu";

export const metadata = { title: "Mağaza İçi Aktarım — Stok Takip" };

export default async function AktarimSayfasi() {
  const oturum = await oturumGerekli();

  const magazalar = await prisma.magaza.findMany({
    where: { aktif: true },
    orderBy: { kod: "asc" },
    select: { id: true, ad: true, dukkanKodu: true },
  });

  const uygun = aktarimaUygunKaynaklar(oturum, magazalar);
  // Ekran açılmıyorsa sebebini ayırt ediyoruz: dükkân kodu eksikse yöneticinin
  // ayar yapması, yetki eksikse kullanıcının yetki istemesi gerekiyor. İkisine
  // aynı mesajı göstermek personeli olmayan bir ayarın peşine düşürüyordu.
  const engel = aktarimEngeli(oturum, magazalar);

  // Sat-geri al işleminde satışı fiilen yapan kişi seçilebiliyor; personel
  // bazlı satış raporu doğru çıksın. Satış ekranıyla aynı kurallar.
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

  const saticilar = saticiAdaylari(
    { kullaniciId: oturum.kullaniciId, rol: oturum.rol, magazaIdleri: yetkiliMagazalar(oturum) },
    kullanicilar.map((k) => ({
      id: k.id,
      adSoyad: k.adSoyad,
      rol: k.rol as SaticiAdayi["rol"],
      aktif: k.aktif,
      magazaIdleri: [
        ...(k.magazaId === null ? [] : [k.magazaId]),
        ...k.ekMagazalar.map((m) => m.id),
      ],
    })),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Mağaza İçi Aktarım</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Aynı dükkânda duran iki kayıt arasında cihazı tek adımda taşır — sevkiyat açılmaz,
          kabul beklenmez. Farklı dükkânlar arasında <Link href="/sevkiyat/yeni" className="text-sky-700 underline-offset-2 hover:underline">Mağazalar Arası Sevk</Link> kullanılır,
          çünkü orada mal fiziken yolda ve karşı tarafın teslim aldığını onaylaması gerekir.
        </p>
      </div>

      {engel?.tur === "YETKI_YOK" ? (
        <Kart baslik="Bu dükkânda yetkiniz eksik">
          <p data-test="aktarim-yetki-engeli" className="text-sm text-slate-700">
            Mağaza içi aktarım dükkânınızda tanımlı, ama tek adımlı aktarım için{" "}
            <strong>iki mağazada da</strong> yetkili olmanız gerekiyor.
            {engel.magazaAdlari.length > 0 ? (
              <>
                {" "}
                Şu mağaza(lar)da yetkiniz yok:{" "}
                <strong>{engel.magazaAdlari.join(", ")}</strong>.
              </>
            ) : null}
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Yöneticinizden <strong>Ayarlar → Mağazalar</strong> ekranında, o mağazanın
            &quot;Yetkili Kullanıcılar&quot; bölümünden size yetki vermesini isteyin. Bu bir
            yönetici ayrıcalığı değil; yetki verilen her kullanıcı aktarım yapabilir ve alış
            fiyatını revize edebilir.
          </p>
        </Kart>
      ) : engel?.tur === "DUKKAN_YOK" ? (
        <Kart baslik="Önce dükkân grubu tanımlanmalı">
          <p className="text-sm text-slate-700">
            Mağaza içi aktarım için aynı dükkânda duran mağazaların <strong>aynı dükkân
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
        <AktarimFormu
          magazalar={uygun}
          varsayilanKaynakId={oturum.magazaId}
          saticilar={saticilar.map((s) => ({ id: s.id, adSoyad: s.adSoyad }))}
          varsayilanSaticiId={oturum.kullaniciId}
        />
      )}
    </div>
  );
}
