# Security Policy

At **Aethel Launcher**, security, data privacy, and integrity are foundational design pillars. We treat security bugs with the highest priority.

---

## 🛡️ Supported Versions

We provide security updates and patches for the following versions:

| Version | Supported | Notes |
|---|---|---|
| `v1.0.x` | ✅ Yes | Active stable release branch |
| `v1.0.0-rc.*` | ✅ Yes | Active release candidates |
| `< v1.0.0` | ❌ No | Legacy pre-releases (please upgrade) |

---

## 🔒 Reporting a Vulnerability

If you believe you have discovered a security vulnerability in Aethel Launcher, **please do not create a public GitHub issue**.

Instead, follow one of these private channels:

1. **GitHub Security Advisory (Preferred):**  
   Use [GitHub Private Vulnerability Reporting](https://github.com/Aethelis-Projects/Aethel-Launcher/security/advisories/new) to submit your report confidentially.

2. **Security Contact Email:**  
   Email us at [`security@aethelis.dev`](mailto:security@aethelis.dev) or [`contact@aethelis.dev`](mailto:contact@aethelis.dev).

### What to Include in Your Report

To help us triage and resolve the issue quickly, please include:
- A clear description of the vulnerability and its potential impact.
- Affected versions and operating systems (Windows, macOS, Linux).
- Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
- Any proposed remediations or patches (if available).

---

## ⏱️ Response Timeline

- **Initial Acknowledgment:** Within **48 hours** of receiving your report.
- **Triage & Assessment:** Within **5 business days** with an initial severity rating (CVSS).
- **Remediation & Patch:** A hotfix or scheduled release will be developed and verified.
- **Public Disclosure:** Coordinated with the reporter after the fix is published and users have had adequate time to update.

---

## 🏗️ Security Invariants & Cryptographic Primitives

Aethel Launcher is designed with defensive architecture by default:

### 1. Token Isolation & Zero-Token SQLite Invariant
- The local SQLite database (`aethel-storage`) strictly stores non-sensitive instance and launcher metadata.
- Authentication tokens (Microsoft OAuth, refresh tokens, Xbox user hashes) are **never written to SQLite**.
- Primary storage is delegated to OS-level secure credential vaults:
  - **Windows:** Windows Credential Manager (`wincred`)
  - **macOS:** Apple Keychain Services (`Security.framework`)
  - **Linux:** FreeDesktop Secret Service (`libsecret` / `org.freedesktop.secrets`)
- When OS keyrings are unavailable (e.g. headless setups or minimal Linux environments), secrets are encrypted on disk via **AES-256-GCM** using a cryptographically random 32-byte master key stored with strict `0600` user permissions.

### 2. Update Integrity via Minisign
- Auto-updates delivered through `tauri-plugin-updater` require valid **Ed25519 Minisign** digital signatures matching the embedded public key:
  ```text
  dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEE2M0Y1RjNDNUJDNDA2MjcKUldRbkJzUmJQRjgvcG1xbzE1MkNCYnZIdWdRVkFGWmdadnljVlN3dVZaS0VubGxoWVVZM1A1L0IK
  ```
- Any update bundle failing signature verification is immediately rejected.

### 3. Archive Safety (Zip Slip Defense)
- Modpack, asset, and runtime extractions validate all zip entry paths against path traversal attacks (`..`, absolute paths, symlink escapes) before writing to the filesystem.

### 4. Memory Safety & Clean-Room Architecture
- The launcher backend is implemented entirely in **Rust**, eliminating common buffer overflow, use-after-free, and dangling pointer vulnerabilities.
