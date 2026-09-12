# Çok Şubeli Operatör Mağazası — Stok Takip Programı / Şartname

## 1. Genel Yapı
- 3 mağaza (şube) + isteğe bağlı merkez depo. Her stok kaydı her an tek bir depoda bulunur.
- **Her fiziksel ürün = tek satır.** Adet mantığı yok; 5 adet aynı kılıf alındıysa 5 kayıt oluşur.
  Böylece seri no / IMEI, alış fiyatı, vade ve sevkiyat geçmişi ürün başına tutulabilir.
- Seri numarası (IMEI) telefon/tablet için **zorunlu ve tekil**, aksesuar için opsiyonel.
- Barkod alanı her üründe bulunur; barkod okuyucu klavye emülasyonu ile çalışır (okut → Enter).

## 2. Kategori Yapısı
| Kategori | Alt Kategoriler |
|---|---|
| Cep Telefonu | Sıfır, İkinci El |
| Aksesuar | Kulaklık, Saat, Güç Grubu, Kılıf, Kablo/Şarj |
| Tablet / Notebook | Tablet, Notebook |
| İkinci El Telefon | (alt kategori opsiyonel) |

Kategori ve alt kategoriler yönetim ekranından düzenlenebilir (sabit kodlanmaz).

## 3. Ürün Kaydı (Stok Kalemi) Alanları
- Barkod, Seri No / IMEI
- Kategori, Alt Kategori
- Marka, Model, Renk, Kapasite
- Alış faturası bağlantısı, Tedarikçi (satıcı), Alış fiyatı, Alış/giriş tarihi
- **Vade:** yok / 21 gün / 45 gün → vade tarihi = giriş tarihi + gün, ödendi/ödenmedi durumu
- Bulunduğu depo (mağaza)
- Durum: `STOKTA` | `TRANSFERDE` | `SATILDI` | `İADE` | `ARIZALI`
- Satış bilgileri: satış tarihi, satış fiyatı, kâr (otomatik), satan kullanıcı
- Müşteri bilgileri: ad soyad, telefon, TCKN/VKN, adres, not
- Genel not
- Çıkış (satış/transfer) tarihi

### Vade Renklendirme Kuralı
- Ödenmemiş ve vade tarihi **geçmiş** → satır **kırmızı**
- Ödenmemiş ve vadeye **7 gün veya az** kalmış → satır **sarı**
- Ödenmiş veya vadesiz → normal

## 4. Giriş (Alım) Akışı — Sadece Admin
1. Admin "Alış Faturası" oluşturur: tedarikçi, fatura no, fatura tarihi, vade seçimi (yok/21/45).
2. Fatura satırlarına ürünler eklenir; her satırda barkod/IMEI okutulur veya yazılır.
3. Kaydedildiğinde her satır için stok kalemi oluşur, hedef depoya `STOKTA` olarak düşer.
4. IMEI çakışması varsa kayıt reddedilir.

> **Yetki:** Stok girişi (ekleme) ve silme **yalnızca admin**tedir. Diğer kullanıcılar giremez, silemez.

## 5. Transfer (Sevkiyat) Akışı — Çift Onaylı
1. **Gönderen kullanıcı** (kendi mağazasından) ürünleri seçer/okutur, hedef mağazayı belirtir, sevkiyatı başlatır.
   → Ürün durumu `TRANSFERDE`, sevkiyat durumu `ONAY BEKLİYOR`.
2. **Kabul eden kullanıcı** (hedef mağaza) sevkiyatı açar, ürünleri tek tek okutarak kontrol eder.
   - Kabul → ürünler hedef depoya geçer, durum `STOKTA`.
   - Kısmi kabul → eksik ürünler `ONAY BEKLİYOR` olarak kalır, fark raporlanır.
   - Red → ürünler kaynak depoya döner, red nedeni kaydedilir.
3. Her adım için log: kim, ne zaman, hangi ürün, hangi depo.

## 6. Satış Akışı
- Mağaza kullanıcısı barkod/IMEI okutur → satış fiyatı, müşteri bilgileri, ödeme tipi girilir.
- Ürün `SATILDI` olur, çıkış tarihi ve satan kullanıcı kaydedilir, kâr hesaplanır.

## 7. Kullanıcılar ve Yetkiler
| Rol | Ürün Ekle | Sil | Transfer Gönder | Transfer Kabul | Satış | Rapor/Excel | Ayarlar |
|---|---|---|---|---|---|---|---|
| Admin | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Mağaza Sorumlusu | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✘ |
| Mağaza Personeli | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ (kendi mağazası) | ✘ |

- Her kullanıcı bir mağazaya bağlıdır; kendi mağazası dışındaki stoğu **görür ama işlem yapamaz**.
- Admin tüm mağazaları görür ve yönetir.

## 8. Ürün Detay Sayfası
- Künye bilgileri (kategori, marka/model, IMEI, barkod, alış/satış fiyatı, vade durumu)
- **Sevkiyat/hareket tarihçesi:** giriş → transferler (gönderen/kabul eden, tarih) → satış, zaman çizelgesi halinde
- İşlem logları (kim ne zaman neyi değiştirdi)
- Müşteri bilgileri (satıldıysa)

## 9. Listeleme, Filtre ve Arama
- **Durum filtresi:** Tümü / Stokta / Transferde / Satıldı
- **Depo filtresi:** Tümü / Mağaza 1 / Mağaza 2 / Mağaza 3
- **Kategori + alt kategori filtresi**
- **Tarih filtreleri:** alış (başlangıç–bitiş), satış (başlangıç–bitiş)
- **Vade filtresi:** vadesi geçenler / yaklaşanlar
- **Arama kutusu:** model, IMEI/seri no, barkod, satıcı, müşteri, not içinde arar.
  Tam eşleşen bir IMEI/barkod girilirse **doğrudan o ürünün detay sayfasına yönlendirir**.
- Üst bilgi şeridi: listelenen cihaz adedi + toplam stok değeri (TL), mağaza bazlı stok değeri.

## 10. Excel Dışa Aktarma
- "Sütunlar" menüsünden gösterilecek/gizlenecek sütunlar seçilir; seçim kullanıcı bazında hatırlanır.
- "Excel'e Aktar" **o anki filtre ve seçili sütunlarla** dosya üretir.
- Sayım raporu ayrıca dışa aktarılabilir.

## 11. Stok Sayımı Modülü
- Sayım **mağaza bazında bağımsız** başlatılır; sadece o mağazadaki `STOKTA` ürünler sayım listesine girer.
- Seri no / barkod okutuldukça:
  - Ürün o mağazada varsa → yeşil "**Stokta bulundu**" bildirimi, `SAYILDI` işaretlenir.
  - Ürün başka mağazadaysa → turuncu uyarı, hangi mağazada olduğu yazılır.
  - Sistemde yoksa → kırmızı "Kayıtsız ürün", fazla listesine eklenir.
  - Aynı ürün ikinci kez okutulursa uyarı verilir, tekrar sayılmaz.
- Ekranın üstünde canlı sayaç: **Okutulan: X / Toplam: Y — Okutulmayan: Z — Fazla: F**
- Sayım kapatıldığında rapor: sayılanlar, eksikler (kayıp), fazlalar → Excel çıktısı.
- Sayım kaydı geçmişte saklanır (kim, ne zaman, hangi mağaza, sonuç).

## 12. Raporlar
- Mağaza bazlı anlık stok ve stok değeri
- Vadesi geçen / yaklaşan stok
- Tarih aralıklı giriş–çıkış
- Satış ve kâr raporu (mağaza / kullanıcı / kategori kırılımı)
- Transfer raporu (bekleyen, kabul edilen, reddedilen)
- Sayım raporları
- Hepsi Excel'e aktarılabilir.

## 13. Loglama
Şu işlemler kullanıcı + zaman damgasıyla loglanır: giriş/çıkış (login), ürün ekleme, silme, düzenleme,
transfer gönderme, transfer kabul/red, satış, sayım başlatma/kapatma, ayar değişikliği, Excel dışa aktarma.

## 14. Yedekleme — Google Drive
- Günlük otomatik yedek: veritabanı dosyası (+ varsa yüklenen dosyalar) sıkıştırılıp Google Drive'a yüklenir.
- Google Cloud'da **servis hesabı** oluşturulur, hedef Drive klasörü bu hesapla paylaşılır.
- Yedek dosya adı: `stok-yedek-YYYYAAGG-SSDD.zip`; son N yedek tutulur, eskiler silinir (rotasyon).
- Panelde "Şimdi yedekle" butonu ve son yedek zamanı/durumu gösterilir; başarısız yedek uyarı üretir.

## 15. Açık Konular / Varsayımlar
1. **Kurulum yeri:** 3 mağazanın aynı veriyi görmesi için merkezi bir sunucu gerekir.
   Varsayım: kendi VPS/sunucunuzda çalışır, veritabanı SQLite dosyası (Drive yedeği bu dosyayı alır).
   Kullanıcı sayısı artarsa PostgreSQL'e geçilir.
2. **Vade kime ait:** tedarikçiye ödeme vadesi olarak modellendi (alış faturası bazlı).
3. Aksesuarlarda IMEI yok; barkod + otomatik üretilen iç takip numarası kullanılır.
4. Negatif stok mümkün değil (her kayıt tekil fiziksel ürün).
5. Maliyet: her ürünün kendi alış fiyatı tutulduğu için ortalama/FIFO sorunu yoktur.
