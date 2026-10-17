#!/usr/bin/env bash
# Çalışan bir WireGuard sunucusuna AdGuard Home reklam engelleyici ekler.
# Kullanım: sudo ./install.sh [arayuz]   (varsayılan: wg0)
set -euo pipefail
cd "$(dirname "$0")"

WG_IF="${1:-wg0}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Lütfen root olarak çalıştırın: sudo ./install.sh" >&2
  exit 1
fi

WG_IP="$(ip -4 -o addr show dev "$WG_IF" 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1)"
if [ -z "$WG_IP" ]; then
  echo "'$WG_IF' arayüzü bulunamadı. WireGuard açık mı? Farklı bir adsa: sudo ./install.sh <arayuz>" >&2
  exit 1
fi
echo ">> WireGuard arayüzü: $WG_IF ($WG_IP)"

if ! command -v docker >/dev/null 2>&1; then
  echo ">> Docker kuruluyor..."
  curl -fsSL https://get.docker.com | sh
fi

echo "WG_IP=${WG_IP}" > .env

# Açılışta Docker, WireGuard arayüzü hazır olduktan sonra başlasın
if systemctl is-enabled --quiet "wg-quick@${WG_IF}" 2>/dev/null; then
  mkdir -p /etc/systemd/system/docker.service.d
  cat > /etc/systemd/system/docker.service.d/after-wireguard.conf <<UNIT
[Unit]
After=wg-quick@${WG_IF}.service
Wants=wg-quick@${WG_IF}.service
UNIT
  systemctl daemon-reload
fi

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow in on "$WG_IF" to any port 53 || true
  ufw allow in on "$WG_IF" to any port 3000 proto tcp || true
fi

docker compose up -d

cat <<MSG

AdGuard Home çalışıyor.

1) VPN'e bağlıyken http://${WG_IP}:3000 adresini açıp ilk kurulumu yapın
   (Yönetici arayüzü portu: 3000, DNS portu: 53).
2) İstemcilerin DNS'ini AdGuard'a yönlendirin. İki seçenek var (README.md):
   A) İstemci dosyalarında:   DNS = ${WG_IP}
   B) İstemcilere dokunmadan, sunucuda yönlendirme yapmak için:
      sudo ./dns-redirect.sh ${WG_IF}
MSG
