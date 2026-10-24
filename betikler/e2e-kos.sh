#!/usr/bin/env bash
# Tek bir e2e süitini YALITILMIŞ ortamda çalıştırır.
#
# Neden gerekli: süitler aynı dev.db dosyasını ve 3000 portunu paylaşıyordu.
# Çoğu "listede tam 6 cihaz var" gibi MUTLAK sayılar varsayıyor; bir süitin
# bıraktığı kayıtlar diğerini düşürüyordu. Bu, sahte başarısızlık üretmenin
# yanı sıra gerçek bir hatayı da maskeleyebilir.
#
# Her çalıştırma kendi veritabanı dosyasını ve kendi portunu kullanır, böylece
# süitler birbirini göremez ve paralel koşabilirler.
#
# Kullanım:  betikler/e2e-kos.sh <süit-adı> [port]
#   örnek:   betikler/e2e-kos.sh cihaz-filtre
set -uo pipefail

KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUIT="${1:?süit adı gerekli, örn: cihaz-filtre}"
BETIK="$KOK/betikler/${SUIT}-dogrula.mjs"
[ -f "$BETIK" ] || { echo "$SUIT :: BETİK YOK"; exit 2; }

# Port: verilmezse süit adından türetilen sabit bir değer (çakışmayı azaltır).
if [ "${2:-}" != "" ]; then
  PORT="$2"
else
  TOPLAM=0
  for (( i=0; i<${#SUIT}; i++ )); do
    TOPLAM=$(( TOPLAM + $(printf '%d' "'${SUIT:$i:1}") ))
  done
  PORT=$(( 3100 + TOPLAM % 700 ))
fi

# Port boş olmalı. Önceki bir çalıştırmadan kalan sunucu aynı portu
# tutuyorsa curl hemen cevap alır ve süit ESKİ derlemeye karşı koşar —
# sonuçlar sessizce yanlış çıkar. Boş port bulunana kadar ilerliyoruz.
for _ in $(seq 1 60); do
  if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/" 2>/dev/null; then
    PORT=$(( PORT + 1 ))
  else
    break
  fi
done

CALISMA="$(mktemp -d "${TMPDIR:-/tmp}/e2e-${SUIT}-XXXXXX")"
VT="$CALISMA/test.db"
GUNLUK="$CALISMA/sunucu.log"
SUNUCU_PID=""

temizle() {
  [ -n "$SUNUCU_PID" ] && kill -9 "$SUNUCU_PID" 2>/dev/null
  rm -rf "$CALISMA"
}
trap temizle EXIT

cd "$KOK"
export DATABASE_URL="file:$VT"
# Yedekleme ucunun yetki yolu ancak anahtar tanımlıyken denenebilir;
# tanımsızken uç 503 döndürüyor ve 401 kontrolleri anlamsız kalıyor.
export YEDEK_ANAHTARI="${YEDEK_ANAHTARI:-e2e-test-anahtari-0123456789}"

npx prisma migrate deploy >/dev/null 2>&1 || { echo "$SUIT :: MIGRATE HATASI"; exit 2; }
npx tsx prisma/seed.ts >/dev/null 2>&1 || { echo "$SUIT :: SEED HATASI"; exit 2; }

PORT="$PORT" npm start >"$GUNLUK" 2>&1 &
SUNUCU_PID=$!

HAZIR=0
for _ in $(seq 1 60); do
  if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/giris" 2>/dev/null; then HAZIR=1; break; fi
  kill -0 "$SUNUCU_PID" 2>/dev/null || break
  sleep 1
done
if [ "$HAZIR" != "1" ]; then
  echo "$SUIT :: SUNUCU AÇILMADI (port $PORT)"
  tail -5 "$GUNLUK" | sed 's/^/    /'
  exit 2
fi
sleep 1

CIKTI_DOSYA="$CALISMA/sonuc.txt"
HEDEF="http://127.0.0.1:$PORT" \
CIKTI="${CIKTI:-/tmp}/e2e-$SUIT" \
CHROME_YOLU="${CHROME_YOLU:-/opt/pw-browsers/chromium}" \
  timeout "${SUIT_ZAMAN_ASIMI:-420}" node "$BETIK" >"$CIKTI_DOSYA" 2>&1
KOD=$?

# Her betik kontrol() kullanıp "N/M kontrol geçti" özeti basar ve bir kontrol
# tutmazsa çıkış kodunu bozar. Eskiden bir kısmı (faz2..faz6, ayarlar, magaza)
# yalnız ✓/✗ yazdırıyor, hiçbir beklentiyi saymıyordu: ✗ yazan bir kontrol
# aylarca "geçti" görünebiliyordu. O yüzden özet satırının YOKLUĞU da artık
# bir hata — betik yarıda ölmüş ya da eski tipte kalmış demektir.
OZET="$(grep -oE '[0-9]+/[0-9]+ kontrol geçti' "$CIKTI_DOSYA" | tail -1)"

if [ "$KOD" = "0" ]; then
  if [ -z "$OZET" ]; then
    echo "$SUIT :: ÖZET YOK — betik kontrol() kullanmıyor ya da yarıda bitti"
    [ "${AYRINTI:-0}" = "1" ] && sed 's/^/    /' "$CIKTI_DOSYA" | tail -25
    exit 1
  fi
  echo "$SUIT :: $OZET"
  exit 0
fi

if [ -n "$OZET" ]; then
  echo "$SUIT :: $OZET"
  grep -E '^ *✗' "$CIKTI_DOSYA" | head -8 | sed 's/^/  /'
  exit 1
fi

SEBEP="$(grep -iE 'error|timeout|exceeded' "$CIKTI_DOSYA" | head -1 | cut -c1-90)"
echo "$SUIT :: ÇÖKTÜ — ${SEBEP:-çıkış kodu $KOD}"
[ "${AYRINTI:-0}" = "1" ] && sed 's/^/    /' "$CIKTI_DOSYA" | tail -25
exit 1
