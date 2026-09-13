# İş Yerindeki PC'yi Sunucu Yapma

Kullanılmayan bir masaüstü bilgisayarı, üç mağazanın da bağlanacağı sunucuya
dönüştürme rehberi. VPS kiralamaya alternatiftir; aylık ücret ödemezsiniz ve
veriler fiziksel olarak iş yerinizde kalır.

Kurulum yaklaşık **2–3 saat** sürer ve bir kez yapılır.

---

## Önce dürüst değerlendirme

Bu yöntem çalışır, ama VPS'ten farklı riskleri vardır. Kararınızı bilerek verin.

| Konu | İş yerindeki PC | VPS |
|---|---|---|
| Aylık ücret | Yok (sadece elektrik) | ~150–500 TL |
| Veri konumu | İş yerinizde, KVKK açısından en basit durum | Sağlayıcının veri merkezi |
| Elektrik kesintisi | **Üç mağaza da durur** | Etkilenmez |
| İnternet kesintisi | **Üç mağaza da durur** | Etkilenmez |
| Donanım arızası | Tek disk, yedek parça sizde | Sağlayıcı halleder |
| Bakım | Size ait | Büyük ölçüde sağlayıcıda |

**Azaltıcı önlemler:**

- **Kesintisiz güç kaynağı (UPS)** alın. En sık yaşanacak sorun kısa elektrik
  kesintileridir; 1500 VA'lık bir UPS birkaç bin liradır ve bu sorunu bitirir.
- **BIOS'ta "elektrik gelince otomatik aç" ayarını** açın (aşağıda anlatılıyor).
  Uzun kesintiden sonra kimse müdahale etmeden sistem geri gelir.
- **Google Drive yedeği** zaten kurulu. Disk tamamen ölse bile en fazla bir
  günlük veri kaybedersiniz ve yeni bir makineye yarım saatte dönersiniz.
- Bir gün vazgeçerseniz **VPS'e geçiş kolaydır**: yedeği indirir, yeni sunucuda
  aynı adımları uygular, alan adını yeni sunucuya yönlendirirsiniz.

> **Öneri:** PC ile başlayın. Aylarca sorunsuz giderse öyle devam edin; sık
> kesinti yaşarsanız VPS'e taşınmak birkaç saatlik iş.

---

## Gerekenler

- Kullanılmayan PC — **en az 4 GB RAM, 60 GB disk**. 10 yaşındaki bir ofis
  bilgisayarı bile fazlasıyla yeter; bu program çok hafiftir.
- **8 GB veya daha büyük USB bellek** (Ubuntu kurulumu için, içindekiler silinir)
- PC'ye bağlı **kablolu internet** (Wi-Fi de olur ama kablo daha güvenilirdir)
- Kurulum sırasında **klavye + monitör** (sonrasında gerekmez)
- Bir **alan adı** (yıllık birkaç yüz lira)
- Google hesabı (yedekleme için)

---

## 1. Ubuntu Server kurulumu

Windows'u silip yerine Ubuntu Server kuracağız. Sunucu işi için Windows'tan çok
daha uygundur: az RAM kullanır, kendi kendine yeniden başlatmaz, ekran gerekmez.

> **Uyarı:** Bu işlem PC'deki her şeyi siler. Üzerinde saklamak istediğiniz dosya
> varsa önce başka yere kopyalayın.

### 1.1. Kurulum USB'si hazırlama

Başka bir bilgisayarda:

1. [ubuntu.com/download/server](https://ubuntu.com/download/server) adresinden
   **Ubuntu Server LTS** sürümünü indirin (yaklaşık 3 GB, `.iso` dosyası).
2. [balena.io/etcher](https://www.balena.io/etcher/) adresinden **Balena Etcher**
   programını indirip kurun.
3. Etcher'ı açın → indirdiğiniz `.iso` dosyasını seçin → USB belleği seçin →
   **Flash** deyin. Birkaç dakika sürer.

### 1.2. PC'yi USB'den başlatma

1. USB belleği PC'ye takın, PC'yi açın.
2. Açılışta **F2, F10, F12 veya Del** tuşuna basarak boot menüsüne girin
   (marka marka değişir, ekranda genellikle yazar).
3. USB belleği seçip başlatın.

### 1.3. Kurulum adımları

Ubuntu kurulum ekranında sırayla:

| Ekran | Seçim |
|---|---|
| Dil | English (Türkçe de olur, komutlar aynı) |
| Klavye | **Turkish** seçin |
| Installation type | **Ubuntu Server** (minimized değil) |
| Network | Kabloluysa otomatik gelir. **IP adresini not alın** (örn. 192.168.1.50) |
| Proxy / Mirror | Boş bırakın, devam |
| Storage | **Use an entire disk** → diski seçin → Done → **Continue** (silme onayı) |
| Profile | Adınız, sunucu adı (örn. `stok`), kullanıcı adı ve **güçlü bir şifre** |
| Upgrade to Ubuntu Pro | **Skip for now** |
| SSH Setup | **Install OpenSSH server** kutusunu ✅ **mutlaka işaretleyin** |
| Featured snaps | Hiçbirini seçmeyin, devam |

Kurulum bitince **Reboot Now** deyin ve USB'yi çıkarın.

### 1.4. BIOS: elektrik gelince otomatik açılma

Bu adımı atlamayın — elektrik kesintisinden sonra sistemin kendiliğinden
gelmesini sağlar.

1. PC'yi yeniden başlatıp **Del veya F2** ile BIOS'a girin.
2. Genellikle **Power Management** / **ACPI** / **Advanced** başlığı altında
   şu ayarı bulun: **Restore on AC Power Loss** (veya *AC Back*, *After Power
   Failure*, *Power On After Power Fail*).
3. Değerini **Power On** (veya *Last State*) yapın.
4. Kaydedip çıkın (genellikle F10).

---

## 2. Sunucuya bağlanma

Bundan sonrası için PC'ye monitör bağlı olmasına gerek yok. Kendi
bilgisayarınızdan bağlanacağız.

Windows'ta **PowerShell**, Mac'te **Terminal** açın:

```bash
ssh kullaniciadi@192.168.1.50
```

`kullaniciadi` ve IP adresini kurulumda belirlediklerinizle değiştirin. İlk
bağlantıda `yes` yazıp şifrenizi girin.

> **İpucu:** Modem arayüzünden bu PC'ye **sabit yerel IP** (DHCP rezervasyonu)
> tanımlayın. Yoksa IP değişince bağlanamazsınız.

---

## 3. Sistem hazırlığı

Bağlandıktan sonra sırayla çalıştırın:

```bash
# Sistemi güncelle
sudo apt update && sudo apt upgrade -y

# Node.js 22 ve git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git

# Sürümleri doğrula (node v22.x ve 10.x çıkmalı)
node -v && npm -v
```

### Güvenlik duvarı

Cloudflare Tunnel kullanacağımız için **dışarıya hiçbir port açmıyoruz**. Sadece
yerel ağdan SSH'a izin vermek yeterli:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 22
sudo ufw enable
```

> `192.168.1.0/24` kısmını kendi yerel ağınıza göre yazın. Modeminiz
> `192.168.0.x` dağıtıyorsa `192.168.0.0/24` olur.

### Otomatik güvenlik güncellemeleri

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # çıkan soruya "Yes"
```

---

## 4. Programın kurulumu

```bash
# Servis kullanıcısı ve veri dizini
sudo useradd --system --create-home --home-dir /opt/stok stok
sudo mkdir -p /var/lib/stok
sudo chown stok:stok /var/lib/stok

# Kodu indir
sudo -u stok git clone https://github.com/cemalcingirlar/stoktakipedelim.git /opt/stok/app
cd /opt/stok/app
sudo -u stok npm ci
```

### Ayar dosyası

```bash
sudo -u stok tee /opt/stok/app/.env > /dev/null <<EOF
DATABASE_URL="file:/var/lib/stok/stok.db"
OTURUM_SIFRESI="$(openssl rand -base64 48)"
YEDEK_ANAHTARI="$(openssl rand -hex 24)"
EOF

sudo chmod 600 /opt/stok/app/.env
```

> Bu komut gizli anahtarları kendiliğinden üretir; bir yere not etmenize gerek
> yok. Yedekleme anahtarını sonra `sudo cat /opt/stok/app/.env` ile görebilirsiniz.

### Veritabanı ve derleme

```bash
cd /opt/stok/app
sudo -u stok npm run db:deploy
sudo -u stok npm run db:seed
sudo -u stok npm run build
```

`db:seed` üç mağazayı, kategorileri ve başlangıç kullanıcılarını oluşturur.

### Servis tanımı

```bash
sudo tee /etc/systemd/system/stok.service > /dev/null <<'EOF'
[Unit]
Description=Stok Takip
After=network.target

[Service]
Type=simple
User=stok
WorkingDirectory=/opt/stok/app
EnvironmentFile=/opt/stok/app/.env
Environment=NODE_ENV=production
# Yalnız yerel arayüze bağlanır; dışarıya erişim Cloudflare Tunnel üzerinden olur.
ExecStart=/usr/bin/npm start -- -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/stok /opt/stok/app/.next

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now stok
sudo systemctl status stok --no-pager
```

Yeşil `active (running)` görmelisiniz. Sınayın:

```bash
curl -I http://127.0.0.1:3000/giris     # HTTP/1.1 200 OK dönmeli
```

---

## 5. Alan adı ve Cloudflare

Mağazaların bağlanacağı adresi burada kuruyoruz. Cloudflare hem alan adını
satar hem tüneli sağlar, ikisini tek yerden yapmak en pratiği.

1. [dash.cloudflare.com](https://dash.cloudflare.com) adresinde **ücretsiz hesap**
   açın.
2. Sol menüden **Domain Registration → Register Domain** ile alan adı alın
   (örn. `abciletisim.com.tr` veya `abciletisim.com`). Maliyeti yıllık birkaç
   yüz liradır.
3. Alan adını başka yerden aldıysanız: Cloudflare'de **Add a site** deyin ve
   size verilen iki **nameserver** adresini, aldığınız firmanın panelinden
   tanımlayın. Yayılması birkaç saat sürebilir.

Mağazaların gireceği adres şu olacak: **`stok.alanadınız.com`**

---

## 6. Cloudflare Tunnel

Tünel, sunucudan Cloudflare'e **dışarı doğru** bir bağlantı açar. Bu sayede:

- Sabit IP'ye ihtiyaç yok
- Modemde port açmak yok
- İnternet sağlayıcınız CGNAT kullanıyor olsa bile çalışır
- HTTPS sertifikası kendiliğinden gelir ve yenilenir
- Sunucunuz internete doğrudan açık değildir

### 6.1. cloudflared kurulumu

Sunucuda:

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared
```

### 6.2. Tüneli oluşturma

Cloudflare panelinde:

1. Sol menüden **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**
2. **Cloudflared** seçin, tünele bir ad verin (örn. `magaza-sunucu`)
3. Karşınıza gelen kurulum komutunu **kopyalayın** — içinde uzun bir token var
4. Sunucuda o komutu çalıştırın. Şuna benzer görünür:

```bash
sudo cloudflared service install eyJhIjoi...uzun-bir-token...
```

5. Panelde **Public Hostname** sekmesine geçin ve **Add a public hostname**:

| Alan | Değer |
|---|---|
| Subdomain | `stok` |
| Domain | alan adınız |
| Type | `HTTP` |
| URL | `localhost:3000` |

6. **Save** deyin.

Bir dakika içinde **https://stok.alanadınız.com** adresi açılır. Sertifika
otomatik olarak gelir.

### 6.3. Sınama

Telefonunuzdan (Wi-Fi'yi kapatıp mobil veriyle) adrese girin. Giriş ekranı
geliyorsa her şey tamam — diğer iki mağaza da aynı adresten bağlanacak.

---

## 7. İlk ayarlar

`https://stok.alanadınız.com` adresine `admin` / `Stok2026!` ile girin, sonra
**hemen**:

1. **Ayarlar → Kullanıcılar**: `admin` dahil bütün varsayılan şifreleri
   değiştirin. Kullanmayacağınız hesapları pasife alın.
2. **Ayarlar → Mağazalar**: mağaza adlarını gerçek isimlerle güncelleyin.
3. **Ayarlar → Kategoriler**: kendi ürün gruplarınıza göre düzenleyin.
4. **Ayarlar → Tedarikçiler**: çalıştığınız firmaları ekleyin.

---

## 8. Google Drive yedekleme

Adımların tamamı programın **Ayarlar → Yedekleme** ekranında da yazılı.

1. [console.cloud.google.com](https://console.cloud.google.com) → yeni proje
2. **APIs & Services → Library** → **Google Drive API** → Enable
3. **OAuth consent screen** → doldurun, kendi Google hesabınızı *test user*
   olarak ekleyin
4. **Credentials → Create credentials → OAuth client ID → Desktop app** →
   Client ID ve Secret'ı not alın
5. Drive'da bir klasör açın (örn. "Stok Yedekleri"), adres çubuğundaki
   `.../folders/` sonrasındaki kimliği kopyalayın

Sunucuda jetonu alın:

```bash
cd /opt/stok/app
sudo -u stok GOOGLE_ISTEMCI_ID="..." GOOGLE_ISTEMCI_SIRRI="..." npm run drive:jeton
```

Ekrandaki bağlantıyı tarayıcıda açıp izin verin, çıkan kodu yapıştırın. Betik
`.env`'e eklenecek satırları basar. Onları ekleyin:

```bash
sudo -u stok nano /opt/stok/app/.env
# GOOGLE_ISTEMCI_ID, GOOGLE_ISTEMCI_SIRRI, GOOGLE_YENILEME_JETONU,
# GOOGLE_DRIVE_KLASOR_ID satırlarını ekleyip Ctrl+O, Enter, Ctrl+X

sudo systemctl restart stok
```

**Ayarlar → Yedekleme** ekranında "Bağlantıyı Sına" ve ardından "Şimdi Yedekle"
deyip çalıştığını görün.

### Günlük otomatik yedek

```bash
ANAHTAR=$(sudo grep YEDEK_ANAHTARI /opt/stok/app/.env | cut -d'"' -f2)
echo "0 3 * * * curl -fsS -X POST -H 'X-Yedek-Anahtari: $ANAHTAR' http://127.0.0.1:3000/api/yedek >> /var/log/stok-yedek.log 2>&1" \
  | sudo tee /etc/cron.d/stok-yedek
sudo chmod 644 /etc/cron.d/stok-yedek
```

Her gece 03:00'te yedek alınır, son 14 yedek Drive'da tutulur.

---

## 9. Günlük bakım

Neredeyse hiç bakım gerektirmez. Ayda bir şunlara bakmanız yeter:

```bash
# Servis çalışıyor mu
sudo systemctl status stok --no-pager

# Son hatalar
sudo journalctl -u stok -n 50 --no-pager

# Sistem güncellemesi
sudo apt update && sudo apt upgrade -y && sudo reboot
```

Yedeklerin düzgün gittiğini **Ayarlar → Yedekleme** ekranından takip edin. Son
başarılı yedeğin üzerinden 48 saat geçerse ekran kırmızı uyarı verir.

### Programı güncelleme

```bash
cd /opt/stok/app
sudo -u stok git pull
sudo -u stok npm ci
sudo -u stok npm run db:deploy
sudo -u stok npm run build
sudo systemctl restart stok
```

### Yedekten geri dönme

```bash
sudo systemctl stop stok
# İndirdiğiniz .db.gz dosyasını sunucuya kopyalayıp:
sudo gunzip -c stok-yedek-20260913-0300.db.gz > /var/lib/stok/stok.db
sudo chown stok:stok /var/lib/stok/stok.db
sudo systemctl start stok
```

---

## 10. Sorun giderme

| Belirti | Bakılacak yer |
|---|---|
| Site hiç açılmıyor | PC açık mı? `sudo systemctl status stok` ve `sudo systemctl status cloudflared` |
| "Bad gateway" hatası | Program durmuş: `sudo systemctl restart stok` |
| Sunucuya SSH ile bağlanamıyorum | PC'nin yerel IP'si değişmiş olabilir; modem arayüzünden bakın |
| Giriş yapılamıyor, "şifre hatalı" | Ayarlar → Kullanıcılar'dan şifre sıfırlayın (başka bir yönetici hesabıyla) |
| Yedek alınmıyor | Ayarlar → Yedekleme'deki hata mesajını okuyun; `sudo cat /var/log/stok-yedek.log` |
| Elektrik kesintisinden sonra açılmadı | BIOS'taki "Restore on AC Power Loss" ayarı **Power On** mu? |
| Program yavaşladı | `htop` ile bakın; bu uygulama için beklenmez, disk dolmuş olabilir: `df -h` |

---

## Özet: maliyet

| Kalem | Tutar |
|---|---|
| PC | Zaten var |
| Alan adı | Yıllık birkaç yüz lira |
| Cloudflare Tunnel | Ücretsiz |
| Google Drive yedek | Ücretsiz (15 GB yeterli) |
| UPS (önerilen) | Tek seferlik birkaç bin lira |
| Elektrik | Ayda ~30–60 TL |

Aylık sabit gider neredeyse yok.
