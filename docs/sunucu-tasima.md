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

Arşiv, betiği çağıran kullanıcının ev klasörüne yazılır ve o kullanıcıya
devredilir; böylece `scp` ile doğrudan indirilebilir. Çıktıda yolu görünür:

```
✓ Yedek hazır: /home/cemal/stok-sunucu-yedek-20261002-1430.tar.gz
```

### Arşivi kendi bilgisayarına indir

Windows'ta Komut İstemi'nden (dosya adını çıktıdan birebir kopyala):

```
scp cemal@100.119.100.57:~/stok-sunucu-yedek-20261002-1430.tar.gz .
scp cemal@100.119.100.57:~/stok-sunucu-yedek-20261002-1430.tar.gz.sha256 .
```

İndikten sonra bozulmadığını doğrula — sunucuda hesaplanan özetle karşılaştırır:

```
sha256sum -c stok-sunucu-yedek-20261002-1430.tar.gz.sha256
```

> `*` gibi joker kalıpları `sudo` ile kullanma: kalıbı senin kabuğun açar,
> `/root` gibi okuma izni olmayan klasörlerde genişlemez ve komut
> "No such file or directory" der. Dosya adını tam yaz.

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
(BIOS'ta otomatik açılma, ağ, SSH).

### Dizüstü bilgisayar kullanıyorsan

Kapak kapanınca makine uyur ve site erişilemez olur. Ubuntu kurulduktan sonra
bunu kapat:

```bash
sudo sed -i 's/^#\?HandleLidSwitch=.*/HandleLidSwitch=ignore/' /etc/systemd/logind.conf
sudo sed -i 's/^#\?HandleLidSwitchExternalPower=.*/HandleLidSwitchExternalPower=ignore/' /etc/systemd/logind.conf
sudo sed -i 's/^#\?HandleLidSwitchDocked=.*/HandleLidSwitchDocked=ignore/' /etc/systemd/logind.conf
sudo systemctl restart systemd-logind
grep -E '^HandleLidSwitch' /etc/systemd/logind.conf
```

Askıya alma ve uyku kiplerini tamamen kapatmak da iyi olur:

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

Dizüstünün bataryası yerleşik bir kesintisiz güç kaynağı gibi çalışır;
elektrik kesildiğinde makine düzgün kapanır, veritabanı bozulmaz.

### RAM'i 4 GB veya altındaysa: takas alanı

Çalışırken program ~250 MB RAM yeter, ama **derleme tepe noktada ~3 GB**
ister. 4 GB'lık makinede işletim sisteminin payı düşüldüğünde bu yetmez ve
derleme çöker. Kurulumdan önce takas alanı aç:

```bash
# Zaten swap varsa (free -h ile bakılır) bu adımı atla.
sudo fallocate -l 6G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# Takas yalnız gerektiğinde kullanılsın; normalde RAM tercih edilir.
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-stok-swap.conf
sudo sysctl -p /etc/sysctl.d/99-stok-swap.conf
free -h
```

Takasla derleme çalışır ama yavaştır: güçlü bir makinede 90 saniye süren
derleme, Atom/Celeron sınıfı bir işlemci ve eMMC diskte **15-25 dakika**
alabilir. Güncellemeyi mesai dışında yapın; `sunucu-guncelle.sh` zaten
derleme boyunca servisi kapatıyor.

### Donanım yeterli mi?

| Bileşen | En az | Not |
|---|---|---|
| İşlemci | 64-bit (x86_64) | 32-bit Atom'lar (N270, N450, N550) **kullanılamaz** |
| RAM | 4 GB + 6 GB takas | 8 GB varsa takas gerekmez |
| Disk | 20 GB boş | Sistem + kod + derleme ~10 GB |

Windows'ta `msinfo32` ile **Sistem Türü** `x64-based PC` olmalı. Bazı Atom
tabletlerde işlemci 64-bit olsa da **32-bit UEFI** bulunur; bu makinelerde
Ubuntu kurulumu ciddi zahmet çıkarır, mümkünse başka makine tercih edin.

### Paketler ve kod

Ubuntu kurulduktan sonra:

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

Üçü de olumlu dönünce tarayıcıdan kendi alan adını (tünelin genel adresini) aç
ve şunlara bak:

- Giriş yapabiliyor musun (oturum anahtarı taşındıysa eski şifreler geçerli)
- Cihaz listesinde kayıtların tamamı duruyor mu
- Son fatura ve son satış görünüyor mu
- **Ayarlar → Yedekleme** ekranında son yedek bugünün tarihli mi

Son adım: Drive'daki `Stok Yedekleri` klasöründe yeni bir dosya oluştuğunu gör.

---

## Alan adını değiştirme

Program hiçbir yerde alan adını saklamıyor: oturum çerezi host'a bağlı, mutlak
adres kuran bir ortam değişkeni yok. Yani alan adı değişikliği **tamamen
Cloudflare tarafında** biter — kod değişmez, yeniden derleme gerekmez, `.env`
dosyasına dokunulmaz.

1. **Cloudflare'a ekle.** [dash.cloudflare.com](https://dash.cloudflare.com) →
   *Add a domain* → alan adını yaz → **Free** planı seç. Cloudflare iki tane
   ad sunucusu (`...ns.cloudflare.com`) verir.
2. **Kayıt firmasında ad sunucularını değiştir.** Alan adının yönetim
   panelinde *Nameservers* → *Custom / I'll use my own* → Cloudflare'ın verdiği
   ikisini yaz. Yayılması genelde 10 dakika–2 saat sürer.
3. **Tünele genel adres ekle.** Cloudflare *Zero Trust* → *Networks* →
   *Tunnels* → tünel → *Public Hostname* → *Add a public hostname*:
   - Subdomain boş, Domain: yeni alan adı, Service: **HTTP**, URL:
     `127.0.0.1:3000`
   - Aynısını Subdomain `www` ile bir daha ekle.

   Bu adım gereken DNS kayıtlarını (proxy'li CNAME) kendisi oluşturur; elle
   A/CNAME kaydı girilmez.
4. **SSL.** *SSL/TLS* → *Overview* → **Full**, ve *Edge Certificates* →
   *Always Use HTTPS* açık. Sertifika aktivasyondan ~15 dakika sonra hazır olur.

Dikkat edilecek iki şey:

- **Joker (`*`) A kaydı açma.** Eski alan adında bu kayıt proxy'li olduğu için
  e-posta MX hedefini de Cloudflare'a yönlendirip postayı bozma riski
  doğurmuştu. Gerekiyorsa gri bulut (DNS only) yap.
- **E-posta kullanacaksan** MX ve SPF/DKIM kayıtlarını Cloudflare'da elle
  oluştur ve hepsini **DNS only** bırak. Sadece yönlendirme yetiyorsa
  Cloudflare *Email Routing* ücretsizdir.

Eski alan adını hemen kaldırmak zorunda değilsin: aynı tünelde iki genel adres
birlikte çalışabilir. Personelin yer imleri bozulmasın diye eskisini birkaç
hafta açık bırakıp sonra *Public Hostname* listesinden silmek en rahatı.

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
