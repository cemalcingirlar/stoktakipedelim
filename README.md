# Stok Takip

Çok şubeli operatör mağazası için barkod ve seri numarası (IMEI) bazlı stok takip programı.
Tarayıcı üzerinden çalışır, kendi sunucunuzda barındırılır.

- Ayrıntılı gereksinimler: [SPEC.md](SPEC.md)
- Yol haritası ve ilerleme: [PLAN.md](PLAN.md)

## Teknoloji

| Katman | Seçim |
|---|---|
| Uygulama | Next.js 16 (App Router) + TypeScript |
| Arayüz | Tailwind CSS 4 |
| Veritabanı | SQLite + Prisma 7 (`@prisma/adapter-better-sqlite3`) |
| Oturum | HttpOnly çerezde imzalı JWT (`jose`) |
| Şifre | Node `crypto.scrypt` — harici bağımlılık yok, VPS'te derleme sorunu çıkarmaz |
| Excel | `exceljs` |

Para birimi alanları **kuruş cinsinden tam sayı** olarak saklanır; kayan nokta yuvarlama
hatası oluşmaz. Biçimlendirme `src/lib/para.ts` içindedir.

## Geliştirme ortamı

```bash
npm install
cp .env.example .env          # DATABASE_URL ve OTURUM_SIFRESI değerlerini doldurun
npm run db:migrate            # şemayı uygula
npm run db:seed               # 3 mağaza, kullanıcılar, kategoriler
npm run dev                   # http://localhost:3000
```

### Başlangıç kullanıcıları

Seed betiği başlangıç için 3 mağaza kurar; yönetici **Ayarlar > Mağazalar**
ekranından istediği kadar şube ekleyebilir. Seed aşağıdaki hesapları oluşturur. Varsayılan şifre `Stok2026!`
(`SEED_SIFRE` ortam değişkeni ile değiştirilebilir). **Canlıya almadan önce hepsini değiştirin.**

| Kullanıcı adı | Rol | Mağaza |
|---|---|---|
| `admin` | Yönetici | tümü |
| `sorumlu1` / `personel1` | Mağaza Sorumlusu / Personeli | 1 Nolu Mağaza |
| `sorumlu2` / `personel2` | Mağaza Sorumlusu / Personeli | 2 Nolu Mağaza |
| `sorumlu3` / `personel3` | Mağaza Sorumlusu / Personeli | 3 Nolu Mağaza |

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Üretim derlemesi |
| `npm start` | Üretim sunucusu |
| `npm run typecheck` | TypeScript denetimi |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Yeni migration üret ve uygula (geliştirme) |
| `npm run db:deploy` | Bekleyen migration'ları uygula (üretim) |
| `npm run db:seed` | Başlangıç verisi |
| `npm run db:studio` | Prisma Studio ile veriyi görüntüle |

## Testler

Birim testleri (para ayrıştırma, vade kuralları, arama normalleştirme):

```bash
npm test
```

Tarayıcı testleri — çalışan bir `npm run dev` gerektirir:

```bash
node betikler/dogrula.mjs           # giriş, yetki, panel
node betikler/faz2-dogrula.mjs      # fatura girişi, cihaz listesi, filtre, IMEI arama
node betikler/ayarlar-dogrula.mjs   # kategori ve tedarikçi yönetimi
node betikler/magaza-dogrula.mjs    # mağaza ekleme, düzenleme, silme korumaları
node betikler/faz3-dogrula.mjs      # çift onaylı sevkiyat, kısmi kabul, red, satış
```

`@playwright/test` kurulu olmalıdır. Tarayıcı ikilisi farklı bir yerdeyse
`CHROME_YOLU` ortam değişkeni ile yolunu verin.

## VPS kurulumu

1. Node.js 20.9+ kurun.
2. Depoyu sunucuya klonlayın, `npm ci` çalıştırın.
3. `.env` dosyasını oluşturun:
   - `DATABASE_URL="file:/var/lib/stok/stok.db"` — kalıcı bir dizin verin
   - `OTURUM_SIFRESI` — `openssl rand -base64 48` çıktısı
4. `npm run db:deploy && npm run build`
5. `npm start` komutunu systemd servisi olarak tanımlayın.
6. Önüne Nginx/Caddy koyup HTTPS sertifikası alın (mağazalar dışarıdan bağlanacak).

> SQLite dosyası tek dosyadır; Google Drive yedeklemesi (Faz 6) bu dosyayı yedekler.
> Kullanıcı sayısı büyürse PostgreSQL'e geçiş Prisma şeması korunarak yapılabilir.

## Proje yapısı

```
prisma/schema.prisma      Veritabanı şeması
prisma/seed.ts            Başlangıç verisi
src/lib/                  Sabitler, oturum, yetki, para, tarih, vade, log yardımcıları
src/bilesenler/           Paylaşılan arayüz bileşenleri
src/app/giris/            Giriş ekranı ve oturum eylemleri
src/app/(uygulama)/       Oturum gerektiren sayfalar (panel, cihazlar, satış, sevkiyat,
                          müşteriler, sayım, rapor, faturalar, ayarlar)
proxy.ts                  Oturum çerezi olmayan istekleri giriş ekranına yönlendirir
betikler/dogrula.mjs      Tarayıcı duman testi
```
