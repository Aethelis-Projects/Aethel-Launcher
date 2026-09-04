# End-to-End (E2E) Testing with tauri-driver

This directory contains end-to-end smoke test scripts for Aethel Launcher using `tauri-driver` and the WebDriver protocol.

---

## 1. Prerequisites

1. **Install `tauri-driver`:**
   ```bash
   cargo install tauri-driver --locked
   ```

2. **Platform WebDriver Requirement:**
   - **Windows:** Ensure `msedgedriver.exe` is in your system `PATH`.
   - **Linux:** Ensure `WebKitWebDriver` is installed:
     ```bash
     sudo apt-get install webkit2gtk-driver
     ```
   - **macOS:** Ensure `safaridriver` is enabled:
     ```bash
     safaridriver --enable
     ```

---

## 2. Running the E2E Smoke Test

1. **Build the Desktop Application:**
   ```bash
   cargo tauri build --debug
   ```

2. **Start `tauri-driver`:**
   ```bash
   tauri-driver
   ```

3. **Execute the Smoke Test:**
   ```bash
   npm run test:e2e
   ```

---

## 3. CI Integration

In GitHub Actions, the E2E smoke test is configured as an optional / advisory job that verifies desktop initialization in headless virtual framebuffers (`xvfb-run` on Linux or Windows server runners).
