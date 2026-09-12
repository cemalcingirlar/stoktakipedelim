# Stok Takip Programı — Yol Haritası

Ayrıntılı gereksinimler: [SPEC.md](SPEC.md)

## Teknoloji
- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma + SQLite (merkezi sunucuda tek dosya; büyürse PostgreSQL)
- Auth: session tabanlı, şifre hash argon2
- Excel: `exceljs` · Yedek: `googleapis` (Drive, servis hesabı)

## Faz 1 — Temel (çekirdek stok) ✅ tamamlandı
1. [x] Proje iskeleti: Next.js + TS + Tailwind, ESLint/Prettier
2. [x] Prisma + SQLite kurulumu
3. [x] Şema: Magaza, Kullanici, Rol, Kategori, AltKategori, Tedarikci, Musteri,
       AlisFaturasi, StokKalemi, StokHareketi, Transfer, TransferKalemi,
       Sayim, SayimKalemi, Log, Ayar
4. [x] Migration + seed: 3 mağaza, admin + mağaza kullanıcıları, kategori/alt kategori ağacı
5. [x] Kimlik doğrulama: giriş ekranı, session, çıkış, route koruması
6. [x] Rol/yetki katmanı (server-side kontrol + menü gizleme)
7. [x] Ortak UI: üst menü (Panel/Cihazlar/Stok/Rapor/Ayarlar), tablo, form, toast, onay diyaloğu

## Faz 2 — Cihaz / Stok Yönetimi ✅ tamamlandı
8. [x] Kategori + alt kategori yönetimi
9. [x] Tedarikçi yönetimi
10. [x] Alış faturası ekranı (sadece admin): fatura başlığı + vade seçimi (yok/21/45)
11. [x] Fatura satırı ekleme: barkod/IMEI okutma, IMEI tekillik kontrolü
12. [x] Kaydetmede stok kalemlerinin transaction içinde oluşturulması
13. [x] Cihaz listesi: durum/depo/kategori/tarih/vade filtreleri, sayfalama, sıralama
14. [x] Vade renklendirme (geçmiş → kırmızı, 7 gün kala → sarı)
15. [x] Üst şerit: cihaz adedi + toplam stok değeri + mağaza bazlı değer
16. [x] Arama kutusu: model/IMEI/barkod/satıcı/müşteri/not; tam IMEI eşleşmesinde detaya yönlendirme
17. [x] Cihaz detay sayfası + hareket/sevkiyat tarihçesi zaman çizelgesi

## Faz 3 — Transfer ve Satış
18. [ ] Transfer oluşturma (gönderen): ürün okutma, hedef mağaza, gönder
19. [ ] Transfer kabul ekranı (kabul eden): ürün okutarak doğrulama, kabul / kısmi kabul / red
20. [ ] Transfer durum takibi ve bekleyen sevkiyat bildirimi
21. [ ] Satış ekranı: barkod/IMEI okut, fiyat, müşteri bilgileri, ödeme tipi
22. [ ] Müşteri kayıt/arama ekranı
23. [ ] Kâr hesabı ve satış kaydı

## Faz 4 — Sayım
24. [ ] Mağaza bazlı sayım başlatma (sadece o mağazanın stoğu)
25. [ ] Okutma ekranı: "Stokta bulundu" / başka mağazada / kayıtsız / tekrar okutma uyarıları
26. [ ] Canlı sayaç: okutulan / toplam / okutulmayan / fazla
27. [ ] Sayım kapatma + sonuç raporu (eksik, fazla, sayılan) + Excel
28. [ ] Sayım geçmişi

## Faz 5 — Rapor, Excel, Log
29. [ ] Sütun seçici ("Sütunlar" menüsü), seçim kullanıcı bazında kalıcı
30. [ ] Excel'e aktar: aktif filtre + seçili sütunlar
31. [ ] Raporlar: mağaza stok, vade, giriş-çıkış, satış/kâr, transfer, sayım
32. [ ] Log kaydı (tüm kritik işlemler) + log görüntüleme ekranı (admin)
33. [~] Panel (dashboard): ilk sürüm hazır — mağaza kartları, vadesi geçen sayısı, bekleyen sevkiyat, son hareketler, grafik

## Faz 6 — Yedekleme ve Dağıtım
34. [ ] Google Drive servis hesabı entegrasyonu
35. [ ] Günlük otomatik yedek (zip + yükleme + rotasyon)
36. [ ] "Şimdi yedekle" butonu, son yedek durumu, hata uyarısı
37. [ ] Testler: IMEI tekillik, transfer kabul akışı, vade hesabı, sayım farkları, yetki kontrolleri
38. [ ] README, kurulum ve sunucu dağıtım dokümanı
