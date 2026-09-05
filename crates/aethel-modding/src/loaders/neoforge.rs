use aethel_core::{AppError, AppErrorCode};
use aethel_manifest::VersionPackage;
use std::path::Path;

#[derive(Clone, Debug, Default)]
pub struct NeoForgeInstaller;

impl NeoForgeInstaller {
    pub fn new() -> Self {
        Self
    }

    pub fn synthesize_profile(mc_version: &str, loader_version: &str) -> String {
        let id = format!("neoforge-{loader_version}");
        serde_json::json!({
            "id": id,
            "inheritsFrom": mc_version,
            "mainClass": "cpw.mods.bootstraplauncher.BootstrapLauncher",
            "type": "release",
            "arguments": {
                "game": [
                    "--fml.neoForgeVersion",
                    loader_version
                ],
                "jvm": [
                    format!("-Dneoforge.version={loader_version}")
                ]
            },
            "libraries": [
                {
                    "name": format!("net.neoforged:neoforge:{loader_version}:client")
                },
                {
                    "name": "net.neoforged.fancymodloader:loader:2.0.0"
                }
            ]
        })
        .to_string()
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
                format!("Failed to create NeoForge version directory: {e}"),
            )
        })?;

        let json_path = target_dir.join(format!("{}.json", pkg.id));
        std::fs::write(&json_path, json_content).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to write NeoForge version JSON: {e}"),
            )
        })?;

        Ok(pkg)
    }

    pub fn install(
        &self,
        mc_version: &str,
        loader_version: &str,
        instance_dir: &Path,
    ) -> Result<VersionPackage, AppError> {
        let json_content = Self::synthesize_profile(mc_version, loader_version);
        self.install_from_json(&json_content, instance_dir)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_neoforge_install_creates_profile() {
        let installer = NeoForgeInstaller::new();
        let dir = tempdir().unwrap();

        let pkg = installer
            .install("1.20.4", "20.4.80-beta", dir.path())
            .expect("install neoforge");

        assert_eq!(pkg.id, "neoforge-20.4.80-beta");
        assert_eq!(
            pkg.main_class,
            "cpw.mods.bootstraplauncher.BootstrapLauncher"
        );
        assert_eq!(pkg.libraries.len(), 2);

        let target_file = dir
            .path()
            .join("versions")
            .join("neoforge-20.4.80-beta")
            .join("neoforge-20.4.80-beta.json");
        assert!(target_file.exists());
    }
}
