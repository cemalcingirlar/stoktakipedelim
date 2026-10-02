# Sunucuyu Başka Bir Bilgisayara Taşıma

Programın çalıştığı bilgisayarı değiştirirken izlenecek yol. Veri, gizli
anahtarlar ve Cloudflare tüneli korunur; alan adı ve DNS ayarlarına
dokunulmaz, kesinti birkaç dakikayla sınırlı kalır.

## Neden sadece veritabanını kopyalamak yetmez

Yeni makinede sıfırdan kurulum yapmak teknik olarak mümkün ama üç şey
yalnızca eski makinede duruyor:

| Dosya | Kaybolursa |
|---|---|
| `/opt/stok/app/.env` | Oturum anahtarı, yedekleme anahtarı ve Google Drive bağlantısı yeniden kurulur; herkesin oturumu düşer, Drive izni baştan alınır |
| `/root/.cloudflared/` | Tünel kimliği gider; yeni tünel açılıp DNS kayıtları yeniden yazılır |
| `/var/lib/stok/stok.db` | Tüm stok, fatura, satış ve sayım geçmişi |

`betikler/sunucu-yedek-al.sh` üçünü de tek arşivde topladığı için yeni
makinede kurulum "devralma" hâline gelir.

---

## 1. Eski makinede yedeği al

```bash
sudo /opt/stok/app/betikler/sunucu-yedek-al.sh
```

Betik servisi durdurur (veritabanı yazılırken kopyalanmasın diye), dosyaları
toplar, arşivi `/root/` altına yazar ve servisi geri başlatır. Birkaç saniye
sürer.

Çıktıda arşivin yolu ve `sha256` sağlaması görünür:

```
✓ Yedek hazır: /root/stok-sunucu-yedek-20261002-1430.tar.gz
```

### Arşivi kendi bilgisayarına indir

Windows'ta Komut İstemi'nden:

```
scp cemal@100.119.100.57:/root/stok-sunucu-yedek-*.tar.gz .
```

`Permission denied` alırsan arşivi önce kendi kullanıcına taşı:

```bash
sudo cp /root/stok-sunucu-yedek-*.tar.gz ~/ && sudo chown $USER ~/stok-sunucu-yedek-*.tar.gz
```

> **Arşiv gizli anahtarlar içerir.** USB bellek veya bulut üzerinden
> taşıyacaksan önce şifrele:
>
> ```bash
> openssl enc -aes-256-cbc -pbkdf2 -salt \
>   -in stok-sunucu-yedek-20261002-1430.tar.gz \
>   -out stok-sunucu-yedek-20261002-1430.tar.gz.enc
> ```
>
> Çözmek için `openssl enc -d -aes-256-cbc -pbkdf2 -in ....enc -out ....tar.gz`.
> Parolayı kaybedersen arşiv açılmaz; yedeğin yedeği olmadan silme.

---

## 2. Eski makineyi devreden çıkar

Yeni makine ayağa kalkmadan **önce** eski makinedeki servisleri durdur.
Aynı tünele iki makine bağlanırsa Cloudflare istekleri ikisi arasında
paylaştırır; bir kısmı eski, bir kısmı yeni veritabanına düşer.

```bash
sudo systemctl disable --now stok cloudflared
```

Bu noktadan sonra site erişilemez olur. Kesinti buradan yeni makinenin
ayağa kalkmasına kadar sürer.

---

## 3. Yeni makineyi hazırla

Ubuntu Server kurulumu için `docs/ofis-pc-kurulumu.md` rehberini izle
(BIOS'ta otomatik açılma, ağ, SSH). Ubuntu kurulduktan sonra:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nodejs npm ufw dnsutils
sudo npm install -g npm@10
node -v && npm -v
```

Kullanıcı, klasör ve kod:

```bash
sudo useradd --system --create-home --home-dir /opt/stok stok
sudo chmod 755 /opt/stok
sudo mkdir -p /var/lib/stok && sudo chown stok:stok /var/lib/stok
sudo -u stok git clone https://github.com/cemalcingirlar/stoktakipedelim.git /opt/stok/app
sudo -u stok bash -c 'cd /opt/stok/app && npm ci'
```

Cloudflare istemcisi (tünel kimliği arşivden gelecek, yeniden giriş yapmayacaksın):

```bash
curl -fsSL -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb
cloudflared --version
```

Güvenlik duvarı:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw --force enable
```

---

## 4. Devral

Arşivi yeni makineye kopyala (Windows'tan):

```
scp stok-sunucu-yedek-20261002-1430.tar.gz cemal@<yeni-sunucu>:~/
```

Sonra yeni makinede:

```bash
sudo /opt/stok/app/betikler/sunucu-geri-yukle.sh ~/stok-sunucu-yedek-20261002-1430.tar.gz
```

Betik sırayla: arşivi açar, künyeyi gösterir, veritabanını ve `.env`'i yerine
koyar, tünel kimliğini kurar, systemd ve cron tanımlarını yazar, saat dilimini
ayarlar, migration'ları uygular, sıfırdan derler, servisleri başlatır ve giriş
sayfasının cevap verdiğini doğrular.

Sonunda `✓ Devralma tamam` görmelisin.

---

## 5. Tailscale (uzaktan erişim)

Eski makinenin Tailscale düğümü artık geçersiz. Yeni makinede:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Ekrandaki bağlantıyı tarayıcıda açıp hesabınla eşle. Yeni IP adresini not al.

Ardından [login.tailscale.com](https://login.tailscale.com/admin/machines) →
eski makineyi listeden **sil**.

Güvenlik duvarında Tailscale arayüzünü aç:

```bash
sudo ufw allow in on tailscale0 comment 'Tailscale'
sudo ufw status verbose
```

---

## 6. Doğrula

```bash
sudo systemctl is-active stok cloudflared
curl -s -o /dev/null -w "HTTP: %{http_code}\n" http://127.0.0.1:3000/giris
sudo /usr/local/bin/stok-yedek.sh
```

Üçü de olumlu dönünce tarayıcıdan `https://hospitalityageny.com` aç ve şunlara bak:

- Giriş yapabiliyor musun (oturum anahtarı taşındıysa eski şifreler geçerli)
- Cihaz listesinde kayıtların tamamı duruyor mu
- Son fatura ve son satış görünüyor mu
- **Ayarlar → Yedekleme** ekranında son yedek bugünün tarihli mi

Son adım: Drive'daki `Stok Yedekleri` klasöründe yeni bir dosya oluştuğunu gör.

---

## Bir şey ters giderse

Eski makine hâlâ elindeyse hiçbir veri kaybolmaz; eski makinede servisleri
geri açmak yeterli:

```bash
sudo systemctl enable --now stok cloudflared
```

Tünel kimliği aynı olduğu için site birkaç saniyede eski makineden yayına
döner. Sonra yeni makinedeki sorunu rahatça çözersin.

Eski makineyi tamamen elden çıkarmadan önce **diskini sil veya biçimlendir** —
üzerinde `.env`, tünel kimliği ve tüm stok geçmişi duruyor.
