#!/bin/bash
#
# Yedek arşivini yeni bir makineye kurar.
#
#   sudo /opt/stok/app/betikler/sunucu-geri-yukle.sh stok-sunucu-yedek-20261002-1430.tar.gz
#
# Öncesinde yeni makinede şunlar hazır olmalı:
#   - Ubuntu kurulu, git ve Node.js kurulu
#   - stok kullanıcısı ve /var/lib/stok klasörü oluşturulmuş
#   - Kod /opt/stok/app içine klonlanmış, npm ci çalıştırılmış
#   - cloudflared paketi kurulmuş
# Bunların komutları docs/sunucu-tasima.md içinde.
#
# Betik veriyi, anahtarları ve tünel kimliğini yerine koyar, servisleri kurar.
# Eski makinedeki servisler KAPATILMIŞ olmalı — aynı tünele iki makine
# bağlanırsa Cloudflare istekleri ikisi arasında paylaştırır ve bir kısmı
# eski, boş veritabanına düşer.

set -euo pipefail

ARSIV="${1:-}"
UYGULAMA=/opt/stok/app
VERI=/var/lib/stok

kirmizi() { printf '\033[31m%s\033[0m\n' "$*"; }
yesil()   { printf '\033[32m%s\033[0m\n' "$*"; }
baslik()  { printf '\n\033[1m=== %s ===\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  kirmizi "Bu betik root yetkisi ister:  sudo $0 <arsiv.tar.gz>"
  exit 1
fi
if [ -z "$ARSIV" ] || [ ! -f "$ARSIV" ]; then
  kirmizi "Arşiv bulunamadı. Kullanım: sudo $0 stok-sunucu-yedek-....tar.gz"
  exit 1
fi
if [ ! -d "$UYGULAMA" ]; then
  kirmizi "$UYGULAMA yok. Önce kodu klonlayın (docs/sunucu-tasima.md)."
  exit 1
fi

GECICI=$(mktemp -d)
trap 'rm -rf "$GECICI"' EXIT

baslik "1/6  Arşiv açılıyor"
tar -xzf "$ARSIV" -C "$GECICI"
PAKET=$(find "$GECICI" -maxdepth 1 -type d -name 'stok-sunucu-*' | head -1)
[ -n "$PAKET" ] || { kirmizi "Arşiv beklenen yapıda değil."; exit 1; }
cat "$PAKET/KUNYE.txt"

baslik "2/6  Veritabanı"
# Üzerine yazmadan önce varsa mevcut dosyayı kenara al.
mkdir -p "$VERI"
if [ -f "$VERI/stok.db" ]; then
  mv "$VERI/stok.db" "$VERI/stok.db.devralma-oncesi-$(date '+%Y%m%d-%H%M')"
  echo "mevcut veritabanı kenara alındı"
fi
cp -p "$PAKET/veri/stok.db" "$VERI/stok.db"
for ek in wal shm; do
  [ -f "$PAKET/veri/stok.db-$ek" ] && cp -p "$PAKET/veri/stok.db-$ek" "$VERI/"
done
chown -R stok:stok "$VERI"
chmod 750 "$VERI"
chmod 600 "$VERI"/stok.db*
ls -lh "$VERI"

baslik "3/6  .env"
cp -p "$PAKET/ayar/env" "$UYGULAMA/.env"
chown stok:stok "$UYGULAMA/.env"
chmod 600 "$UYGULAMA/.env"
sed -E 's/=".*"/="***"/' "$UYGULAMA/.env"

baslik "4/6  Cloudflare tüneli"
mkdir -p /etc/cloudflared /root/.cloudflared
cp -rp "$PAKET/ayar/cloudflared/." /etc/cloudflared/ 2>/dev/null || true
cp -rp "$PAKET/ayar/cloudflared-kimlik/." /root/.cloudflared/ 2>/dev/null || true
chmod 600 /root/.cloudflared/* 2>/dev/null || true
grep -m1 '^tunnel:' /etc/cloudflared/config.yml || echo "config.yml okunamadı"

baslik "5/6  Servisler ve görevler"
# Hedef klasörleri var saymıyoruz; betik kendi kendine yetmeli.
mkdir -p /etc/systemd/system /usr/local/bin /etc/cron.d /etc/logrotate.d
cp -p "$PAKET/ayar/systemd/stok.service" /etc/systemd/system/
if [ -d "$PAKET/ayar/systemd/stok.service.d" ]; then
  mkdir -p /etc/systemd/system/stok.service.d
  cp -p "$PAKET/ayar/systemd/stok.service.d/." /etc/systemd/system/stok.service.d/ 2>/dev/null ||
    cp -rp "$PAKET/ayar/systemd/stok.service.d/"* /etc/systemd/system/stok.service.d/
fi
cp -p "$PAKET/ayar/diger/yedek-betigi.sh" /usr/local/bin/stok-yedek.sh 2>/dev/null || true
chown root:root /usr/local/bin/stok-yedek.sh 2>/dev/null || true
chmod 700 /usr/local/bin/stok-yedek.sh 2>/dev/null || true
cp -p "$PAKET/ayar/diger/cron-stok-yedek" /etc/cron.d/stok-yedek 2>/dev/null || true
chmod 644 /etc/cron.d/stok-yedek 2>/dev/null || true
cp -p "$PAKET/ayar/diger/logrotate-stok-yedek" /etc/logrotate.d/stok-yedek 2>/dev/null || true
chmod 644 /etc/logrotate.d/stok-yedek 2>/dev/null || true
touch /var/log/stok-yedek.log && chown root:adm /var/log/stok-yedek.log && chmod 640 /var/log/stok-yedek.log

timedatectl set-timezone Europe/Istanbul || true
systemctl daemon-reload

baslik "6/6  Derleme ve başlatma"
sudo -u stok bash -c "cd $UYGULAMA && npm run db:generate && npm run db:deploy"
rm -rf "$UYGULAMA/.next"
sudo -u stok bash -c "cd $UYGULAMA && npm run build"

systemctl enable --now stok
command -v cloudflared >/dev/null && { cloudflared service install 2>/dev/null || true; systemctl enable --now cloudflared; }

for i in $(seq 1 30); do
  KOD=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/giris || echo 000)
  [ "$KOD" = "200" ] && break
  sleep 1
done

echo
if [ "$KOD" = "200" ]; then
  yesil "✓ Devralma tamam. Uygulama HTTP 200, tünel: $(systemctl is-active cloudflared 2>/dev/null || echo yok)"
  echo "  Şimdi tarayıcıdan alan adını açıp verilerin geldiğini doğrulayın."
else
  kirmizi "✗ Uygulama cevap vermiyor (HTTP $KOD). Son günlükler:"
  journalctl -u stok -n 30 --no-pager
  exit 1
fi
