use aethel_core::{AppError, AppErrorCode};
use minisign_verify::{PublicKey, Signature};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const DEFAULT_PUBKEY: &str =
    "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDMzNkExM0ZFQjY0MDBCNzcKUldSM0MwQzIvaE5xTS9EMnhJUnhNQ295OWVuUVFhSmF0eG1DYnNYckdQVDFQNjNNRnluY3NLTEEK";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct UpdateInfo {
    pub version: String,
    pub date: String,
    pub body: String,
    pub download_size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdatePlatform {
    pub signature: String,
    pub url: String,
    pub download_size: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateManifest {
    pub version: String,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
    pub platforms: HashMap<String, UpdatePlatform>,
}

pub fn current_platform_target() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "windows-x86_64"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "linux-x86_64"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "darwin-x86_64"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "darwin-aarch64"
    }
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "aarch64"),
    )))]
    {
        "unknown"
    }
}

/// Verifies a Minisign Ed25519 signature against data.
pub fn verify_minisign_signature(
    public_key_str: &str,
    signature_str: &str,
    data: &[u8],
) -> Result<(), AppError> {
    // If pubkey has untrusted comment header, parse base64 key line
    let key_clean = public_key_str
        .lines()
        .nth(1)
        .unwrap_or(public_key_str)
        .trim();

    let public_key = PublicKey::from_base64(key_clean).map_err(|e| {
        AppError::new(
            AppErrorCode::InternalError,
            format!("Invalid minisign public key: {e}"),
        )
    })?;

    let signature = Signature::decode(signature_str).map_err(|e| {
        AppError::new(
            AppErrorCode::InternalError,
            format!("Invalid minisign signature: {e}"),
        )
    })?;

    public_key.verify(data, &signature, false).map_err(|e| {
        AppError::new(
            AppErrorCode::HashMismatch,
            format!("Minisign signature verification failed: {e}"),
        )
    })?;

    Ok(())
}

/// Parses an UpdateManifest and evaluates if an update is available for the current version and target platform.
pub fn evaluate_manifest(
    manifest: &UpdateManifest,
    current_version_str: &str,
    platform_target: &str,
) -> Option<UpdateInfo> {
    let current_ver = Version::parse(current_version_str.trim_start_matches('v')).ok()?;
    let target_ver = Version::parse(manifest.version.trim_start_matches('v')).ok()?;

    if target_ver <= current_ver {
        return None;
    }

    let platform = manifest.platforms.get(platform_target)?;

    Some(UpdateInfo {
        version: manifest.version.clone(),
        date: manifest
            .pub_date
            .clone()
            .unwrap_or_else(|| "Unknown".to_string()),
        body: manifest
            .notes
            .clone()
            .unwrap_or_else(|| "Bug fixes and improvements.".to_string()),
        download_size: platform.download_size.unwrap_or(0),
    })
}

/// Checks for updates against the configured endpoint.
/// Includes graceful offline mode fallback (returns Ok(None) when network or endpoint is unreachable).
pub async fn check_for_updates_internal(
    channel: Option<String>,
    endpoint_override: Option<String>,
    current_version: &str,
) -> Result<Option<UpdateInfo>, String> {
    let chan = channel.unwrap_or_else(|| "stable".to_string());

    let url = if let Some(custom) = endpoint_override {
        custom
    } else if let Ok(custom_env) = std::env::var("AETHEL_UPDATE_URL") {
        custom_env
    } else if chan == "beta" {
        "https://github.com/Aethelis-Projects/aethel-launcher/releases/download/beta/latest.json"
            .to_string()
    } else {
        "https://github.com/Aethelis-Projects/aethel-launcher/releases/latest/download/latest.json"
            .to_string()
    };

    let client = match reqwest::Client::builder()
        .user_agent("aethel-launcher/0.1.0 (Aethelis Projects)")
        .timeout(std::time::Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(_) => return Ok(None), // Offline mode fallback
    };

    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(_) => return Ok(None), // Offline mode fallback
    };

    if !resp.status().is_success() {
        return Ok(None);
    }

    let manifest: UpdateManifest = match resp.json().await {
        Ok(m) => m,
        Err(_) => return Ok(None),
    };

    let target = current_platform_target();
    Ok(evaluate_manifest(&manifest, current_version, target))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_updater_verifies_signature() {
        // Known test vector from Minisign
        let pubkey = "RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
        let sig = "untrusted comment: signature from minisign secret key\nRUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1633700835\tfile:test\tprehashed\nwLMDjy9FLAuxZ3q4NlEvkgtyhrr0gtTu6KC4KBJdITbbOeAi1zBIYo0v4iTgt8jJpIidRJnp94ABQkJAgAooBQ==";
        let data = b"test";

        let verified = verify_minisign_signature(pubkey, sig, data);
        assert!(verified.is_ok(), "Signature verification must succeed");

        let bad_data = b"tampered";
        let failed = verify_minisign_signature(pubkey, sig, bad_data);
        assert!(failed.is_err(), "Tampered data must fail signature check");
    }

    #[test]
    fn test_updater_checks_manifest() {
        let manifest_json = r#"{
            "version": "v0.2.0",
            "notes": "Added Phase M6 Modpack & Update features",
            "pub_date": "2026-09-04T12:00:00Z",
            "platforms": {
                "windows-x86_64": {
                    "signature": "mock_sig_win",
                    "url": "https://releases.aethelis.dev/Aethel_0.2.0.msi",
                    "download_size": 15000000
                },
                "linux-x86_64": {
                    "signature": "mock_sig_linux",
                    "url": "https://releases.aethelis.dev/Aethel_0.2.0.AppImage",
                    "download_size": 16000000
                }
            }
        }"#;

        let manifest: UpdateManifest = serde_json::from_str(manifest_json).unwrap();

        // 1. Current version is 0.1.0 -> should detect update
        let update = evaluate_manifest(&manifest, "0.1.0", "windows-x86_64");
        assert!(update.is_some());
        let info = update.unwrap();
        assert_eq!(info.version, "v0.2.0");
        assert_eq!(info.download_size, 15000000);
        assert!(info.body.contains("Phase M6"));

        // 2. Current version is already 0.2.0 -> no update
        let up_to_date = evaluate_manifest(&manifest, "0.2.0", "windows-x86_64");
        assert!(up_to_date.is_none());

        // 3. Current version is newer (0.3.0) -> no update
        let newer = evaluate_manifest(&manifest, "0.3.0", "windows-x86_64");
        assert!(newer.is_none());

        // 4. Unsupported platform -> None
        let unsupported = evaluate_manifest(&manifest, "0.1.0", "freebsd-x86_64");
        assert!(unsupported.is_none());
    }

    #[tokio::test]
    async fn test_updater_offline_fallback() {
        // Point to an unreachable mock endpoint
        let unreachable_url = "http://127.0.0.1:54321/non-existent-manifest.json".to_string();

        let res = check_for_updates_internal(None, Some(unreachable_url), "0.1.0").await;

        // Must not return an Err, but Ok(None) to maintain offline resilience
        assert!(res.is_ok());
        assert!(res.unwrap().is_none());
    }
}
