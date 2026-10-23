/**
 * Bir sayımın hangi mağazaları kapsadığı.
 *
 * Aynı dükkânda duran kasa ve depo kayıtları fiziken iç içe: raftaki cihazın
 * hangi kayıtta olduğu sayım anında bilinmiyor. İkisini ayrı saymak, her
 * sayımda diğerinin cihazlarını "fazla" göstermek demekti — sayım sonucu
 * gerçeği değil kayıt bölünmesini raporluyordu. Bu yüzden bir sayım birden çok
 * mağazayı kapsayabiliyor.
 *
 * Burada veritabanı yok: seçim denetimi ve etiketler saf, böylece ekran ile
 * sunucu aynı kuralı kullanıyor.
 */

/** Tek sayımda kapsanabilecek en çok mağaza; kazara "hepsini seç" olmasın. */
export const EN_COK_MAGAZA = 10;

export type SecilebilirMagaza = {
  id: number;
  ad: string;
  aktif: boolean;
  /** Bu mağazayı kapsayan, devam eden bir sayım var mı? */
  acikSayimVar: boolean;
};

/**
 * Seçim geçerli mi? Geçerliyse null, değilse kullanıcıya gösterilecek mesaj.
 *
 * Açık sayımı olan mağaza ikinci kez sayıma giremiyor: aynı cihaz iki sayımda
 * birden beklenirse ikisinin de sonucu yanlış çıkar.
 */
export function kapsamSorunu(
  secilenIdler: number[],
  magazalar: SecilebilirMagaza[],
): string | null {
  const benzersiz = [...new Set(secilenIdler)];
  if (benzersiz.length === 0) return "En az bir mağaza seçin.";
  if (benzersiz.length > EN_COK_MAGAZA) {
    return `Tek sayımda en çok ${EN_COK_MAGAZA} mağaza sayılabilir.`;
  }

  for (const id of benzersiz) {
    const magaza = magazalar.find((m) => m.id === id);
    if (!magaza) return "Seçilen mağaza bulunamadı.";
    if (!magaza.aktif) return `${magaza.ad} pasif durumda, sayıma giremez.`;
    if (magaza.acikSayimVar) return `${magaza.ad} için devam eden bir sayım zaten var.`;
  }

  return null;
}

/** Seçimi tekilleştirip sıralar; sunucuya giden liste bu. */
export function kapsamiDuzenle(secilenIdler: number[]): number[] {
  return [...new Set(secilenIdler.filter((id) => Number.isInteger(id) && id > 0))].sort(
    (a, b) => a - b,
  );
}

/**
 * Sayımın başlığında ve listesinde görünen mağaza adı.
 *
 * Tek mağazada sade ad; birden çoğunda hepsi yazılıyor. "+2 mağaza" gibi
 * kısaltma kullanılmıyor: sayım sonucunu okuyan kişi hangi kayıtların dahil
 * olduğunu görmeden eksik/fazla rakamını yorumlayamaz.
 */
export function kapsamEtiketi(adlar: string[]): string {
  if (adlar.length === 0) return "—";
  return adlar.join(" + ");
}

/** Kapsamda kaç mağaza olduğunu anlatan kısa not; tek mağazada boş. */
export function kapsamNotu(adlar: string[]): string {
  if (adlar.length <= 1) return "";
  return `${adlar.length} mağaza birlikte sayılıyor; aralarındaki cihazlar "fazla" sayılmaz.`;
}

/**
 * Cihazın kayıtlı olduğu mağaza sayımın kapsamında mı?
 *
 * Kapsam içindeki bir cihaz "başka mağazada" değildir — birlikte saymanın
 * bütün amacı bu.
 */
export function kapsamdaMi(kapsamIdleri: number[], magazaId: number): boolean {
  return kapsamIdleri.includes(magazaId);
}
