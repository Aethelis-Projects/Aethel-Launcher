pub mod fabric;
pub mod forge;
pub mod meta;
pub mod neoforge;
pub mod quilt;

pub use fabric::FabricInstaller;
pub use forge::ForgeInstaller;
pub use meta::*;
pub use neoforge::NeoForgeInstaller;
pub use quilt::QuiltInstaller;

use crate::types::ModloaderType;
use aethel_core::AppError;
use aethel_manifest::VersionPackage;
use std::path::Path;

pub trait ModloaderInstaller: Send + Sync {
    fn loader_type(&self) -> ModloaderType;
    fn install(
        &self,
        mc_version: &str,
        loader_version: &str,
        instance_dir: &Path,
    ) -> Result<VersionPackage, AppError>;
}
