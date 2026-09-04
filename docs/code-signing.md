# Code Signing & Notarization Guide

This guide details the cryptographic configuration and secret management for authenticating Aethel Launcher releases across all operating systems.

---

## 1. Windows: Authenticode Code Signing

### Overview
Windows uses Authenticode signatures to satisfy Microsoft Defender SmartScreen and guarantee binary integrity.

### Required Credentials
- **Certificate Type**: Standard Organization Validation (OV) or Extended Validation (EV) Code Signing Certificate.
- **Export Format**: `.pfx` archive containing certificate and private key.

### GitHub Actions Secrets
Configure the following in GitHub repository settings under **Secrets and variables > Actions**:
- `WINDOWS_CERTIFICATE_DATA`: Base64-encoded string of the `.pfx` certificate file:
  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("MyCertificate.pfx")) | Set-Clipboard
  ```
- `WINDOWS_CERTIFICATE_PASSWORD`: Password used to protect the `.pfx` file.

### Signing Tool Command
```powershell
signtool sign `
  /f certificate.pfx `
  /p $env:WINDOWS_CERTIFICATE_PASSWORD `
  /tr http://timestamp.digicert.com `
  /td sha256 `
  /fd sha256 `
  target\release\bundle\msi\Aethel_Launcher_x64.msi
```

---

## 2. macOS: Developer ID & Apple Notarization

### Overview
macOS requires:
1. **Developer ID Application** certificate for code signing.
2. **Hardened Runtime** (`--options runtime`).
3. Submission to Apple's notary service via `xcrun notarytool`.
4. Ticket stapling with `xcrun stapler`.

### Required Credentials
- Apple Developer Account with Admin or App Manager role.
- App Store Connect API Key (`AuthKey_<KEY_ID>.p8`) or Apple ID App-Specific Password.

### GitHub Actions Secrets
- `APPLE_CERTIFICATE`: Base64-encoded `.p12` file of your Developer ID Application certificate.
- `APPLE_CERTIFICATE_PASSWORD`: Password protecting the `.p12`.
- `APPLE_ID`: Developer Apple ID email.
- `APPLE_PASSWORD`: App-specific password generated on appleid.apple.com.
- `APPLE_TEAM_ID`: 10-character Apple Developer Team ID.

### Notarization Pipeline
```bash
# 1. Sign application bundle
codesign --deep --force --options runtime \
  --sign "Developer ID Application: Aethelis Projects" \
  Aethel.app

# 2. Package into zip or dmg
ditto -c -k --keepParent Aethel.app Aethel.zip

# 3. Submit to Apple Notary Service
xcrun notarytool submit Aethel.zip \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

# 4. Staple notarization ticket
xcrun stapler staple Aethel.app
```

---

## 3. Tauri Auto-Updater: Minisign Ed25519 Keys

### Overview
Tauri's built-in updater validates release payloads and manifests using **Minisign Ed25519** public-key signatures, completely immune to man-in-the-middle attacks.

### Key Generation
Generate a dedicated keypair using the Tauri CLI:
```bash
npx tauri signer generate -w ~/.tauri/aethel.key
```
This produces:
- **Public Key**: placed into `src-tauri/tauri.conf.json`:
  ```json
  "plugins": {
    "updater": {
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDMzNkExM0ZFQjY0MDBCNzcKUldSM0MwQzIvaE5xTS9EMnhJUnhNQ295OWVuUVFhSmF0eG1DYnNYckdQVDFQNjNNRnluY3NLTEEK",
      "endpoints": [
        "https://github.com/Aethelis-Projects/aethel-launcher/releases/latest/download/latest.json"
      ]
    }
  }
  ```
- **Private Key**: stored securely in GitHub repository secret:
  - `TAURI_SIGNING_PRIVATE_KEY`: full contents of `~/.tauri/aethel.key`.
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: password entered during key generation (if any).

When `cargo tauri build` executes in CI with these environment variables, Tauri automatically signs the update bundles and outputs `latest.json` ready for deployment!
