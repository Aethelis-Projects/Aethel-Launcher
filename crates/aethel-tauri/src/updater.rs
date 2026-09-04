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
    pub download_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitHubAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitHubRelease {
    pub tag_name: String,
    pub name: Option<String>,
    pub body: Option<String>,
    pub published_at: Option<String>,
    pub prerelease: bool,
    pub draft: bool,
    pub assets: Vec<GitHubAsset>,
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
        download_url: Some(platform.url.clone()),
    })
}

/// Parses a GitHubRelease and evaluates if an update is available for current version and target platform.
pub fn evaluate_github_release(
    release: &GitHubRelease,
    current_version_str: &str,
    platform_target: &str,
) -> Option<UpdateInfo> {
    let current_ver = Version::parse(current_version_str.trim_start_matches('v')).ok()?;
    let target_ver = Version::parse(release.tag_name.trim_start_matches('v')).ok()?;

    if target_ver <= current_ver {
        return None;
    }

    let (matched_asset, dl_size) = match platform_target {
        "windows-x86_64" => {
            let asset = release
                .assets
                .iter()
                .find(|a| a.name.ends_with(".exe") && a.name.contains("setup"))
                .or_else(|| release.assets.iter().find(|a| a.name.ends_with(".msi")))
                .or_else(|| release.assets.iter().find(|a| a.name.ends_with(".exe")));
            (
                asset.map(|a| a.browser_download_url.clone()),
                asset.map(|a| a.size).unwrap_or(0),
            )
        }
        "linux-x86_64" => {
            let asset = release
                .assets
                .iter()
                .find(|a| a.name.ends_with(".AppImage"))
                .or_else(|| release.assets.iter().find(|a| a.name.ends_with(".deb")));
            (
                asset.map(|a| a.browser_download_url.clone()),
                asset.map(|a| a.size).unwrap_or(0),
            )
        }
        "darwin-aarch64" => {
            let asset = release
                .assets
                .iter()
                .find(|a| a.name.ends_with(".dmg") && a.name.contains("aarch64"))
                .or_else(|| release.assets.iter().find(|a| a.name.ends_with(".dmg")));
            (
                asset.map(|a| a.browser_download_url.clone()),
                asset.map(|a| a.size).unwrap_or(0),
            )
        }
        "darwin-x86_64" => {
            let asset = release
                .assets
                .iter()
                .find(|a| a.name.ends_with(".dmg") && a.name.contains("x64"))
                .or_else(|| release.assets.iter().find(|a| a.name.ends_with(".dmg")));
            (
                asset.map(|a| a.browser_download_url.clone()),
                asset.map(|a| a.size).unwrap_or(0),
            )
        }
        _ => (None, 0),
    };

    Some(UpdateInfo {
        version: release.tag_name.clone(),
        date: release
            .published_at
            .clone()
            .unwrap_or_else(|| "Unknown".to_string()),
        body: release
            .body
            .clone()
            .unwrap_or_else(|| "Bug fixes and improvements.".to_string()),
        download_size: dl_size,
        download_url: matched_asset,
    })
}

static RELEASE_CACHE: std::sync::Mutex<Option<(std::time::Instant, String, Option<UpdateInfo>)>> =
    std::sync::Mutex::new(None);

/// Checks for updates against GitHub Releases API or configured manifest.
/// Includes in-memory cache (TTL 15 minutes) and graceful offline mode fallback.
pub async fn check_for_updates_internal(
    channel: Option<String>,
    endpoint_override: Option<String>,
    current_version: &str,
) -> Result<Option<UpdateInfo>, String> {
    let chan = channel.unwrap_or_else(|| "stable".to_string());

    // 1. Check in-memory cache (TTL 15 min) unless custom endpoint is provided
    if endpoint_override.is_none() {
        if let Ok(guard) = RELEASE_CACHE.lock() {
            if let Some((ts, ref cached_chan, ref info)) = *guard {
                if cached_chan == &chan && ts.elapsed() < std::time::Duration::from_secs(15 * 60) {
                    return Ok(info.clone());
                }
            }
        }
    }

    let target = current_platform_target();

    let client = match reqwest::Client::builder()
        .user_agent("aethel-launcher/0.1.0 (Aethelis Projects)")
        .timeout(std::time::Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(_) => return Ok(None), // Offline fallback
    };

    // If custom endpoint or AETHEL_UPDATE_URL is provided, query manifest directly
    if let Some(custom) = endpoint_override.or_else(|| std::env::var("AETHEL_UPDATE_URL").ok()) {
        if let Ok(resp) = client.get(&custom).send().await {
            if resp.status().is_success() {
                if let Ok(manifest) = resp.json::<UpdateManifest>().await {
                    let res = evaluate_manifest(&manifest, current_version, target);
                    return Ok(res);
                }
            }
        }
        return Ok(None);
    }

    // 2. Query GitHub Releases API for real-time release notes & assets
    let gh_api_url =
        "https://api.github.com/repos/Aethelis-Projects/Aethel-Launcher/releases?per_page=5";
    if let Ok(resp) = client.get(gh_api_url).send().await {
        if resp.status().is_success() {
            if let Ok(releases) = resp.json::<Vec<GitHubRelease>>().await {
                let candidate = releases.into_iter().find(|r| {
                    if r.draft {
                        return false;
                    }
                    if chan == "stable" {
                        !r.prerelease
                    } else {
                        true
                    }
                });

                if let Some(rel) = candidate {
                    let info = evaluate_github_release(&rel, current_version, target);
                    if let Ok(mut guard) = RELEASE_CACHE.lock() {
                        *guard = Some((std::time::Instant::now(), chan.clone(), info.clone()));
                    }
                    return Ok(info);
                }
            }
        }
    }

    // 3. Fallback to static manifest
    let fallback_url = if chan == "beta" {
        "https://github.com/Aethelis-Projects/aethel-launcher/releases/download/beta/latest.json"
    } else {
        "https://github.com/Aethelis-Projects/aethel-launcher/releases/latest/download/latest.json"
    };

    if let Ok(resp) = client.get(fallback_url).send().await {
        if resp.status().is_success() {
            if let Ok(manifest) = resp.json::<UpdateManifest>().await {
                let info = evaluate_manifest(&manifest, current_version, target);
                if let Ok(mut guard) = RELEASE_CACHE.lock() {
                    *guard = Some((std::time::Instant::now(), chan, info.clone()));
                }
                return Ok(info);
            }
        }
    }

    Ok(None)
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
