# WireGuard VPN + Reklam Engelleyici (AdGuard Home)

Tek paket: kendi sunucunuzda çalışan bir **WireGuard VPN** ve bu VPN'e bağlı tüm
cihazlarda reklamları, izleyicileri ve kötü amaçlı alan adlarını engelleyen
**AdGuard Home**.

```
Telefon / PC ──WireGuard──▶ wg-easy (10.8.1.3) ──▶ İnternet
                                │
                                └─ DNS sorguları ─▶ AdGuard Home (10.8.1.2)
                                                     reklam alan adlarını engeller
```

## İçerik

| Dosya | Açıklama |
|---|---|
| `docker-compose.yml` | WireGuard (wg-easy) + AdGuard Home servisleri |
| `setup.sh` | Docker kurar, `.env` dosyasını oluşturur, servisleri başlatır |
| `.env.example` | Ayar şablonu (sunucu IP'si, panel şifresi özeti) |
| `client.conf.example` | Elle yapılandırma için örnek istemci dosyası |

## Gereksinimler

- Ubuntu/Debian bir VPS (1 vCPU / 512 MB RAM yeterli)
- Sağlayıcı güvenlik duvarında açık portlar: **51820/UDP** (VPN) ve **51821/TCP** (web paneli)

## Kurulum

```bash
# paketi sunucuya kopyalayın, sonra:
cd wireguard-adblock
sudo ./setup.sh
```

Betik sunucu IP'sini ve panel şifresini sorar, ardından her şeyi başlatır.

### 1. İstemci oluşturma

1. `http://SUNUCU_IP:51821` adresine gidin, şifrenizle giriş yapın.
2. **+ New Client** ile her cihaz için bir istemci oluşturun.
3. Telefonda WireGuard uygulamasından QR kodu okutun; bilgisayarda `.conf`
   dosyasını indirip WireGuard'a içe aktarın.

İstemci dosyalarında `DNS = 10.8.1.2` otomatik olarak gelir; reklam engelleme
bu sayede çalışır.

### 2. AdGuard Home ilk kurulumu (bir kez)

VPN'e **bağlıyken** `http://10.8.1.2:3000` adresini açın:

1. **Yönetici Web Arayüzü**: Tüm arayüzler, port **80**
2. **DNS sunucusu**: Tüm arayüzler, port **53**
3. Kullanıcı adı/şifre belirleyin ve bitirin.

Bundan sonra panel `http://10.8.1.2` adresindedir (yalnızca VPN içinden erişilebilir,
internete açık değildir).

### 3. Önerilen engelleme listeleri

AdGuard Home → **Filtreler → DNS engelleme listeleri → Engelleme listesi ekle → Özel liste ekle**:

| Liste | URL |
|---|---|
| AdGuard DNS filter (varsayılan) | `https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt` |
| OISD Big | `https://big.oisd.nl` |
| Hagezi Multi PRO | `https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.txt` |
| Türkçe reklam listesi (AdGuard Turkish) | `https://adguardteam.github.io/HostlistsRegistry/assets/filter_26.txt` |

Önerilen ek ayarlar (**Ayarlar → DNS ayarları**):
- Üst akış DNS: `https://dns.cloudflare.com/dns-query` ve `https://dns.quad9.net/dns-query`
- Önbellek boyutu: 4 MB ile 16 MB arası
- **Ayarlar → Genel ayarlar**: "Güvenli Tarama" açık

## Doğrulama

VPN'e bağlıyken:

```bash
nslookup doubleclick.net 10.8.1.2   # 0.0.0.0 dönmeli → engellendi
```

ya da tarayıcıdan https://d3ward.github.io/toolz/adblock adresinde test edin.
AdGuard panelindeki **Sorgu günlüğü** engellenen istekleri gösterir.

## Bakım

```bash
docker compose pull && docker compose up -d   # güncelle
docker compose logs -f wg-easy                # VPN günlükleri
docker compose down                           # durdur
```

Yedeklenecek klasörler: `wireguard/` (VPN anahtarları), `adguard/` (AdGuard ayarları), `.env`.

## Sık karşılaşılan sorunlar

- **Bağlanıyor ama internet yok**: Sağlayıcının güvenlik duvarında 51820/UDP açık mı?
  `.env` içindeki `WG_HOST` doğru genel IP mi?
- **Reklamlar hâlâ görünüyor**: Tarayıcıda "Güvenli DNS (DoH)" kapalı olmalı, aksi halde
  tarayıcı VPN DNS'ini atlar. YouTube reklamları DNS ile engellenemez.
- **Bir site bozuldu**: AdGuard → Sorgu günlüğü → ilgili alan adında **Engellemeyi kaldır**.
- **Web panelini internete açmak istemiyorum**: `.env` içinde `WG_UI_BIND=127.0.0.1`
  yapın ve `ssh -L 51821:localhost:51821 kullanici@SUNUCU_IP` ile erişin.
