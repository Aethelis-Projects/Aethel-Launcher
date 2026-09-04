#[allow(unused_imports)]
use aethel_core::{AppError, AppErrorCode};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Component {
    Launcher,
    Java21,
    Java17,
    Java8,
    DesktopShortcut,
    StartMenuShortcut,
    FileAssociations,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallConfig {
    pub install_path: PathBuf,
    pub components: Vec<Component>,
    pub create_desktop_shortcut: bool,
    pub create_start_menu_shortcut: bool,
    pub auto_start: bool,
    pub register_file_associations: bool,
}

impl Default for InstallConfig {
    fn default() -> Self {
        let default_path = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Aethel Launcher");

        Self {
            install_path: default_path,
            components: vec![
                Component::Launcher,
                Component::Java21,
                Component::DesktopShortcut,
                Component::StartMenuShortcut,
            ],
            create_desktop_shortcut: true,
            create_start_menu_shortcut: true,
            auto_start: false,
            register_file_associations: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathValidation {
    pub is_valid: bool,
    pub error_message: Option<String>,
    pub warning_message: Option<String>,
    pub free_space_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub stage: String,
    pub progress_percent: f32,
    pub speed_bps: u64,
    pub eta_seconds: u64,
    pub log_message: String,
}

pub struct Installer {
    pub config: InstallConfig,
}

impl Installer {
    pub fn new(config: InstallConfig) -> Self {
        Self { config }
    }

    /// Checks if the process has elevated Administrator privileges (Windows UAC).
    pub fn is_running_as_admin() -> bool {
        #[cfg(windows)]
        {
            use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_QUERY};
            use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

            unsafe {
                let mut token: windows_sys::Win32::Foundation::HANDLE = std::ptr::null_mut();
                if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
                    return false;
                }

                let mut elevation: u32 = 0;
                let mut size = 0;
                let res = GetTokenInformation(
                    token,
                    TokenElevation,
                    &mut elevation as *mut _ as *mut _,
                    std::mem::size_of::<u32>() as u32,
                    &mut size,
                );

                if !token.is_null() {
                    windows_sys::Win32::Foundation::CloseHandle(token);
                }

                res != 0 && elevation != 0
            }
        }
        #[cfg(not(windows))]
        {
            // On Unix: root check via environment variables USER / LOGNAME
            std::env::var("USER")
                .or_else(|_| std::env::var("LOGNAME"))
                .map(|u| u == "root")
                .unwrap_or(false)
        }
    }

    /// Validates target installation directory.
    pub fn validate_install_path(path_str: &str) -> PathValidation {
        let trimmed = path_str.trim();
        if trimmed.is_empty() {
            return PathValidation {
                is_valid: false,
                error_message: Some("Installation path cannot be empty".to_string()),
                warning_message: None,
                free_space_bytes: 0,
            };
        }

        let path = Path::new(trimmed);
        let is_abs = path.is_absolute()
            || trimmed.starts_with('/')
            || (trimmed.len() >= 3
                && trimmed.as_bytes()[0].is_ascii_alphabetic()
                && trimmed.as_bytes()[1] == b':'
                && (trimmed.as_bytes()[2] == b'\\' || trimmed.as_bytes()[2] == b'/'));

        if !is_abs {
            return PathValidation {
                is_valid: false,
                error_message: Some("Installation path must be an absolute path".to_string()),
                warning_message: None,
                free_space_bytes: 0,
            };
        }

        // Check for non-ASCII characters or spaces (common issue with Java/Minecraft paths)
        let mut warning = None;
        if !trimmed.is_ascii() {
            warning = Some("Path contains non-ASCII characters, which may cause compatibility issues with older Minecraft mods".to_string());
        }

        // Check disk free space
        let free_space = Self::get_available_disk_space(path).unwrap_or(0);
        let min_required = 500 * 1024 * 1024; // 500 MB minimum

        if free_space > 0 && free_space < min_required {
            return PathValidation {
                is_valid: false,
                error_message: Some(format!(
                    "Insufficient disk space: required 500 MB, available {} MB",
                    free_space / (1024 * 1024)
                )),
                warning_message: warning,
                free_space_bytes: free_space,
            };
        }

        PathValidation {
            is_valid: true,
            error_message: None,
            warning_message: warning,
            free_space_bytes: free_space,
        }
    }

    /// Queries free disk space available on the target drive in bytes.
    pub fn get_available_disk_space(path: &Path) -> Result<u64, AppError> {
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

            let check_dir = if path.is_dir() {
                path
            } else {
                path.parent().unwrap_or(path)
            };

            let mut cur = check_dir;
            while !cur.exists() {
                if let Some(parent) = cur.parent() {
                    cur = parent;
                } else {
                    break;
                }
            }

            let mut wide: Vec<u16> = cur.as_os_str().encode_wide().collect();
            wide.push(0);

            let mut free_bytes_available: u64 = 0;
            let mut total_bytes: u64 = 0;
            let mut total_free_bytes: u64 = 0;

            unsafe {
                let res = GetDiskFreeSpaceExW(
                    wide.as_ptr(),
                    &mut free_bytes_available,
                    &mut total_bytes,
                    &mut total_free_bytes,
                );
                if res == 0 {
                    return Err(AppError::new(
                        AppErrorCode::InternalError,
                        "Failed to query disk space",
                    ));
                }
            }

            Ok(free_bytes_available)
        }
        #[cfg(not(windows))]
        {
            let _ = path;
            Ok(10 * 1024 * 1024 * 1024) // 10 GB dummy fallback on non-windows
        }
    }

    /// Calculates estimated download and install size for selected components.
    pub fn calculate_components_size(components: &[Component]) -> u64 {
        let mut total_bytes: u64 = 0;
        for c in components {
            match c {
                Component::Launcher => total_bytes += 120 * 1024 * 1024, // ~120 MB
                Component::Java21 => total_bytes += 190 * 1024 * 1024,   // ~190 MB
                Component::Java17 => total_bytes += 175 * 1024 * 1024,   // ~175 MB
                Component::Java8 => total_bytes += 105 * 1024 * 1024,    // ~105 MB
                _ => {}
            }
        }
        total_bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_install_path_validation_valid() {
        let res_win = Installer::validate_install_path(r"C:\AethelLauncher");
        assert!(res_win.is_valid);
        assert!(res_win.error_message.is_none());

        let res_unix = Installer::validate_install_path("/opt/AethelLauncher");
        assert!(res_unix.is_valid);
        assert!(res_unix.error_message.is_none());
    }

    #[test]
    fn test_install_path_validation_empty() {
        let res = Installer::validate_install_path("   ");
        assert!(!res.is_valid);
        assert_eq!(
            res.error_message,
            Some("Installation path cannot be empty".to_string())
        );
    }

    #[test]
    fn test_install_path_validation_relative() {
        let res = Installer::validate_install_path("relative/path/launcher");
        assert!(!res.is_valid);
        assert_eq!(
            res.error_message,
            Some("Installation path must be an absolute path".to_string())
        );
    }

    #[test]
    fn test_install_path_validation_non_ascii_warning() {
        let res_win = Installer::validate_install_path(r"C:\Игры\Aethel");
        assert!(res_win.is_valid);
        assert!(res_win.warning_message.is_some());

        let res_unix = Installer::validate_install_path("/opt/Игры/Aethel");
        assert!(res_unix.is_valid);
        assert!(res_unix.warning_message.is_some());
    }

    #[test]
    fn test_component_size_calculation() {
        let comps = vec![Component::Launcher, Component::Java21];
        let size = Installer::calculate_components_size(&comps);
        assert_eq!(size, (120 + 190) * 1024 * 1024);
    }
}
