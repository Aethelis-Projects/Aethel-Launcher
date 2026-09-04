use crate::types::ModFileHashes;
use aethel_core::{AppError, AppErrorCode};
use serde::{Deserialize, Serialize};
use sha1::{Digest as Sha1Digest, Sha1};
use sha2::Sha512;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct EnvSpec {
    pub client: Option<String>,
    pub server: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthFile {
    pub path: String,
    pub hashes: ModFileHashes,
    pub env: Option<EnvSpec>,
    pub downloads: Vec<String>,
    pub file_size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthIndex {
    pub format_version: u32,
    pub game: String,
    pub version_id: String,
    pub name: String,
    pub summary: Option<String>,
    pub files: Vec<ModrinthFile>,
    pub dependencies: HashMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct ImportResult {
    pub instance_id: String,
    pub name: String,
    pub game_version: String,
    pub loader: Option<String>,
    pub loader_version: Option<String>,
    pub files_installed: usize,
    pub overrides_applied: usize,
}

/// Validates that a relative path does not escape the destination directory (Zip-Slip protection).
pub fn is_safe_relative_path(path_str: &str) -> bool {
    let clean_str = path_str.replace('\\', "/");

    if clean_str.is_empty()
        || clean_str.starts_with('/')
        || clean_str.starts_with('\\')
        || clean_str.contains(':')
    {
        return false;
    }

    let path = Path::new(&clean_str);
    if path.is_absolute() {
        return false;
    }

    for component in path.components() {
        match component {
            std::path::Component::Normal(_) => {}
            _ => return false,
        }
    }
    true
}

/// Verifies hash of bytes against ModFileHashes.
pub fn verify_file_hashes(
    bytes: &[u8],
    hashes: &ModFileHashes,
    path_name: &str,
) -> Result<(), AppError> {
    if let Some(ref expected_sha512) = hashes.sha512 {
        let mut hasher = Sha512::new();
        hasher.update(bytes);
        let actual_sha512 = format!("{:x}", hasher.finalize());
        if !actual_sha512.eq_ignore_ascii_case(expected_sha512) {
            return Err(AppError::new(
                AppErrorCode::HashMismatch,
                format!(
                    "SHA-512 verification failed for {}: expected {}, got {}",
                    path_name, expected_sha512, actual_sha512
                ),
            ));
        }
    }

    if let Some(ref expected_sha1) = hashes.sha1 {
        let mut hasher = Sha1::new();
        hasher.update(bytes);
        let actual_sha1 = format!("{:x}", hasher.finalize());
        if !actual_sha1.eq_ignore_ascii_case(expected_sha1) {
            return Err(AppError::new(
                AppErrorCode::HashMismatch,
                format!(
                    "SHA-1 verification failed for {}: expected {}, got {}",
                    path_name, expected_sha1, actual_sha1
                ),
            ));
        }
    }

    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModpackArchiveType {
    Modrinth,
    CurseForge,
    AethelBackup,
}

pub struct ModpackImporter;

impl ModpackImporter {
    /// Detects whether an archive is a Modrinth .mrpack, CurseForge .zip, or Aethel instance backup.
    pub fn detect_archive_type(archive_path: &Path) -> Result<ModpackArchiveType, AppError> {
        let file = File::open(archive_path).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to open archive {}: {e}", archive_path.display()),
            )
        })?;

        let mut archive = ZipArchive::new(file).map_err(|e| {
            AppError::new(
                AppErrorCode::InvalidManifest,
                format!("Invalid zip archive: {e}"),
            )
        })?;

        if archive.by_name("modrinth.index.json").is_ok() {
            return Ok(ModpackArchiveType::Modrinth);
        }

        if archive.by_name("manifest.json").is_ok() {
            return Ok(ModpackArchiveType::CurseForge);
        }

        if archive.by_name("instance.json").is_ok() {
            return Ok(ModpackArchiveType::AethelBackup);
        }

        Err(AppError::new(
            AppErrorCode::InvalidManifest,
            "Archive does not contain recognized manifest (modrinth.index.json, manifest.json, or instance.json)",
        ))
    }

    /// Reads and parses modrinth.index.json from a .mrpack file.
    pub fn read_index(mrpack_path: &Path) -> Result<ModrinthIndex, AppError> {
        let file = File::open(mrpack_path).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to open mrpack file {}: {e}", mrpack_path.display()),
            )
        })?;

        let mut archive = ZipArchive::new(file).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to read mrpack zip archive: {e}"),
            )
        })?;

        let mut index_file = archive.by_name("modrinth.index.json").map_err(|_| {
            AppError::new(
                AppErrorCode::InvalidManifest,
                "mrpack archive missing modrinth.index.json",
            )
        })?;

        let mut contents = String::new();
        index_file.read_to_string(&mut contents).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to read modrinth.index.json: {e}"),
            )
        })?;

        let index: ModrinthIndex = serde_json::from_str(&contents).map_err(|e| {
            AppError::new(
                AppErrorCode::InvalidManifest,
                format!("Failed to parse modrinth.index.json: {e}"),
            )
        })?;

        if index.format_version != 1 {
            return Err(AppError::new(
                AppErrorCode::InvalidManifest,
                format!(
                    "Unsupported mrpack format version: {}",
                    index.format_version
                ),
            ));
        }

        if index.game != "minecraft" {
            return Err(AppError::new(
                AppErrorCode::InvalidManifest,
                format!("Unsupported game in mrpack: {}", index.game),
            ));
        }

        Ok(index)
    }

    /// Imports a .mrpack file into instance_dir using a custom async byte fetcher.
    pub async fn import_with_fetcher<F, Fut>(
        mrpack_path: &Path,
        instance_dir: &Path,
        instance_id: &str,
        fetcher: F,
    ) -> Result<ImportResult, AppError>
    where
        F: Fn(String) -> Fut,
        Fut: std::future::Future<Output = Result<Vec<u8>, AppError>>,
    {
        let index = Self::read_index(mrpack_path)?;

        let game_version = index
            .dependencies
            .get("minecraft")
            .cloned()
            .unwrap_or_else(|| "1.20.4".to_string());

        let (loader, loader_version) = if let Some(ver) = index.dependencies.get("fabric-loader") {
            (Some("fabric".to_string()), Some(ver.clone()))
        } else if let Some(ver) = index.dependencies.get("neoforge") {
            (Some("neoforge".to_string()), Some(ver.clone()))
        } else if let Some(ver) = index.dependencies.get("quilt-loader") {
            (Some("quilt".to_string()), Some(ver.clone()))
        } else if let Some(ver) = index.dependencies.get("forge") {
            (Some("forge".to_string()), Some(ver.clone()))
        } else {
            (None, None)
        };

        std::fs::create_dir_all(instance_dir).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to create instance dir: {e}"),
            )
        })?;

        // 1. Extract overrides and client-overrides
        let mut overrides_applied = 0;
        {
            let file = File::open(mrpack_path).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to open mrpack: {e}"),
                )
            })?;
            let mut archive = ZipArchive::new(file).map_err(|e| {
                AppError::new(AppErrorCode::InternalError, format!("Invalid zip: {e}"))
            })?;

            // Extract generic overrides first, then client-overrides to allow overriding
            for prefix in &["overrides/", "client-overrides/"] {
                for i in 0..archive.len() {
                    let mut entry = archive.by_index(i).map_err(|e| {
                        AppError::new(
                            AppErrorCode::InternalError,
                            format!("Failed reading entry: {e}"),
                        )
                    })?;
                    let name = entry.name().to_string();

                    if name.starts_with(prefix) && !entry.is_dir() {
                        let rel_path = &name[prefix.len()..];
                        if rel_path.is_empty() {
                            continue;
                        }

                        if !is_safe_relative_path(rel_path) {
                            return Err(AppError::new(
                                AppErrorCode::ZipSlipDetected,
                                format!("Zip-Slip attempt in mrpack override: {rel_path}"),
                            ));
                        }

                        let target_path = instance_dir.join(rel_path);
                        if let Some(parent) = target_path.parent() {
                            std::fs::create_dir_all(parent).map_err(|e| {
                                AppError::new(
                                    AppErrorCode::InternalError,
                                    format!("Failed creating override dir: {e}"),
                                )
                            })?;
                        }

                        let mut out_file = File::create(&target_path).map_err(|e| {
                            AppError::new(
                                AppErrorCode::InternalError,
                                format!("Failed creating override file: {e}"),
                            )
                        })?;
                        std::io::copy(&mut entry, &mut out_file).map_err(|e| {
                            AppError::new(
                                AppErrorCode::InternalError,
                                format!("Failed copying override file: {e}"),
                            )
                        })?;
                        overrides_applied += 1;
                    }
                }
            }
        }

        // 2. Download and verify files
        let mut files_installed = 0;
        for file_spec in &index.files {
            // Check client environment: skip if client is unsupported
            if let Some(ref env) = file_spec.env {
                if let Some(ref client) = env.client {
                    if client.eq_ignore_ascii_case("unsupported") {
                        continue;
                    }
                }
            }

            if !is_safe_relative_path(&file_spec.path) {
                return Err(AppError::new(
                    AppErrorCode::ZipSlipDetected,
                    format!("Zip-Slip attempt in file spec: {}", file_spec.path),
                ));
            }

            let target_path = instance_dir.join(&file_spec.path);
            if let Some(parent) = target_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    AppError::new(
                        AppErrorCode::InternalError,
                        format!("Failed creating target dir: {e}"),
                    )
                })?;
            }

            if file_spec.downloads.is_empty() {
                continue;
            }

            // Fetch bytes using the provided fetcher
            let download_url = file_spec.downloads[0].clone();
            let bytes = fetcher(download_url).await?;

            // Verify hashes
            verify_file_hashes(&bytes, &file_spec.hashes, &file_spec.path)?;

            let mut out = File::create(&target_path).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to create mod file: {e}"),
                )
            })?;
            out.write_all(&bytes).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to write mod file: {e}"),
                )
            })?;

            files_installed += 1;
        }

        Ok(ImportResult {
            instance_id: instance_id.to_string(),
            name: index.name,
            game_version,
            loader,
            loader_version,
            files_installed,
            overrides_applied,
        })
    }

    /// Default import using reqwest for downloading files.
    pub async fn import(
        mrpack_path: &Path,
        instance_dir: &Path,
        instance_id: &str,
    ) -> Result<ImportResult, AppError> {
        let client = reqwest::Client::builder()
            .user_agent("aethel-launcher/0.1.0 (Aethelis Projects)")
            .build()
            .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?;

        Self::import_with_fetcher(mrpack_path, instance_dir, instance_id, |url| {
            let client = client.clone();
            async move {
                let resp = client
                    .get(&url)
                    .send()
                    .await
                    .map_err(|e| AppError::new(AppErrorCode::NetworkError, e.to_string()))?;
                let status = resp.status();
                if !status.is_success() {
                    return Err(AppError::new(
                        AppErrorCode::NetworkError,
                        format!("Download failed with status {status}: {url}"),
                    ));
                }
                let bytes = resp
                    .bytes()
                    .await
                    .map_err(|e| AppError::new(AppErrorCode::NetworkError, e.to_string()))?;
                Ok(bytes.to_vec())
            }
        })
        .await
    }
}

pub struct ModpackExporter;

impl ModpackExporter {
    /// Exports an instance into a valid Modrinth .mrpack archive.
    pub fn export(
        instance_dir: &Path,
        output_path: &Path,
        metadata: &ModrinthIndex,
    ) -> Result<(), AppError> {
        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to create output dir: {e}"),
                )
            })?;
        }

        let out_file = File::create(output_path).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to create output .mrpack file: {e}"),
            )
        })?;

        let mut zip = ZipWriter::new(out_file);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        // 1. Write modrinth.index.json
        let index_json = serde_json::to_string_pretty(metadata).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to serialize modrinth.index.json: {e}"),
            )
        })?;

        zip.start_file("modrinth.index.json", options)
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed adding index to zip: {e}"),
                )
            })?;
        zip.write_all(index_json.as_bytes()).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed writing index bytes: {e}"),
            )
        })?;

        // 2. Add overrides from instance_dir
        // Walk directories like config/, resourcepacks/, shaderpacks/, scripts/, options.txt
        let override_dirs = [
            "config",
            "resourcepacks",
            "shaderpacks",
            "scripts",
            "defaultconfigs",
        ];

        for sub_dir in &override_dirs {
            let src = instance_dir.join(sub_dir);
            if src.exists() && src.is_dir() {
                for entry in walkdir::WalkDir::new(&src)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    if entry.file_type().is_file() {
                        let rel = entry.path().strip_prefix(instance_dir).map_err(|e| {
                            AppError::new(AppErrorCode::InternalError, e.to_string())
                        })?;
                        let zip_entry_name =
                            format!("overrides/{}", rel.to_string_lossy().replace('\\', "/"));

                        zip.start_file(&zip_entry_name, options).map_err(|e| {
                            AppError::new(
                                AppErrorCode::InternalError,
                                format!("Failed adding file {zip_entry_name}: {e}"),
                            )
                        })?;

                        let mut f = File::open(entry.path()).map_err(|e| {
                            AppError::new(
                                AppErrorCode::InternalError,
                                format!("Failed reading file: {e}"),
                            )
                        })?;
                        std::io::copy(&mut f, &mut zip).map_err(|e| {
                            AppError::new(
                                AppErrorCode::InternalError,
                                format!("Failed writing file: {e}"),
                            )
                        })?;
                    }
                }
            }
        }

        // Check options.txt
        let options_file = instance_dir.join("options.txt");
        if options_file.exists() && options_file.is_file() {
            zip.start_file("overrides/options.txt", options)
                .map_err(|e| {
                    AppError::new(
                        AppErrorCode::InternalError,
                        format!("Failed adding options.txt: {e}"),
                    )
                })?;
            let mut f = File::open(&options_file).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed reading options.txt: {e}"),
                )
            })?;
            std::io::copy(&mut f, &mut zip).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed writing options.txt: {e}"),
                )
            })?;
        }

        zip.finish().map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to finish mrpack zip: {e}"),
            )
        })?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_is_safe_relative_path() {
        assert!(is_safe_relative_path("mods/test.jar"));
        assert!(is_safe_relative_path("config/sub/nested.json"));
        assert!(is_safe_relative_path("options.txt"));

        // Dangerous paths
        assert!(!is_safe_relative_path("../escape.jar"));
        assert!(!is_safe_relative_path("mods/../../escape.jar"));
        assert!(!is_safe_relative_path("/etc/passwd"));
        assert!(!is_safe_relative_path("C:\\Windows\\System32\\calc.exe"));
        assert!(!is_safe_relative_path("C:/Windows/System32/calc.exe"));
        assert!(!is_safe_relative_path(""));
    }

    #[test]
    fn test_mrpack_hash_verification() {
        let content = b"hello modpack verification";
        let mut sha1_hasher = Sha1::new();
        sha1_hasher.update(content);
        let valid_sha1 = format!("{:x}", sha1_hasher.finalize());

        let mut sha512_hasher = Sha512::new();
        sha512_hasher.update(content);
        let valid_sha512 = format!("{:x}", sha512_hasher.finalize());

        let good_hashes = ModFileHashes {
            sha1: Some(valid_sha1),
            sha512: Some(valid_sha512),
        };
        assert!(verify_file_hashes(content, &good_hashes, "test.jar").is_ok());

        let bad_hashes = ModFileHashes {
            sha1: Some("0000000000000000000000000000000000000000".to_string()),
            sha512: None,
        };
        assert!(verify_file_hashes(content, &bad_hashes, "test.jar").is_err());
    }

    #[tokio::test]
    async fn test_mrpack_import_creates_instance_and_overrides() {
        let temp = tempdir().unwrap();
        let mrpack_path = temp.path().join("test_pack.mrpack");
        let instance_dir = temp.path().join("instance");

        // 1. Create a dummy .mrpack archive with index, overrides, and a mod
        let file = File::create(&mrpack_path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        let mod_content = b"fake-jar-content";
        let mut s1 = Sha1::new();
        s1.update(mod_content);
        let hash_s1 = format!("{:x}", s1.finalize());

        let mut s512 = Sha512::new();
        s512.update(mod_content);
        let hash_s512 = format!("{:x}", s512.finalize());

        let mut deps = HashMap::new();
        deps.insert("minecraft".to_string(), "1.20.4".to_string());
        deps.insert("fabric-loader".to_string(), "0.15.7".to_string());

        let index = ModrinthIndex {
            format_version: 1,
            game: "minecraft".to_string(),
            version_id: "1.0.0".to_string(),
            name: "Awesome Fabric Pack".to_string(),
            summary: Some("Test summary".to_string()),
            files: vec![ModrinthFile {
                path: "mods/test-mod.jar".to_string(),
                hashes: ModFileHashes {
                    sha1: Some(hash_s1),
                    sha512: Some(hash_s512),
                },
                env: Some(EnvSpec {
                    client: Some("required".to_string()),
                    server: Some("required".to_string()),
                }),
                downloads: vec!["mock://downloads/test-mod.jar".to_string()],
                file_size: mod_content.len() as u64,
            }],
            dependencies: deps,
        };

        let index_json = serde_json::to_string(&index).unwrap();
        zip.start_file("modrinth.index.json", options).unwrap();
        zip.write_all(index_json.as_bytes()).unwrap();

        // Add an override file
        zip.start_file("overrides/config/settings.json", options)
            .unwrap();
        zip.write_all(b"{\"custom\": true}").unwrap();

        // Add a client-override file
        zip.start_file("client-overrides/options.txt", options)
            .unwrap();
        zip.write_all(b"fov:90").unwrap();

        zip.finish().unwrap();

        // 2. Import using mock fetcher
        let res = ModpackImporter::import_with_fetcher(
            &mrpack_path,
            &instance_dir,
            "test-pack-inst",
            |_url| async { Ok(b"fake-jar-content".to_vec()) },
        )
        .await
        .expect("Import should succeed");

        assert_eq!(res.name, "Awesome Fabric Pack");
        assert_eq!(res.game_version, "1.20.4");
        assert_eq!(res.loader.as_deref(), Some("fabric"));
        assert_eq!(res.loader_version.as_deref(), Some("0.15.7"));
        assert_eq!(res.files_installed, 1);
        assert_eq!(res.overrides_applied, 2);

        // Verify files on disk
        let mod_file = instance_dir.join("mods/test-mod.jar");
        assert!(mod_file.exists());
        assert_eq!(std::fs::read(&mod_file).unwrap(), b"fake-jar-content");

        let config_file = instance_dir.join("config/settings.json");
        assert!(config_file.exists());
        assert_eq!(
            std::fs::read_to_string(&config_file).unwrap(),
            "{\"custom\": true}"
        );

        let options_file = instance_dir.join("options.txt");
        assert!(options_file.exists());
        assert_eq!(std::fs::read_to_string(&options_file).unwrap(), "fov:90");
    }

    #[test]
    fn test_mrpack_export_generates_valid_archive() {
        let temp = tempdir().unwrap();
        let instance_dir = temp.path().join("source_instance");
        let output_mrpack = temp.path().join("exported.mrpack");

        std::fs::create_dir_all(instance_dir.join("config")).unwrap();
        std::fs::write(instance_dir.join("config/foo.toml"), "foo = true").unwrap();
        std::fs::write(instance_dir.join("options.txt"), "guiScale:2").unwrap();

        let mut deps = HashMap::new();
        deps.insert("minecraft".to_string(), "1.20.4".to_string());
        deps.insert("neoforge".to_string(), "20.4.80-beta".to_string());

        let metadata = ModrinthIndex {
            format_version: 1,
            game: "minecraft".to_string(),
            version_id: "2.0.0".to_string(),
            name: "Exported Pack".to_string(),
            summary: Some("Summary".to_string()),
            files: vec![],
            dependencies: deps,
        };

        ModpackExporter::export(&instance_dir, &output_mrpack, &metadata)
            .expect("Export should succeed");

        assert!(output_mrpack.exists());

        // Validate exported index
        let read_back = ModpackImporter::read_index(&output_mrpack).unwrap();
        assert_eq!(read_back.name, "Exported Pack");
        assert_eq!(
            read_back.dependencies.get("neoforge").unwrap(),
            "20.4.80-beta"
        );

        // Verify zip contains overrides
        let file = File::open(&output_mrpack).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        assert!(archive.by_name("overrides/config/foo.toml").is_ok());
        assert!(archive.by_name("overrides/options.txt").is_ok());
    }

    #[tokio::test]
    async fn test_mrpack_zip_slip_protection() {
        let temp = tempdir().unwrap();
        let mrpack_path = temp.path().join("slip.mrpack");
        let instance_dir = temp.path().join("instance");

        let file = File::create(&mrpack_path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        let mut deps = HashMap::new();
        deps.insert("minecraft".to_string(), "1.20.4".to_string());

        let index = ModrinthIndex {
            format_version: 1,
            game: "minecraft".to_string(),
            version_id: "1.0.0".to_string(),
            name: "Slip Pack".to_string(),
            summary: None,
            files: vec![],
            dependencies: deps,
        };
        let index_json = serde_json::to_string(&index).unwrap();
        zip.start_file("modrinth.index.json", options).unwrap();
        zip.write_all(index_json.as_bytes()).unwrap();

        // Malicious entry escaping instance dir
        zip.start_file("overrides/../evil.bat", options).unwrap();
        zip.write_all(b"calc.exe").unwrap();
        zip.finish().unwrap();

        let res = ModpackImporter::import_with_fetcher(
            &mrpack_path,
            &instance_dir,
            "slip-inst",
            |_url| async { Ok(vec![]) },
        )
        .await;

        assert!(res.is_err());
        let err = res.unwrap_err();
        assert_eq!(err.code(), AppErrorCode::ZipSlipDetected);
    }
}
