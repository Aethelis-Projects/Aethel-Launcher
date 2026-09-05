//! Maven coordinate resolver and multi-repository artifact downloader.

use aethel_core::{AppError, AppErrorCode};
use sha1::{Digest, Sha1};
use std::path::{Path, PathBuf};
use tracing::info;

/// Converts a Maven coordinate name into a relative jar path.
///
/// Supported patterns:
/// - `group:artifact:version` -> `group/artifact/version/artifact-version.jar`
/// - `group:artifact:version:classifier` -> `group/artifact/version/artifact-version-classifier.jar`
/// - `group:artifact:version@ext` -> `group/artifact/version/artifact-version.ext`
/// - `group:artifact:version:classifier@ext` -> `group/artifact/version/artifact-version-classifier.ext`
pub fn maven_name_to_path(name: &str) -> Option<String> {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version_raw = parts[2];

    let (version, ext_from_version) = match version_raw.split_once('@') {
        Some((v, ext)) => (v, Some(ext)),
        None => (version_raw, None),
    };

    let (classifier, ext) = if parts.len() >= 4 {
        let fourth = parts[3];
        match fourth.split_once('@') {
            Some((cls, ext)) => (Some(cls), ext),
            None => (Some(fourth), ext_from_version.unwrap_or("jar")),
        }
    } else {
        (None, ext_from_version.unwrap_or("jar"))
    };

    let filename = if let Some(cls) = classifier {
        format!("{artifact}-{version}-{cls}.{ext}")
    } else {
        format!("{artifact}-{version}.{ext}")
    };

    Some(format!("{group}/{artifact}/{version}/{filename}"))
}

/// Returns a list of candidate Maven repositories prioritized for a given loader.
pub fn maven_repos_for(loader: &str) -> Vec<&'static str> {
    match loader.to_lowercase().as_str() {
        "fabric" => vec![
            "https://maven.fabricmc.net/",
            "https://libraries.minecraft.net/",
            "https://repo1.maven.org/maven2/",
        ],
        "quilt" => vec![
            "https://maven.quiltmc.org/repository/release/",
            "https://maven.fabricmc.net/",
            "https://libraries.minecraft.net/",
            "https://repo1.maven.org/maven2/",
        ],
        "neoforge" => vec![
            "https://maven.neoforged.net/releases/",
            "https://libraries.minecraft.net/",
            "https://repo1.maven.org/maven2/",
        ],
        "forge" => vec![
            "https://maven.minecraftforge.net/",
            "https://libraries.minecraft.net/",
            "https://repo1.maven.org/maven2/",
        ],
        _ => vec![
            "https://libraries.minecraft.net/",
            "https://repo1.maven.org/maven2/",
        ],
    }
}

/// Verifies whether the file's SHA-1 checksum matches expected value (if provided).
fn verify_file_sha1(path: &Path, expected_sha1: Option<&str>) -> bool {
    let Some(expected) = expected_sha1 else {
        return true;
    };
    let clean = expected.trim();
    if clean.is_empty() {
        return true;
    }
    let Ok(bytes) = std::fs::read(path) else {
        return false;
    };
    let mut hasher = Sha1::new();
    hasher.update(&bytes);
    let actual = format!("{:x}", hasher.finalize());
    actual.eq_ignore_ascii_case(clean)
}

/// Downloads a Maven artifact using custom repository list.
pub async fn download_maven_artifact_with_repos(
    maven_name: &str,
    repos: &[&str],
    libraries_dir: &Path,
    sha1: Option<&str>,
    client: &reqwest::Client,
) -> Result<PathBuf, AppError> {
    let rel_path = maven_name_to_path(maven_name).ok_or_else(|| {
        AppError::new(
            AppErrorCode::InvalidManifest,
            format!("Invalid Maven name: {maven_name}"),
        )
    })?;

    let full_path = libraries_dir.join(&rel_path);
    if full_path.exists()
        && full_path.metadata().map(|m| m.len() > 0).unwrap_or(false)
        && verify_file_sha1(&full_path, sha1)
    {
        return Ok(full_path);
    }

    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!(
                    "Failed to create directories for {}: {e}",
                    full_path.display()
                ),
            )
        })?;
    }

    for repo in repos {
        let base = repo.trim_end_matches('/');
        let url = format!("{}/{}", base, rel_path.trim_start_matches('/'));
        if let Ok(resp) = client.get(&url).send().await {
            if resp.status().is_success() {
                if let Ok(bytes) = resp.bytes().await {
                    if !bytes.is_empty() {
                        if let Some(expected) = sha1 {
                            let clean = expected.trim();
                            if !clean.is_empty() {
                                let mut hasher = Sha1::new();
                                hasher.update(&bytes);
                                let actual = format!("{:x}", hasher.finalize());
                                if !actual.eq_ignore_ascii_case(clean) {
                                    continue;
                                }
                            }
                        }
                        if std::fs::write(&full_path, &bytes).is_ok() {
                            info!("Downloaded Maven artifact {} from {}", maven_name, url);
                            return Ok(full_path);
                        }
                    }
                }
            }
        }
    }

    Err(AppError::new(
        AppErrorCode::NetworkError,
        format!("Maven artifact not found in any repository: {maven_name}"),
    ))
}

/// Downloads a Maven artifact by resolving repositories for the target loader.
pub async fn download_maven_artifact(
    maven_name: &str,
    loader: &str,
    libraries_dir: &Path,
    sha1: Option<&str>,
    client: &reqwest::Client,
) -> Result<PathBuf, AppError> {
    let repos = maven_repos_for(loader);
    download_maven_artifact_with_repos(maven_name, &repos, libraries_dir, sha1, client).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_maven_name_to_path() {
        assert_eq!(
            maven_name_to_path("net.fabricmc:fabric-loader:0.17.0"),
            Some("net/fabricmc/fabric-loader/0.17.0/fabric-loader-0.17.0.jar".into())
        );
        assert_eq!(
            maven_name_to_path("org.ow2.asm:asm:9.6"),
            Some("org/ow2/asm/asm/9.6/asm-9.6.jar".into())
        );
        assert_eq!(
            maven_name_to_path("com.google.guava:guava:33.0.0-jre"),
            Some("com/google/guava/guava/33.0.0-jre/guava-33.0.0-jre.jar".into())
        );
        assert_eq!(
            maven_name_to_path("org.lwjgl.lwjgl:lwjgl-platform:2.9.4:natives-windows"),
            Some(
                "org/lwjgl/lwjgl/lwjgl-platform/2.9.4/lwjgl-platform-2.9.4-natives-windows.jar"
                    .into()
            )
        );
        assert_eq!(
            maven_name_to_path("net.minecraftforge:forge:1.20.1-47.2.0:launcher"),
            Some("net/minecraftforge/forge/1.20.1-47.2.0/forge-1.20.1-47.2.0-launcher.jar".into())
        );
        assert_eq!(maven_name_to_path("invalid_coordinate"), None);
    }

    #[test]
    fn test_maven_repos_for() {
        let fab = maven_repos_for("Fabric");
        assert!(fab.contains(&"https://maven.fabricmc.net/"));

        let qlt = maven_repos_for("Quilt");
        assert!(qlt.contains(&"https://maven.quiltmc.org/repository/release/"));

        let neo = maven_repos_for("NeoForge");
        assert!(neo.contains(&"https://maven.neoforged.net/releases/"));

        let frg = maven_repos_for("Forge");
        assert!(frg.contains(&"https://maven.minecraftforge.net/"));
    }
}
