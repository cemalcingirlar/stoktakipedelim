#!/bin/bash
#
# Sunucudaki kurulumu günceller. Tek komutla çalıştırılır:
#
#   sudo /opt/stok/app/betikler/sunucu-guncelle.sh
#
# Sıra önemli: servis durdurulmadan derleme yapılırsa Next.js'in parça
# dosyaları çalışan sürecin altından değişir ve uygulama
# "module factory is not available" hatasıyla sayfa üretemez hâle gelir.
# Bu betik doğru sırayı garanti eder.

set -euo pipefail

UYGULAMA=/opt/stok/app
KULLANICI=stok
SERVIS=stok
DAL="${1:-}"

kirmizi() { printf '\033[31m%s\033[0m\n' "$*"; }
yesil()   { printf '\033[32m%s\033[0m\n' "$*"; }
baslik()  { printf '\n\033[1m=== %s ===\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  kirmizi "Bu betik root yetkisi ister:  sudo $0"
  exit 1
fi

cd "$UYGULAMA"

# Hangi dal güncellenecek? Parametre verilmediyse mevcut dalın izlediği uzak dal.
if [ -z "$DAL" ]; then
  DAL=$(sudo -u "$KULLANICI" git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo "origin/main")
else
  DAL="origin/$DAL"
fi

ONCEKI=$(sudo -u "$KULLANICI" git rev-parse --short HEAD)

baslik "1/7  Güncelleme öncesi yedek"
if [ -x /usr/local/bin/stok-yedek.sh ] && systemctl is-active --quiet "$SERVIS"; then
  /usr/local/bin/stok-yedek.sh || kirmizi "Yedek alınamadı — yine de devam ediliyor."
else
  echo "Servis kapalı veya yedek betiği yok, atlandı."
fi

baslik "2/7  Kod indiriliyor ($DAL)"
sudo -u "$KULLANICI" git fetch origin
sudo -u "$KULLANICI" git reset --hard "$DAL"
YENI=$(sudo -u "$KULLANICI" git rev-parse --short HEAD)
sudo -u "$KULLANICI" git log --oneline -1

if [ "$ONCEKI" = "$YENI" ]; then
  echo "Kod zaten güncel ($YENI) — yine de yeniden derlenecek."
fi

baslik "3/7  Servis durduruluyor"
# Derleme sırasında çalışan süreç olmamalı.
systemctl stop "$SERVIS"

baslik "4/7  Bağımlılıklar"
sudo -u "$KULLANICI" npm ci

baslik "5/7  Veritabanı"
sudo -u "$KULLANICI" npm run db:generate
sudo -u "$KULLANICI" npm run db:deploy

baslik "6/7  Derleme"
# Eski parça dosyaları yenileriyle karışmasın diye sıfırdan.
rm -rf "$UYGULAMA/.next"
sudo -u "$KULLANICI" npm run build

baslik "7/7  Servis başlatılıyor"
systemctl start "$SERVIS"

# Ayağa kalkmasını bekle; 30 saniye sonunda hâlâ cevap yoksa geri al.
for i in $(seq 1 30); do
  KOD=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/giris || echo 000)
  [ "$KOD" = "200" ] && break
  sleep 1
done

echo
if [ "$KOD" = "200" ]; then
  yesil "✓ Güncelleme tamam.  $ONCEKI → $YENI  ·  giriş sayfası HTTP 200"
  echo "  Tünel durumu: $(systemctl is-active cloudflared)"
else
  kirmizi "✗ Uygulama cevap vermiyor (HTTP $KOD). Son günlükler:"
  journalctl -u "$SERVIS" -n 30 --no-pager
  echo
  kirmizi "Önceki sürüme dönmek için:"
  echo "  sudo -u $KULLANICI git -C $UYGULAMA reset --hard $ONCEKI"
  echo "  sudo $0"
  exit 1
fi
