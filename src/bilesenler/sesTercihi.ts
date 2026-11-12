/**
 * Okutma sesi tercihi: tarayıcıda saklanan tek bir açık/kapalı değeri.
 *
 * Tercih bileşen durumu olarak tutulup localStorage bir effect içinde
 * okunmuyor: sunucuda localStorage yok, ilk çizim öntanımlıyla yapılıyor ve
 * effect içinden setState etmek React'in kaçındığı zincirleme çizime yol
 * açıyor (react-hooks/set-state-in-effect). Bunun yerine değer dış kaynak
 * sayılıyor ve useSyncExternalStore ile okunuyor: sunucuda öntanımlı,
 * tarayıcıda saklanan değer, başka sekmede değişirse de güncel.
 */
import {
  SES_TERCIHI_ANAHTARI,
  sesAcikMi,
  sesTercihiYaz,
} from "@/lib/sesliOkutma";

const dinleyiciler = new Set<() => void>();

/** Aynı sekmedeki değişiklikleri ve diğer sekmelerin yazdığını dinler. */
export function sesTercihiniIzle(bildir: () => void): () => void {
  dinleyiciler.add(bildir);
  window.addEventListener("storage", bildir);
  return () => {
    dinleyiciler.delete(bildir);
    window.removeEventListener("storage", bildir);
  };
}

/** Tarayıcıdaki tercih; gizli kipte okunamazsa öntanımlı açık. */
export function sesAcikOku(): boolean {
  try {
    return sesAcikMi(window.localStorage.getItem(SES_TERCIHI_ANAHTARI));
  } catch {
    return true;
  }
}

/** Sunucuda localStorage yok: ilk çizim sesi açık varsayıyor. */
export function sesAcikSunucuda(): boolean {
  return true;
}

/** Tercihi saklar ve bu sekmedeki dinleyicileri uyandırır. */
export function sesTercihiniKaydet(acik: boolean): void {
  try {
    window.localStorage.setItem(SES_TERCIHI_ANAHTARI, sesTercihiYaz(acik));
  } catch {
    // Saklanamıyorsa tercih yalnız bu ekran için geçerli.
  }
  for (const bildir of [...dinleyiciler]) bildir();
}
