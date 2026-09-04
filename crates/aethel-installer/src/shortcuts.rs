#[allow(unused_imports)]
use aethel_core::{AppError, AppErrorCode};
use std::path::Path;

pub struct ShortcutManager;

impl ShortcutManager {
    /// Creates shortcuts on Desktop and/or Start Menu.
    pub fn create_shortcuts(
        target_exe: &Path,
        install_dir: &Path,
        app_name: &str,
        create_desktop: bool,
        create_start_menu: bool,
    ) -> Result<Vec<String>, AppError> {
        let mut created = Vec::new();

        #[cfg(target_os = "windows")]
        {
            if create_desktop {
                if let Some(desktop_dir) = dirs::desktop_dir() {
                    let shortcut_path = desktop_dir.join(format!("{app_name}.lnk"));
                    if Self::create_windows_shortcut(target_exe, install_dir, &shortcut_path)
                        .is_ok()
                    {
                        created.push(shortcut_path.to_string_lossy().to_string());
                    }
                }
            }

            if create_start_menu {
                if let Some(data_dir) = dirs::data_dir() {
                    let start_menu_dir = data_dir.join(r"Microsoft\Windows\Start Menu\Programs");
                    let _ = std::fs::create_dir_all(&start_menu_dir);
                    let shortcut_path = start_menu_dir.join(format!("{app_name}.lnk"));
                    if Self::create_windows_shortcut(target_exe, install_dir, &shortcut_path)
                        .is_ok()
                    {
                        created.push(shortcut_path.to_string_lossy().to_string());
                    }
                }
            }
        }

        #[cfg(target_os = "linux")]
        {
            let desktop_entry = format!(
                "[Desktop Entry]\n\
                 Name={app_name}\n\
                 Exec=\"{}\"\n\
                 Path=\"{}\"\n\
                 Terminal=false\n\
                 Type=Application\n\
                 Categories=Game;\n",
                target_exe.display(),
                install_dir.display()
            );

            if create_desktop {
                if let Some(desktop_dir) = dirs::desktop_dir() {
                    let p = desktop_dir.join(format!("{app_name}.desktop"));
                    if std::fs::write(&p, &desktop_entry).is_ok() {
                        created.push(p.to_string_lossy().to_string());
                    }
                }
            }

            if create_start_menu {
                if let Some(home) = dirs::home_dir() {
                    let app_dir = home.join(".local/share/applications");
                    let _ = std::fs::create_dir_all(&app_dir);
                    let p = app_dir.join(format!("{app_name}.desktop"));
                    if std::fs::write(&p, &desktop_entry).is_ok() {
                        created.push(p.to_string_lossy().to_string());
                    }
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            let _ = (
                target_exe,
                install_dir,
                app_name,
                create_desktop,
                create_start_menu,
            );
            let _ = &mut created;
        }

        Ok(created)
    }

    #[cfg(target_os = "windows")]
    fn create_windows_shortcut(
        target_exe: &Path,
        working_dir: &Path,
        shortcut_path: &Path,
    ) -> Result<(), AppError> {
        let script = format!(
            "$ws = New-Object -ComObject WScript.Shell; \
             $s = $ws.CreateShortcut('{}'); \
             $s.TargetPath = '{}'; \
             $s.WorkingDirectory = '{}'; \
             $s.Save()",
            shortcut_path.to_string_lossy().replace('\'', "''"),
            target_exe.to_string_lossy().replace('\'', "''"),
            working_dir.to_string_lossy().replace('\'', "''")
        );

        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to execute PowerShell shortcut creation: {e}"),
                )
            })?;

        if !output.status.success() {
            return Err(AppError::new(
                AppErrorCode::InternalError,
                format!(
                    "Shortcut creation failed: {}",
                    String::from_utf8_lossy(&output.stderr)
                ),
            ));
        }

        Ok(())
    }
}
