pub mod commands;
pub mod downloader;
pub mod installer;
pub mod payload;
pub mod shortcuts;
pub mod uninstall;

pub use downloader::*;
pub use installer::*;
pub use payload::*;
pub use shortcuts::*;
pub use uninstall::*;

/// Checks if a newer installer version exists on GitHub releases (Clarification #9).
pub async fn check_installer_version() -> Result<Option<String>, String> {
    let current_version = env!("CARGO_PKG_VERSION");

    let client = reqwest::Client::builder()
        .user_agent("Aethel-Installer")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get("https://api.github.com/repos/Aethelis-Projects/Aethel-Launcher/releases/latest")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let release: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let latest_tag = release["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches("v")
        .trim_start_matches("installer-v");

    if !latest_tag.is_empty() && latest_tag != current_version {
        Ok(Some(latest_tag.to_string()))
    } else {
        Ok(None)
    }
}
