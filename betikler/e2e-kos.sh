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

# İki tip betik var:
#  - Yeni tip: kontrol() kullanır ve "N/M kontrol geçti" özeti basar.
#  - Eski "gezinti" tipi (faz2..faz6, ayarlar, magaza): özet basmaz, beklenti
#    tutmazsa fırlatıp çıkış kodunu bozar. Bu yüzden ASIL ölçüt çıkış kodu;
#    özet satırı varsa ek bilgi olarak gösteriliyor. Önce yalnız özete
#    bakılıyordu ve sorunsuz çalışan eski betikler "çöktü" sanılıyordu.
OZET="$(grep -oE '[0-9]+/[0-9]+ kontrol geçti' "$CIKTI_DOSYA" | tail -1)"

if [ "$KOD" = "0" ]; then
  echo "$SUIT :: ${OZET:-geçti (özet satırı yok — eski tip betik)}"
  exit 0
fi

if [ -n "$OZET" ]; then
  echo "$SUIT :: $OZET"
  grep -E '^  ✗' "$CIKTI_DOSYA" | head -8 | sed 's/^/  /'
  exit 1
fi

SEBEP="$(grep -iE 'error|timeout|exceeded' "$CIKTI_DOSYA" | head -1 | cut -c1-90)"
echo "$SUIT :: ÇÖKTÜ — ${SEBEP:-çıkış kodu $KOD}"
[ "${AYRINTI:-0}" = "1" ] && sed 's/^/    /' "$CIKTI_DOSYA" | tail -25
exit 1
