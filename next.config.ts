import type { NextConfig } from "next";

/**
 * Güvenlik başlıkları.
 *
 * Hiç yoktu. Tarayıcıya "bu sayfayı çerçeveye alma, içerik türünü tahmin
 * etme, adresi yabancı sitelere sızdırma" demenin maliyeti sıfır; olmayınca
 * tıklama hırsızlığı (clickjacking) ve MIME tahmini saldırıları açık kalıyor.
 *
 * CSP'de 'unsafe-inline' script için açık: Next, sayfa durumunu satır içi
 * script'lerle aktarıyor ve nonce'a geçmek bütün sayfaları dinamik render'a
 * zorluyor. Satır içi script'ler bizim yazdığımız sabit kodlar; asıl kazanç
 * olan "dışarıdan kod yükleme" yolu default-src 'self' ile zaten kapalı.
 *
 * camera=(self): barkod okuma kamerayı kullanıyor, kapatılamaz.
 */
const GUVENLIK_BASLIKLARI = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=15552000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

/**
 * Sekme simgesi için önbellek.
 *
 * Next bu dosyayı "public, max-age=0, must-revalidate" ile ve doğrulayıcı
 * (ETag / Last-Modified) olmadan sunuyor. Sonuç ölçüldü: tarayıcı her sayfa
 * geçişinde 25 KB'lık simgeyi baştan indiriyordu — tünel üzerinden her
 * tıklamaya eklenen boş yük. Adres içerik özeti taşıdığı için
 * (/favicon.ico?favicon.<özet>.ico) simge değişince adres de değişir.
 *
 * Bir hafta: özetsiz /favicon.ico adresini de kapsıyor, logo değişirse o yol
 * da en geç bir haftada tazeleniyor.
 */
const SIMGE_ONBELLEGI = [
  { key: "Cache-Control", value: "public, max-age=604800" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:yol*", headers: GUVENLIK_BASLIKLARI },
      { source: "/favicon.ico", headers: SIMGE_ONBELLEGI },
    ];
  },
  // Geliştirmede sunucuya 127.0.0.1 / yerel ağ IP'si üzerinden erişildiğinde
  // HMR kaynaklarının engellenmemesi için.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // pdfjs kendi çalışan (worker) dosyasını çalışma anında yüklüyor; paketleyici
  // içine alınca bu yol bozuluyor. Node modülü olarak bırakılıyor.
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    // Excel ile toplu stok yükleme dosyayı Server Action gövdesinde taşır;
    // varsayılan 1 MB sınırı birkaç bin satırlık dosyada yetmiyor.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
