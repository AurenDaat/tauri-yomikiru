# Changelog

All notable changes to Kuro Manga are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] — first public release

### Added

- **Library** built by linking one root folder; files are read in place and
  never copied, moved or modified.
- Parsing rules: `#` group folders (nested, `#` stripped from the name),
  first-level folders as series, `.cbz` files and image subfolders as volumes,
  loose `.cbz` files as single-volume series, natural ordering everywhere.
- **CBZ page source** that reads the ZIP central directory and extracts single
  pages on demand (never the whole archive).
- **Reader** with single / double / webtoon modes, RTL / LTR / vertical reading
  direction, whole-page zoom capped at 100 %, fit modes, left page-thumbnail
  panel, volumes drawer, quick settings, bookmarks, tap zones and gestures.
- Brightness, dim and warmth overlays applied instantly.
- Categories, search, sorting, history, backup / restore.
- Dark, Light, Sunrise, Ember Night, Eclipse, Sepia, True Black, Forest and
  Ocean themes; English and Arabic (RTL) interface.
- Packaging: Linux `.deb` + AppImage and a signed Android `.apk` built from the
  command line only, plus a GitHub Actions release workflow.
