# Kuro Manga

A personal, **fully offline** manga library and reader for **CBZ archives** and
**plain folders of images**. You link one folder once; the app reads it in place
— nothing is uploaded, copied, moved or modified, and no server or internet
connection is involved.

Built as a **Tauri 2.0** app: one HTML/CSS/JS front-end plus a small Rust core,
rendered through the operating system's own WebView. One project produces a
Linux `.deb`, a Linux `AppImage` and an Android `.apk`.

---

## Features

**Library**

- Link one root folder; a filesystem watcher keeps the library in sync, with a
  manual **Refresh Library** button as a fallback.
- Folders whose name starts with `#` are **group folders** (sub-libraries). They
  can be nested, they always show the *series* inside them, and the `#` is never
  shown in the interface.
- Every other first-level folder is one **series** (displayed by folder name
  only — never a path). Inside a series, each `.cbz` file and each subfolder of
  images is one **volume**; a series folder that only holds images is a single
  volume; a loose `.cbz` is a single-volume series.
- Natural ordering everywhere (2 before 10, 10.5 between 10 and 11).
- Covers: manual override → an image named ~`cover` → first page of the first
  volume. Optional `ComicInfo.xml`, `details.json` or `description.txt`
  metadata. Manual descriptions and cover overrides live in the app database,
  never in your folder.
- Search, sorting (name / date added / last read), custom categories, a
  Continue Reading strip and a History screen.

**Reader**

- Single page, double page (with automatic wide-spread detection and an
  optional lone first page) and webtoon (the only scrolling mode).
- Reading direction RTL / LTR / vertical, per series with a global default, plus
  a separate page-turn direction with independent inversions for taps, swipes,
  arrow keys and the mouse wheel.
- Whole-page zoom around a fixed centre axis: **100 % = page width equals screen
  width** and is the hard maximum; the page never moves sideways and never
  leaves a gap above or below. Ctrl + wheel moves in small accumulating steps.
- Fit to screen / width / height / original, all capped at 100 %, global and
  persistent across volumes, series and restarts.
- Left page-thumbnail panel with its own toggle button, keyboard shortcut and
  remembered state; it hides with the interface and comes back as you left it.
- Fixed comfortable gray reader background (never themed, never user-selectable)
  with brightness, dim and warmth overlays applied instantly.
- Every page of the volume is pre-rendered at display size in priority order
  (current page first, then outward). Changing a layout setting re-renders the
  volume instead of mixing old and new layouts.
- Tap zones inset from the screen edge (never flush against it), swipes,
  long-press/right-click page actions (Save, Copy, Share), bookmarks,
  end-of-volume card and volume-to-volume navigation.

**App**

- Dark, Light, Sunrise, Ember Night, Eclipse, Sepia, True Black (AMOLED),
  Forest and Ocean themes.
- English and Arabic with full RTL mirroring.
- Local backup / restore of everything the app owns.
- Native feel: no tap highlight, no selection callouts, no overscroll bounce,
  immersive full screen on Android, and a layout that adapts to pointer type
  (coarse vs fine) as well as width.

---

## Running in development

```bash
npm install
npm run dev          # front-end only, in a browser
npx tauri dev        # the real desktop app (Rust core + WebView)
```

> The browser build uses the File System Access API (or a folder input) so the
> whole interface can be tried without Rust. The Tauri build routes the same
> page-source interface through the Rust core instead.

## Building for Linux

```bash
./scripts/build-linux.sh      # installs deps, then builds both bundles
# or
npx tauri build --bundles deb,appimage
```

Artifacts land in `src-tauri/target/release/bundle/`:

- `deb/kuro-manga_1.0.0_amd64.deb`
- `appimage/kuro-manga_1.0.0_amd64.AppImage` (runs on Nix, Arch, Fedora, …)

## Building for Android (no Android Studio)

```bash
./scripts/build-android.sh
```

The script installs the Android SDK **command-line tools only**, accepts the
licenses, installs the platform, build-tools and NDK, adds the four Rust Android
targets, creates `~/.android/kuro-manga.keystore` if it does not exist, writes
`keystore.properties` and runs `tauri android build --apk`. It ends with a
signed, installable APK under
`src-tauri/gen/android/app/build/outputs/apk/`.

---

## Automated releases (GitHub Actions)

`.github/workflows/build.yml`:

| Trigger | Jobs |
| --- | --- |
| push to `main`, pull requests | `check` — front-end build + `cargo check` |
| tag `v*`, manual dispatch | `linux` (`.deb` + AppImage), `android` (`.apk`) |
| tag `v*` | `release` — attaches all three to the GitHub Release |

Rust and npm dependencies are cached between runs, and every successful run
uploads the bundles as downloadable artifacts.

### Android signing secrets

The keystore never lives in the repository. Create it once locally and encode
it:

```bash
keytool -genkeypair -v -keystore kuro.keystore -alias kuro \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 kuro.keystore > kuro.keystore.b64
```

Then add these repository secrets:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | contents of `kuro.keystore.b64` |
| `ANDROID_KEY_ALIAS` | the alias you chose (`kuro`) |
| `ANDROID_KEY_PASSWORD` | the key password |
| `ANDROID_STORE_PASSWORD` | the keystore password |

During the build the workflow decodes the keystore into a temporary file and
generates `src-tauri/gen/android/keystore.properties`. **When the secrets are
missing (for example in a fork) the job builds a debug-signed APK instead of
failing.**

---

## Versioning

The version is defined once in `package.json` and mirrored in
`src-tauri/tauri.conf.json`, so the tag, the file names and the release title
always match.

## Data and privacy

Everything the app owns (linked folder path, series and volume index, cached
page lists, progress, bookmarks, categories, manual descriptions and cover
overrides, per-series reader settings, theme and language) lives in a local
SQLite database managed by the Rust core. Your manga folder is only ever read.

## License

MIT — see [LICENSE](LICENSE).
