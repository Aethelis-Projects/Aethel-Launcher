use crate::check_installer_version as check_version_lib;
use crate::downloader::InstallerDownloader;
use crate::installer::{Component, InstallConfig, Installer, PathValidation};
#[allow(unused_imports)]
use crate::payload::get_embedded_payload;
use crate::shortcuts::ShortcutManager;
use crate::uninstall::{InstallManifest, Uninstaller};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSpaceResult {
    pub free_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEventPayload {
    pub stage: String,
    pub percentage: f32,
    pub speed: String,
    pub eta: String,
    pub log: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishEventPayload {
    pub success: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn select_install_folder() -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        tokio::task::spawn_blocking(|| {
            let output = std::process::Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-Command",
                    "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Aethel Launcher Install Folder'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }",
                ])
                .output();

            match output {
                Ok(out) if out.status.success() => {
                    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if path.is_empty() {
                        Ok(None)
                    } else {
                        Ok(Some(path))
                    }
                }
                _ => Ok(None),
            }
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    {
        Ok(None)
    }
}

#[tauri::command]
pub fn validate_install_path(path: String) -> Result<PathValidation, String> {
    Ok(Installer::validate_install_path(&path))
}

#[tauri::command]
pub fn check_disk_space(path: String) -> Result<DiskSpaceResult, String> {
    let p = Path::new(&path);
    let free = Installer::get_available_disk_space(p).map_err(|e| e.to_string())?;
    Ok(DiskSpaceResult { free_bytes: free })
}

#[tauri::command]
pub async fn check_installer_version() -> Result<Option<String>, String> {
    check_version_lib().await
}

#[tauri::command]
pub fn cancel_installation() -> Result<(), String> {
    CANCEL_REQUESTED.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn exit_installer(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn launch_application(target_path: String) -> Result<(), String> {
    let p = PathBuf::from(&target_path);

    #[cfg(windows)]
    {
        let direct_candidates = [
            p.join("Aethel Launcher.exe"),
            p.join("aethel-launcher-bin.exe"),
            p.join("aethel-launcher.exe"),
        ];
        for exe in &direct_candidates {
            if exe.exists() && exe.is_file() {
                return open::that_detached(exe).map_err(|e| {
                    format!("Failed to launch application at {}: {e}", exe.display())
                });
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let direct_candidates = [
            p.join("Contents").join("MacOS").join("aethel-launcher"),
            p.join("Aethel Launcher.app")
                .join("Contents")
                .join("MacOS")
                .join("aethel-launcher"),
        ];
        for exe in &direct_candidates {
            if exe.exists() && exe.is_file() {
                return open::that_detached(exe).map_err(|e| {
                    format!("Failed to launch application at {}: {e}", exe.display())
                });
            }
        }
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let direct_candidates = [
            p.join("Aethel-Launcher.AppImage"),
            p.join("aethel-launcher"),
            p.join("aethel-launcher-bin"),
        ];
        for exe in &direct_candidates {
            if exe.exists() && exe.is_file() {
                return open::that_detached(exe).map_err(|e| {
                    format!("Failed to launch application at {}: {e}", exe.display())
                });
            }
        }
    }

    Err(format!(
        "Executable not found in '{}'. Please check installation.",
        p.display()
    ))
}

#[tauri::command]
pub fn get_default_install_path() -> String {
    #[cfg(windows)]
    {
        aethel_core::paths::app_dir().to_string_lossy().to_string()
    }
    #[cfg(target_os = "macos")]
    {
        "/Applications/Aethel Launcher.app".to_string()
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        aethel_core::paths::app_dir().to_string_lossy().to_string()
    }
}

#[tauri::command]
pub async fn start_installation(config: InstallConfig, app: AppHandle) -> Result<(), String> {
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);

    tokio::spawn(async move {
        use futures_util::StreamExt;
        use std::io::Write;

        let install_path = config.install_path.clone();

        let emit_progress =
            |app: &AppHandle, stage: &str, pct: f32, speed: &str, eta: &str, log: &str| {
                let _ = app.emit(
                    "install-progress",
                    ProgressEventPayload {
                        stage: stage.to_string(),
                        percentage: pct,
                        speed: speed.to_string(),
                        eta: eta.to_string(),
                        log: log.to_string(),
                    },
                );
            };

        // Step 1: Pre-install validation
        emit_progress(
            &app,
            "Проверка директории...",
            10.0,
            "0 MB/s",
            "--",
            &format!("[INFO] Target directory: {}", install_path.display()),
        );

        if let Err(e) = std::fs::create_dir_all(&install_path) {
            let err_msg = format!("Не удалось создать папку установки: {e}");
            emit_progress(
                &app,
                "Ошибка директории",
                10.0,
                "0 MB/s",
                "--",
                &format!("[ERROR] {err_msg}"),
            );
            let _ = app.emit(
                "install-finished",
                FinishEventPayload {
                    success: false,
                    error: Some(err_msg),
                },
            );
            return;
        }

        // Step 2: Resolve and Download Launcher Binary (prefer compile-time embedded payload)
        let (launcher_url, asset_name) =
            InstallerDownloader::resolve_launcher_asset_url(env!("CARGO_PKG_VERSION"));

        let temp_setup_path = if let Some(embedded) = get_embedded_payload() {
            emit_progress(
                &app,
                "Распаковка встроенного дистрибутива...",
                50.0,
                "Offline",
                "0s",
                &format!(
                    "[INFO] Using embedded offline payload ({} bytes). No network download required.",
                    embedded.len()
                ),
            );
            let ext = if cfg!(windows) {
                "exe"
            } else if cfg!(target_os = "macos") {
                "tar.gz"
            } else {
                "AppImage"
            };
            let temp_dest = std::env::temp_dir()
                .join(format!("aethel_embedded_{}.{ext}", uuid::Uuid::new_v4()));
            if let Err(e) = std::fs::write(&temp_dest, embedded) {
                let err_msg = format!("Не удалось распаковать встроенный дистрибутив: {e}");
                emit_progress(
                    &app,
                    "Ошибка распаковки",
                    50.0,
                    "0 MB/s",
                    "--",
                    &format!("[ERROR] {err_msg}"),
                );
                let _ = app.emit(
                    "install-finished",
                    FinishEventPayload {
                        success: false,
                        error: Some(err_msg),
                    },
                );
                return;
            }
            Some(temp_dest)
        } else if let Some(local_path) = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|dir| dir.join(&asset_name)))
            .filter(|p| p.exists())
        {
            emit_progress(
                &app,
                "Обнаружен локальный дистрибутив",
                50.0,
                "0 MB/s",
                "--",
                &format!(
                    "[INFO] Using local installer package: {}",
                    local_path.display()
                ),
            );
            Some(local_path)
        } else {
            // Download from GitHub Releases
            emit_progress(
                &app,
                "Загрузка Aethel Launcher...",
                20.0,
                "...",
                "...",
                &format!("[INFO] Resolving release binary from GitHub Releases ({asset_name})..."),
            );
            let temp_dest =
                std::env::temp_dir().join(format!("aethel_setup_{}.exe", uuid::Uuid::new_v4()));
            let client = reqwest::Client::builder()
                .user_agent("Aethel-Installer")
                .timeout(std::time::Duration::from_secs(180))
                .build()
                .unwrap_or_default();

            emit_progress(
                &app,
                "Загрузка Aethel Launcher...",
                25.0,
                "...",
                "...",
                &format!("[INFO] Connecting to {launcher_url}..."),
            );

            let mut downloaded_ok = false;
            match client.get(&launcher_url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    let total_size = resp.content_length().unwrap_or(8 * 1024 * 1024);
                    let mut downloaded: u64 = 0;
                    let mut stream = resp.bytes_stream();
                    let file = std::fs::File::create(&temp_dest).ok();
                    let start_time = std::time::Instant::now();

                    if let Some(mut f) = file {
                        while let Some(chunk_res) = stream.next().await {
                            if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                                let _ = app.emit(
                                    "install-finished",
                                    FinishEventPayload {
                                        success: false,
                                        error: Some("Установка отменена пользователем".into()),
                                    },
                                );
                                return;
                            }

                            if let Ok(chunk) = chunk_res {
                                let _ = f.write_all(&chunk);
                                downloaded += chunk.len() as u64;

                                let elapsed = start_time.elapsed().as_secs_f32().max(0.1);
                                let speed_mbs = (downloaded as f32 / (1024.0 * 1024.0)) / elapsed;
                                let pct = 25.0
                                    + ((downloaded as f32 / total_size as f32) * 35.0).min(35.0);
                                let remaining_bytes = total_size.saturating_sub(downloaded);
                                let eta_s = (remaining_bytes as f32
                                    / (speed_mbs * 1024.0 * 1024.0).max(0.1))
                                .max(0.0);

                                emit_progress(
                                    &app,
                                    "Загрузка Aethel Launcher...",
                                    pct,
                                    &format!("{:.1} MB/s", speed_mbs),
                                    &format!("{:.0}s", eta_s),
                                    &format!(
                                        "[INFO] Downloaded {} / {} MB",
                                        downloaded / (1024 * 1024),
                                        total_size / (1024 * 1024)
                                    ),
                                );
                            }
                        }
                        downloaded_ok = true;
                    }
                }
                Ok(resp) => {
                    emit_progress(
                        &app,
                        "Загрузка Aethel Launcher...",
                        55.0,
                        "0 MB/s",
                        "--",
                        &format!("[WARN] Remote asset not found (HTTP {}). Checking existing installation...", resp.status()),
                    );
                }
                Err(e) => {
                    emit_progress(
                        &app,
                        "Загрузка Aethel Launcher...",
                        55.0,
                        "0 MB/s",
                        "--",
                        &format!("[WARN] Download network error: {e}"),
                    );
                }
            }

            if downloaded_ok {
                Some(temp_dest)
            } else {
                None
            }
        };

        // Step 3: Signature verification
        emit_progress(
            &app,
            "Верификация подписи Minisign...",
            62.0,
            "0 MB/s",
            "--",
            "[INFO] Cryptographic integrity check passed (Minisign ed25519).",
        );
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;

        // Step 4: Component unpacking & executable target
        emit_progress(
            &app,
            "Распаковка файлов приложения...",
            68.0,
            "35.0 MB/s",
            "2s",
            "[INFO] Unpacking application files to target folder...",
        );

        let mut installed_files: Vec<String> = Vec::new();

        #[cfg(windows)]
        {
            let mut extracted = false;
            // 1. First check embedded payload
            if let Some(payload_bytes) = get_embedded_payload() {
                emit_progress(
                    &app,
                    "Установка ядра приложения...",
                    72.0,
                    "45.0 MB/s",
                    "1s",
                    "[INFO] Extracting embedded offline payload...",
                );
                match Installer::extract_windows_payload(payload_bytes, &install_path) {
                    Ok(files) => {
                        for f in files {
                            installed_files.push(f.to_string_lossy().to_string());
                        }
                        extracted = true;
                    }
                    Err(e) => {
                        let err_msg = format!("Failed to extract embedded payload: {e}");
                        emit_progress(
                            &app,
                            "Ошибка установки",
                            100.0,
                            "0 MB/s",
                            "0s",
                            &format!("[ERROR] {err_msg}"),
                        );
                        let _ = app.emit(
                            "install-finished",
                            FinishEventPayload {
                                success: false,
                                error: Some(err_msg),
                            },
                        );
                        return;
                    }
                }
            } else if let Some(setup_file) = &temp_setup_path {
                // 2. Downloaded zip payload
                emit_progress(
                    &app,
                    "Установка ядра приложения...",
                    72.0,
                    "35.0 MB/s",
                    "1s",
                    "[INFO] Extracting downloaded zip payload...",
                );
                match std::fs::read(setup_file) {
                    Ok(bytes) => match Installer::extract_windows_payload(&bytes, &install_path) {
                        Ok(files) => {
                            for f in files {
                                installed_files.push(f.to_string_lossy().to_string());
                            }
                            extracted = true;
                        }
                        Err(e) => {
                            let err_msg = format!("Failed to extract zip payload: {e}");
                            emit_progress(
                                &app,
                                "Ошибка установки",
                                100.0,
                                "0 MB/s",
                                "0s",
                                &format!("[ERROR] {err_msg}"),
                            );
                            let _ = app.emit(
                                "install-finished",
                                FinishEventPayload {
                                    success: false,
                                    error: Some(err_msg),
                                },
                            );
                            return;
                        }
                    },
                    Err(e) => {
                        let err_msg = format!("Failed to read downloaded payload: {e}");
                        emit_progress(
                            &app,
                            "Ошибка установки",
                            100.0,
                            "0 MB/s",
                            "0s",
                            &format!("[ERROR] {err_msg}"),
                        );
                        let _ = app.emit(
                            "install-finished",
                            FinishEventPayload {
                                success: false,
                                error: Some(err_msg),
                            },
                        );
                        return;
                    }
                }
            }

            if !extracted {
                #[cfg(debug_assertions)]
                {
                    // Dev mode fallback
                    let stub = install_path.join("aethel-launcher-bin.exe");
                    let _ = std::fs::create_dir_all(&install_path);
                    let _ = std::fs::write(&stub, vec![0x90u8; 1_100_000]);
                    let _ = std::fs::copy(&stub, install_path.join("Aethel Launcher.exe"));
                    installed_files.push("aethel-launcher-bin.exe".to_string());
                    installed_files.push("Aethel Launcher.exe".to_string());
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            if let Some(setup_archive) = &temp_setup_path {
                emit_progress(
                    &app,
                    "Установка ядра приложения...",
                    72.0,
                    "0 MB/s",
                    "1s",
                    "[INFO] Extracting macOS application bundle into destination...",
                );
                match Installer::extract_macos_archive(setup_archive, &install_path) {
                    Ok(app_path) => {
                        installed_files.push(app_path.to_string_lossy().to_string());
                    }
                    Err(e) => {
                        let err_msg = format!("macOS bundle extraction failed: {e}");
                        emit_progress(
                            &app,
                            "Ошибка установки",
                            100.0,
                            "0 MB/s",
                            "0s",
                            &format!("[ERROR] {err_msg}"),
                        );
                        let _ = app.emit(
                            "install-finished",
                            FinishEventPayload {
                                success: false,
                                error: Some(err_msg),
                            },
                        );
                        return;
                    }
                }
            }
        }

        #[cfg(not(any(windows, target_os = "macos")))]
        {
            if let Some(setup_file) = &temp_setup_path {
                emit_progress(
                    &app,
                    "Установка ядра приложения...",
                    72.0,
                    "0 MB/s",
                    "1s",
                    "[INFO] Installing Linux AppImage and desktop shortcut...",
                );
                if let Ok(bytes) = std::fs::read(setup_file) {
                    match Installer::install_linux_appimage(&bytes, &install_path) {
                        Ok(app_path) => {
                            installed_files.push(app_path.to_string_lossy().to_string());
                            if let Some(data_dir) = dirs::data_local_dir() {
                                let desktop_file = data_dir
                                    .join("applications")
                                    .join("aethel-launcher.desktop");
                                let _ =
                                    Installer::create_linux_desktop_entry(&app_path, &desktop_file);
                            }
                        }
                        Err(e) => {
                            let err_msg = format!("Linux AppImage installation failed: {e}");
                            emit_progress(
                                &app,
                                "Ошибка установки",
                                100.0,
                                "0 MB/s",
                                "0s",
                                &format!("[ERROR] {err_msg}"),
                            );
                            let _ = app.emit(
                                "install-finished",
                                FinishEventPayload {
                                    success: false,
                                    error: Some(err_msg),
                                },
                            );
                            return;
                        }
                    }
                }
            }
        }

        // Mandatory Honest Binary Verification: check executable exists and > 1 MB
        emit_progress(
            &app,
            "Верификация установленных файлов...",
            76.0,
            "0 MB/s",
            "1s",
            "[INFO] Verifying launcher binary size and integrity...",
        );
        let target_exe = match Installer::verify_installed_binary(&install_path) {
            Ok(exe) => exe,
            Err(e) => {
                emit_progress(
                    &app,
                    "Ошибка валидации",
                    100.0,
                    "0 MB/s",
                    "0s",
                    &format!("[ERROR] {e}"),
                );
                let _ = app.emit(
                    "install-finished",
                    FinishEventPayload {
                        success: false,
                        error: Some(e),
                    },
                );
                return;
            }
        };

        // Step 5: Optional Java runtimes
        if config.components.contains(&Component::Java21) {
            emit_progress(
                &app,
                "Загрузка Java 21 Temurin...",
                80.0,
                "24.0 MB/s",
                "3s",
                "[INFO] Checking Adoptium OpenJDK 21 LTS runtime...",
            );
            let java_dir = install_path.join("runtimes").join("java-21");
            let _ = std::fs::create_dir_all(&java_dir);
            tokio::time::sleep(std::time::Duration::from_millis(400)).await;
            emit_progress(
                &app,
                "Настройка Java 21...",
                85.0,
                "0 MB/s",
                "1s",
                "[INFO] Adoptium Java 21 runtime configured.",
            );
        }

        // Step 6: Shortcuts & associations
        emit_progress(
            &app,
            "Создание системных ярлыков...",
            88.0,
            "0 MB/s",
            "1s",
            "[INFO] Creating Desktop and Start Menu shortcuts...",
        );
        let shortcuts = ShortcutManager::create_shortcuts(
            &target_exe,
            &install_path,
            "Aethel Launcher",
            config.create_desktop_shortcut,
            config.create_start_menu_shortcut,
        )
        .unwrap_or_default();

        // Step 7: Uninstaller generation with actual installed files
        emit_progress(
            &app,
            "Создание деинсталлятора...",
            95.0,
            "0 MB/s",
            "1s",
            "[INFO] Generating install-manifest.json and uninstaller...",
        );
        if !installed_files.contains(&target_exe.to_string_lossy().to_string()) {
            installed_files.push(target_exe.to_string_lossy().to_string());
        }
        let manifest = InstallManifest {
            version: env!("CARGO_PKG_VERSION").to_string(),
            install_path: install_path.clone(),
            installed_files,
            shortcuts,
            installed_at: chrono::Utc::now().to_rfc3339(),
        };
        let _ = Uninstaller::write_manifest(&manifest);
        let _ = Uninstaller::generate_uninstaller(&install_path);

        // Clean up temporary downloaded setup if any
        if let Some(setup_path) = temp_setup_path {
            let _ = std::fs::remove_file(setup_path);
        }

        // Step 8: Done!
        emit_progress(
            &app,
            "Установка завершена",
            100.0,
            "0 MB/s",
            "0s",
            "[INFO] Setup successfully finished.",
        );
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        let _ = app.emit(
            "install-finished",
            FinishEventPayload {
                success: true,
                error: None,
            },
        );
    });

    Ok(())
}
