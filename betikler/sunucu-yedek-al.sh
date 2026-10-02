#!/bin/bash
#
# Sunucunun tamamını tek bir arşive alır — makine değiştirirken kullanılır.
#
#   sudo /opt/stok/app/betikler/sunucu-yedek-al.sh [hedef-klasor]
#
# Arşivde ne var:
#   - Veritabanı (/var/lib/stok/stok.db)
#   - .env (oturum anahtarı, yedek anahtarı, Google OAuth bilgileri)
#   - Cloudflare tünel kimlik dosyaları ve yapılandırması
#   - systemd servis tanımları, cron görevi, logrotate tanımı
#   - Kurulumun künyesi (commit, sürümler, tünel kimliği)
#
# Kod GitHub'dan indirildiği için arşive konmaz.
#
# DİKKAT: Arşiv gizli anahtarlar içerir. 600 izinle oluşturulur; taşırken
# şifrelemek için rehberdeki openssl komutunu kullanın.

set -euo pipefail

UYGULAMA=/opt/stok/app
VERI=/var/lib/stok
SERVIS=stok
# Arşiv varsayılan olarak betiği çağıran kullanıcının ev klasörüne yazılır.
# /root altına yazılsaydı normal kullanıcı dosyayı ne görebilir ne scp ile
# indirebilirdi; sudo ile açılan joker kalıplar da kullanıcı kabuğunda
# genişlemediği için kopyalama komutu da çalışmazdı.
CAGIRAN="${SUDO_USER:-root}"
EV=$(getent passwd "$CAGIRAN" | cut -d: -f6)
HEDEF="${1:-${EV:-/root}}"
DURDUR=1

kirmizi() { printf '\033[31m%s\033[0m\n' "$*"; }
yesil()   { printf '\033[32m%s\033[0m\n' "$*"; }
baslik()  { printf '\n\033[1m=== %s ===\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  kirmizi "Bu betik root yetkisi ister:  sudo $0"
  exit 1
fi

DAMGA=$(date '+%Y%m%d-%H%M')
GECICI=$(mktemp -d)
PAKET="$GECICI/stok-sunucu-$DAMGA"
ARSIV="$HEDEF/stok-sunucu-yedek-$DAMGA.tar.gz"
mkdir -p "$PAKET"

temizle() { rm -rf "$GECICI"; }
trap temizle EXIT

baslik "1/5  Servis durduruluyor"
# Veritabanının tutarlı kopyalanması için yazan süreç olmamalı.
if systemctl is-active --quiet "$SERVIS"; then
  systemctl stop "$SERVIS"
  echo "durduruldu"
else
  DURDUR=0
  echo "zaten kapalıydı"
fi

baslik "2/5  Veritabanı"
mkdir -p "$PAKET/veri"
# -wal ve -shm dosyaları servis kapalıyken boş olur ama varsa da alınır.
for d in "$VERI"/stok.db "$VERI"/stok.db-wal "$VERI"/stok.db-shm; do
  [ -f "$d" ] && cp -p "$d" "$PAKET/veri/"
done
ls -lh "$PAKET/veri/"

baslik "3/5  Ayarlar ve anahtarlar"
mkdir -p "$PAKET/ayar"
cp -p "$UYGULAMA/.env" "$PAKET/ayar/env"

mkdir -p "$PAKET/ayar/cloudflared"
[ -d /etc/cloudflared ] && cp -rp /etc/cloudflared/. "$PAKET/ayar/cloudflared/" 2>/dev/null || true
mkdir -p "$PAKET/ayar/cloudflared-kimlik"
[ -d /root/.cloudflared ] && cp -rp /root/.cloudflared/. "$PAKET/ayar/cloudflared-kimlik/" 2>/dev/null || true

mkdir -p "$PAKET/ayar/systemd"
cp -p /etc/systemd/system/stok.service "$PAKET/ayar/systemd/" 2>/dev/null || true
[ -d /etc/systemd/system/stok.service.d ] &&
  cp -rp /etc/systemd/system/stok.service.d "$PAKET/ayar/systemd/" 2>/dev/null || true

mkdir -p "$PAKET/ayar/diger"
cp -p /usr/local/bin/stok-yedek.sh "$PAKET/ayar/diger/yedek-betigi.sh" 2>/dev/null || true
# Cron ve logrotate dosyalarının adı aynı; ayrı adlarla saklanmazsa biri
# diğerinin üzerine yazar.
cp -p /etc/cron.d/stok-yedek "$PAKET/ayar/diger/cron-stok-yedek" 2>/dev/null || true
cp -p /etc/logrotate.d/stok-yedek "$PAKET/ayar/diger/logrotate-stok-yedek" 2>/dev/null || true
find "$PAKET/ayar" -type f | sed "s|$PAKET/||"

baslik "4/5  Künye"
TUNEL=$(grep -m1 '^tunnel:' /etc/cloudflared/config.yml 2>/dev/null | awk '{print $2}' || echo "yok")
{
  echo "Alınma zamanı : $(date '+%Y-%m-%d %H:%M %Z')"
  echo "Makine        : $(hostname)"
  echo "İşletim sistemi: $(. /etc/os-release && echo "$PRETTY_NAME")"
  echo "Node          : $(node -v 2>/dev/null || echo yok)"
  echo "npm           : $(npm -v 2>/dev/null || echo yok)"
  echo "Git commit    : $(sudo -u stok git -C "$UYGULAMA" rev-parse HEAD 2>/dev/null || echo yok)"
  echo "Git dalı      : $(sudo -u stok git -C "$UYGULAMA" rev-parse --abbrev-ref HEAD 2>/dev/null || echo yok)"
  echo "Tünel kimliği : $TUNEL"
  echo "Veritabanı    : $(du -h "$VERI/stok.db" 2>/dev/null | cut -f1)"
} > "$PAKET/KUNYE.txt"
cat "$PAKET/KUNYE.txt"

baslik "5/5  Arşiv"
tar -czf "$ARSIV" -C "$GECICI" "stok-sunucu-$DAMGA"
( cd "$HEDEF" && sha256sum "$(basename "$ARSIV")" > "$(basename "$ARSIV").sha256" )
# Çağıran kullanıcı dosyayı scp ile indirebilsin; izin yine yalnız sahibinde.
if [ "$CAGIRAN" != "root" ]; then
  chown "$CAGIRAN":"$CAGIRAN" "$ARSIV" "$ARSIV.sha256" 2>/dev/null || true
fi
chmod 600 "$ARSIV" "$ARSIV.sha256"

if [ "$DURDUR" -eq 1 ]; then
  systemctl start "$SERVIS"
  for i in $(seq 1 30); do
    KOD=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/giris || echo 000)
    [ "$KOD" = "200" ] && break
    sleep 1
  done
  echo "servis yeniden başlatıldı: ${KOD:-?}"
fi

echo
yesil "✓ Yedek hazır: $ARSIV"
ls -lh "$ARSIV"
echo
echo "Bu dosyayı kendi bilgisayarına indir (Windows'ta Komut İstemi):"
echo "  scp $CAGIRAN@<sunucu-adresi>:$ARSIV ."
echo "  scp $CAGIRAN@<sunucu-adresi>:$ARSIV.sha256 ."
echo
echo "İndirdikten sonra bütünlüğünü doğrula (sunucuda alınan özetle karşılaştır):"
echo "  sha256sum -c $(basename "$ARSIV").sha256"
echo
kirmizi "Arşiv gizli anahtarlar içeriyor. USB veya bulut üzerinden taşıyacaksan önce şifrele:"
echo "  openssl enc -aes-256-cbc -pbkdf2 -salt -in $(basename "$ARSIV") -out $(basename "$ARSIV").enc"
