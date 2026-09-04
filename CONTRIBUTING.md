# Contributing to Aethel Launcher

Thank you for your interest in contributing to **Aethel Launcher**! We welcome contributions ranging from bug reports and documentation fixes to full-featured pull requests.

---

## 🧭 Core Principles

1. **Rule of Truth (Execution over Words):**
   Truth is execution. Any assertion that conflicts with the actual runtime behavior of the JVM, Mojang/Modrinth/CurseForge APIs, or the host OS yields to execution. Numerical facts, hashes, and test vectors are verified in the repository exclusively by automated execution, never by manual textual edits.

2. **Clean-Room Engineering:**
   Aethel Launcher is distributed under permissive dual licensing (**Apache-2.0 / MIT**). Strictly zero copy-pasting from GPL-licensed codebases (e.g. Prism Launcher, MultiMC) is permitted. All protocol parsers, manifest resolvers, and launch supervisors are designed and implemented independently.

3. **Security Invariants:**
   - **Zero Auth Tokens in SQLite:** The SQLite database is strictly metadata-only. Tokens belong solely in OS native credential vaults (`keyring` crate) or encrypted fallback storage.
   - **Signing Integrity:** Minisign private keys are stored exclusively in GitHub Secrets and must never enter the repository tree.
   - **Archive Safety:** All zip and tar extractions enforce canonicalization checks against Zip Slip attacks.

---

## 🛠️ Prerequisites & Setup

### Requirements

- **Rust:** `1.80+` (stable toolchain)
- **Node.js:** `20+` LTS
- **Package Manager:** `npm` (v10+)
- **System Dependencies:**
  - **Windows:** Visual Studio C++ Build Tools (MSVC), Windows 10/11 SDK, WebView2 (pre-installed on Windows 10/11).
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`).
  - **Linux:** `libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`.

### Initial Setup

```bash
# 1. Clone repository with submodules (if applicable)
git clone https://github.com/Aethelis-Projects/Aethel-Launcher.git
cd Aethel-Launcher

# 2. Install frontend dependencies
npm install

# 3. Verify Rust workspace compiles
cargo check --workspace
```

---

## 🏗️ Workspace Architecture

The repository is organized as a Cargo and npm monorepo:

### Rust Crates (`crates/` & `src-tauri/`)

| Crate | Purpose |
|---|---|
| [`aethel-core`](crates/aethel-core) | Core domain entities, universal error taxonomy (`AppErrorCode`), events (`BackendEvent`), and cryptographic hashing. |
| [`aethel-auth`](crates/aethel-auth) | Microsoft OAuth device code & browser flow, offline UUID generation, token caching, AES-256-GCM fallback. |
| [`aethel-storage`](crates/aethel-storage) | SQLite persistence with WAL mode, connection pooling, and `user_version` zero-token schema migrations. |
| [`aethel-manifest`](crates/aethel-manifest) | Mojang version manifests, rule evaluators, library classifiers, and Modrinth / CurseForge manifest parsers. |
| [`aethel-download`](crates/aethel-download) | High-throughput asynchronous downloader with semaphore throttling, retry backoff, and SHA-1/SHA-512 verification. |
| [`aethel-java`](crates/aethel-java) | Automated JVM detection across system paths, registry, and on-demand Adoptium Temurin runtime provisioning. |
| [`aethel-modding`](crates/aethel-modding) | Mod loader integrations: Fabric, NeoForge, Forge, and Quilt resolver matrices. |
| [`aethel-launch`](crates/aethel-launch) | Cross-platform process builder, Windows `@argfile` and classpath ladder, and real-time process supervision. |
| [`aethel-installer`](crates/aethel-installer) | Lightweight custom standalone setup wizard with animated UI and background payload unpacker. |
| [`aethel-tauri`](crates/aethel-tauri) / [`src-tauri`](src-tauri) | Tauri v2 desktop application boundary, IPC contracts, and Specta TypeScript type generators. |

### Frontend (`src/` & `crates/aethel-installer/src-ui/`)

- **Main App:** React 19, Vite, Tailwind CSS, Lucide icons, Framer Motion, Zustand state management.
- **Installer UI:** Self-contained Vite React app embedded into the installer binary.

---

## 🧪 Verification & Quality Checks

Before submitting a pull request, run the test suites and linter:

```bash
# 1. Run all Rust unit and integration tests
cargo test --workspace

# 2. Run Rust linter (all warnings treated as fatal in CI)
cargo clippy --workspace --all-targets -- -D warnings

# 3. Format Rust code
cargo fmt --all -- --check

# 4. Run frontend tests
npm test

# 5. Run frontend lint & build
npm run lint
npm run build

# 6. Test installer bundle
npm run build:installer
cargo test -p aethel-installer
```

---

## 📝 Commit Conventions

We enforce [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

- `feat(scope): ...` — New user-facing feature or backend capability
- `fix(scope): ...` — Bug fix
- `refactor(scope): ...` — Code change that neither fixes a bug nor adds a feature
- `perf(scope): ...` — Performance improvement
- `test(scope): ...` — Adding or correcting tests
- `docs(scope): ...` — Documentation changes
- `chore(scope): ...` — Build tasks, dependency bumps, CI configuration

*Common scopes:* `installer`, `launch`, `auth`, `storage`, `manifest`, `modding`, `ui`, `deps`.

---

## 🔄 Pull Request Guidelines

1. **Branch Naming:** Use `feat/description`, `fix/issue-num-description`, or `refactor/target`.
2. **Atomic Commits:** Keep commits focused on a single change. Avoid bundling unrelated formatting edits.
3. **Tests Included:** Any new logic or bug fix must be accompanied by corresponding unit or integration tests.
4. **CI Green:** Ensure GitHub Actions CI workflows pass completely on your PR branch.
