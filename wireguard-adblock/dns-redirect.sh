#!/usr/bin/env bash
# VPN istemcilerinin tüm DNS sorgularını (hangi DNS'i kullanırlarsa kullansınlar)
# AdGuard Home'a yönlendirir. Böylece istemci dosyalarını değiştirmeniz gerekmez.
# Kullanım: sudo ./dns-redirect.sh [arayuz]          (ekle)
#           sudo ./dns-redirect.sh [arayuz] --remove (kaldır)
set -euo pipefail

WG_IF="${1:-wg0}"
ACTION="-A"
[ "${2:-}" = "--remove" ] && ACTION="-D"

WG_IP="$(ip -4 -o addr show dev "$WG_IF" | awk '{print $4}' | cut -d/ -f1 | head -n1)"

for proto in udp tcp; do
  rule=(PREROUTING -i "$WG_IF" -p "$proto" --dport 53 ! -d "$WG_IP" -j DNAT --to-destination "${WG_IP}:53")
  if [ "$ACTION" = "-A" ]; then
    iptables -t nat -C "${rule[@]}" 2>/dev/null || iptables -t nat -A "${rule[@]}"
  else
    iptables -t nat -D "${rule[@]}" 2>/dev/null || true
  fi
done

if [ "$ACTION" = "-A" ]; then
  cat <<MSG
>> DNS yönlendirmesi eklendi.

Yeniden başlatmada kalıcı olması için /etc/wireguard/${WG_IF}.conf içindeki
[Interface] bölümüne şu satırları ekleyin:

PostUp = iptables -t nat -A PREROUTING -i %i -p udp --dport 53 ! -d ${WG_IP} -j DNAT --to-destination ${WG_IP}:53; iptables -t nat -A PREROUTING -i %i -p tcp --dport 53 ! -d ${WG_IP} -j DNAT --to-destination ${WG_IP}:53
PostDown = iptables -t nat -D PREROUTING -i %i -p udp --dport 53 ! -d ${WG_IP} -j DNAT --to-destination ${WG_IP}:53; iptables -t nat -D PREROUTING -i %i -p tcp --dport 53 ! -d ${WG_IP} -j DNAT --to-destination ${WG_IP}:53
MSG
else
  echo ">> DNS yönlendirmesi kaldırıldı."
fi
