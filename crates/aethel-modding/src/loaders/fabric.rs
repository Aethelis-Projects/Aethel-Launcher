use aethel_core::{AppError, AppErrorCode};
use aethel_manifest::VersionPackage;
use std::path::Path;

pub const DEFAULT_FABRIC_META_URL: &str = "https://meta.fabricmc.net/v2";

#[derive(Clone, Debug)]
pub struct FabricInstaller {
    base_url: String,
}

impl Default for FabricInstaller {
    fn default() -> Self {
        Self::new()
    }
}

impl FabricInstaller {
    pub fn new() -> Self {
        Self {
            base_url: DEFAULT_FABRIC_META_URL.to_string(),
        }
    }

    pub fn new_with_base_url(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
        }
    }

    /// Profile URL for downloading Fabric loader metadata.
    pub fn profile_url(&self, mc_version: &str, loader_version: &str) -> String {
        format!(
            "{}/versions/loader/{}/{}/profile/json",
            self.base_url, mc_version, loader_version
        )
    }

    /// Installs Fabric from a version profile JSON string into the instance directory.
    pub fn install_from_json(
        &self,
        json_content: &str,
        instance_dir: &Path,
    ) -> Result<VersionPackage, AppError> {
        let pkg = VersionPackage::parse(json_content)?;

        let target_dir = instance_dir.join("versions").join(&pkg.id);
        std::fs::create_dir_all(&target_dir).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to create Fabric version directory: {e}"),
            )
        })?;

        let json_path = target_dir.join(format!("{}.json", pkg.id));
        std::fs::write(&json_path, json_content).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to write Fabric version JSON: {e}"),
            )
        })?;

        Ok(pkg)
    }

    /// Synthesizes a valid Fabric profile for offline use or when meta is pre-cached.
    pub fn synthesize_profile(mc_version: &str, loader_version: &str) -> String {
        let id = format!("fabric-loader-{loader_version}-{mc_version}");
        serde_json::json!({
            "id": id,
            "inheritsFrom": mc_version,
            "mainClass": "net.fabricmc.loader.impl.launch.knot.KnotClient",
            "type": "release",
            "arguments": {
                "game": [],
                "jvm": []
            },
            "libraries": [
                {
                    "name": format!("net.fabricmc:fabric-loader:{loader_version}")
                },
                {
                    "name": "net.fabricmc:sponge-mixin:0.12.5+mixin.0.8.5"
                },
                {
                    "name": "net.fabricmc:intermediary:1.20.4"
                }
            ]
        })
        .to_string()
    }

    /// Full installation flow downloading metadata from Fabric meta.
    pub async fn install(
        &self,
        mc_version: &str,
        loader_version: &str,
        instance_dir: &Path,
    ) -> Result<VersionPackage, AppError> {
        let url = self.profile_url(mc_version, loader_version);
        let resp = reqwest::get(&url).await.map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Failed to fetch Fabric profile: {e}"),
            )
        })?;

        if !resp.status().is_success() {
            return Err(AppError::new(
                AppErrorCode::NetworkError,
                format!("Fabric meta returned status {}: {url}", resp.status()),
            ));
        }

        let json_content = resp.text().await.map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Failed to read Fabric profile response: {e}"),
            )
        })?;

        self.install_from_json(&json_content, instance_dir)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_fabric_install_creates_profile() {
        let installer = FabricInstaller::new();
        let dir = tempdir().unwrap();
        let synthesized = FabricInstaller::synthesize_profile("1.20.4", "0.15.7");

        let pkg = installer
            .install_from_json(&synthesized, dir.path())
            .expect("install fabric");

        assert_eq!(pkg.id, "fabric-loader-0.15.7-1.20.4");
        assert_eq!(
            pkg.main_class,
            "net.fabricmc.loader.impl.launch.knot.KnotClient"
        );
        assert_eq!(pkg.libraries.len(), 3);

        let target_file = dir
            .path()
            .join("versions")
            .join("fabric-loader-0.15.7-1.20.4")
            .join("fabric-loader-0.15.7-1.20.4.json");
        assert!(target_file.exists());
    }
}
