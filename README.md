# Harmonic Analysis — yayınlama & veri toplama rehberi

Bu klasör, **tarayıcıda çalışan** (indirme yok) analiz sitesinin dağıtıma hazır halidir.
Ziyaretçi melodi + akor MIDI'sini bırakır, site analizi gösterir, ve her analizin bir
kopyası **senin** Cloudflare veritabanına düşer. Hiçbir sır uygulamanın içinde değildir.

```
harmonic-analysis/
├── index.html            ← uygulama (tek dosya, tarayıcıda çalışır)
├── privacy.html          ← "ne saklanıyor" sayfası (iletişim adresini ekle!)
├── functions/api/
│   ├── collect.js        ← POST /api/collect  → analizi D1'e yazar
│   └── export.js         ← GET  /api/export   → sadece SEN (token ile) veriyi çeker
├── schema.sql            ← veritabanı tablosu
├── wrangler.toml         ← Cloudflare yapılandırması (sır YOK)
├── .dev.vars.example     ← yerel test için örnek (gerçeği .dev.vars, git'e girmez)
└── .gitignore
```

---

## Mimari — ve neden güvenli

```
  Ziyaretçinin tarayıcısı                 Cloudflare (senin hesabın)
 ┌───────────────────────┐              ┌──────────────────────────────┐
 │ index.html            │  POST /api/  │ Pages Function (collect.js)  │
 │  • MIDI'yi OKUR        │ ──collect──▶ │  • same-origin + boyut kontr.│
 │  • tarayıcıda ANALİZ   │   (JSON)     │  • D1'e INSERT               │
 │  • sonucu gösterir     │              └─────────────┬────────────────┘
 └───────────────────────┘                            │ binding: env.DB
                                            ┌──────────▼───────────┐
   Sen (yönetici)                           │ D1 (SQLite) veritabanı│
   GET /api/export?token=… ◀────────────────┤  analyses tablosu     │
   (ADMIN_TOKEN sunucu sırrı)               └───────────────────────┘
```

- **MIDI dosyaları sunucuya gitmez** — analiz ziyaretçinin cihazında yapılır. Yalnızca
  türetilmiş analiz + nota verisi (JSON) gönderilir.
- **Uygulamanın içinde (`index.html`) hiçbir API anahtarı, e-posta veya kişisel veri yok.**
  Kanıt: `grep` taraması temiz; tek dış bağlantı Google Fonts.
- **Veritabanı erişimi bir "binding" (`env.DB`)** ile olur — bağlantı dizesi/şifre yok, ve
  bu sadece sunucu tarafında (Function içinde) görünür.
- **Veriyi çekmek için gereken `ADMIN_TOKEN`** şifreli bir Cloudflare sırrıdır; ne
  `index.html`'de ne de git'te bulunur (`.gitignore` bunu engeller).

---

## Gereksinimler

- **Node.js 18+** (kontrol: `node -v`). Yoksa: https://nodejs.org (LTS).
- **Ücretsiz bir Cloudflare hesabı**: https://dash.cloudflare.com/sign-up
- Ekstra kurulum yok — `wrangler` aracını `npx` ile çalıştıracağız.

> Aşağıdaki tüm komutları bu klasörün içinde çalıştır:
> `cd "/Users/mac/harmonic-analysis"`

---

## Tek seferlik kurulum

### 1) Cloudflare'e giriş yap
```bash
npx wrangler login
```
Tarayıcı açılır, "Allow" de. (Hesap seçimi sorulursa kendi hesabını seç.)

### 2) Veritabanını oluştur
```bash
npx wrangler d1 create harmonic-analysis-db
```
Çıktıdaki `database_id = "..."` değerini kopyala ve **`wrangler.toml`** içindeki
`PASTE_YOUR_D1_DATABASE_ID_HERE` yerine yapıştır.

### 3) Tabloyu kur
```bash
npx wrangler d1 execute harmonic-analysis-db --remote --file=./schema.sql
```

### 4) Yönetici sırrını (token) belirle
Önce uzun rastgele bir değer üret:
```bash
openssl rand -hex 24
```
Bu değeri bir yere kaydet (veriyi indirirken lazım), sonra sır olarak yükle:
```bash
npx wrangler pages secret put ADMIN_TOKEN
```
İstenince yapıştır. (İlk `pages secret` komutu proje yoksa oluşturmanı isteyebilir —
sorulursa proje adını `harmonic-analysis` yap. Aksi halde önce 5. adımı çalıştır, sonra bunu.)

### 5) Yayınla
```bash
npx wrangler pages deploy .
```
Bittiğinde sana bir adres verir: `https://harmonic-analysis.pages.dev` (ya da benzeri).
**Site artık canlı.** Her `deploy` çalıştırdığında güncellenir.

> **D1 bağlaması Pages'te görünmüyorsa:** Cloudflare panosu → **Workers & Pages** →
> `harmonic-analysis` → **Settings → Functions → D1 database bindings** → *Add binding*,
> Variable name: `DB`, D1 database: `harmonic-analysis-db` → Save. Sonra tekrar `deploy`.

---

## Doğrula (2 dakika)

1. Verdiği adresi aç, iki MIDI bırak, **Analyze**'a bas — analiz görünmeli.
2. "keep an anonymous copy" kutusu işaretliyken analiz veritabanına düşer. Kontrol:
```bash
npx wrangler d1 execute harmonic-analysis-db --remote --command "SELECT count(*) AS n FROM analyses"
```

---

## Veriyi çekme (sadece sen)

Tarayıcıda ya da `curl` ile — `TOKEN` yerine kendi ADMIN_TOKEN'ını yaz:

- **JSON** (analiz + ham nota verisi dahil):
  `https://SENIN-ADRESIN.pages.dev/api/export?token=TOKEN`
- **CSV** (özet sütunlar, tabloya döker):
  `https://SENIN-ADRESIN.pages.dev/api/export?format=csv&token=TOKEN`
- Filtreler: `&limit=1000`, `&since=<ms-zaman-damgası>`

Doğrudan SQL de çalıştırabilirsin:
```bash
npx wrangler d1 execute harmonic-analysis-db --remote --command "SELECT created_at,key_name,mode_name,bars,chord_count FROM analyses ORDER BY created_at DESC LIMIT 20"
```

> `?token=` yanlışsa endpoint **401** döner — token olmadan kimse veriyi göremez.

---

## Yerel test (opsiyonel, yayınlamadan önce)

```bash
cp .dev.vars.example .dev.vars     # içine bir test ADMIN_TOKEN yaz
npx wrangler pages dev .
```
`http://localhost:8788` açılır; Functions + D1 yerel olarak çalışır.

---

## Güvenlik kontrol listesi

- [x] `index.html` içinde API anahtarı / e-posta / kişisel veri **yok** (tarandı, temiz).
- [x] `ADMIN_TOKEN` şifreli sır — koda ve git'e **girmiyor** (`.gitignore`).
- [x] `/api/collect` **same-origin** kontrolü + **boyut limiti** (~600 KB) uygular.
- [x] `/api/export` yalnızca doğru token ile yanıt verir (401 aksi halde).
- [ ] **`privacy.html`'e bir iletişim adresi ekle** (kaldırma talepleri için) — yayından önce.
- [ ] **Gizlilik/rıza:** Otomatik toplama seçtin. Sitedeki bildirim + "kopya tutma" kutusu
      bu yüzden var — **onları kaldırma.** AB'li ziyaretçin olacaksa açık rıza (KVKK/GDPR)
      için kutuyu varsayılan *kapalı* yapmayı düşün (index.html'de `id="optSave"` → `checked`'i kaldır).
- [ ] (Opsiyonel) Bot/spam'a karşı Cloudflare **Turnstile** veya panodan **Rate limiting** ekle.
- [ ] Token'ı sızdırırsan: yeni `openssl rand -hex 24` üret, `pages secret put ADMIN_TOKEN` ile değiştir.

---

## Sürüm güncelleme / özel alan adı

- Uygulamada değişiklik → dosyayı düzenle → `npx wrangler pages deploy .`
- Kendi alan adın: Pages projesi → **Custom domains** → alan ekle (DNS Cloudflare'deyse tek tık).

## Maliyet
Cloudflare Pages + Functions + D1'in ücretsiz katmanı bu iş için fazlasıyla yeter
(günde 100k istek, 5 GB D1). Küçük/orta trafikte ücret çıkmaz.
