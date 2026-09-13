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
| Excel | `exceljs` (`src/lib/excel.ts`) |
| Yedekleme | Google Drive (`googleapis`), gzip'lenmiş SQLite anlık görüntüsü |

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
| `npm run yedek` | Elle yedek al ve Google Drive'a yükle |
| `npm run drive:jeton` | Google Drive yenileme jetonu al (bir kez) |

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
node betikler/faz4-dogrula.mjs      # mağaza bazlı sayım, eksik/fazla tespiti, Excel raporu
node betikler/faz5-dogrula.mjs      # sütun seçici, Excel çıktıları, raporlar, loglar, kullanıcılar
node betikler/faz6-dogrula.mjs      # yedekleme ekranı, yetki ve cron ucu
```

`@playwright/test` kurulu olmalıdır. Tarayıcı ikilisi farklı bir yerdeyse
`CHROME_YOLU` ortam değişkeni ile yolunu verin.

## Nerede çalıştırmalı?

| Seçenek | Uygun olduğu durum |
|---|---|
| **İş yerindeki bir PC** | Aylık ücret ödemek istemiyorsanız, veriler fiziksel olarak yanınızda kalsın istiyorsanız. Adım adım rehber: [docs/ofis-pc-kurulumu.md](docs/ofis-pc-kurulumu.md) |
| **VPS** | Elektrik/internet kesintisinden etkilenmemek, bakımı sağlayıcıya bırakmak istiyorsanız. Aşağıdaki adımlar. |

Her iki durumda da veritabanı tek bir SQLite dosyasıdır ve Google Drive yedeği
sayesinde iki seçenek arasında geçiş yarım saatlik iştir.

## VPS kurulumu

Uygulama tek bir Node.js süreci olarak çalışır ve veritabanı tek bir SQLite
dosyasıdır. Üç mağazanın aynı veriyi görmesi için merkezi, sürekli açık bir
sunucu gerekir.

### 1. Sistem hazırlığı

```bash
# Node.js 20.9+ (örnek: Ubuntu 24.04)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Uygulama kullanıcısı ve dizinler
sudo useradd --system --create-home --home-dir /opt/stok stok
sudo mkdir -p /var/lib/stok
sudo chown stok:stok /var/lib/stok
```

### 2. Kod ve bağımlılıklar

```bash
sudo -u stok git clone https://github.com/cemalcingirlar/stoktakipedelim.git /opt/stok/app
cd /opt/stok/app
sudo -u stok npm ci
```

### 3. Ortam değişkenleri

`/opt/stok/app/.env` dosyasını oluşturun (`.env.example` dosyasını örnek alın):

```bash
DATABASE_URL="file:/var/lib/stok/stok.db"
OTURUM_SIFRESI="$(openssl rand -base64 48)"
YEDEK_ANAHTARI="$(openssl rand -hex 24)"
```

> `.env` dosyasının izinlerini kısıtlayın: `sudo chmod 600 .env && sudo chown stok:stok .env`

### 4. Veritabanı ve derleme

```bash
sudo -u stok npm run db:deploy    # şemayı uygula
sudo -u stok npm run db:seed      # ilk kurulumda: mağazalar, kullanıcılar, kategoriler
sudo -u stok npm run build
```

**Seed sonrası ilk iş:** `admin` ile girip Ayarlar → Kullanıcılar ekranından
tüm varsayılan şifreleri değiştirin.

### 5. systemd servisi

`/etc/systemd/system/stok.service`:

```ini
[Unit]
Description=Stok Takip
After=network.target

[Service]
Type=simple
User=stok
WorkingDirectory=/opt/stok/app
EnvironmentFile=/opt/stok/app/.env
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

# Sıkılaştırma
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/stok /opt/stok/app/.next

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now stok
sudo systemctl status stok
```

### 6. HTTPS (Caddy ile)

Mağazalar dışarıdan bağlanacağı için HTTPS şart. `/etc/caddy/Caddyfile`:

```
stok.sirketiniz.com {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy sertifikayı otomatik alır ve yeniler. Nginx tercih ederseniz
`proxy_pass http://127.0.0.1:3000;` ile aynı sonucu alır, sertifika için
`certbot` kullanın.

Uygulama sunucusunun doğrudan internete açılmaması için 3000 portunu kapatın:

```bash
sudo ufw allow 80,443/tcp
sudo ufw deny 3000/tcp
sudo ufw enable
```

### 7. Otomatik yedekleme

Yedekleme Google Drive'a yapılır. Kurulum adımları uygulama içinde
**Ayarlar → Yedekleme** ekranında da yazılıdır.

```bash
# Yenileme jetonunu alın (bir kez)
GOOGLE_ISTEMCI_ID=... GOOGLE_ISTEMCI_SIRRI=... npm run drive:jeton
```

Çıkan değerleri `.env` dosyasına ekleyip servisi yeniden başlatın, sonra cron
görevini kurun:

```bash
sudo crontab -e
```

```cron
0 3 * * * curl -fsS -X POST -H "X-Yedek-Anahtari: ANAHTARINIZ" \
  http://127.0.0.1:3000/api/yedek >> /var/log/stok-yedek.log 2>&1
```

Alternatif olarak uygulama sunucusundan bağımsız çalışan betik:

```cron
0 3 * * * cd /opt/stok/app && /usr/bin/npm run yedek >> /var/log/stok-yedek.log 2>&1
```

Yedekleme durumu, son yedek zamanı ve başarısız denemeler **Ayarlar →
Yedekleme** ekranında görünür. Son başarılı yedeğin üzerinden 48 saat geçerse
ekran uyarı verir.

### 8. Yedekten geri dönme

```bash
sudo systemctl stop stok
gunzip -c stok-yedek-20260913-0300.db.gz > /var/lib/stok/stok.db
sudo chown stok:stok /var/lib/stok/stok.db
sudo systemctl start stok
```

### 9. Güncelleme

```bash
cd /opt/stok/app
sudo -u stok git pull
sudo -u stok npm ci
sudo -u stok npm run db:deploy
sudo -u stok npm run build
sudo systemctl restart stok
```

> **Ölçek notu:** SQLite yazma işlemlerinde dosyayı kilitler. Üç mağaza ve
> günlük birkaç yüz işlem için fazlasıyla yeterlidir. Kullanıcı sayısı çok
> artarsa PostgreSQL'e geçiş Prisma şeması korunarak yapılabilir.

## Proje yapısı

```
prisma/schema.prisma      Veritabanı şeması
prisma/seed.ts            Başlangıç verisi
src/lib/                  Sabitler, oturum, yetki, para, tarih, vade, log, rapor,
                          Excel ve yedekleme yardımcıları
src/bilesenler/           Paylaşılan arayüz bileşenleri
src/app/giris/            Giriş ekranı ve oturum eylemleri
src/app/(uygulama)/       Oturum gerektiren sayfalar (panel, cihazlar, satış, sevkiyat,
                          müşteriler, sayım, rapor, faturalar, ayarlar)
proxy.ts                  Oturum çerezi olmayan istekleri giriş ekranına yönlendirir
src/app/api/yedek/        Cron'un çağırdığı yedekleme ucu (gizli anahtarla korunur)
betikler/                 Tarayıcı testleri, Drive jeton alma ve yedekleme betikleri
```
