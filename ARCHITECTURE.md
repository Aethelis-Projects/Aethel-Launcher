# Aethel Launcher — System Architecture & Design

This document details the architectural design, crate organization, concurrency models, and security boundaries of **Aethel Launcher**.

---

## 🏛️ High-Level System Architecture

Aethel Launcher is structured as a modular monorepo combining a high-performance **Rust** systems core with a modern, responsive **React 19** frontend orchestrated via **Tauri v2**.

```mermaid
flowchart TB
    subgraph Frontend ["Frontend Layer (Webview)"]
        UI["React 19 + Tailwind CSS"]
        State["Zustand State Stores"]
        Bridge["@tauri-apps/api (IPC Bridge)"]
        UI --> State
        State --> Bridge
    end

    subgraph TauriLayer ["Desktop Application Boundary"]
        App["Tauri v2 Core App"]
        Specta["Specta IPC Contracts"]
        Updater["tauri-plugin-updater (Minisign)"]
        Bridge <==> Specta
        Specta <==> App
        App --> Updater
    end

    subgraph CoreEngine ["Modular Rust Engine (crates/)"]
        Auth["aethel-auth\n(OAuth / OS Keyrings)"]
        Storage["aethel-storage\n(SQLite WAL / Schema)"]
        Manifest["aethel-manifest\n(Mojang / CurseForge / Modrinth)"]
        Download["aethel-download\n(Async Semaphore / Verification)"]
        Java["aethel-java\n(Adoptium Discovery & Provisioning)"]
        Modding["aethel-modding\n(Fabric / Forge / NeoForge / Quilt)"]
        Launch["aethel-launch\n(Process Supervisor & Classpath)"]
        Core["aethel-core\n(Types, Errors, Events, Hashes)"]

        App --> Auth
        App --> Storage
        App --> Manifest
        App --> Download
        App --> Java
        App --> Modding
        App --> Launch

        Auth --> Core
        Storage --> Core
        Manifest --> Core
        Download --> Core
        Java --> Core
        Modding --> Core
        Launch --> Core
    end

    subgraph HostSystem ["Host Operating System"]
        GameProc["Minecraft JVM Process (Isolated)"]
        KeyringService["OS Credential Vault (wincred / Keychain / SecretService)"]
        DiskStorage["%LocalAppData% / ~/.local/share / ~/Library"]

        Launch -->|Spawns & Monitors| GameProc
        Auth -->|Secures Tokens| KeyringService
        Storage -->|Persists Metadata| DiskStorage
        Download -->|Streams Assets| DiskStorage
    end
```

---

## 📦 Crate Dependency Graph (DAG)

The Rust backend is separated into strictly decoupled domain crates:

```mermaid
graph TD
    aethel_core["aethel-core\n• Error taxonomy (AppErrorCode)\n• Event system (BackendEvent)\n• Hashes (SHA-1, SHA-512, MD5)"]
    
    aethel_storage["aethel-storage\n• SQLite with WAL mode\n• Connection pooling (r2d2)\n• Zero-token migrations"]
    
    aethel_auth["aethel-auth\n• Microsoft OAuth device code flow\n• Keyring native OS vault\n• AES-256-GCM encrypted fallback"]
    
    aethel_manifest["aethel-manifest\n• Version manifest models\n• Rule engine (OS & features)\n• CurseForge & Modrinth parsers"]
    
    aethel_download["aethel-download\n• Async concurrent queue\n• Bounded semaphore (tokio)\n• Checksum validation"]
    
    aethel_java["aethel-java\n• Registry & PATH scanner\n• Adoptium Temurin API client\n• Tar / Zip safe unpacker"]
    
    aethel_modding["aethel-modding\n• Fabric Meta resolver\n• NeoForge / Forge installer executor\n• Quilt resolver"]
    
    aethel_launch["aethel-launch\n• Classpath builder\n• Windows @argfile ladder\n• ProcessSupervisor actor"]
    
    aethel_tauri["aethel-tauri / bin\n• Tauri commands\n• Specta bindings\n• Event broadcast channel"]

    aethel_installer["aethel-installer\n• Standalone setup wizard\n• Self-contained webview UI\n• Release unpacker"]

    aethel_storage --> aethel_core
    aethel_auth --> aethel_core
    aethel_manifest --> aethel_core
    aethel_download --> aethel_core
    aethel_java --> aethel_core
    aethel_java --> aethel_download
    aethel_modding --> aethel_core
    aethel_modding --> aethel_manifest
    aethel_launch --> aethel_core
    aethel_launch --> aethel_manifest
    aethel_launch --> aethel_java

    aethel_tauri --> aethel_core
    aethel_tauri --> aethel_storage
    aethel_tauri --> aethel_auth
    aethel_tauri --> aethel_manifest
    aethel_tauri --> aethel_download
    aethel_tauri --> aethel_java
    aethel_tauri --> aethel_modding
    aethel_tauri --> aethel_launch

    aethel_installer --> aethel_core
```

---

## ⚡ Concurrency & Memory Management

1. **Async Runtime:**
   The backend runs on the `tokio` multi-threaded runtime. Heavy I/O operations (file streaming, network fetching, checksum computation) execute cooperatively without blocking the UI thread.

2. **Concurrency Throttling:**
   Downloads are bounded using `tokio::sync::Semaphore`. This prevents socket starvation and excessive file descriptor consumption when downloading thousands of game assets simultaneously.

3. **Zero-Copy & Streaming:**
   File downloads stream directly from network responses to disk using buffered asynchronous writers, keeping the launcher's memory footprint under **50MB** even during large modpack installations.

---

## 🎮 Process Supervisor Lifecycle

Game execution is strictly managed via the `ProcessSupervisor` lifecycle:

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend as Frontend UI
    participant Backend as aethel-tauri
    participant Launcher as aethel-launch
    participant JVM as Minecraft JVM Process

    User->>Frontend: Click "Launch Instance"
    Frontend->>Backend: invoke("launch_instance", { id })
    Backend->>Launcher: LaunchBuilder::build(&instance)
    Launcher->>Launcher: Resolve Java, Libraries, Assets & ModLoader
    Launcher->>Launcher: Build Command (Classpath / @argfile)
    Launcher->>JVM: ProcessSupervisor::spawn(Command)
    Launcher-->>Backend: Yield Child PID & Supervisor Handle
    Backend-->>Frontend: emit("game-started", { pid, instance_id })

    par Stdout & Stderr Stream
        JVM->>Launcher: stdout / stderr chunks
        Launcher->>Backend: ProcessEvent::LogLine(line)
        Backend->>Frontend: emit("game-log", { line })
    and Health Monitoring
        JVM->>Launcher: Process Exited (exit_code)
        Launcher->>Backend: ProcessEvent::Exited(exit_code)
        Backend->>Frontend: emit("game-exited", { exit_code })
    end
```

---

## 🔐 Security Boundaries & Invariants

| Domain | Mechanism | Threat Defended |
|---|---|---|
| **Credentials** | OS Native Credential Store (`wincred`, `Keychain`, `SecretService`) | Prevents plaintext token extraction by unauthorized local processes. |
| **Fallback Storage** | AES-256-GCM symmetric encryption with `0600` file permissions | Defends secrets in headless or containerized environments lacking keyrings. |
| **Database** | SQLite WAL mode strictly storing non-sensitive metadata | Zero-Token Invariant: database compromises yield zero credentials. |
| **Updater** | Minisign Ed25519 digital signatures | Blocks man-in-the-middle (MITM) and poisoned CDN updates. |
| **Archive Unpacking** | Canonicalized path validation on all zip/tar entries | Eliminates Zip Slip arbitrary file overwrite vulnerabilities. |
| **Command Line** | Windows `@argfile` argument file execution | Prevents Windows `32,767` character command-line truncation. |

---

## 💻 Standalone Installer Architecture

The installer (`crates/aethel-installer`) operates independently of the main application runtime:

1. **Lightweight Executable:** Compiled as a single static binary (~15MB compressed) with an embedded Vite React frontend.
2. **Permission-Safe Default Path:** Default install location targets `%LocalAppData%\Programs\Aethel Launcher` on Windows (and standard XDG/Applications on Linux/macOS), requiring zero UAC administrator elevation.
3. **Payload Streaming:** Connects to GitHub Releases API to stream the verified 64-bit production package with real-time download progress and hash verification.
4. **Clean Handshake:** Silently installs the target payload and launches the genuine application upon completion.
