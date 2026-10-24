/**
 * Fatura ve sevkiyat listelerinin arama/sayfalama kuralları.
 *
 * İki liste de "son 100 kayıt" gösteriyordu; arama ve sayfalama yoktu.
 * Ayda ~20 fatura giren bir dükkânda bu, beş aydan eski faturanın ekrandan
 * ERİŞİLEMEZ olması demek — kayıp değil ama bulunamaz, ki pratikte aynı şey.
 * Yavaşlık sorunu değil (100 bin cihazla ölçüldü: liste 340 ms); görünürlük
 * sorunu.
 */

export const SAYFA_BOYUTU = 50;

export type ListeFiltresi = {
  /** Fatura no / tedarikçi adı araması. */
  ara: string;
  /** Mağaza kısıtı; 0 ise tümü. */
  magazaId: number;
  sayfa: number;
};

function metin(deger: unknown): string {
  return typeof deger === "string" ? deger.trim() : "";
}

function sayi(deger: unknown): number {
  const n = Number(deger);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** URL parametrelerini filtreye çevirir. */
export function listeFiltresiniCoz(
  params: Record<string, string | string[] | undefined>,
): ListeFiltresi {
  const tek = (ad: string) => {
    const d = params[ad];
    return Array.isArray(d) ? d[0] : d;
  };
  return {
    ara: metin(tek("ara")).slice(0, 80),
    magazaId: sayi(tek("magaza")),
    sayfa: Math.max(1, sayi(tek("sayfa")) || 1),
  };
}

/** Kaç sayfa var? Boş listede de 1 sayfa görünür. */
export function toplamSayfa(toplam: number, boyut = SAYFA_BOYUTU): number {
  return Math.max(1, Math.ceil(toplam / boyut));
}

/** Sayfa numarası listenin dışına taşarsa son sayfaya çekilir. */
export function gecerliSayfa(
  sayfa: number,
  toplam: number,
  boyut = SAYFA_BOYUTU,
): number {
  return Math.min(Math.max(1, sayfa), toplamSayfa(toplam, boyut));
}

/** Prisma'nın `skip` değeri. */
export function atlanacak(sayfa: number, boyut = SAYFA_BOYUTU): number {
  return (Math.max(1, sayfa) - 1) * boyut;
}

/** Filtre özeti: "3 kayıt · 'vatan' araması" gibi. */
export function filtreOzeti(toplam: number, filtre: ListeFiltresi): string {
  const parcalar = [`${toplam.toLocaleString("tr-TR")} kayıt`];
  if (filtre.ara) parcalar.push(`"${filtre.ara}" araması`);
  return parcalar.join(" · ");
}
