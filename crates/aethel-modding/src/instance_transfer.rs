use aethel_core::{AppError, AppErrorCode, Instance};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::modpack::is_safe_relative_path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct ExportOptions {
    pub include_saves: bool,
    pub include_resourcepacks: bool,
    pub include_shaderpacks: bool,
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            include_saves: true,
            include_resourcepacks: true,
            include_shaderpacks: true,
        }
    }
}

pub struct InstanceExporter;

impl InstanceExporter {
    /// Checks if a relative path component represents a directory that should be excluded.
    pub fn is_excluded_dir(name: &str) -> bool {
        matches!(
            name,
            "natives"
                | "libraries"
                | "logs"
                | "crash-reports"
                | ".fabric"
                | ".quilt"
                | ".cache"
                | "assets"
        )
    }

    /// Exports an instance into a transferable .zip archive.
    pub fn export(
        instance_dir: &Path,
        instance: &Instance,
        output_zip: &Path,
        options: &ExportOptions,
    ) -> Result<(), AppError> {
        if let Some(parent) = output_zip.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed creating output dir: {e}"),
                )
            })?;
        }

        let file = File::create(output_zip).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed creating export zip {}: {e}", output_zip.display()),
            )
        })?;

        let mut zip = ZipWriter::new(file);
        let file_options =
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        // 1. Write instance.json metadata at root
        let json_data = serde_json::to_string_pretty(instance).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed serializing instance.json: {e}"),
            )
        })?;

        zip.start_file("instance.json", file_options).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed adding instance.json: {e}"),
            )
        })?;
        zip.write_all(json_data.as_bytes()).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed writing instance.json: {e}"),
            )
        })?;

        // 2. Walk instance directory
        if instance_dir.exists() {
            for entry in WalkDir::new(instance_dir)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if !entry.file_type().is_file() {
                    continue;
                }

                let rel_path = entry
                    .path()
                    .strip_prefix(instance_dir)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?;

                // Check directory exclusions
                let components: Vec<_> = rel_path
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy().to_string())
                    .collect();

                if components.iter().any(|c| Self::is_excluded_dir(c)) {
                    continue;
                }

                // Check options-based exclusions
                if !options.include_saves && components.iter().any(|c| c == "saves") {
                    continue;
                }
                if !options.include_resourcepacks && components.iter().any(|c| c == "resourcepacks")
                {
                    continue;
                }
                if !options.include_shaderpacks && components.iter().any(|c| c == "shaderpacks") {
                    continue;
                }

                let zip_name = rel_path.to_string_lossy().replace('\\', "/");
                zip.start_file(&zip_name, file_options).map_err(|e| {
                    AppError::new(
                        AppErrorCode::InternalError,
                        format!("Failed adding {zip_name} to zip: {e}"),
                    )
                })?;

                let mut in_file = File::open(entry.path()).map_err(|e| {
                    AppError::new(
                        AppErrorCode::InternalError,
                        format!("Failed reading file {}: {e}", entry.path().display()),
                    )
                })?;
                std::io::copy(&mut in_file, &mut zip).map_err(|e| {
                    AppError::new(
                        AppErrorCode::InternalError,
                        format!("Failed writing {zip_name} to zip: {e}"),
                    )
                })?;
            }
        }

        zip.finish().map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to finalize instance zip: {e}"),
            )
        })?;

        Ok(())
    }
}

pub struct InstanceImporter;

impl InstanceImporter {
    /// Reads instance.json from an export zip archive without extracting everything.
    pub fn read_metadata(zip_path: &Path) -> Result<Instance, AppError> {
        let file = File::open(zip_path).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed opening instance zip {}: {e}", zip_path.display()),
            )
        })?;

        let mut archive = ZipArchive::new(file).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Invalid zip archive: {e}"),
            )
        })?;

        let mut instance_file = archive.by_name("instance.json").map_err(|_| {
            AppError::new(
                AppErrorCode::InvalidManifest,
                "Instance archive missing instance.json",
            )
        })?;

        let mut json_str = String::new();
        instance_file.read_to_string(&mut json_str).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed reading instance.json: {e}"),
            )
        })?;

        let instance: Instance = serde_json::from_str(&json_str).map_err(|e| {
            AppError::new(
                AppErrorCode::InvalidManifest,
                format!("Failed parsing instance.json: {e}"),
            )
        })?;

        Ok(instance)
    }

    /// Imports an instance zip into the target directory with Zip-Slip protection.
    pub fn import(zip_path: &Path, target_dir: &Path) -> Result<Instance, AppError> {
        let instance = Self::read_metadata(zip_path)?;

        std::fs::create_dir_all(target_dir).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed creating target dir: {e}"),
            )
        })?;

        let file = File::open(zip_path).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed opening instance zip: {e}"),
            )
        })?;

        let mut archive = ZipArchive::new(file).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed reading zip archive: {e}"),
            )
        })?;

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed reading entry {i}: {e}"),
                )
            })?;

            let name = entry.name().to_string();
            if entry.is_dir() {
                continue;
            }

            if !is_safe_relative_path(&name) {
                return Err(AppError::new(
                    AppErrorCode::ZipSlipDetected,
                    format!("Zip-Slip attempt detected: {name}"),
                ));
            }

            let dest_path = target_dir.join(&name);
            if let Some(parent) = dest_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    AppError::new(
                        AppErrorCode::InternalError,
                        format!("Failed creating parent dir: {e}"),
                    )
                })?;
            }

            let mut out = File::create(&dest_path).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed creating file {}: {e}", dest_path.display()),
                )
            })?;
            std::io::copy(&mut entry, &mut out).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed writing file {}: {e}", dest_path.display()),
                )
            })?;
        }

        Ok(instance)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn sample_instance() -> Instance {
        Instance {
            id: "inst-123".to_string(),
            name: "Test Instance".to_string(),
            game_version: "1.20.4".to_string(),
            loader: Some("fabric".to_string()),
            loader_version: Some("0.15.7".to_string()),
            java_path: None,
            memory_min_mb: Some(1024),
            memory_max_mb: Some(4096),
            jvm_args: None,
            last_played_at: None,
            total_playtime_seconds: 120,
            icon_path: None,
            banner_path: None,
            created_at: "2026-09-04T12:00:00Z".to_string(),
        }
    }

    #[test]
    fn test_instance_excludes_natives_and_libs() {
        assert!(InstanceExporter::is_excluded_dir("natives"));
        assert!(InstanceExporter::is_excluded_dir("libraries"));
        assert!(InstanceExporter::is_excluded_dir("logs"));
        assert!(InstanceExporter::is_excluded_dir("crash-reports"));
        assert!(InstanceExporter::is_excluded_dir(".fabric"));
        assert!(InstanceExporter::is_excluded_dir(".quilt"));
        assert!(InstanceExporter::is_excluded_dir(".cache"));

        assert!(!InstanceExporter::is_excluded_dir("mods"));
        assert!(!InstanceExporter::is_excluded_dir("config"));
        assert!(!InstanceExporter::is_excluded_dir("saves"));
    }

    #[test]
    fn test_instance_export_and_import_roundtrip() {
        let temp = tempdir().unwrap();
        let src_dir = temp.path().join("src_instance");
        let zip_file = temp.path().join("backup.zip");
        let restore_dir = temp.path().join("restored_instance");

        // Setup source instance structure
        std::fs::create_dir_all(src_dir.join("mods")).unwrap();
        std::fs::create_dir_all(src_dir.join("config")).unwrap();
        std::fs::create_dir_all(src_dir.join("saves/world1")).unwrap();
        std::fs::create_dir_all(src_dir.join("natives")).unwrap(); // Should be excluded!
        std::fs::create_dir_all(src_dir.join("libraries")).unwrap(); // Should be excluded!

        std::fs::write(src_dir.join("mods/sodium.jar"), b"PK\x03\x04sodium").unwrap();
        std::fs::write(src_dir.join("config/options.json"), b"{\"ui\": 1}").unwrap();
        std::fs::write(src_dir.join("saves/world1/level.dat"), b"world-data").unwrap();
        std::fs::write(src_dir.join("natives/glfw.dll"), b"native-dll").unwrap();
        std::fs::write(src_dir.join("libraries/client.jar"), b"library-jar").unwrap();

        let inst = sample_instance();

        // Export
        InstanceExporter::export(&src_dir, &inst, &zip_file, &ExportOptions::default())
            .expect("Export must succeed");

        assert!(zip_file.exists());

        // Import
        let imported_inst =
            InstanceImporter::import(&zip_file, &restore_dir).expect("Import must succeed");

        assert_eq!(imported_inst.id, inst.id);
        assert_eq!(imported_inst.name, inst.name);
        assert_eq!(imported_inst.game_version, inst.game_version);
        assert_eq!(imported_inst.loader, inst.loader);

        // Verify included files
        assert!(restore_dir.join("instance.json").exists());
        assert!(restore_dir.join("mods/sodium.jar").exists());
        assert!(restore_dir.join("config/options.json").exists());
        assert!(restore_dir.join("saves/world1/level.dat").exists());

        // Verify excluded platform-dependent files
        assert!(!restore_dir.join("natives/glfw.dll").exists());
        assert!(!restore_dir.join("libraries/client.jar").exists());
    }

    #[test]
    fn test_instance_import_zip_slip_protection() {
        let temp = tempdir().unwrap();
        let zip_file = temp.path().join("evil.zip");
        let restore_dir = temp.path().join("restored");

        let file = File::create(&zip_file).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        let inst = sample_instance();
        let inst_json = serde_json::to_string(&inst).unwrap();
        zip.start_file("instance.json", options).unwrap();
        zip.write_all(inst_json.as_bytes()).unwrap();

        // Malicious entry
        zip.start_file("../evil.txt", options).unwrap();
        zip.write_all(b"escape").unwrap();
        zip.finish().unwrap();

        let res = InstanceImporter::import(&zip_file, &restore_dir);
        assert!(res.is_err());
        let err = res.unwrap_err();
        assert_eq!(err.code(), AppErrorCode::ZipSlipDetected);
    }
}
