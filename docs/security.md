# Aethel Launcher — Security Architecture & Key Management

## 1. Updater Signing Keys

Aethel Launcher uses `tauri-plugin-updater` with Minisign Ed25519 signatures to ensure tamper-proof automatic updates.

### Public Key
Configured in `src-tauri/tauri.conf.json`:
```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDMzNkExM0ZFQjY0MDBCNzcKUldSM0MwQzIvaE5xTS9EMnhJUnhNQ295OWVuUVFhSmF0eG1DYnNYckdQVDFQNjNNRnluY3NLTEEK
```

### Private Key Policy
- **STRICT RULE:** The private signing key MUST NEVER be stored in git, documentation, issues, or local workspace files.
- The private key is provisioned exclusively through repository CI secrets (`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).

### Key Rotation Procedure
1. Generate a new keypair using `@tauri-apps/cli signer generate`.
2. Update the public key in `src-tauri/tauri.conf.json` and this document.
3. Update `TAURI_SIGNING_PRIVATE_KEY` in GitHub Actions Secrets.
4. Cut a transitional release signed with the old key that bundles the new public key.
5. Sign all subsequent releases with the new private key.

## 2. Token & Credential Storage Isolation
 
- **SQLite Database (`aethel-storage`):** Strictly restricted to public non-sensitive metadata (instance configurations, playtime, cached public nicknames, public skin URLs).
- **Zero Token Invariant:** SQLite schema MUST NEVER contain token, secret, or password columns. Automated unit tests (`test_no_tokens_in_database`) strictly enforce this invariant on every build and CI run.
- **Primary Storage (OS Native Keyrings):** All Microsoft OAuth access tokens, refresh tokens, and session secrets are stored in native operating system credential vaults via the `keyring` crate:
  - **Windows:** Windows Credential Manager (`wincred`)
  - **macOS:** Apple Keychain Services (`Security.framework`)
  - **Linux:** FreeDesktop Secret Service via D-Bus (`libsecret` / `gnome-keyring` / `ksecretservice`)
- **Encrypted Fallback Storage (`SecureStorage`):** For headless environments, containers, or systems where the OS keyring daemon is unavailable or unconfigured, `aethel-auth` provides a secure file-level encrypted fallback:
  - **Cipher Suite:** Authenticated symmetric encryption using **AES-256-GCM** (`aes-gcm` crate).
  - **Master Key (`master.key`):** A 32-byte cryptographically secure random key generated via system entropy (`rand::rngs::OsRng`) on first use.
  - **File Permissions:** Stored strictly with `0600` (read/write only by owner) on Unix/Linux/macOS platforms (`std::os::unix::fs::PermissionsExt`).
  - **Per-Record Nonce:** Each token encryption generates an independent 12-byte random initialization vector (nonce) via `OsRng`, precluding any keystream reuse attacks.
  - **Authentication Tag (MAC):** AES-GCM guarantees both confidentiality and ciphertext integrity; any manual tampering or bit flips are immediately rejected with `DecryptionFailed`.
  - **Threat Model & Boundaries:** Protects against unauthorized inspection by unprivileged local users or backup daemons. Does not defend against root/admin compromised hosts or kernel-level memory scanners (which is outside the desktop application threat boundary).

## 3. Archive Safety (Zip Slip Prevention)

Any archive extraction (mods, asset packs, Java runtimes) enforces path canonicalization checks to reject entries containing `..` or leading slashes outside the intended target destination directory.
