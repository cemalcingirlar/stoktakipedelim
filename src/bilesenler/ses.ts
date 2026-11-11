/**
 * Okutma sesi — tarayıcıda konuşma.
 *
 * Konuşma sentezi (Web Speech) her cihazda aynı değil: Türkçe ses yüklü
 * olmayabilir, iOS ilk konuşmayı kullanıcı hareketine bağlıyor, bazı
 * tarayıcılarda hiç yok. Bu yüzden her çağrı korumalı ve konuşma yoksa
 * yerine bip sesi çalınıyor — operatör sonucu yine de duyuyor.
 */
import { okutmaSesi, type OkutmaTuru } from "@/lib/sesliOkutma";

function sentez(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  const s = window.speechSynthesis;
  return s && typeof s.speak === "function" ? s : null;
}

/** Türkçe ses varsa onu seçer; yoksa tarayıcının öntanımlısı konuşur. */
function turkceSes(s: SpeechSynthesis): SpeechSynthesisVoice | null {
  try {
    const sesler = s.getVoices?.() ?? [];
    return sesler.find((v) => v.lang?.toLowerCase().startsWith("tr")) ?? null;
  } catch {
    return null;
  }
}

/**
 * iOS'ta ilk konuşma kullanıcı hareketi içinde başlamalı; okutma sonucu ise
 * sunucu cevabından sonra, yani hareketin dışında geliyor. Okutma anında boş
 * bir konuşma yollayıp motoru uyandırıyoruz.
 */
export function sesiHazirla(): void {
  const s = sentez();
  if (!s) return;
  try {
    if (s.speaking || s.pending) return;
    const bos = new SpeechSynthesisUtterance("");
    bos.volume = 0;
    s.speak(bos);
  } catch {
    // Ses hazırlanamadıysa okutma yine de çalışmalı.
  }
}

/**
 * Kısa bip: konuşma yoksa sonucu yine de duyurur.
 * Başarı tek ve tiz, hata iki kez ve pes — gürültüde ayırt edilebilsin.
 */
function bip(basariMi: boolean): void {
  try {
    const Ses =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ses) return;
    const baglam = new Ses();
    const calzaman = baglam.currentTime;
    const notalar = basariMi ? [[880, 0, 0.1]] : [[220, 0, 0.16], [220, 0.22, 0.16]];
    for (const [frekans, gecikme, sure] of notalar) {
      const osilator = baglam.createOscillator();
      const kazanc = baglam.createGain();
      osilator.frequency.value = frekans;
      kazanc.gain.value = 0.08;
      osilator.connect(kazanc).connect(baglam.destination);
      osilator.start(calzaman + gecikme);
      osilator.stop(calzaman + gecikme + sure);
    }
    setTimeout(() => baglam.close().catch(() => {}), 1200);
  } catch {
    // Ses çalınamıyorsa sessiz kalınıyor; okutma etkilenmiyor.
  }
}

/**
 * Okutma sonucunu seslendirir.
 *
 * Bekleyen konuşma iptal ediliyor: arka arkaya hızlı okutmada sesler
 * birikirse operatör üç cihaz önceki sonucu duyar.
 */
export function okutmayiSeslendir(tur: OkutmaTuru): void {
  const metin = okutmaSesi(tur);
  if (!metin) return;
  const basariMi = tur === "basari";
  const s = sentez();
  if (!s) {
    bip(basariMi);
    return;
  }
  try {
    s.cancel();
    const konusma = new SpeechSynthesisUtterance(metin);
    konusma.lang = "tr-TR";
    // Okutma hızlı ilerliyor; ses de peşinden yetişsin.
    konusma.rate = 1.15;
    const ses = turkceSes(s);
    if (ses) konusma.voice = ses;
    // Konuşma hiç başlamazsa (ses yüklü değil, sistem kapalı) bip'e düşülüyor.
    konusma.onerror = () => bip(basariMi);
    s.speak(konusma);
  } catch {
    bip(basariMi);
  }
}
