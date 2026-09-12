# Stok Takip Programı — Yapılacaklar Listesi

## ✅ Verilen Kararlar
- **Platform:** Web
- **Stack:** Next.js (App Router) + TypeScript + Prisma + SQLite + Tailwind CSS
- **MVP kapsamı:** Ürün + stok giriş/çıkış, barkod desteği, cari + fatura, raporlar + Excel çıktı

### Sıralı Görev Listesi (MVP)
1. [ ] Proje iskeleti: `create-next-app` (TS, Tailwind, App Router), ESLint/Prettier
2. [ ] Prisma kurulumu + SQLite bağlantısı
3. [ ] Şema: Urun, Kategori, Birim, Cari, Depo, StokHareketi, Fatura, FaturaSatiri, Kullanici, Ayar
4. [ ] İlk migration + seed script (demo kategori/ürün/cari)
5. [ ] Ortak UI: layout, sidebar menü, tablo bileşeni, form bileşenleri, toast
6. [ ] Kimlik doğrulama: giriş ekranı, şifre hash (argon2/bcrypt), session, route koruması
7. [ ] Kategori CRUD
8. [ ] Ürün CRUD + liste (arama, filtre, sayfalama) + kritik stok alanı
9. [ ] Barkod: ürün üzerinde unique barkod alanı, barkod ile hızlı arama input'u (okuyucu klavye emülasyonu + Enter)
10. [ ] Stok giriş ekranı (barkod okut → miktar → kaydet)
11. [ ] Stok çıkış ekranı (aynı akış, stok yeterlilik kontrolü)
12. [ ] Stok hareketleri listesi (tarih aralığı, ürün, tür filtresi)
13. [ ] Anlık stok hesaplama servisi (hareket toplamı) + ürün listesinde gösterim
14. [ ] Cari CRUD + cari ekstresi
15. [ ] Alış faturası: satır ekleme, KDV/iskonto/toplam hesabı, kayıtta otomatik stok girişi (transaction)
16. [ ] Satış faturası: aynı yapı, otomatik stok çıkışı
17. [ ] Fatura silme/iptal → stok hareketlerinin geri alınması
18. [ ] Raporlar: anlık stok, kritik stok, tarih aralıklı giriş-çıkış, cari bakiye
19. [ ] Excel dışa aktarma (exceljs) + yazdırma/PDF görünümü
20. [ ] Dashboard: toplam ürün, toplam stok değeri, kritik ürün sayısı, son hareketler, aylık grafik
21. [ ] Testler: stok bakiyesi, negatif stok kontrolü, fatura toplamları, fatura iptali
22. [ ] README (kurulum, `npm run dev`, seed, yedekleme) + deploy notları

## 0. Açık Kalan Kapsam Soruları
- [ ] Tek kullanıcı mı, çok kullanıcı mı (yetkilendirme gerekir mi)?
- [ ] Çoklu depo/şube desteği olacak mı?
- [ ] Barkod okuyucu ve yazıcı (etiket/fiş) kullanılacak mı?
- [ ] KDV, para birimi, e-Fatura/e-Arşiv entegrasyonu gerekli mi?

## 1. Veri Modeli
- [ ] `urunler` — kod, barkod, ad, kategori, birim (adet/kg/lt), alış fiyatı, satış fiyatı, KDV oranı, kritik stok seviyesi, aktif/pasif
- [ ] `kategoriler` — ad, üst kategori (hiyerarşi)
- [ ] `birimler` — adet, kutu, koli, kg… + çevrim katsayıları
- [ ] `cariler` — müşteri/tedarikçi, unvan, vergi no, telefon, adres, bakiye
- [ ] `depolar` — depo/şube tanımı
- [ ] `stok_hareketleri` — giriş / çıkış / transfer / sayım düzeltme, miktar, birim fiyat, tarih, belge no, açıklama, kullanıcı
- [ ] `alis_faturalari` / `satis_faturalari` + satır tabloları
- [ ] `kullanicilar` ve `roller` (admin, depo, satış, sadece görüntüleme)
- [ ] `ayarlar` — firma bilgileri, varsayılan KDV, para birimi
- [ ] `log/audit` — kim ne zaman neyi değiştirdi

**Kural:** Stok miktarı ürün tablosunda tutulmaz; her zaman `stok_hareketleri` toplamından hesaplanır (veya hareketle senkron güncellenen bir bakiye alanı + tutarlılık kontrolü).

## 2. Temel Ekranlar / Modüller
### Ürün Yönetimi
- [ ] Ürün listesi: arama (ad/kod/barkod), filtre (kategori, aktif, kritik stok), sayfalama, sıralama
- [ ] Ürün ekle / düzenle / pasife al (silme yerine soft delete)
- [ ] Barkod ile hızlı ürün bulma
- [ ] Ürün resmi yükleme (opsiyonel)
- [ ] Toplu içe aktarma (Excel/CSV)

### Stok Hareketleri
- [ ] Stok girişi (alım) ekranı
- [ ] Stok çıkışı (satış/fire/iade) ekranı
- [ ] Depolar arası transfer
- [ ] Sayım (fiili stok girip fark düzeltmesi otomatik oluşturma)
- [ ] Hareket geçmişi: tarih aralığı + ürün + tür filtreli liste
- [ ] Hareket iptal/düzeltme (iz bırakarak)

### Cari (Müşteri/Tedarikçi)
- [ ] Cari listesi, ekle/düzenle
- [ ] Cari ekstresi ve bakiye takibi
- [ ] Tahsilat / ödeme kaydı

### Fatura / Fiş
- [ ] Alış faturası (girişi otomatik stok hareketine dönüştürür)
- [ ] Satış faturası / fişi (çıkışı otomatik stok hareketine dönüştürür)
- [ ] Satır bazlı iskonto, KDV, ara toplam/genel toplam hesaplama
- [ ] Yazdırma / PDF çıktısı

### Raporlar
- [ ] Anlık stok durumu (depo bazlı)
- [ ] Kritik stok / stok altı ürünler uyarı raporu
- [ ] Tarih aralıklı giriş–çıkış raporu
- [ ] En çok satan / en az hareket gören ürünler
- [ ] Kâr-zarar (alış–satış farkı)
- [ ] Cari bakiye raporu
- [ ] Tüm raporlarda Excel / PDF dışa aktarma

### Dashboard (Ana Ekran)
- [ ] Toplam ürün sayısı, toplam stok değeri
- [ ] Kritik seviyenin altındaki ürün sayısı
- [ ] Günlük/aylık giriş–çıkış özeti (grafik)
- [ ] Son hareketler listesi

## 3. Kullanıcı ve Güvenlik
- [ ] Giriş ekranı (kullanıcı adı + şifre)
- [ ] Şifre hash'leme (bcrypt/argon2 — düz metin asla)
- [ ] Rol bazlı yetki kontrolü (menü ve işlem seviyesinde)
- [ ] Oturum yönetimi / otomatik çıkış
- [ ] İşlem logları

## 4. Teknik Altyapı
- [ ] Teknoloji seçimi (aşağıdaki öneriye bak)
- [ ] Proje iskeleti, klasör yapısı, kod standardı (lint/format)
- [ ] Veritabanı şeması + migration'lar
- [ ] Seed/demo veri scripti
- [ ] Hata yönetimi ve kullanıcıya anlamlı mesajlar
- [ ] Yedekleme / geri yükleme (DB dosyası veya dump)
- [ ] Testler: stok bakiyesi hesaplama, negatif stok kontrolü, fatura toplamları
- [ ] README + kurulum talimatları
- [ ] Dağıtım (masaüstü için kurulum paketi / web için deploy)

### Önerilen Teknoloji (web)
- Backend: Node.js + TypeScript + Express veya Next.js API routes
- Veritabanı: SQLite (tek kullanıcı/küçük ölçek) → PostgreSQL (çok kullanıcı)
- ORM: Prisma
- Frontend: Next.js + React + Tailwind CSS
- Kimlik: NextAuth veya kendi JWT/session yapımız

### Alternatif (masaüstü)
- C# WinForms/WPF + SQLite veya SQL Server (videolardaki en yaygın yaklaşım)
- Python + PyQt/Tkinter + SQLite
- Electron (web bilgisi tekrar kullanılır, tek exe çıkar)

## 5. Aşamalandırma
### MVP (ilk sürüm)
1. Veritabanı şeması + proje iskeleti
2. Kullanıcı girişi
3. Ürün CRUD + kategori
4. Stok giriş/çıkış + anlık stok hesabı
5. Basit stok listesi raporu
6. Dashboard özet kartları

### v1
7. Cari yönetimi
8. Alış/satış faturası
9. Barkod desteği
10. Raporlar + Excel/PDF çıktı
11. Kritik stok uyarıları

### v2
12. Çoklu depo + transfer
13. Sayım modülü
14. Rol/yetki detaylandırma
15. Yedekleme, log ekranı
16. Mobil uyumluluk / mobil uygulama

## 6. İş Kuralları (unutulmaması gerekenler)
- [ ] Negatif stoğa izin verilecek mi? (ayar olarak sunulmalı)
- [ ] Maliyet yöntemi: ortalama maliyet mi, FIFO mu?
- [ ] Aynı barkod iki üründe olamaz (unique kısıt)
- [ ] Fatura silinince stok hareketi de geri alınmalı (transaction içinde)
- [ ] Para ve miktar alanlarında float yerine decimal kullanılmalı
