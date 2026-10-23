#!/usr/bin/env bash
# Bütün e2e süitlerini yalıtılmış ortamlarda çalıştırır ve özet verir.
#
# Her süit kendi veritabanı dosyasını ve kendi portunu kullanır (e2e-kos.sh),
# bu yüzden paralel koşabilirler ve birbirlerinin kayıtlarını göremezler.
#
# Kullanım:
#   betikler/e2e-tumu.sh                 # hepsi
#   betikler/e2e-tumu.sh cihaz-filtre satis   # yalnız verilenler
#   PARALEL=3 betikler/e2e-tumu.sh       # eşzamanlı süit sayısı
set -uo pipefail

KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$KOK"

PARALEL="${PARALEL:-2}"
SONUC_DIZIN="$(mktemp -d "${TMPDIR:-/tmp}/e2e-ozet-XXXXXX")"
trap 'rm -rf "$SONUC_DIZIN"' EXIT

if [ "$#" -gt 0 ]; then
  SUITLER=("$@")
else
  mapfile -t SUITLER < <(ls betikler/*-dogrula.mjs | sed 's|betikler/||; s|-dogrula\.mjs||' | sort)
fi

echo "${#SUITLER[@]} süit, $PARALEL paralel"
echo

PORT=3100
for SUIT in "${SUITLER[@]}"; do
  while [ "$(jobs -rp | wc -l)" -ge "$PARALEL" ]; do sleep 1; done
  PORT=$(( PORT + 1 ))
  (
    CIKTI_SATIR="$(./betikler/e2e-kos.sh "$SUIT" "$PORT" 2>&1)"
    DURUM=$?
    printf '%s\n' "$CIKTI_SATIR" > "$SONUC_DIZIN/$SUIT.txt"
    echo "$DURUM" > "$SONUC_DIZIN/$SUIT.kod"
    printf '%s\n' "$CIKTI_SATIR"
  ) &
done
wait

echo
echo "================ ÖZET ================"
GECEN=0; DUSEN=0; COKEN=0
for SUIT in "${SUITLER[@]}"; do
  KOD="$(cat "$SONUC_DIZIN/$SUIT.kod" 2>/dev/null || echo 2)"
  SATIR="$(head -1 "$SONUC_DIZIN/$SUIT.txt" 2>/dev/null || echo "$SUIT :: SONUÇ YOK")"
  case "$KOD" in
    0) GECEN=$(( GECEN + 1 ));;
    1) if grep -q 'ÇÖKTÜ' <<<"$SATIR"; then COKEN=$(( COKEN + 1 )); else DUSEN=$(( DUSEN + 1 )); fi;;
    *) COKEN=$(( COKEN + 1 ));;
  esac
  [ "$KOD" != "0" ] && printf '  %s\n' "$SATIR"
done

echo
echo "geçen: $GECEN · düşen: $DUSEN · çöken: $COKEN · toplam: ${#SUITLER[@]}"
[ "$DUSEN" = "0" ] && [ "$COKEN" = "0" ] && { echo "TÜMÜ GEÇTİ"; exit 0; }
exit 1
