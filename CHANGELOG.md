# Changelog

All notable changes to Aethel Launcher will be documented in this file.

## [v0.1.0-alpha.2] - 2026-09-04

### Added
- **Instance Deletion Command**: Added `delete_instance` IPC command in `aethel-storage` and `aethel-tauri` with complete database record and directory cleanup.
- **Instance Deletion UI**: Added a delete button (Trash icon) with confirmation modal on each instance card in `InstanceGrid`.
- **Database Auto-Seeding**: Automatic initialization of default vanilla instances (`1.20.4`, `1.21.1`, `1.7.10`) when database is empty.
- **Dynamic Database Isolation**: `DB_HOLDER` dynamically detects `AETHEL_DATA_DIR` changes to prevent test fixtures from modifying the production database.

### Fixed
- **Instance Persistence on Startup**: Fixed issue where imported instances disappeared upon restarting the launcher due to missing `fetchInstances()` on startup mount in `App.tsx`.
- **Test Instance Leakage**: Eliminated the bug that caused `Mod Test Instance` records to leak into `%LOCALAPPDATA%\aethel\aethel.db` during unit test runs.
- **Database Deduplication**: Purged duplicate modpack entries and orphan records from SQLite database.

### Changed
- Re-exported TypeScript bindings to include `deleteInstance`.
- Added localized confirmation strings (`instances.delete`, `instances.confirmDelete`) in English and Russian.

---

## [v0.1.0-alpha.1] - 2026-09-04

### Added
- Phase M6 release contour:
  - Modpack Import and Export (`.mrpack`, Modrinth schema v2) with Zip-Slip protection.
  - Instance Backup Transfer (`.zip`) with intelligent folder exclusion.
  - Cryptographic auto-updater verified with Ed25519 Minisign.
  - Multi-platform GitHub Actions release workflow (Windows MSI/NSIS, Linux DEB/AppImage, macOS DMG).
  - 4-Tier Classpath ladder execution engine.
