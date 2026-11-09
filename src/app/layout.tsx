import type { Metadata } from "next";
import "./globals.css";

// Yazı tipi (Inter) kendi sunucumuzdan: tanımı globals.css'te, dosyaları
// public/yazitipi altında. Eskiden next/font/google kullanılıyordu; o,
// DERLEME SIRASINDA Google'a bağlanıyor ve sunucuda o adrese çıkış olmadığı
// için güncelleme derlemede duruyordu.

export const metadata: Metadata = {
  title: "Stok Takip",
  description: "Çok şubeli operatör mağazası stok takip programı",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
