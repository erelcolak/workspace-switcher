# Workspace Switcher — Claude Code Yönergeleri

Bu proje, `~/Developer` altındaki `.code-workspace` dosyalarını tarayıp **Activity Bar** ve **Status Bar** üzerinden tek tıkla (yeni pencerede) açan bağımsız bir **VSCode eklentisidir**. Datasoft.HR repo'sundan tamamen ayrıdır.

## Teknoloji Yığını

- **Dil:** TypeScript (`strict: true`), CommonJS, hedef ES2020.
- **Çalışma zamanı bağımlılığı:** Yok — yalnızca Node `fs`/`path`/`os` ve `vscode` API'si.
- **Geliştirme bağımlılıkları:** `typescript`, `@types/vscode`, `@types/node`.
- **Derleme:** `tsc -p ./` → çıktı `out/` klasörüne. `main` alanı `./out/extension.js`'i gösterir.

## Klasör Yapısı

```
workspace-switcher/
├─ package.json            # Eklenti manifestosu: contributes (view, command, config), scriptler
├─ tsconfig.json           # strict TS, rootDir=src, outDir=out
├─ media/workspaces.svg    # Activity Bar container ikonu (monokrom)
├─ .vscode/
│  ├─ launch.json          # F5 "Run Extension" (extensionHost)
│  └─ tasks.json           # npm: compile / npm: watch
├─ src/
│  ├─ extension.ts         # activate(): view + status bar + komut kayıtları
│  ├─ scanner.ts           # Saf tarama mantığı + JSONC parse (vscode'dan bağımsız)
│  ├─ colorIcon.ts         # Renk → SVG ikon üretimi (saf Node, vscode'dan bağımsız)
│  ├─ treeProvider.ts      # Activity Bar TreeDataProvider + WorkspaceItem
│  └─ statusBar.ts         # Status Bar item fabrikası
├─ .claude/
│  ├─ plans/               # tamamlanan iş adımlarının kalıcı kaydı (01-setup.md, 02-…)
│  ├─ progress/            # done.md (yapılan) / current.md (şu anki) / next.md (yapılacak)
│  └─ deploy/              # 01-local.md (F5/geliştirme) · 02-vsix.md (paketleme+kurulum)
└─ out/                    # Derleme çıktısı (gitignore'da)
```

## Mimari ve Sorumluluklar

| Dosya | Sorumluluk | Bağımlılık |
| --- | --- | --- |
| `scanner.ts` | Dosya sistemi tarama, `WorkspaceEntry` üretimi, JSONC parse ile `iconColor` okuma, `~` genişletme | **Saf** — `vscode` import ETMEZ |
| `colorIcon.ts` | Hex renk doğrulama + o renkte SVG ikon üretip cache'leme | **Saf** — `vscode` import ETMEZ (`fs`/`path`) |
| `treeProvider.ts` | Ağaç görünümü modeli, ikon/etiket eşlemesi | `vscode` + `scanner` + `colorIcon` |
| `statusBar.ts` | Status Bar butonu | `vscode` |
| `extension.ts` | Orkestrasyon: config okuma, komutlar, `vscode.openFolder` | hepsi |

**Kural:** `scanner.ts` ve `colorIcon.ts` `vscode` modülünü import etmemeli — Node ile (`node -e ...`) doğrudan smoke-test edilebilir kalmalı. UI/komut mantığı `extension.ts`'te toplanır. Üretilen SVG ikonlar `context.globalStorageUri` altına yazılır; `treeProvider`/`extension` dönen yolu `vscode.Uri.file` ile sarar.

## Tarama Davranışı (KESİN)

- **Yalnızca `.code-workspace` dosyaları listelenir.** Git repo klasörleri listelenmez.
- `.code-workspace` dosyaları bulundukları her seviyede listelenir (git repo'ları içindekiler dâhil — repo bulununca tarama durmaz).
- Semboliik bağlantı dizinleri takip edilmez (`Dirent.isDirectory()` symlink'te `false` → döngü riski yok).
- Otomatik atlanan klasörler `scanner.ts` içindeki `DEFAULT_IGNORE`'da (`node_modules`, `dist`, `out`, `.next`, `target`, `vendor`, `.git`, gizli `.` dizinleri vb.).
- Sonuçlar `fsPath` ile tekilleştirilir ve ada göre alfabetik sıralanır.
- Tarama sırasında her `.code-workspace` dosyası JSONC olarak parse edilir (yorum + trailing comma toleranslı) ve `settings["workspaceSwitcher.iconColor"]` değeri `WorkspaceEntry.color`'a okunur. Geçerli hex renk (örn. `#d173f1`) varsa o renkte bir **katman (layers) SVG ikonu** üretilir (media/workspaces.svg ile aynı şekil); renk yoksa temaya uyumlu (açık/koyu) varsayılan katman ikonu kullanılır (storage yazılamazsa `$(layers)` codicon'a düşer). Her durumda aynı ikon kullanılır — yalnızca tint farklıdır, ad hiç değişmez.

## Komutlar ve Katkılar

- `workspaceSwitcher.refresh` — yeniden tarar (view başlığındaki yenile ikonu).
- `workspaceSwitcher.openInNewWindow` — satıra tıklama varsayılan aksiyonu (`forceNewWindow: true`).
- `workspaceSwitcher.openInCurrentWindow` — satır context/inline aksiyonu.
- `workspaceSwitcher.quickPick` — Status Bar butonunun çağırdığı QuickPick.
- Açma: her zaman `vscode.commands.executeCommand("vscode.openFolder", uri, { forceNewWindow })`.

## Ayarlar

| Ayar | Varsayılan | Açıklama |
| --- | --- | --- |
| `workspaceSwitcher.rootFolders` | `["~/Developer"]` | Taranacak kökler (`~` ev dizinine genişler) |
| `workspaceSwitcher.maxDepth` | `4` | Kökten itibaren maksimum derinlik |
| `workspaceSwitcher.ignoreFolders` | `[]` | Ek atlanacak klasör adları |
| `workspaceSwitcher.iconColor` | `""` | Listedeki ikon rengi (hex). İlgili `.code-workspace` dosyasının `settings` bloğuna yazılır |

Config değiştiğinde `onDidChangeConfiguration` ile liste otomatik yenilenir.

## Geliştirme Akışı

```bash
npm install
npm run compile     # veya: npm run watch (sürekli derleme)
```

- Çalıştırma: VSCode'da klasörü aç → **F5** ("Run Extension"). Açılan Extension Development Host penceresinde değişiklik sonrası `Cmd+R` ile yeniden yükle.
- Scanner smoke-test (UI olmadan):
  ```bash
  node -e "require('./out/scanner').scanWorkspaces(['~/Developer'],4,[]).then(r=>console.log(r.length,'workspace'))"
  ```
- Paketleme: `vsce package` → `.vsix`; kurulum `code --install-extension *.vsix`.

## İlerleme Takibi (ÖNEMLİ)

Proje ilerlemesi `.claude/` altında izlenir:

- `.claude/plans/NN-*.md` — tamamlanan iş bloklarının kalıcı kaydı (örn. `01-setup.md`).
- `.claude/progress/done.md` — yapılanlar.
- `.claude/progress/current.md` — şu anki durum + sıradaki odak.
- `.claude/progress/next.md` — yapılacaklar.

**Kural:** Kullanıcı **ara vermek / durmak** istediğini belirttiğinde (ör. "ara verelim", "buraya kadar", "şimdilik bu kadar", "devam ederiz"), o ana kadar yapılanları **mutlaka** `.claude/progress/` dosyalarına yaz: biten işleri `done.md`'ye ekle, `current.md`'yi güncelle, kalanları `next.md`'ye taşı. Belirgin bir aşama tamamlandığında ek olarak yeni bir `plans/NN-*.md` kaydı oluştur.

## Konvansiyonlar

- Dışa açılan fonksiyonlar `utils`/`hooks` benzeri mantık taşıyorsa **İngilizce JSDoc** (`@function`, `@description`, `@param`, `@returns`) yazılır — mevcut `scanner.ts`/`extension.ts` örnek alınır.
- `strict` aktif; `any` kullanma — `WorkspaceEntry` gibi açık tipler kullan.
- Kullanıcıya görünen metinler **İngilizce** (komut başlıkları, tooltip, QuickPick placeholder, view welcome, ayar açıklamaları, "Recently Used"/"All" bölüm başlıkları). Eklenti yayım için İngilizceye çevrildi.
- Yeni komut eklerken: `package.json > contributes.commands` + `extension.ts`'te `registerCommand` + (gerekiyorsa) `menus`. Üçü senkron kalmalı.

## Geçmiş / Durum

- v0.1.0 — İlk sürüm: klasör tarama kaynağı, Activity Bar + Status Bar arayüzü, yeni/mevcut pencerede açma. Build temiz, scanner doğrulandı.
- Sonrası: tarama yalnızca `.code-workspace`'e sadeleştirildi, "Workspace Switcher" isimlendirmesi, tutarlı layers ikonu, `workspaceSwitcher.iconColor` ile workspace bazlı renkli ikon.
- Güncel/ayrıntılı durum için her zaman `.claude/progress/` (done/current/next) ve `.claude/plans/` dosyalarına bak.
