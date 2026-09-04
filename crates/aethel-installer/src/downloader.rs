use aethel_core::{AppError, AppErrorCode};
use aethel_download::DownloadEngine;
use minisign_verify::{PublicKey, Signature};

pub const DEFAULT_PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDMzNkExM0ZFQjY0MDBCNzcKUldSM0MwQzIvaE5xTS9EMnhJUnhNQ295OWVuUVFhSmF0eG1DYnNYckdQVDFQNjNNRnluY3NLTEEK";

pub struct InstallerDownloader {
    pub engine: DownloadEngine,
    pub pubkey: String,
}

impl Default for InstallerDownloader {
    fn default() -> Self {
        Self::new()
    }
}

impl InstallerDownloader {
    pub fn new() -> Self {
        Self {
            engine: DownloadEngine::new(4),
            pubkey: DEFAULT_PUBKEY.to_string(),
        }
    }

    pub fn with_pubkey(pubkey: impl Into<String>) -> Self {
        Self {
            engine: DownloadEngine::new(4),
            pubkey: pubkey.into(),
        }
    }

    /// Verifies that data matches the provided Minisign signature.
    pub fn verify_signature(
        data: &[u8],
        signature_str: &str,
        pubkey_str: &str,
    ) -> Result<(), AppError> {
        let pk = PublicKey::from_base64(pubkey_str.trim()).map_err(|e| {
            AppError::new(
                AppErrorCode::HashMismatch,
                format!("Invalid Minisign public key: {e}"),
            )
        })?;

        let sig = Signature::decode(signature_str.trim()).map_err(|e| {
            AppError::new(
                AppErrorCode::HashMismatch,
                format!("Invalid Minisign signature format: {e}"),
            )
        })?;

        pk.verify(data, &sig, false).map_err(|e| {
            AppError::new(
                AppErrorCode::HashMismatch,
                format!("Minisign cryptographic verification failed: {e}"),
            )
        })?;

        Ok(())
    }

    /// Resolves official release asset download URL for the target operating system.
    pub fn resolve_launcher_asset_url(version: &str) -> (String, String) {
        let tag = if version.starts_with('v') {
            version.to_string()
        } else {
            format!("v{version}")
        };

        let base =
            format!("https://github.com/Aethelis-Projects/aethel-launcher/releases/download/{tag}");

        #[cfg(target_os = "windows")]
        {
            let asset_name = format!("AethelLauncher_{version}_x64-setup.exe");
            (format!("{base}/{asset_name}"), asset_name)
        }

        #[cfg(target_os = "macos")]
        {
            let asset_name = format!("AethelLauncher_{version}_universal.dmg");
            (format!("{base}/{asset_name}"), asset_name)
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            let asset_name = format!("AethelLauncher_{version}_amd64.AppImage");
            (format!("{base}/{asset_name}"), asset_name)
        }
    }

    /// Resolves Adoptium Temurin Java JRE download URL.
    pub fn resolve_java_url(major: u32) -> Option<String> {
        #[cfg(target_os = "windows")]
        let os = "windows";
        #[cfg(target_os = "macos")]
        let os = "mac";
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        let os = "linux";

        let arch = if cfg!(target_arch = "aarch64") {
            "aarch64"
        } else {
            "x64"
        };

        Some(format!(
            "https://api.adoptium.net/v3/binary/latest/{major}/ga/{os}/{arch}/jre/hotspot/normal/eclipse?project=jdk"
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_launcher_asset_url() {
        let (url, asset_name) = InstallerDownloader::resolve_launcher_asset_url("1.0.0");
        assert!(url.contains("v1.0.0"));
        assert!(url.contains(&asset_name));
    }

    #[test]
    fn test_resolve_java_url() {
        let url = InstallerDownloader::resolve_java_url(21).unwrap();
        assert!(url.contains("latest/21/ga"));
        assert!(url.contains("jre/hotspot"));
    }

    #[test]
    fn test_verify_signature_rejection() {
        let data = b"corrupted binary payload";
        let invalid_sig = "untrusted comment: signature\nRWFakeSig\n";
        let res = InstallerDownloader::verify_signature(data, invalid_sig, DEFAULT_PUBKEY);
        assert!(res.is_err());
    }
}
