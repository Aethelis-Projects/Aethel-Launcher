# Contributing to Aethel Launcher

Welcome to Aethel Launcher (`Aethelis Projects`).

## Core Principles

1. **Rule of Truth (Execution over Words):**
   Truth is execution. Any assertion that conflicts with the actual behavior of the JVM, Mojang/Modrinth APIs, or the host OS yields to execution. Numerical facts, hashes, and vectors are fixed in the repository exclusively by program execution, never by manual textual edits.

2. **Clean-Room Engineering:**
   Aethel Launcher is distributed under Apache-2.0 / MIT. Strictly zero GPL copy-pasting is allowed. All protocol parsers, manifest converters, and launch mechanics are implemented independently.

3. **Security Invariants:**
   - No auth tokens in SQLite.
   - Private signing keys must never be committed to git.
   - All external archive extraction must be guarded against Zip Slip vulnerabilities.

## Workspace Architecture

The Rust workspace consists of 9 isolated crates:
- `aethel-core`: Shared types, error codes (`AppErrorCode`), events (`BackendEvent`), and hash algorithms.
- `aethel-auth`: Microsoft OAuth and offline UUID generation (tested against OpenJDK test vectors).
- `aethel-storage`: SQLite persistence with WAL mode and `user_version` schema migrations.
- `aethel-manifest`: Mojang version manifests and loader rule resolvers.
- `aethel-download`: Concurrency-bounded download engine with SHA-1/SHA-512 verification.
- `aethel-java`: JVM detection and Adoptium runtime management.
- `aethel-modding`: Fabric, NeoForge, Quilt loader integrations.
- `aethel-launch`: Cross-platform process builder with Windows `@argfile` / `CLASSPATH` ladder.
- `aethel-tauri`: Tauri v2 command contracts with Specta TypeScript bridge.

## Verification Commands

- Run Rust tests: `cargo test --workspace`
- Export TypeScript bindings: `cargo run -p aethel-launcher-bin --bin export_bindings`
- Build frontend: `npm run build`
- Run linting: `npm run lint`
