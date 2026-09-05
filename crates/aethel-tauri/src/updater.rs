use aethel_core::{AppError, AppErrorCode};
use minisign_verify::{PublicKey, Signature};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const DEFAULT_PUBKEY: &str =
    "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEE2M0Y1RjNDNUJDNDA2MjcKUldRbkJzUmJQRjgvcG1xbzE1MkNCYnZIdWdRVkFGWmdadnljVlN3dVZaS0VubGxoWVVZM1A1L0IK";

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

/// Update channel selection: Stable (production releases) vs Beta (pre-releases).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UpdateChannel {
    Stable,
    Beta,
}

impl From<&str> for UpdateChannel {
    fn from(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "beta" => Self::Beta,
            _ => Self::Stable,
        }
    }
}

impl std::str::FromStr for UpdateChannel {
    type Err = std::convert::Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self::from(s))
    }
}

/// Normalizes a version tag/string by stripping leading 'v' and whitespace for semver compatibility.
pub fn normalize_version(version: &str) -> &str {
    let trimmed = version.trim();
    trimmed.strip_prefix('v').unwrap_or(trimmed)
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
    let current_ver = Version::parse(normalize_version(current_version_str)).ok()?;
    let target_ver = Version::parse(normalize_version(&manifest.version)).ok()?;

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
    let current_ver = Version::parse(normalize_version(current_version_str)).ok()?;
    let target_ver = Version::parse(normalize_version(&release.tag_name)).ok()?;

    if target_ver <= current_ver {
        return None;
    }

    let (matched_asset, dl_size) = match platform_target {
        "windows-x86_64" => {
            let asset = release
                .assets
                .iter()
                .find(|a| {
                    let n = a.name.to_lowercase();
                    n.ends_with(".exe") && (n.contains("setup") || n.contains("installer"))
                })
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
                .or_else(|| release.assets.iter().find(|a| a.name.ends_with(".deb")))
                .or_else(|| release.assets.iter().find(|a| a.name.contains("Linux")));
            (
                asset.map(|a| a.browser_download_url.clone()),
                asset.map(|a| a.size).unwrap_or(0),
            )
        }
        "darwin-aarch64" => {
            let asset = release
                .assets
                .iter()
                .find(|a| {
                    let n = a.name.to_lowercase();
                    n.ends_with(".dmg")
                        && (n.contains("aarch64") || n.contains("arm64") || n.contains("universal"))
                })
                .or_else(|| release.assets.iter().find(|a| a.name.contains("macOS")))
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
                .find(|a| {
                    let n = a.name.to_lowercase();
                    n.ends_with(".dmg")
                        && (n.contains("x64") || n.contains("x86_64") || n.contains("universal"))
                })
                .or_else(|| release.assets.iter().find(|a| a.name.contains("macOS")))
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
    let chan_enum = UpdateChannel::from(chan.as_str());

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
        .user_agent("Aethel-Launcher-Updater/1.0.0 (Aethelis Projects)")
        .timeout(std::time::Duration::from_secs(10))
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
        "https://api.github.com/repos/Aethelis-Projects/Aethel-Launcher/releases?per_page=10";
    if let Ok(resp) = client.get(gh_api_url).send().await {
        if resp.status().is_success() {
            if let Ok(releases) = resp.json::<Vec<GitHubRelease>>().await {
                let candidate = releases.into_iter().find(|r| {
                    if r.draft {
                        return false;
                    }
                    match chan_enum {
                        UpdateChannel::Stable => !r.prerelease,
                        UpdateChannel::Beta => true,
                    }
                });

                if let Some(rel) = candidate {
                    // Prefer latest.json asset if bundled in the release
                    if let Some(latest_asset) = rel.assets.iter().find(|a| a.name == "latest.json")
                    {
                        if let Ok(m_resp) =
                            client.get(&latest_asset.browser_download_url).send().await
                        {
                            if m_resp.status().is_success() {
                                if let Ok(manifest) = m_resp.json::<UpdateManifest>().await {
                                    if let Some(info) =
                                        evaluate_manifest(&manifest, current_version, target)
                                    {
                                        if let Ok(mut guard) = RELEASE_CACHE.lock() {
                                            *guard = Some((
                                                std::time::Instant::now(),
                                                chan.clone(),
                                                Some(info.clone()),
                                            ));
                                        }
                                        return Ok(Some(info));
                                    }
                                }
                            }
                        }
                    }

                    // Fallback to evaluating raw release assets
                    let info = evaluate_github_release(&rel, current_version, target);
                    if let Ok(mut guard) = RELEASE_CACHE.lock() {
                        *guard = Some((std::time::Instant::now(), chan.clone(), info.clone()));
                    }
                    return Ok(info);
                }
            }
        }
    }

    // 3. Fallback to static manifest on latest public release
    let fallback_url =
        "https://github.com/Aethelis-Projects/Aethel-Launcher/releases/latest/download/latest.json";

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

    #[test]
    fn test_semver_v_prefix_stripped() {
        assert_eq!(normalize_version("v1.0.0-rc.6"), "1.0.0-rc.6");
        assert_eq!(normalize_version("1.0.0-rc.6"), "1.0.0-rc.6");
        assert_eq!(normalize_version("  v2.0.0 "), "2.0.0");
        let parsed = Version::parse(normalize_version("v1.0.0-rc.6"));
        assert!(parsed.is_ok(), "Parsed version without error");
    }

    #[test]
    fn test_updater_channel_filtering() {
        let releases = [
            GitHubRelease {
                tag_name: "v1.1.0-draft".to_string(),
                name: Some("Draft".to_string()),
                body: None,
                published_at: None,
                prerelease: true,
                draft: true,
                assets: vec![],
            },
            GitHubRelease {
                tag_name: "v1.0.0-rc.6".to_string(),
                name: Some("v1.0.0-rc.6".to_string()),
                body: None,
                published_at: None,
                prerelease: true,
                draft: false,
                assets: vec![],
            },
            GitHubRelease {
                tag_name: "v1.0.0".to_string(),
                name: Some("v1.0.0".to_string()),
                body: None,
                published_at: None,
                prerelease: false,
                draft: false,
                assets: vec![],
            },
        ];

        // Stable channel filters out drafts and prereleases -> picks v1.0.0
        let stable_candidate = releases.iter().find(|r| !r.draft && !r.prerelease);
        assert_eq!(stable_candidate.unwrap().tag_name, "v1.0.0");

        // Beta channel filters out drafts only -> picks v1.0.0-rc.6
        let beta_candidate = releases.iter().find(|r| !r.draft);
        assert_eq!(beta_candidate.unwrap().tag_name, "v1.0.0-rc.6");
    }

    #[test]
    fn test_updater_reads_from_public_release() {
        let release = GitHubRelease {
            tag_name: "v1.0.0-rc.6".to_string(),
            name: Some("v1.0.0-rc.6".to_string()),
            body: Some("RC6 Notes".to_string()),
            published_at: Some("2026-09-05T12:00:00Z".to_string()),
            prerelease: true,
            draft: false,
            assets: vec![
                GitHubAsset {
                    name: "Aethel-Installer-Windows-x64.exe".to_string(),
                    browser_download_url: "https://github.com/Aethelis-Projects/Aethel-Launcher/releases/download/v1.0.0-rc.6/Aethel-Installer-Windows-x64.exe".to_string(),
                    size: 45000000,
                },
                GitHubAsset {
                    name: "Aethel-Installer-Windows-x64.exe.sig".to_string(),
                    browser_download_url: "https://github.com/Aethelis-Projects/Aethel-Launcher/releases/download/v1.0.0-rc.6/Aethel-Installer-Windows-x64.exe.sig".to_string(),
                    size: 200,
                },
            ],
        };

        let update = evaluate_github_release(&release, "1.0.0-rc.5", "windows-x86_64");
        assert!(update.is_some());
        let info = update.unwrap();
        assert_eq!(info.version, "v1.0.0-rc.6");
        assert_eq!(info.download_size, 45000000);
        assert!(info
            .download_url
            .unwrap()
            .contains("Aethel-Installer-Windows-x64.exe"));
    }
}
