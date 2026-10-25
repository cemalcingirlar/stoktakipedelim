"use client";

import NextLink, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

/**
 * Tıklanan bağlantıda anında görünen bekleme çizgisi.
 *
 * Sayfalar dinamik üretiliyor: tıklamadan içeriğin gelmesine kadar bir
 * gidiş-dönüş geçiyor (ölçüldü, 200 ms gecikmeli bağlantıda 330-380 ms).
 * Eskiden bu sürede ekranda hiçbir şey değişmiyordu; kullanıcı tıklamanın
 * işleyip işlemediğini bilmediği için ikinci kez tıklıyordu. "Sayfalar arası
 * yavaşlık" şikâyeti ölçümde buraya çıktı — sunucunun kendisi 12-80 ms'de
 * cevap veriyor.
 *
 * loading.tsx ile iskelet göstermek denendi ve ÖLÇÜMLE reddedildi: iskelet
 * hemen çıkıyor ama gerçek içerik 230 ms yerine ~830 ms'de geliyordu
 * (React iskeletin titremesini önlemek için geçişi bekletiyor). Bu çizgi
 * içeriği hiç geciktirmiyor.
 */
function GezinmeCizgisi() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      data-test="gezinme-beklemede"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-sky-400"
    />
  );
}

/**
 * Uygulama içi bağlantı: `next/link` ama önden getirme (prefetch) kapalı ve
 * tıklandığında bekleme çizgisi gösteriyor.
 *
 * Prefetch neden kapalı: bu uygulamanın bütün sayfaları dinamik üretiliyor
 * (her istek oturum çerezini okuyor) ve yükleme sınırı (loading.tsx) yok.
 * Next bu durumda önden getirme isteğine neredeyse boş gövde dönüyor —
 * ölçüldü: ~280 bayt, tıklamayı hiç hızlandırmıyor. Buna karşılık ekranda
 * görünen HER bağlantı için bir istek açıyordu: 50 satırlık cihaz listesinde
 * sayfa başına 44 boşa giden istek, her biri sunucuda oturum okuması + sorgu.
 *
 * Kapatmanın gezinme süresine etkisi ölçüldü: 200 ms gecikmeli bağlantıda
 * fark gürültü düzeyinde (328→325, 331→332 ms), istek sayısı ise cihaz
 * listesinde 44'ten 0'a indi.
 *
 * Ortak bileşen olmasının sebebi: her çağrı yerine `prefetch={false}` yazmak
 * 80 yerde tekrar demek ve yeni eklenen bağlantıda unutulur. Gerekirse
 * çağıran taraf `prefetch` vererek ezebilir.
 */
export function Link({ children, ...kalan }: ComponentProps<typeof NextLink>) {
  return (
    <NextLink prefetch={false} {...kalan}>
      {children}
      <GezinmeCizgisi />
    </NextLink>
  );
}
