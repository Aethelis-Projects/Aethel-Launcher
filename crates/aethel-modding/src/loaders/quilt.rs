use aethel_core::{AppError, AppErrorCode};
use aethel_manifest::VersionPackage;
use std::path::Path;

pub const DEFAULT_QUILT_META_URL: &str = "https://meta.quiltmc.org/v3";

#[derive(Clone, Debug)]
pub struct QuiltInstaller {
    base_url: String,
}

impl Default for QuiltInstaller {
    fn default() -> Self {
        Self::new()
    }
}

impl QuiltInstaller {
    pub fn new() -> Self {
        Self {
            base_url: DEFAULT_QUILT_META_URL.to_string(),
        }
    }

    pub fn new_with_base_url(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
        }
    }

    pub fn profile_url(&self, mc_version: &str, loader_version: &str) -> String {
        format!(
            "{}/versions/loader/{}/{}/profile/json",
            self.base_url, mc_version, loader_version
        )
    }

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
                format!("Failed to create Quilt version directory: {e}"),
            )
        })?;

        let json_path = target_dir.join(format!("{}.json", pkg.id));
        std::fs::write(&json_path, json_content).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to write Quilt version JSON: {e}"),
            )
        })?;

        Ok(pkg)
    }

    pub fn synthesize_profile(mc_version: &str, loader_version: &str) -> String {
        let id = format!("quilt-loader-{loader_version}-{mc_version}");
        serde_json::json!({
            "id": id,
            "inheritsFrom": mc_version,
            "mainClass": "org.quiltmc.loader.impl.launch.knot.KnotClient",
            "type": "release",
            "arguments": {
                "game": [],
                "jvm": []
            },
            "libraries": [
                {
                    "name": format!("org.quiltmc:quilt-loader:{loader_version}")
                },
                {
                    "name": "org.ow2.asm:asm:9.6"
                }
            ]
        })
        .to_string()
    }

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
                format!("Failed to fetch Quilt profile: {e}"),
            )
        })?;

        if !resp.status().is_success() {
            return Err(AppError::new(
                AppErrorCode::NetworkError,
                format!("Quilt meta returned status {}: {url}", resp.status()),
            ));
        }

        let json_content = resp.text().await.map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Failed to read Quilt profile response: {e}"),
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
    fn test_quilt_install_creates_profile() {
        let installer = QuiltInstaller::new();
        let dir = tempdir().unwrap();
        let synthesized = QuiltInstaller::synthesize_profile("1.20.4", "0.24.0");

        let pkg = installer
            .install_from_json(&synthesized, dir.path())
            .expect("install quilt");

        assert_eq!(pkg.id, "quilt-loader-0.24.0-1.20.4");
        assert_eq!(
            pkg.main_class,
            "org.quiltmc.loader.impl.launch.knot.KnotClient"
        );
        assert_eq!(pkg.libraries.len(), 2);

        let target_file = dir
            .path()
            .join("versions")
            .join("quilt-loader-0.24.0-1.20.4")
            .join("quilt-loader-0.24.0-1.20.4.json");
        assert!(target_file.exists());
    }
}
