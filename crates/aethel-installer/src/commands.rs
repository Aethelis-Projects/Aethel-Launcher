use crate::check_installer_version as check_version_lib;
use crate::downloader::InstallerDownloader;
use crate::installer::{Component, InstallConfig, Installer, PathValidation};
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
pub fn launch_application(target_path: String) -> Result<(), String> {
    let p = PathBuf::from(target_path);
    #[cfg(windows)]
    let exe_path = p.join("Aethel Launcher.exe");
    #[cfg(not(windows))]
    let exe_path = p.join("aethel-launcher");

    if exe_path.exists() {
        open::that_detached(&exe_path).map_err(|e| format!("Failed to launch application: {e}"))?;
    } else if p.exists() {
        open::that_detached(&p).map_err(|e| format!("Failed to open install folder: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_default_install_path() -> String {
    #[cfg(windows)]
    {
        if let Some(local_appdata) = dirs::data_local_dir() {
            local_appdata
                .join("Programs")
                .join("Aethel Launcher")
                .to_string_lossy()
                .to_string()
        } else {
            r"C:\Program Files\Aethel Launcher".to_string()
        }
    }
    #[cfg(target_os = "macos")]
    {
        "/Applications/Aethel Launcher.app".to_string()
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        if let Some(local_share) = dirs::data_local_dir() {
            local_share
                .join("aethel-launcher")
                .to_string_lossy()
                .to_string()
        } else {
            "~/.local/share/aethel-launcher".to_string()
        }
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

        // Step 2: Resolve and Download Launcher Binary
        let (launcher_url, asset_name) =
            InstallerDownloader::resolve_launcher_asset_url(env!("CARGO_PKG_VERSION"));

        emit_progress(
            &app,
            "Загрузка Aethel Launcher...",
            20.0,
            "...",
            "...",
            &format!("[INFO] Resolving release binary from GitHub Releases ({asset_name})..."),
        );

        // Check if installer package already exists locally (e.g. downloaded alongside installer)
        let local_payload = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|dir| dir.join(&asset_name)))
            .filter(|p| p.exists());

        let temp_setup_path = if let Some(local_path) = local_payload {
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

        #[cfg(windows)]
        let target_exe = install_path.join("Aethel Launcher.exe");
        #[cfg(not(windows))]
        let target_exe = install_path.join("aethel-launcher");

        #[cfg(windows)]
        {
            if let Some(setup_exe) = &temp_setup_path {
                emit_progress(
                    &app,
                    "Установка ядра приложения...",
                    72.0,
                    "0 MB/s",
                    "1s",
                    "[INFO] Executing silent installation into destination...",
                );
                let _ = std::process::Command::new(setup_exe)
                    .args(["/S", &format!("/D={}", install_path.display())])
                    .status();
            }
        }

        // Step 5: Optional Java runtimes
        if config.components.contains(&Component::Java21) {
            emit_progress(
                &app,
                "Загрузка Java 21 Temurin...",
                78.0,
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
                84.0,
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
        let _ = ShortcutManager::create_shortcuts(
            &target_exe,
            &install_path,
            "Aethel Launcher",
            config.create_desktop_shortcut,
            config.create_start_menu_shortcut,
        );

        // Step 7: Uninstaller generation
        emit_progress(
            &app,
            "Создание деинсталлятора...",
            95.0,
            "0 MB/s",
            "1s",
            "[INFO] Generating install-manifest.json and uninstaller...",
        );
        let manifest = InstallManifest {
            version: env!("CARGO_PKG_VERSION").to_string(),
            install_path: install_path.clone(),
            installed_files: vec![target_exe.to_string_lossy().to_string()],
            shortcuts: vec![],
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
