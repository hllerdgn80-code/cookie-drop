#!/usr/bin/env bash
# WireGuard + AdGuard Home kurulum betiği (Ubuntu/Debian)
set -euo pipefail
cd "$(dirname "$0")"

if [ "$(id -u)" -ne 0 ]; then
  echo "Lütfen root olarak çalıştırın: sudo ./setup.sh" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo ">> Docker kuruluyor..."
  curl -fsSL https://get.docker.com | sh
fi

if [ ! -f .env ]; then
  detected_ip="$(curl -fsS https://api.ipify.org || true)"
  read -rp "Sunucunun genel IP'si veya alan adı [${detected_ip}]: " wg_host
  wg_host="${wg_host:-$detected_ip}"

  read -rsp "wg-easy web paneli için şifre belirleyin: " ui_pass; echo
  [ -n "$ui_pass" ] || { echo "Şifre boş olamaz." >&2; exit 1; }

  echo ">> Şifre özeti üretiliyor..."
  hash_line="$(docker run --rm ghcr.io/wg-easy/wg-easy:14 wgpw "$ui_pass" | tr -d '\r')"

  {
    echo "WG_HOST=${wg_host}"
    echo "${hash_line}"
    echo "WG_UI_BIND=0.0.0.0"
  } > .env
  chmod 600 .env
  echo ">> .env oluşturuldu."
fi

# Güvenlik duvarı (ufw varsa)
if command -v ufw >/dev/null 2>&1; then
  ufw allow 51820/udp || true
  ufw allow 51821/tcp || true
fi

docker compose up -d

cat <<MSG

Kurulum tamamlandı.

1) Tarayıcıdan http://$(grep '^WG_HOST=' .env | cut -d= -f2):51821 adresine girip
   şifrenizle oturum açın ve bir istemci (cihaz) oluşturun.
2) Telefona QR kodu okutun ya da .conf dosyasını indirip WireGuard uygulamasına ekleyin.
3) VPN'e bağlıyken http://10.8.1.2:3000 adresinden AdGuard Home ilk kurulumunu yapın
   (ayrıntılar README.md içinde).
MSG
