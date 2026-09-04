# Aethel Launcher Release Process

This document describes the end-to-end release lifecycle for Aethel Launcher, from version bumping to signing and distributing binaries across Windows, Linux, and macOS.

---

## 1. Release Cadence & Versioning

Aethel Launcher follows [Semantic Versioning 2.0.0](https://semver.org/):
- **MAJOR (`x.0.0`)**: Incompatible architectural changes, major UI overhauls.
- **MINOR (`0.x.0`)**: New features (modpack support, new loaders, performance features) in a backward-compatible manner.
- **PATCH (`0.0.x`)**: Backward-compatible bug fixes and security advisories.

Channels:
- **`stable`**: Production-ready releases published on GitHub Releases.
- **`beta`**: Release candidates (`v0.2.0-rc.1`) for testing new features before general availability.

---

## 2. Pre-Release Checklist

1. **Clean Quality Gates:**
   Ensure all local and CI quality gates are 100% green:
   ```bash
   cargo fmt --check
   cargo clippy --workspace -- -D warnings
   cargo test --workspace
   npm run lint
   npm test
   npm run build
   npm run audit:security
   ```

2. **Synchronize Version Numbers:**
   Update version strings in the following files:
   - `Cargo.toml` (`[workspace.package] version = "..."`)
   - `src-tauri/tauri.conf.json` (`"version": "..."`)
   - `package.json` (`"version": "..."`)

3. **Export Bindings:**
   Ensure TypeScript bindings are updated and committed:
   ```bash
   cargo run --bin export_bindings
   ```

4. **Update Changelog:**
   Update release notes and summary of user-facing changes.

---

## 3. Creating and Publishing a Release

1. **Commit and Tag:**
   ```bash
   git add .
   git commit -m "chore(release): prepare v0.1.0"
   git tag -a v0.1.0 -m "Release v0.1.0"
   git push origin main
   git push origin v0.1.0
   ```

2. **Automated CI Build (`release.yml`):**
   Pushing a tag `v*` triggers `.github/workflows/release.yml`.
   - Compiles native binaries for:
     - **Windows (`x86_64-pc-windows-msvc`)**: `.msi` and `.exe` installers.
     - **Linux (`x86_64-unknown-linux-gnu`)**: `.deb` and `.AppImage`.
     - **macOS (`x86_64-apple-darwin`, `aarch64-apple-darwin`)**: `.dmg` and universal `.app`.
   - Codesigns Windows binaries using Authenticode.
   - Signs and notarizes macOS applications with Apple Developer ID.
   - Generates and signs `latest.json` for Tauri auto-updater via Minisign Ed25519.
   - Uploads all release assets to GitHub Releases.

---

## 4. Post-Release Verification

1. **Windows SmartScreen & Installation:**
   Download the `.msi` on Windows, run installation, and confirm no untrusted publisher warning appears.
2. **macOS Gatekeeper & Notarization:**
   Mount `.dmg` on macOS, verify Gatekeeper allows launching without security warnings.
3. **Linux AppImage:**
   Mark `chmod +x` and run on Ubuntu 22.04 / 24.04.
4. **Auto-Updater Check:**
   Launch previous version, click **Check for Updates**, verify the new version and changelog display correctly.

---

## 5. Rollback Procedure

If a critical flaw is discovered post-release:
1. Mark the GitHub Release as **Pre-release** or delete the draft to prevent automatic update discovery.
2. Revert the problematic commit on `main`.
3. Tag and ship a hotfix patch release (e.g. `v0.1.1`).
