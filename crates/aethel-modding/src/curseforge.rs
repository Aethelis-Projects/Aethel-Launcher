use crate::modpack::{is_safe_relative_path, ImportResult};
use aethel_core::{AppError, AppErrorCode};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use zip::ZipArchive;

/// Default public CurseForge Core API key for launcher integration
pub const DEFAULT_CURSEFORGE_KEY: &str =
    "$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CurseForgeFileRef {
    #[serde(rename = "projectID")]
    pub project_id: u32,
    #[serde(rename = "fileID")]
    pub file_id: u32,
    #[serde(default = "default_required")]
    pub required: bool,
}

fn default_required() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CurseForgeModLoader {
    pub id: String,
    #[serde(default)]
    pub primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CurseForgeMinecraft {
    pub version: String,
    #[serde(default)]
    pub mod_loaders: Vec<CurseForgeModLoader>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CurseForgeManifest {
    pub minecraft: CurseForgeMinecraft,
    #[serde(default = "default_manifest_type")]
    pub manifest_type: String,
    #[serde(default = "default_manifest_version")]
    pub manifest_version: u32,
    pub name: String,
    pub version: String,
    pub author: Option<String>,
    #[serde(default)]
    pub files: Vec<CurseForgeFileRef>,
    #[serde(default = "default_overrides")]
    pub overrides: String,
}

fn default_manifest_type() -> String {
    "minecraftModpack".to_string()
}

fn default_manifest_version() -> u32 {
    1
}

fn default_overrides() -> String {
    "overrides".to_string()
}

impl CurseForgeManifest {
    pub fn parse(json_str: &str) -> Result<Self, AppError> {
        serde_json::from_str(json_str).map_err(|e| {
            AppError::new(
                AppErrorCode::InvalidManifest,
                format!("Failed to parse CurseForge manifest.json: {e}"),
            )
        })
    }

    /// Parses the mod loader string into (loader_name, loader_version).
    /// Handles "neoforge-21.1.65", "forge-49.0.30", "fabric-0.15.7", "quilt-0.20.0".
    pub fn parse_loader(&self) -> Result<(String, String), AppError> {
        let primary = self
            .minecraft
            .mod_loaders
            .iter()
            .find(|l| l.primary)
            .or_else(|| self.minecraft.mod_loaders.first());

        let loader_item = match primary {
            Some(l) => l,
            None => {
                return Ok(("vanilla".to_string(), "".to_string()));
            }
        };

        let loader_string = &loader_item.id;
        let parts: Vec<&str> = loader_string.splitn(2, '-').collect();
        if parts.len() != 2 {
            return Err(AppError::new(
                AppErrorCode::InvalidManifest,
                format!("Invalid CurseForge loader format: {}", loader_string),
            ));
        }

        let loader = parts[0].to_lowercase();
        let version = parts[1].to_string();

        match loader.as_str() {
            "forge" | "neoforge" | "fabric" | "quilt" => Ok((loader, version)),
            _ => Err(AppError::new(
                AppErrorCode::InvalidManifest,
                format!("Unsupported CurseForge loader: {}", loader),
            )),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurseForgeApiFile {
    pub id: u32,
    pub mod_id: u32,
    pub file_name: String,
    pub file_length: u64,
    pub download_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurseForgeFilesResponse {
    pub data: Vec<CurseForgeApiFile>,
}

pub struct CurseForgeClient {
    api_key: String,
    client: reqwest::Client,
}

impl CurseForgeClient {
    pub fn new() -> Self {
        let api_key = std::env::var("CURSEFORGE_API_KEY")
            .unwrap_or_else(|_| DEFAULT_CURSEFORGE_KEY.to_string());

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default();

        Self { api_key, client }
    }

    pub fn with_api_key(api_key: impl Into<String>) -> Self {
        let api_key = api_key.into();
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default();

        Self { api_key, client }
    }

    /// Fetches file metadata in batches of at most 50 file IDs per request (ToS & batch limit).
    pub async fn get_files_batch(
        &self,
        file_ids: &[u32],
    ) -> Result<Vec<CurseForgeApiFile>, AppError> {
        let mut results = Vec::new();

        for chunk in file_ids.chunks(50) {
            let response = self
                .client
                .post("https://api.curseforge.com/v1/mods/files")
                .header("x-api-key", &self.api_key)
                .header("Content-Type", "application/json")
                .json(&serde_json::json!({ "fileIds": chunk }))
                .send()
                .await
                .map_err(|e| {
                    AppError::new(
                        AppErrorCode::NetworkError,
                        format!("CurseForge batch files request failed: {e}"),
                    )
                })?;

            if !response.status().is_success() {
                return Err(AppError::new(
                    AppErrorCode::NetworkError,
                    format!("CurseForge API returned status {}", response.status()),
                ));
            }

            let resp_body: CurseForgeFilesResponse = response.json().await.map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Failed to parse CurseForge batch files response: {e}"),
                )
            })?;

            results.extend(resp_body.data);
        }

        Ok(results)
    }

    /// Synthesizes direct download URL, falling back to official edge CDN format if direct URL is omitted or expired.
    pub fn get_download_url(file: &CurseForgeApiFile) -> String {
        if let Some(ref url) = file.download_url {
            if !url.trim().is_empty() {
                return url.clone();
            }
        }

        // Standard edge CDN layout: https://edge.forgecdn.net/files/{first4}/{last3}/{filename}
        format!(
            "https://edge.forgecdn.net/files/{}/{}/{}",
            file.id / 1000,
            file.id % 1000,
            file.file_name
        )
    }
}

pub struct CurseForgeImporter;

impl CurseForgeImporter {
    /// Reads and parses `manifest.json` from a CurseForge modpack `.zip`.
    pub fn read_manifest(zip_path: &Path) -> Result<CurseForgeManifest, AppError> {
        let file = File::open(zip_path).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!(
                    "Failed to open CurseForge zip archive {}: {e}",
                    zip_path.display()
                ),
            )
        })?;

        let mut archive = ZipArchive::new(file).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to read CurseForge zip archive: {e}"),
            )
        })?;

        let mut manifest_file = archive.by_name("manifest.json").map_err(|_| {
            AppError::new(
                AppErrorCode::InvalidManifest,
                "CurseForge archive missing manifest.json",
            )
        })?;

        let mut contents = String::new();
        manifest_file.read_to_string(&mut contents).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to read manifest.json: {e}"),
            )
        })?;

        CurseForgeManifest::parse(&contents)
    }

    /// Safely extracts all files from the `overrides/` folder into `instance_dir`.
    pub fn extract_overrides(
        zip_path: &Path,
        instance_dir: &Path,
        overrides_dir_name: &str,
    ) -> Result<usize, AppError> {
        let file = File::open(zip_path).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to open zip archive: {e}"),
            )
        })?;

        let mut archive = ZipArchive::new(file).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to read zip archive: {e}"),
            )
        })?;

        let prefix = format!("{}/", overrides_dir_name.trim_matches('/'));
        let mut overrides_applied = 0;

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to read zip entry: {e}"),
                )
            })?;

            let entry_name = entry.name().to_string();
            if !entry_name.starts_with(&prefix) {
                continue;
            }

            let rel_path = &entry_name[prefix.len()..];
            if rel_path.is_empty() {
                continue;
            }

            if !is_safe_relative_path(rel_path) {
                return Err(AppError::new(
                    AppErrorCode::ZipSlipDetected,
                    format!("Zip Slip detected in CurseForge overrides entry: {entry_name}"),
                ));
            }

            let dest_path = instance_dir.join(rel_path);

            if entry.is_dir() {
                std::fs::create_dir_all(&dest_path).map_err(|e| {
                    AppError::new(
                        AppErrorCode::InternalError,
                        format!(
                            "Failed to create overrides directory {}: {e}",
                            dest_path.display()
                        ),
                    )
                })?;
            } else {
                if let Some(parent) = dest_path.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| {
                        AppError::new(
                            AppErrorCode::InternalError,
                            format!(
                                "Failed to create parent directory {}: {e}",
                                parent.display()
                            ),
                        )
                    })?;
                }

                let mut out = File::create(&dest_path).map_err(|e| {
                    AppError::new(
                        AppErrorCode::InternalError,
                        format!("Failed to create file {}: {e}", dest_path.display()),
                    )
                })?;

                std::io::copy(&mut entry, &mut out).map_err(|e| {
                    AppError::new(
                        AppErrorCode::InternalError,
                        format!("Failed to extract file {}: {e}", dest_path.display()),
                    )
                })?;

                overrides_applied += 1;
            }
        }

        Ok(overrides_applied)
    }

    /// Complete import of a CurseForge modpack archive into target instance_dir.
    pub async fn import(
        zip_path: &Path,
        instance_dir: &Path,
        instance_id: &str,
    ) -> Result<ImportResult, AppError> {
        let manifest = Self::read_manifest(zip_path)?;

        let (loader, loader_version) = manifest
            .parse_loader()
            .unwrap_or_else(|_| ("vanilla".to_string(), "".to_string()));

        std::fs::create_dir_all(instance_dir).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to create instance directory: {e}"),
            )
        })?;

        // 1. Extract overrides
        let overrides_applied =
            Self::extract_overrides(zip_path, instance_dir, &manifest.overrides)?;

        // 2. Fetch and download mod files declared in manifest
        let mut files_installed = 0;
        if !manifest.files.is_empty() {
            let mods_dir = instance_dir.join("mods");
            let _ = std::fs::create_dir_all(&mods_dir);

            let client = CurseForgeClient::new();
            let file_ids: Vec<u32> = manifest.files.iter().map(|f| f.file_id).collect();

            if let Ok(file_metas) = client.get_files_batch(&file_ids).await {
                let http = reqwest::Client::builder()
                    .timeout(std::time::Duration::from_secs(60))
                    .build()
                    .unwrap_or_default();

                for meta in file_metas {
                    let download_url = CurseForgeClient::get_download_url(&meta);
                    let target_path = mods_dir.join(&meta.file_name);

                    if target_path.exists() {
                        files_installed += 1;
                        continue;
                    }

                    if let Ok(resp) = http.get(&download_url).send().await {
                        if resp.status().is_success() {
                            if let Ok(bytes) = resp.bytes().await {
                                if let Ok(mut f) = File::create(&target_path) {
                                    if f.write_all(&bytes).is_ok() {
                                        files_installed += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(ImportResult {
            instance_id: instance_id.to_string(),
            name: manifest.name,
            game_version: manifest.minecraft.version,
            loader: if loader == "vanilla" {
                None
            } else {
                Some(loader)
            },
            loader_version: if loader_version.is_empty() {
                None
            } else {
                Some(loader_version)
            },
            files_installed,
            overrides_applied,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_CURSEFORGE_MANIFEST: &str = r#"{
        "minecraft": {
            "version": "1.21.1",
            "modLoaders": [
                {
                    "id": "neoforge-21.1.65",
                    "primary": true
                }
            ]
        },
        "manifestType": "minecraftModpack",
        "manifestVersion": 1,
        "name": "All the Mods 10",
        "version": "8.1",
        "author": "ATMTeam",
        "files": [
            {
                "projectID": 238222,
                "fileID": 5846848,
                "required": true
            }
        ],
        "overrides": "overrides"
    }"#;

    #[test]
    fn test_parse_curseforge_manifest() {
        let manifest =
            CurseForgeManifest::parse(SAMPLE_CURSEFORGE_MANIFEST).expect("valid manifest");
        assert_eq!(manifest.name, "All the Mods 10");
        assert_eq!(manifest.version, "8.1");
        assert_eq!(manifest.minecraft.version, "1.21.1");
        assert_eq!(manifest.files.len(), 1);
        assert_eq!(manifest.files[0].project_id, 238222);
        assert_eq!(manifest.files[0].file_id, 5846848);
        assert_eq!(manifest.overrides, "overrides");
    }

    #[test]
    fn test_parse_curseforge_loaders() {
        let test_cases = vec![
            ("neoforge-21.1.65", ("neoforge", "21.1.65")),
            ("forge-49.0.30", ("forge", "49.0.30")),
            ("fabric-0.15.7", ("fabric", "0.15.7")),
            ("quilt-0.20.0", ("quilt", "0.20.0")),
        ];

        for (input, expected) in test_cases {
            let manifest = CurseForgeManifest {
                minecraft: CurseForgeMinecraft {
                    version: "1.20.4".to_string(),
                    mod_loaders: vec![CurseForgeModLoader {
                        id: input.to_string(),
                        primary: true,
                    }],
                },
                manifest_type: "minecraftModpack".to_string(),
                manifest_version: 1,
                name: "Test Pack".to_string(),
                version: "1.0".to_string(),
                author: None,
                files: vec![],
                overrides: "overrides".to_string(),
            };

            let (loader, version) = manifest.parse_loader().expect("parse loader");
            assert_eq!(loader, expected.0);
            assert_eq!(version, expected.1);
        }
    }

    #[test]
    fn test_curseforge_cdn_url_synthesis() {
        let file = CurseForgeApiFile {
            id: 5846848,
            mod_id: 238222,
            file_name: "jei-1.20.4-neoforge-17.3.1.5.jar".to_string(),
            file_length: 1094333,
            download_url: None,
        };

        let url = CurseForgeClient::get_download_url(&file);
        assert_eq!(
            url,
            "https://edge.forgecdn.net/files/5846/848/jei-1.20.4-neoforge-17.3.1.5.jar"
        );
    }
}
