---
layout: default
title: Aethel Launcher Documentation
description: Fast, secure, and modern Minecraft launcher engineered with Rust and Tauri v2.
---

# 🚀 Aethel Launcher Documentation

Welcome to the official documentation for **Aethel Launcher** — a modern, ultra-fast, and secure open-source Minecraft launcher built with Rust and Tauri v2.

---

## 📚 Quick Navigation

- [Architecture Overview](../ARCHITECTURE.md) — Modular crate DAG, concurrency engine, and IPC bridge.
- [Security Architecture](security.md) — Credential isolation, Minisign digital signatures, and Zero-Token Invariant.
- [Release Process](release-process.md) — Automated multi-platform build and deployment pipelines.
- [Code Signing Guide](code-signing.md) — Operating system digital signature management.
- [Contributing Guide](../CONTRIBUTING.md) — Code style, verification suites, and pull request procedures.

---

## ✨ Key Features

| Capability | Description |
|---|---|
| ⚡ **Near-Instant Startup** | Launches in under 0.8s with idle memory consumption below 50MB. |
| 🛡️ **Defensive Security** | Zero auth tokens stored in SQLite. Tokens live exclusively in OS native keyrings (`wincred`, `Keychain`, `SecretService`) or AES-256-GCM encrypted fallback. |
| 📦 **Universal Modpacks** | Native one-click import for CurseForge (`.zip` with overrides) and Modrinth (`.mrpack`). |
| ☕ **Auto Java Provisioning** | Automated JVM detection and seamless on-demand Adoptium Temurin runtime downloads (Java 8, 17, 21). |
| 🔄 **Minisign Auto-Updates** | Tamper-proof in-app updates with cryptographically verified Ed25519 digital signatures. |
| 🎨 **Bespoke Installer** | Custom 6-screen animated installer wizard with automatic non-admin path provisioning. |

---

## 💾 Installation & Downloads

Head over to the [GitHub Releases](https://github.com/Aethelis-Projects/Aethel-Launcher/releases/latest) page to download the right installer for your operating system:

- **Windows:** `AethelInstaller-Windows-x86_64.exe` (or direct setup `.exe`)
- **macOS:** `AethelInstaller-macOS-aarch64` / `AethelInstaller-macOS-x86_64` (or `.dmg`)
- **Linux:** `AethelInstaller-Linux-x86_64` (or `.AppImage` / `.deb`)

---

## 💬 Community & Support

- **GitHub Discussions:** [Ask questions & share modpacks](https://github.com/Aethelis-Projects/Aethel-Launcher/discussions)
- **Discord:** [Join the Aethel community](https://discord.gg/aethelis)
- **Bug Reports:** [Submit an issue](https://github.com/Aethelis-Projects/Aethel-Launcher/issues/new/choose)
