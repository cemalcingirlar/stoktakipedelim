#!/bin/bash
#
# Sunucunun sayfa üretme süresini ölçer: yavaşlık uygulamada mı, ağda mı?
#
# Neden gerekli: "sayfalar yavaş açılıyor" şikâyetinde iki ayrı şey birbirine
# karışıyor — sunucunun sayfayı üretme süresi ve mağazadan sunucuya giden
# yolun (Cloudflare tüneli, internet hattı) gecikmesi. Bu betik sunucunun
# KENDİ üzerinde, ağı hiç kullanmadan ölçüyor. Sayılar burada küçük çıkıp
# mağazada yavaşlık sürüyorsa sebep ağdır, uygulama değil.
#
#   bash betikler/sunucu-hiz-olc.sh
#
# Çıkan sayılar bu ölçümde (2.500 cihazlık veriyle) şöyleydi: giriş ekranı
# 10-20 ms, cihaz listesi 45 ms, panel 47 ms. 100 bin cihazla panel 144 ms.
# Kendi sunucunuzda bunların birkaç katı çıkması normal (ofis bilgisayarı
# ölçüm makinesinden yavaş olabilir); on katı çıkıyorsa söyleyin.

set -uo pipefail

ADRES="${ADRES:-http://127.0.0.1:3000}"
TUR="${TUR:-7}"

command -v curl >/dev/null || { echo "curl yok"; exit 1; }

if ! curl -s -o /dev/null --max-time 5 "$ADRES/giris"; then
  echo "✗ $ADRES/giris yanıt vermiyor — uygulama çalışıyor mu?"
  echo "  systemctl status stok"
  exit 1
fi

echo "ölçüm: $ADRES · $TUR tur · süreler milisaniye"
echo

olc() {
  local ad="$1" yol="$2"
  local -a sureler=()
  local i sn ms
  for (( i=0; i<TUR; i++ )); do
    sn=$(curl -s -o /dev/null -w '%{time_total}' --max-time 30 "$ADRES$yol")
    ms=$(awk -v s="$sn" 'BEGIN { printf "%d", s * 1000 }')
    sureler+=("$ms")
  done
  # Ortanca: tek bir takılma ortalamayı bozmasın.
  local sirali ortanca
  sirali=$(printf '%s\n' "${sureler[@]}" | sort -n)
  ortanca=$(printf '%s\n' "$sirali" | awk -v n="$TUR" 'NR == int(n/2)+1 { print }')
  # Not: printf alan genişliğini BAYT sayar, Türkçe harfler iki bayt —
  # etiketi sabit genişliğe yazdırmak hizayı bozuyordu.
  echo "$ad: ortanca $ortanca ms   (turlar: $(printf '%s ' "${sureler[@]}"))"
}

# Giriş ekranı oturum gerektirmiyor: saf sunucu + veritabanı süresi.
olc "giriş ekranı" "/giris"
# Oturumsuz istek yönlendirmeye düşer ama yine kullanıcı okuma yolundan
# geçer: oturum denetiminin kendi maliyetini gösterir.
olc "oturum denetimi" "/panel"

echo
echo "Oturum açarak ölçmek için tarayıcıdan:"
echo "  F12 → Network → bir menü ögesine tıklayın → '_rsc' isteğine bakın."
echo "  'Waiting (TTFB)' büyükse sebep sunucu/ağ gecikmesi,"
echo "  'Content Download' büyükse hattın hızı."
