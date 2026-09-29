import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Geliştirmede sunucuya 127.0.0.1 / yerel ağ IP'si üzerinden erişildiğinde
  // HMR kaynaklarının engellenmemesi için.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    // Excel ile toplu stok yükleme dosyayı Server Action gövdesinde taşır;
    // varsayılan 1 MB sınırı birkaç bin satırlık dosyada yetmiyor.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
