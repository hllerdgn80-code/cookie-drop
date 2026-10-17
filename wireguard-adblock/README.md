# WireGuard için Reklam Engelleyici (AdGuard Home)

**Halihazırda çalışan** bir WireGuard sunucusuna eklenen reklam engelleyici.
VPN ayarlarınıza dokunmaz; VPN'e bağlı cihazların DNS sorgularını AdGuard Home'dan
geçirerek reklamları, izleyicileri ve zararlı alan adlarını engeller.

```
Telefon / PC ──WireGuard (mevcut)──▶ Sunucu ──▶ İnternet
                                       │
                                       └─ DNS ─▶ AdGuard Home (wg0 IP'si, ör. 10.8.0.1)
```

AdGuard Home yalnızca WireGuard arayüzünün IP'sini dinler. İnternete hiçbir port açılmaz.

## İçerik

| Dosya | Açıklama |
|---|---|
| `docker-compose.yml` | AdGuard Home servisi |
| `install.sh` | WireGuard IP'sini bulur, Docker'ı kurar (gerekirse), AdGuard'ı başlatır |
| `dns-redirect.sh` | İstemci dosyalarını değiştirmeden tüm DNS'i AdGuard'a yönlendirir (isteğe bağlı) |

## Kurulum

Klasörü WireGuard sunucusuna kopyalayın ve şunu çalıştırın:

```bash
cd wireguard-adblock
sudo ./install.sh          # arayüzün adı wg0 değilse: sudo ./install.sh <arayuz>
```

### 1. AdGuard Home ilk kurulumu (bir kez)

VPN'e **bağlıyken** `http://<WG_IP>:3000` adresini açın (ör. `http://10.8.0.1:3000`):

1. **Yönetici Web Arayüzü**: Tüm arayüzler, port **3000**. Port 3000'de kalmalı, çünkü yalnızca bu port yayınlanıyor.
2. **DNS sunucusu**: Tüm arayüzler, port **53**
3. Kullanıcı adı ve şifre belirleyin.

### 2. Cihazları AdGuard'a yönlendirin

İki yoldan birini seçin:

**A) İstemci dosyalarını düzenleyin.** Her cihazın WireGuard ayarında `[Interface]` altındaki DNS satırını şöyle değiştirin:

```ini
DNS = 10.8.0.1   # kendi wg0 IP'niz
```

Telefonda WireGuard uygulamasında tünele dokunun, **Düzenle**'yi seçin, DNS sunucularını değiştirin ve kaydedin.

**B) Sunucuda yönlendirme yapın (istemcilere dokunmadan):**

```bash
sudo ./dns-redirect.sh wg0
```

Betik VPN'den gelen tüm 53. port DNS sorgularını AdGuard'a yönlendirir. Yeniden başlatmadan
sonra da kalıcı olması için betiğin yazdığı `PostUp`/`PostDown` satırlarını
`/etc/wireguard/wg0.conf` dosyasına ekleyin. Kaldırmak için: `sudo ./dns-redirect.sh wg0 --remove`

> Not: Cihazda şifreli DNS (Android'de "Özel DNS", tarayıcıda "Güvenli DNS") açıksa
> sorgular bu yönlendirmeyi atlar. En sağlam yol A seçeneği ile birlikte bu ayarları kapatmaktır.

### 3. Önerilen engelleme listeleri

AdGuard → **Filtreler → DNS engelleme listeleri → Engelleme listesi ekle → Özel liste ekle**:

| Liste | URL |
|---|---|
| AdGuard DNS filter (varsayılan) | `https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt` |
| OISD Big | `https://big.oisd.nl` |
| Hagezi Multi PRO | `https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.txt` |
| AdGuard Turkish (Türkçe reklamlar) | `https://adguardteam.github.io/HostlistsRegistry/assets/filter_26.txt` |

**Ayarlar → DNS ayarları → Üst akış DNS** için önerilenler: `https://dns.cloudflare.com/dns-query`
ve `https://dns.quad9.net/dns-query`.

## Test

VPN'e bağlıyken:

```bash
nslookup doubleclick.net 10.8.0.1   # 0.0.0.0 dönmeli, yani engellendi
nslookup doubleclick.net 1.1.1.1    # B seçeneği açıksa bu da 0.0.0.0 dönmeli
```

Tarayıcı testi için https://d3ward.github.io/toolz/adblock adresini açın. Engellenen istekler
AdGuard'daki **Sorgu günlüğü** ekranında görünür.

## Sık karşılaşılan sorunlar

- **`install.sh` arayüzü bulamıyor**: `ip a` ile WireGuard arayüzünün adını kontrol edin
  ve adı betiğe parametre olarak verin.
- **VPN'e bağlıyken internet çalışmıyor**: AdGuard kapalıysa DNS çözümlenmez. `docker compose ps` ile
  durumunu kontrol edin, gerekirse istemcide DNS'i geçici olarak `1.1.1.1` yapın.
- **Bir site bozuldu**: AdGuard → Sorgu günlüğü → ilgili alan adı → **Engellemeyi kaldır**.
- **YouTube reklamları**: Videodaki reklamlar YouTube ile aynı alan adından geldiği için DNS ile engellenemez.

## Bakım

```bash
docker compose pull && docker compose up -d   # güncelle
docker compose down                           # durdur
```

Yedeklemek için `adguard/` klasörünü saklayın.
