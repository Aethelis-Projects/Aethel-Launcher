//! Canonical filesystem paths and legacy migration for Aethel Launcher.

use crate::AppError;
use std::path::{Path, PathBuf};
use tracing::info;

/// Resolves root data directory with an optional override.
pub fn resolve_data_root(override_dir: Option<&str>) -> PathBuf {
    if let Some(dir) = override_dir {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("aethel")
}

/// Returns the root data directory for Aethel Launcher.
///
/// Hierarchy:
/// - Windows: `%LOCALAPPDATA%\aethel\`
/// - Linux: `~/.local/share/aethel/`
/// - macOS: `~/Library/Application Support/aethel/`
///
/// Can be overridden via the `AETHEL_DATA_DIR` environment variable for testing and portability.
pub fn data_root() -> PathBuf {
    resolve_data_root(std::env::var("AETHEL_DATA_DIR").ok().as_deref())
}

/// Directory for launcher application binaries (`<data_root>/app`).
pub fn app_dir() -> PathBuf {
    data_root().join("app")
}

/// Directory for Minecraft instances (`<data_root>/instances`).
pub fn instances_dir() -> PathBuf {
    data_root().join("instances")
}

/// Directory for managed Java runtimes (`<data_root>/runtimes`).
pub fn runtimes_dir() -> PathBuf {
    data_root().join("runtimes")
}

/// Directory for downloaded shared libraries (`<data_root>/libraries`).
pub fn libraries_dir() -> PathBuf {
    data_root().join("libraries")
}

/// Directory for downloaded game assets (`<data_root>/assets`).
pub fn assets_dir() -> PathBuf {
    data_root().join("assets")
}

/// Directory for Minecraft version packages and client jars (`<data_root>/versions`).
pub fn versions_dir() -> PathBuf {
    data_root().join("versions")
}

/// Directory for cache files (`<data_root>/cache`).
pub fn cache_dir() -> PathBuf {
    data_root().join("cache")
}

/// Migrates data from legacy directory (`Aethel Launcher`) into modern unified root (`aethel`).
///
/// Must be executed before database opening and application state initialization.
pub fn migrate_legacy_paths() -> Result<(), AppError> {
    let Some(data_local) = dirs::data_local_dir() else {
        return Ok(());
    };

    let legacy = data_local.join("Aethel Launcher");
    let modern = data_root();

    // If legacy directory exists and is distinct from modern
    if legacy.exists() && legacy != modern {
        info!(
            "Checking for legacy data migration from {:?} to {:?}",
            legacy, modern
        );
        std::fs::create_dir_all(&modern)?;

        // Migrate core game subdirectories
        let subdirs = [
            "instances",
            "runtimes",
            "libraries",
            "assets",
            "versions",
            "cache",
        ];
        for subdir in &subdirs {
            let src = legacy.join(subdir);
            let dst = modern.join(subdir);
            if src.exists() && !dst.exists() {
                info!("Migrating legacy subdir {:?} to {:?}", src, dst);
                if let Err(e) = std::fs::rename(&src, &dst) {
                    info!("Rename failed ({e}), attempting copy for {:?}", src);
                    copy_dir_recursive(&src, &dst)?;
                    let _ = std::fs::remove_dir_all(&src);
                }
            }
        }

        // Migrate standalone databases/config if present in legacy root
        let root_files = ["aethel.db", "aethel.db-shm", "aethel.db-wal", "accounts.db"];
        for file in &root_files {
            let src = legacy.join(file);
            let dst = modern.join(file);
            if src.exists() && !dst.exists() {
                info!("Migrating legacy file {:?} to {:?}", src, dst);
                let _ = std::fs::rename(&src, &dst);
            }
        }

        // Clean up legacy directory if it is now empty
        let _ = clean_if_empty(&legacy);
    }

    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), AppError> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)?.flatten() {
        let path = entry.path();
        let dest_path = dst.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &dest_path)?;
        } else {
            std::fs::copy(&path, &dest_path)?;
        }
    }
    Ok(())
}

fn clean_if_empty(dir: &Path) -> std::io::Result<()> {
    if let Ok(mut entries) = std::fs::read_dir(dir) {
        if entries.next().is_none() {
            std::fs::remove_dir(dir)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_data_root_and_subdirs() {
        let root = resolve_data_root(None);
        assert!(root.to_string_lossy().contains("aethel"));
        assert_eq!(root.join("app"), root.join("app"));
        assert_eq!(root.join("instances"), root.join("instances"));
        assert_eq!(root.join("runtimes"), root.join("runtimes"));
        assert_eq!(root.join("libraries"), root.join("libraries"));
        assert_eq!(root.join("assets"), root.join("assets"));
        assert_eq!(root.join("versions"), root.join("versions"));
    }

    #[test]
    fn test_resolve_data_root_override() {
        let custom = resolve_data_root(Some("/custom/aethel/path"));
        assert_eq!(custom, PathBuf::from("/custom/aethel/path"));
    }

    #[test]
    fn test_migrate_legacy_paths_moves_data() {
        let temp = tempfile::tempdir().unwrap();
        let legacy = temp.path().join("legacy_root");
        let modern = temp.path().join("modern_root");

        let legacy_inst = legacy.join("instances/my-inst");
        std::fs::create_dir_all(&legacy_inst).unwrap();
        std::fs::write(legacy_inst.join("instance.json"), b"{}").unwrap();

        std::fs::create_dir_all(&modern).unwrap();
        let src = legacy.join("instances");
        let dst = modern.join("instances");
        std::fs::rename(&src, &dst).unwrap();

        assert!(modern.join("instances/my-inst/instance.json").exists());
        assert!(!legacy.join("instances").exists());
    }
}
