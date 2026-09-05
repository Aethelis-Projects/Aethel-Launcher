use aethel_core::{AppError, AppErrorCode};
use aethel_manifest::VersionPackage;
use std::path::Path;

/// Forge installer implementation.
///
/// FALLBACK POLICY (from Master Plan v6 / M5 Guidelines):
/// If the complex Forge processor pipeline is unstable or requires external tooling,
/// Forge installer delegates to clean profile synthesis or can be deferred to v1.1
/// without blocking the core M5 milestone release.
#[derive(Clone, Debug, Default)]
pub struct ForgeInstaller;

impl ForgeInstaller {
    pub fn new() -> Self {
        Self
    }

    pub fn synthesize_profile(mc_version: &str, forge_version: &str) -> String {
        let id = format!("{mc_version}-forge-{forge_version}");
        serde_json::json!({
            "id": id,
            "inheritsFrom": mc_version,
            "mainClass": "cpw.mods.bootstraplauncher.BootstrapLauncher",
            "type": "release",
            "arguments": {
                "game": [
                    "--fml.forgeVersion",
                    forge_version
                ],
                "jvm": [
                    format!("-Dforge.version={forge_version}")
                ]
            },
            "libraries": [
                {
                    "name": format!("net.minecraftforge:forge:{mc_version}-{forge_version}:client")
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
                format!("Failed to create Forge version directory: {e}"),
            )
        })?;

        let json_path = target_dir.join(format!("{}.json", pkg.id));
        std::fs::write(&json_path, json_content).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to write Forge version JSON: {e}"),
            )
        })?;

        Ok(pkg)
    }

    pub fn install(
        &self,
        mc_version: &str,
        forge_version: &str,
        instance_dir: &Path,
    ) -> Result<VersionPackage, AppError> {
        let json_content = Self::synthesize_profile(mc_version, forge_version);
        self.install_from_json(&json_content, instance_dir)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_forge_install_processes() {
        let installer = ForgeInstaller::new();
        let dir = tempdir().unwrap();

        let pkg = installer
            .install("1.20.4", "49.0.30", dir.path())
            .expect("install forge");

        assert_eq!(pkg.id, "1.20.4-forge-49.0.30");
        assert_eq!(
            pkg.main_class,
            "cpw.mods.bootstraplauncher.BootstrapLauncher"
        );
        assert_eq!(pkg.libraries.len(), 1);

        let target_file = dir
            .path()
            .join("versions")
            .join("1.20.4-forge-49.0.30")
            .join("1.20.4-forge-49.0.30.json");
        assert!(target_file.exists());
    }
}
