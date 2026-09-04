use aethel_core::{AppError, AppErrorCode};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallManifest {
    pub version: String,
    pub install_path: PathBuf,
    pub installed_files: Vec<String>,
    pub shortcuts: Vec<String>,
    pub installed_at: String,
}

pub struct Uninstaller;

impl Uninstaller {
    pub const MANIFEST_FILENAME: &str = "install-manifest.json";

    /// Writes install manifest into the installation directory.
    pub fn write_manifest(manifest: &InstallManifest) -> Result<(), AppError> {
        let manifest_path = manifest.install_path.join(Self::MANIFEST_FILENAME);
        let json = serde_json::to_string_pretty(manifest).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to serialize install manifest: {e}"),
            )
        })?;

        std::fs::write(&manifest_path, json).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to write install manifest {}: {e}", manifest_path.display()),
            )
        })?;

        Ok(())
    }

    /// Reads existing install manifest.
    pub fn read_manifest(install_path: &Path) -> Result<InstallManifest, AppError> {
        let manifest_path = install_path.join(Self::MANIFEST_FILENAME);
        let contents = std::fs::read_to_string(&manifest_path).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to read install manifest {}: {e}", manifest_path.display()),
            )
        })?;

        serde_json::from_str(&contents).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Invalid install manifest format: {e}"),
            )
        })
    }

    /// Generates uninstall script in the installation directory.
    pub fn generate_uninstaller(install_path: &Path) -> Result<PathBuf, AppError> {
        #[cfg(target_os = "windows")]
        {
            let script_path = install_path.join("uninstall.cmd");
            let script_content = format!(
                "@echo off\r\n\
                 echo Uninstalling Aethel Launcher...\r\n\
                 timeout /t 1 /nobreak >nul\r\n\
                 powershell -NoProfile -Command \"$p = Get-Content '{}\\install-manifest.json' | ConvertFrom-Json; foreach ($s in $p.shortcuts) {{ Remove-Item -Force -ErrorAction SilentlyContinue $s }}\"\r\n\
                 rmdir /s /q \"{}\"\r\n\
                 echo Uninstall complete.\r\n",
                install_path.display(),
                install_path.display()
            );

            std::fs::write(&script_path, script_content).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to generate uninstaller script: {e}"),
                )
            })?;

            Ok(script_path)
        }
        #[cfg(not(target_os = "windows"))]
        {
            let script_path = install_path.join("uninstall.sh");
            let script_content = format!(
                "#!/bin/sh\n\
                 echo 'Uninstalling Aethel Launcher...'\n\
                 rm -rf \"{}\"\n",
                install_path.display()
            );

            std::fs::write(&script_path, script_content).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to generate uninstaller script: {e}"),
                )
            })?;

            Ok(script_path)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manifest_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let manifest = InstallManifest {
            version: "1.0.0".to_string(),
            install_path: tmp.path().to_path_buf(),
            installed_files: vec!["launcher.exe".to_string()],
            shortcuts: vec!["Aethel.lnk".to_string()],
            installed_at: "2026-09-04T22:00:00Z".to_string(),
        };

        Uninstaller::write_manifest(&manifest).unwrap();
        let loaded = Uninstaller::read_manifest(tmp.path()).unwrap();
        assert_eq!(loaded.version, "1.0.0");
        assert_eq!(loaded.installed_files.len(), 1);
        assert_eq!(loaded.shortcuts.len(), 1);
    }
}
