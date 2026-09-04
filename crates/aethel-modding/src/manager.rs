use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

use crate::modrinth::ModrinthClient;
use crate::types::{InstalledMod, ModUpdate};
use aethel_core::{AppError, AppErrorCode};

pub struct ModManager {
    instance_dir: PathBuf,
}

impl ModManager {
    pub fn new(instance_dir: impl Into<PathBuf>) -> Self {
        Self {
            instance_dir: instance_dir.into(),
        }
    }

    pub fn mods_dir(&self) -> PathBuf {
        self.instance_dir.join("mods")
    }

    /// Lists all installed mods in the instance's mods directory (alias).
    pub fn list_installed_mods(&self) -> Result<Vec<InstalledMod>, AppError> {
        self.list_installed()
    }

    /// Lists all installed mods in the instance's mods directory.
    pub fn list_installed(&self) -> Result<Vec<InstalledMod>, AppError> {
        let mods_path = self.mods_dir();
        if !mods_path.exists() {
            return Ok(Vec::new());
        }

        let mut mods = Vec::new();
        let entries = std::fs::read_dir(&mods_path).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to read mods directory {}: {e}", mods_path.display()),
            )
        })?;

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let file_name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            let (is_mod, enabled) = if file_name.ends_with(".jar") {
                (true, true)
            } else if file_name.ends_with(".jar.disabled") {
                (true, false)
            } else {
                (false, false)
            };

            if !is_mod {
                continue;
            }

            let meta = Self::read_jar_metadata(&path);
            let id = meta.id.unwrap_or_else(|| {
                file_name
                    .trim_end_matches(".disabled")
                    .trim_end_matches(".jar")
                    .to_string()
            });
            let name = meta.name.unwrap_or_else(|| id.clone());
            let version = meta.version.unwrap_or_else(|| "unknown".to_string());

            mods.push(InstalledMod {
                id: id.clone(),
                name,
                version,
                file_name,
                enabled,
                description: meta.description,
                authors: meta.authors,
                project_id: meta.project_id.or(Some(id)),
            });
        }

        // Sort alphabetically by name
        mods.sort_by_key(|a| a.name.to_lowercase());
        Ok(mods)
    }

    /// Reads metadata from a mod jar without full extraction.
    pub fn read_jar_metadata(path: &Path) -> ExtractedModMeta {
        let file = match File::open(path) {
            Ok(f) => f,
            Err(_) => return ExtractedModMeta::default(),
        };

        let mut archive = match ZipArchive::new(file) {
            Ok(a) => a,
            Err(_) => return ExtractedModMeta::default(),
        };

        // 1. Try fabric.mod.json
        if let Ok(mut zip_file) = archive.by_name("fabric.mod.json") {
            let mut content = String::new();
            if zip_file.read_to_string(&mut content).is_ok() {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    let id = val["id"].as_str().map(String::from);
                    let name = val["name"].as_str().map(String::from);
                    let version = val["version"].as_str().map(String::from);
                    let description = val["description"].as_str().map(String::from);
                    let authors = val["authors"]
                        .as_array()
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|a| {
                                    if let Some(s) = a.as_str() {
                                        Some(s.to_string())
                                    } else {
                                        a["name"].as_str().map(String::from)
                                    }
                                })
                                .collect()
                        })
                        .unwrap_or_default();

                    return ExtractedModMeta {
                        id,
                        name,
                        version,
                        description,
                        authors,
                        project_id: None,
                    };
                }
            }
        }

        // 2. Try quilt.mod.json
        if let Ok(mut zip_file) = archive.by_name("quilt.mod.json") {
            let mut content = String::new();
            if zip_file.read_to_string(&mut content).is_ok() {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    let loader_node = &val["quilt_loader"];
                    let id = loader_node["id"].as_str().map(String::from);
                    let version = loader_node["version"].as_str().map(String::from);
                    let name = loader_node["metadata"]["name"].as_str().map(String::from);
                    let description = loader_node["metadata"]["description"]
                        .as_str()
                        .map(String::from);

                    return ExtractedModMeta {
                        id,
                        name,
                        version,
                        description,
                        authors: vec![],
                        project_id: None,
                    };
                }
            }
        }

        // 3. Try mcmod.info (Forge legacy)
        if let Ok(mut zip_file) = archive.by_name("mcmod.info") {
            let mut content = String::new();
            if zip_file.read_to_string(&mut content).is_ok() {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    let item = if val.is_array() {
                        val.get(0)
                    } else {
                        val["modList"].get(0)
                    };

                    if let Some(mod_node) = item {
                        let id = mod_node["modid"].as_str().map(String::from);
                        let name = mod_node["name"].as_str().map(String::from);
                        let version = mod_node["version"].as_str().map(String::from);
                        let description = mod_node["description"].as_str().map(String::from);

                        return ExtractedModMeta {
                            id,
                            name,
                            version,
                            description,
                            authors: vec![],
                            project_id: None,
                        };
                    }
                }
            }
        }

        ExtractedModMeta::default()
    }

    /// Enables a mod by renaming `.jar.disabled` to `.jar`.
    pub fn enable_mod(&self, file_name: &str) -> Result<(), AppError> {
        let mods_path = self.mods_dir();
        let src = mods_path.join(file_name);
        if !src.exists() {
            return Err(AppError::new(
                AppErrorCode::InternalError,
                format!("Mod file not found: {file_name}"),
            ));
        }

        if file_name.ends_with(".disabled") {
            let target_name = file_name.trim_end_matches(".disabled");
            let dst = mods_path.join(target_name);
            std::fs::rename(&src, &dst).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to enable mod {file_name}: {e}"),
                )
            })?;
        }

        Ok(())
    }

    /// Disables a mod by renaming `.jar` to `.jar.disabled`.
    pub fn disable_mod(&self, file_name: &str) -> Result<(), AppError> {
        let mods_path = self.mods_dir();
        let src = mods_path.join(file_name);
        if !src.exists() {
            return Err(AppError::new(
                AppErrorCode::InternalError,
                format!("Mod file not found: {file_name}"),
            ));
        }

        if !file_name.ends_with(".disabled") {
            let target_name = format!("{file_name}.disabled");
            let dst = mods_path.join(target_name);
            std::fs::rename(&src, &dst).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to disable mod {file_name}: {e}"),
                )
            })?;
        }

        Ok(())
    }

    /// Toggles mod enabled state.
    pub fn toggle_mod(&self, file_name: &str, enabled: bool) -> Result<(), AppError> {
        if enabled {
            self.enable_mod(file_name)
        } else {
            self.disable_mod(file_name)
        }
    }

    /// Deletes a mod from the instance.
    pub fn delete_mod(&self, file_name: &str) -> Result<(), AppError> {
        let path = self.mods_dir().join(file_name);
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to delete mod {file_name}: {e}"),
                )
            })?;
        }
        Ok(())
    }

    /// Checks for newer versions of installed mods matching the game version & loader.
    pub async fn check_updates(
        &self,
        game_version: &str,
        loader: &str,
        client: &ModrinthClient,
    ) -> Result<Vec<ModUpdate>, AppError> {
        let installed = self.list_installed()?;
        let mut updates = Vec::new();

        for m in installed {
            let Some(ref project_id) = m.project_id else {
                continue;
            };

            if let Ok(versions) = client
                .get_project_versions(project_id, Some(game_version), Some(loader))
                .await
            {
                if let Some(latest) = versions.into_iter().next() {
                    if latest.version_number != m.version {
                        let download_url = latest
                            .files
                            .iter()
                            .find(|f| f.primary)
                            .or_else(|| latest.files.first())
                            .map(|f| f.url.clone())
                            .unwrap_or_default();

                        updates.push(ModUpdate {
                            project_id: project_id.clone(),
                            current_version: m.version.clone(),
                            latest_version: latest.version_number,
                            download_url,
                        });
                    }
                }
            }
        }

        Ok(updates)
    }
}

#[derive(Default, Debug)]
pub struct ExtractedModMeta {
    pub id: Option<String>,
    pub name: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub authors: Vec<String>,
    pub project_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;
    use zip::write::SimpleFileOptions;

    fn create_test_jar(path: &Path, manifest_content: &str) {
        let file = File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        zip.start_file("fabric.mod.json", options).unwrap();
        zip.write_all(manifest_content.as_bytes()).unwrap();
        zip.finish().unwrap();
    }

    #[test]
    fn test_list_installed_mods_and_toggle() {
        let dir = tempdir().unwrap();
        let mods_dir = dir.path().join("mods");
        std::fs::create_dir_all(&mods_dir).unwrap();

        let fabric_json = r#"{
            "id": "sodium",
            "name": "Sodium",
            "version": "0.5.8",
            "description": "Next-generation optimization mod",
            "authors": ["jellysquid"]
        }"#;

        let jar_path = mods_dir.join("sodium-0.5.8.jar");
        create_test_jar(&jar_path, fabric_json);

        let manager = ModManager::new(dir.path());
        let list = manager.list_installed().expect("list mods");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "sodium");
        assert_eq!(list[0].name, "Sodium");
        assert_eq!(list[0].version, "0.5.8");
        assert!(list[0].enabled);

        // Disable mod
        manager.disable_mod("sodium-0.5.8.jar").expect("disable");
        let list_disabled = manager.list_installed().expect("list mods");
        assert_eq!(list_disabled.len(), 1);
        assert!(!list_disabled[0].enabled);
        assert_eq!(list_disabled[0].file_name, "sodium-0.5.8.jar.disabled");

        // Enable mod
        manager
            .enable_mod("sodium-0.5.8.jar.disabled")
            .expect("enable");
        let list_enabled = manager.list_installed().expect("list mods");
        assert!(list_enabled[0].enabled);
        assert_eq!(list_enabled[0].file_name, "sodium-0.5.8.jar");

        // Delete mod
        manager.delete_mod("sodium-0.5.8.jar").expect("delete");
        let empty_list = manager.list_installed().expect("list mods");
        assert!(empty_list.is_empty());
    }
}
