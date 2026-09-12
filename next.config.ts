import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Geliştirmede sunucuya 127.0.0.1 / yerel ağ IP'si üzerinden erişildiğinde
  // HMR kaynaklarının engellenmemesi için.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  /* config options here */
};

export default nextConfig;
