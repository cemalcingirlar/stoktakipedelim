#!/bin/bash
#
# Yedek ve geri yükleme betiklerini sahte bir sunucu düzeninde sınar.
# Gerçek sisteme dokunmaz: tüm yollar geçici bir köke kopyalanır ve
# betiklerin kopyaları o köke göre yeniden yazılır.
#
#   bash betikler/sunucu-yedek-dogrula.sh

set -uo pipefail

KOK=$(mktemp -d)
GECTI=0; KALDI=0
kontrol() {
  if [ "$2" = "0" ]; then echo "✓ $1"; GECTI=$((GECTI+1));
  else echo "✗ $1 ${3:+— $3}"; KALDI=$((KALDI+1)); fi
}
temizle() { rm -rf "$KOK"; }
trap temizle EXIT

# ---------------------------------------------------- sahte sunucu düzeni
mkdir -p "$KOK"/opt/stok/app "$KOK"/var/lib/stok "$KOK"/etc/cloudflared \
         "$KOK"/root/.cloudflared "$KOK"/etc/systemd/system/stok.service.d \
         "$KOK"/usr/local/bin "$KOK"/etc/cron.d "$KOK"/etc/logrotate.d "$KOK"/hedef

printf 'sahte-veritabani-icerigi\n' > "$KOK/var/lib/stok/stok.db"
printf 'DATABASE_URL="file:/var/lib/stok/stok.db"\nOTURUM_SIFRESI="gizli"\n' > "$KOK/opt/stok/app/.env"
printf 'tunnel: abc-123-tunel\ncredentials-file: /root/.cloudflared/abc-123-tunel.json\n' > "$KOK/etc/cloudflared/config.yml"
printf '{"AccountTag":"x"}\n' > "$KOK/root/.cloudflared/abc-123-tunel.json"
printf 'sertifika\n' > "$KOK/root/.cloudflared/cert.pem"
printf '[Service]\nExecStart=/bin/true\n' > "$KOK/etc/systemd/system/stok.service"
printf '[Service]\nEnvironment=TZ=Europe/Istanbul\n' > "$KOK/etc/systemd/system/stok.service.d/saat.conf"
printf '#!/bin/bash\necho yedek\n' > "$KOK/usr/local/bin/stok-yedek.sh"
printf '15 3 * * * root /usr/local/bin/stok-yedek.sh\n' > "$KOK/etc/cron.d/stok-yedek"
printf '/var/log/stok-yedek.log { monthly }\n' > "$KOK/etc/logrotate.d/stok-yedek"

# ---------------------------------------------------- betiği köke uyarla
# Gerçek sisteme dokunan komutlar (systemctl, npm, curl, chown...) sahte
# karşılıklarıyla değiştirilir; amaç dosya toplama mantığını sınamak.
uyarla() {
  sed -e "s|/opt/stok/app|$KOK/opt/stok/app|g" \
      -e "s|/var/lib/stok|$KOK/var/lib/stok|g" \
      -e "s|/etc/cloudflared|$KOK/etc/cloudflared|g" \
      -e "s|/root/.cloudflared|$KOK/root/.cloudflared|g" \
      -e "s|/etc/systemd/system|$KOK/etc/systemd/system|g" \
      -e "s|/usr/local/bin|$KOK/usr/local/bin|g" \
      -e "s|/etc/cron.d|$KOK/etc/cron.d|g" \
      -e "s|/etc/logrotate.d|$KOK/etc/logrotate.d|g" \
      -e 's|^set -euo pipefail|set -uo pipefail|' \
      -e 's|\bsystemctl\b|:|g' -e 's|\btimedatectl\b|:|g' \
      -e 's|\bchown\b|:|g' \
      -e 's|sudo -u stok bash -c|bash -c|g' \
      -e 's|sudo -u "\$KULLANICI" bash -c|bash -c|g' \
      -e 's|sudo -u stok |env |g' \
      -e 's|sudo -u "\$KULLANICI" |env |g' \
      -e 's|curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/giris|echo 200|g' \
      -e 's|^if \[ "\$(id -u)" -ne 0 \]|if false|' \
      -e 's|\bnpm run [a-z:]*|true|g' \
      -e 's|\bcloudflared service install\b|true|g' \
      -e 's|command -v cloudflared|false|g' \
      -e 's|\btouch /var/log/stok-yedek.log\b|true|g' \
      -e 's|/var/log/stok-yedek.log|'"$KOK"'/stok-yedek.log|g' \
      "$1"
}

uyarla betikler/sunucu-yedek-al.sh > "$KOK/yedek.sh"
uyarla betikler/sunucu-geri-yukle.sh > "$KOK/geri.sh"
chmod +x "$KOK/yedek.sh" "$KOK/geri.sh"

# ---------------------------------------------------- 1) yedek al
echo "--- yedek alınıyor ---"
bash "$KOK/yedek.sh" "$KOK/hedef" > "$KOK/yedek-cikti.txt" 2>&1
kontrol "yedek betiği hatasız bitti" "$?" "$(tail -3 "$KOK/yedek-cikti.txt")"

ARSIV=$(find "$KOK/hedef" -name '*.tar.gz' | head -1)
[ -n "$ARSIV" ]; kontrol "arşiv oluştu" "$?"
[ -f "$ARSIV.sha256" ]; kontrol "sağlama dosyası oluştu" "$?"
[ "$(stat -c '%a' "$ARSIV")" = "600" ]; kontrol "arşiv izni 600" "$?" "$(stat -c '%a' "$ARSIV" 2>/dev/null)"

ICERIK=$(tar -tzf "$ARSIV")
for beklenen in veri/stok.db ayar/env ayar/cloudflared/config.yml \
                ayar/cloudflared-kimlik/cert.pem ayar/systemd/stok.service \
                ayar/diger/cron-stok-yedek ayar/diger/logrotate-stok-yedek \
                ayar/diger/yedek-betigi.sh KUNYE.txt; do
  echo "$ICERIK" | grep -q "$beklenen"
  kontrol "arşivde $beklenen var" "$?"
done

echo "$ICERIK" | grep -q "saat.conf"; kontrol "systemd drop-in de alınmış" "$?"

# ---------------------------------------------------- 2) geri yükle
echo "--- yeni makineye geri yükleniyor ---"
rm -rf "$KOK/var/lib/stok" "$KOK/etc/cloudflared" "$KOK/root/.cloudflared" \
       "$KOK/etc/systemd/system" "$KOK/etc/cron.d" "$KOK/etc/logrotate.d" \
       "$KOK/usr/local/bin" "$KOK/opt/stok/app/.env"
mkdir -p "$KOK/etc/cron.d" "$KOK/etc/logrotate.d" "$KOK/usr/local/bin"

bash "$KOK/geri.sh" "$ARSIV" > "$KOK/geri-cikti.txt" 2>&1
kontrol "geri yükleme betiği hatasız bitti" "$?" "$(tail -5 "$KOK/geri-cikti.txt")"

grep -q "sahte-veritabani-icerigi" "$KOK/var/lib/stok/stok.db" 2>/dev/null
kontrol "veritabanı yerine geldi" "$?"
grep -q "OTURUM_SIFRESI" "$KOK/opt/stok/app/.env" 2>/dev/null
kontrol ".env yerine geldi" "$?"
grep -q "abc-123-tunel" "$KOK/etc/cloudflared/config.yml" 2>/dev/null
kontrol "tünel yapılandırması yerine geldi" "$?"
[ -f "$KOK/root/.cloudflared/cert.pem" ]; kontrol "tünel kimliği yerine geldi" "$?"
[ -f "$KOK/etc/systemd/system/stok.service.d/saat.conf" ]
kontrol "systemd drop-in yerine geldi" "$?"
grep -q "15 3" "$KOK/etc/cron.d/stok-yedek" 2>/dev/null
kontrol "cron görevi yerine geldi" "$?"
grep -q "monthly" "$KOK/etc/logrotate.d/stok-yedek" 2>/dev/null
kontrol "logrotate tanımı yerine geldi (cron'un üzerine yazmamış)" "$?"
[ -f "$KOK/usr/local/bin/stok-yedek.sh" ]; kontrol "yedek betiği yerine geldi" "$?"

echo
echo "$GECTI geçti, $KALDI kaldı."
[ "$KALDI" -eq 0 ]
