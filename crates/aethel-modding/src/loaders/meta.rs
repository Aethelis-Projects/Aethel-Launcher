//! Live modloader metadata fetching from official endpoints with XML/JSON parsing.

use crate::types::{ModloaderType, ModloaderVersion};
use aethel_core::{AppError, AppErrorCode};

/// Parses `<version>` tags from a Maven `maven-metadata.xml` payload.
pub fn parse_xml_versions(xml: &str) -> Vec<String> {
    let mut versions = Vec::new();
    let mut rest = xml;
    while let Some(start_idx) = rest.find("<version>") {
        let after = &rest[start_idx + 9..];
        if let Some(end_idx) = after.find("</version>") {
            let ver = after[..end_idx].trim();
            if !ver.is_empty() {
                versions.push(ver.to_string());
            }
            rest = &after[end_idx + 10..];
        } else {
            break;
        }
    }
    versions
}

/// Fetches live modloader versions from remote metadata APIs.
pub async fn fetch_loader_versions_online(
    loader: ModloaderType,
    game_version: &str,
    client: &reqwest::Client,
) -> Result<Vec<ModloaderVersion>, AppError> {
    match loader {
        ModloaderType::Fabric => {
            let url = format!("https://meta.fabricmc.net/v2/versions/loader/{game_version}");
            let resp = client.get(&url).send().await.map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Fabric meta request failed: {e}"),
                )
            })?;
            if !resp.status().is_success() {
                return Err(AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Fabric meta returned status {}", resp.status()),
                ));
            }
            let val: serde_json::Value = resp.json().await.map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Failed to parse Fabric meta: {e}"),
                )
            })?;
            let mut list = Vec::new();
            if let Some(arr) = val.as_array() {
                for item in arr {
                    if let Some(v) = item["loader"]["version"].as_str() {
                        let stable = item["loader"]["stable"].as_bool().unwrap_or(true);
                        list.push(ModloaderVersion {
                            loader: ModloaderType::Fabric,
                            version: v.to_string(),
                            game_version: game_version.to_string(),
                            stable,
                        });
                    }
                }
            }
            if list.is_empty() {
                return Err(AppError::new(
                    AppErrorCode::InvalidManifest,
                    format!("No Fabric versions found for {game_version}"),
                ));
            }
            Ok(list)
        }
        ModloaderType::Quilt => {
            let url = format!("https://meta.quiltmc.org/v2/versions/loader/{game_version}");
            let resp = client.get(&url).send().await.map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Quilt meta request failed: {e}"),
                )
            })?;
            if !resp.status().is_success() {
                return Err(AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Quilt meta returned status {}", resp.status()),
                ));
            }
            let val: serde_json::Value = resp.json().await.map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Failed to parse Quilt meta: {e}"),
                )
            })?;
            let mut list = Vec::new();
            if let Some(arr) = val.as_array() {
                for item in arr {
                    if let Some(v) = item["loader"]["version"].as_str() {
                        let stable = item["loader"]["stable"].as_bool().unwrap_or(true);
                        list.push(ModloaderVersion {
                            loader: ModloaderType::Quilt,
                            version: v.to_string(),
                            game_version: game_version.to_string(),
                            stable,
                        });
                    }
                }
            }
            if list.is_empty() {
                return Err(AppError::new(
                    AppErrorCode::InvalidManifest,
                    format!("No Quilt versions found for {game_version}"),
                ));
            }
            Ok(list)
        }
        ModloaderType::NeoForge => {
            let url =
                "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
            let resp = client.get(url).send().await.map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("NeoForge maven metadata request failed: {e}"),
                )
            })?;
            if !resp.status().is_success() {
                return Err(AppError::new(
                    AppErrorCode::NetworkError,
                    format!("NeoForge maven returned status {}", resp.status()),
                ));
            }
            let xml = resp.text().await.map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Failed to read NeoForge maven response: {e}"),
                )
            })?;
            let all_versions = parse_xml_versions(&xml);

            let prefix = if let Some(stripped) = game_version.strip_prefix("1.") {
                format!("{stripped}.")
            } else {
                format!("{game_version}.")
            };

            let mut matching: Vec<ModloaderVersion> = all_versions
                .into_iter()
                .filter(|v| v.starts_with(&prefix))
                .map(|v| ModloaderVersion {
                    loader: ModloaderType::NeoForge,
                    version: v,
                    game_version: game_version.to_string(),
                    stable: true,
                })
                .collect();

            matching.reverse();

            if matching.is_empty() {
                return Err(AppError::new(
                    AppErrorCode::InvalidManifest,
                    format!("No NeoForge versions found matching prefix {prefix}"),
                ));
            }
            Ok(matching)
        }
        ModloaderType::Forge => {
            let url =
                "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml";
            let resp = client.get(url).send().await.map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Forge maven metadata request failed: {e}"),
                )
            })?;
            if !resp.status().is_success() {
                return Err(AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Forge maven returned status {}", resp.status()),
                ));
            }
            let xml = resp.text().await.map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Failed to read Forge maven response: {e}"),
                )
            })?;
            let all_versions = parse_xml_versions(&xml);

            let prefix = format!("{game_version}-");
            let mut matching: Vec<ModloaderVersion> = all_versions
                .into_iter()
                .filter(|v| v.starts_with(&prefix))
                .map(|v| {
                    let forge_ver = v.trim_start_matches(&prefix).to_string();
                    ModloaderVersion {
                        loader: ModloaderType::Forge,
                        version: forge_ver,
                        game_version: game_version.to_string(),
                        stable: true,
                    }
                })
                .collect();

            matching.reverse();

            if matching.is_empty() {
                return Err(AppError::new(
                    AppErrorCode::InvalidManifest,
                    format!("No Forge versions found for {game_version}"),
                ));
            }
            Ok(matching)
        }
    }
}

/// Fallback static versions if offline or network failure.
pub fn fallback_loader_versions(
    loader: ModloaderType,
    game_version: &str,
) -> Vec<ModloaderVersion> {
    match loader {
        ModloaderType::Fabric => vec![
            ModloaderVersion {
                loader: ModloaderType::Fabric,
                version: "0.17.2".into(),
                game_version: game_version.to_string(),
                stable: true,
            },
            ModloaderVersion {
                loader: ModloaderType::Fabric,
                version: "0.16.10".into(),
                game_version: game_version.to_string(),
                stable: true,
            },
            ModloaderVersion {
                loader: ModloaderType::Fabric,
                version: "0.15.11".into(),
                game_version: game_version.to_string(),
                stable: true,
            },
            ModloaderVersion {
                loader: ModloaderType::Fabric,
                version: "0.15.7".into(),
                game_version: game_version.to_string(),
                stable: true,
            },
        ],
        ModloaderType::Quilt => vec![
            ModloaderVersion {
                loader: ModloaderType::Quilt,
                version: "0.27.0".into(),
                game_version: game_version.to_string(),
                stable: true,
            },
            ModloaderVersion {
                loader: ModloaderType::Quilt,
                version: "0.26.1".into(),
                game_version: game_version.to_string(),
                stable: true,
            },
            ModloaderVersion {
                loader: ModloaderType::Quilt,
                version: "0.25.0".into(),
                game_version: game_version.to_string(),
                stable: true,
            },
        ],
        ModloaderType::NeoForge => vec![
            ModloaderVersion {
                loader: ModloaderType::NeoForge,
                version: "21.1.65".into(),
                game_version: game_version.to_string(),
                stable: true,
            },
            ModloaderVersion {
                loader: ModloaderType::NeoForge,
                version: "20.4.160-beta".into(),
                game_version: game_version.to_string(),
                stable: true,
            },
        ],
        ModloaderType::Forge => vec![
            ModloaderVersion {
                loader: ModloaderType::Forge,
                version: "49.0.30".into(),
                game_version: game_version.to_string(),
                stable: true,
            },
            ModloaderVersion {
                loader: ModloaderType::Forge,
                version: "47.2.20".into(),
                game_version: game_version.to_string(),
                stable: true,
            },
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_xml_versions() {
        let xml = r#"
        <metadata>
            <versioning>
                <versions>
                    <version>20.4.80-beta</version>
                    <version>20.4.160-beta</version>
                    <version>21.1.65</version>
                </versions>
            </versioning>
        </metadata>
        "#;
        let versions = parse_xml_versions(xml);
        assert_eq!(versions, vec!["20.4.80-beta", "20.4.160-beta", "21.1.65"]);
    }
}
