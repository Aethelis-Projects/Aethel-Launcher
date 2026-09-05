use reqwest::{header, StatusCode};
use sha1::{Digest, Sha1};
use sha2::Sha512;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tracing::{debug, warn};

use crate::types::{
    DependencyType, ModDependency, ModFile, ModFileHashes, ModSearchResult, ModVersion,
};
use aethel_core::{AppError, AppErrorCode};

const DEFAULT_MODRINTH_URL: &str = "https://api.modrinth.com/v2";
const CACHE_TTL: Duration = Duration::from_secs(300); // 5 minutes

/// Token-bucket rate limiter with 429 Retry-After cooldown support.
#[derive(Debug)]
pub struct RateLimiter {
    tokens: f64,
    max_tokens: f64,
    refill_rate: f64, // tokens per second
    last_refill: Instant,
    cooldown_until: Option<Instant>,
}

impl RateLimiter {
    pub fn new(max_tokens: f64, refill_rate: f64) -> Self {
        Self {
            tokens: max_tokens,
            max_tokens,
            refill_rate,
            last_refill: Instant::now(),
            cooldown_until: None,
        }
    }

    pub async fn acquire(&mut self) {
        if let Some(cooldown) = self.cooldown_until {
            let now = Instant::now();
            if cooldown > now {
                let wait_duration = cooldown - now;
                tokio::time::sleep(wait_duration).await;
            }
            self.cooldown_until = None;
        }

        loop {
            let now = Instant::now();
            let elapsed = now.duration_since(self.last_refill).as_secs_f64();
            self.tokens = (self.tokens + elapsed * self.refill_rate).min(self.max_tokens);
            self.last_refill = now;

            if self.tokens >= 1.0 {
                self.tokens -= 1.0;
                break;
            }

            let wait_secs = (1.0 - self.tokens) / self.refill_rate;
            tokio::time::sleep(Duration::from_secs_f64(wait_secs)).await;
        }
    }

    pub fn set_cooldown(&mut self, duration: Duration) {
        self.cooldown_until = Some(Instant::now() + duration);
    }
}

/// Client for interacting with Modrinth API v2.
#[derive(Clone)]
pub struct ModrinthClient {
    base_url: String,
    client: reqwest::Client,
    cache: Arc<Mutex<HashMap<String, (Instant, String)>>>,
    rate_limiter: Arc<Mutex<RateLimiter>>,
}

impl ModrinthClient {
    pub fn new() -> Result<Self, AppError> {
        Self::new_with_base_url(DEFAULT_MODRINTH_URL)
    }

    pub fn new_with_base_url(base_url: impl Into<String>) -> Result<Self, AppError> {
        let mut headers = header::HeaderMap::new();
        headers.insert(
            header::USER_AGENT,
            header::HeaderValue::from_static("aethel-launcher/0.1.0 (Aethelis Projects)"),
        );

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Failed to build reqwest client: {e}"),
                )
            })?;

        Ok(Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            client,
            cache: Arc::new(Mutex::new(HashMap::new())),
            // 300 requests per minute = 5 req/sec
            rate_limiter: Arc::new(Mutex::new(RateLimiter::new(300.0, 5.0))),
        })
    }

    /// Internal request execution with rate limiting, caching and 429 retry-after handling.
    async fn fetch_cached(&self, url: &str, use_cache: bool) -> Result<String, AppError> {
        if use_cache {
            let mut cache = self.cache.lock().await;
            if let Some((inserted, body)) = cache.get(url) {
                if inserted.elapsed() < CACHE_TTL {
                    debug!("Modrinth cache hit: {url}");
                    return Ok(body.clone());
                } else {
                    cache.remove(url);
                }
            }
        }

        // Apply rate limiting
        {
            let mut limiter = self.rate_limiter.lock().await;
            limiter.acquire().await;
        }

        let resp = self.client.get(url).send().await.map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Modrinth request failed for {url}: {e}"),
            )
        })?;

        if resp.status() == StatusCode::TOO_MANY_REQUESTS {
            let retry_after_secs = resp
                .headers()
                .get(header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(60);

            warn!("Modrinth HTTP 429 Too Many Requests, backoff {retry_after_secs}s");
            let mut limiter = self.rate_limiter.lock().await;
            limiter.set_cooldown(Duration::from_secs(retry_after_secs));

            return Err(AppError::new(
                AppErrorCode::NetworkError,
                format!("Modrinth rate limited (429), retry after {retry_after_secs}s"),
            ));
        }

        if !resp.status().is_success() {
            return Err(AppError::new(
                AppErrorCode::NetworkError,
                format!("Modrinth API returned status {}: {url}", resp.status()),
            ));
        }

        let body = resp.text().await.map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Failed to read Modrinth response: {e}"),
            )
        })?;

        if use_cache {
            let mut cache = self.cache.lock().await;
            cache.insert(url.to_string(), (Instant::now(), body.clone()));
        }

        Ok(body)
    }

    /// Searches mods on Modrinth matching query, game version, and modloader.
    pub async fn search_mods(
        &self,
        query: &str,
        game_version: Option<&str>,
        loader: Option<&str>,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<ModSearchResult>, AppError> {
        let mut facets = Vec::new();
        facets.push(r#"["project_type:mod"]"#.to_string());

        if let Some(gv) = game_version {
            if !gv.is_empty() {
                facets.push(format!(r#"["versions:{}"]"#, gv));
            }
        }
        if let Some(ld) = loader {
            if !ld.is_empty() {
                facets.push(format!(r#"["categories:{}"]"#, ld));
            }
        }

        let facets_param = format!("[{}]", facets.join(","));
        let url = format!(
            "{}/search?query={}&facets={}&limit={}&offset={}",
            self.base_url,
            urlencoding::encode(query),
            urlencoding::encode(&facets_param),
            limit.clamp(1, 100),
            offset
        );

        let json_str = self.fetch_cached(&url, true).await?;
        Self::parse_search_results(&json_str)
    }

    pub fn parse_search_results(json_str: &str) -> Result<Vec<ModSearchResult>, AppError> {
        let root: serde_json::Value = serde_json::from_str(json_str).map_err(|e| {
            AppError::new(
                AppErrorCode::InvalidManifest,
                format!("Failed to parse Modrinth search JSON: {e}"),
            )
        })?;

        let hits = root["hits"].as_array().ok_or_else(|| {
            AppError::new(
                AppErrorCode::InvalidManifest,
                "Missing 'hits' array in Modrinth search response",
            )
        })?;

        let mut results = Vec::new();
        for hit in hits {
            let project_id = hit["project_id"].as_str().unwrap_or_default().to_string();
            let slug = hit["slug"].as_str().unwrap_or_default().to_string();
            let title = hit["title"].as_str().unwrap_or_default().to_string();
            let description = hit["description"].as_str().unwrap_or_default().to_string();
            let author = hit["author"].as_str().unwrap_or_default().to_string();
            let downloads = hit["downloads"].as_u64().unwrap_or(0);
            let follows = hit["follows"].as_u64().unwrap_or(0);
            let icon_url = hit["icon_url"].as_str().map(|s| s.to_string());

            let categories = hit["categories"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();

            let versions = hit["versions"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();

            results.push(ModSearchResult {
                project_id,
                slug,
                title,
                description,
                author,
                downloads,
                follows,
                icon_url,
                categories,
                versions,
            });
        }

        Ok(results)
    }

    /// Fetches available versions for a project matching optional game version and loader.
    pub async fn get_project_versions(
        &self,
        project_id_or_slug: &str,
        game_version: Option<&str>,
        loader: Option<&str>,
    ) -> Result<Vec<ModVersion>, AppError> {
        let mut query_params = Vec::new();
        if let Some(gv) = game_version {
            if !gv.is_empty() {
                query_params.push(format!(
                    "game_versions={}",
                    urlencoding::encode(&format!(r#"["{}"]"#, gv))
                ));
            }
        }
        if let Some(ld) = loader {
            if !ld.is_empty() {
                query_params.push(format!(
                    "loaders={}",
                    urlencoding::encode(&format!(r#"["{}"]"#, ld))
                ));
            }
        }

        let query_str = if query_params.is_empty() {
            String::new()
        } else {
            format!("?{}", query_params.join("&"))
        };

        let url = format!(
            "{}/project/{}/version{}",
            self.base_url, project_id_or_slug, query_str
        );

        let json_str = self.fetch_cached(&url, true).await?;
        Self::parse_versions(&json_str)
    }

    /// Fetches a specific version by its version ID.
    pub async fn get_version(&self, version_id: &str) -> Result<ModVersion, AppError> {
        let url = format!("{}/version/{}", self.base_url, version_id);
        let json_str = self.fetch_cached(&url, true).await?;
        let val: serde_json::Value = serde_json::from_str(&json_str).map_err(|e| {
            AppError::new(
                AppErrorCode::InvalidManifest,
                format!("Failed to parse version JSON: {e}"),
            )
        })?;
        Self::parse_single_version(&val)
    }

    pub fn parse_versions(json_str: &str) -> Result<Vec<ModVersion>, AppError> {
        let arr: Vec<serde_json::Value> = serde_json::from_str(json_str).map_err(|e| {
            AppError::new(
                AppErrorCode::InvalidManifest,
                format!("Failed to parse Modrinth versions JSON: {e}"),
            )
        })?;

        let mut versions = Vec::new();
        for item in &arr {
            versions.push(Self::parse_single_version(item)?);
        }
        Ok(versions)
    }

    fn parse_single_version(val: &serde_json::Value) -> Result<ModVersion, AppError> {
        let version_id = val["id"].as_str().unwrap_or_default().to_string();
        let project_id = val["project_id"].as_str().unwrap_or_default().to_string();
        let version_number = val["version_number"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        let name = val["name"].as_str().unwrap_or_default().to_string();
        let date_published = val["date_published"]
            .as_str()
            .unwrap_or_default()
            .to_string();

        let game_versions = val["game_versions"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        let loaders = val["loaders"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        let files = val["files"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .map(|f| {
                        let url = f["url"].as_str().unwrap_or_default().to_string();
                        let filename = f["filename"].as_str().unwrap_or_default().to_string();
                        let primary = f["primary"].as_bool().unwrap_or(false);
                        let size = f["size"].as_u64().unwrap_or(0);
                        let sha1 = f["hashes"]["sha1"].as_str().map(String::from);
                        let sha512 = f["hashes"]["sha512"].as_str().map(String::from);

                        ModFile {
                            url,
                            filename,
                            primary,
                            size,
                            hashes: ModFileHashes { sha1, sha512 },
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        let dependencies = val["dependencies"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .map(|d| {
                        let project_id = d["project_id"].as_str().map(String::from);
                        let version_id = d["version_id"].as_str().map(String::from);
                        let file_name = d["file_name"].as_str().map(String::from);
                        let dep_type_str = d["dependency_type"].as_str().unwrap_or("required");
                        let dependency_type = match dep_type_str {
                            "optional" => DependencyType::Optional,
                            "incompatible" => DependencyType::Incompatible,
                            "embedded" => DependencyType::Embedded,
                            _ => DependencyType::Required,
                        };

                        ModDependency {
                            project_id,
                            version_id,
                            file_name,
                            dependency_type,
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(ModVersion {
            version_id,
            project_id,
            version_number,
            name,
            game_versions,
            loaders,
            files,
            dependencies,
            date_published,
        })
    }

    /// Downloads a mod file to target path and verifies SHA-1 and SHA-512 hashes.
    pub async fn download_mod_file(
        &self,
        file: &ModFile,
        target_path: &Path,
    ) -> Result<(), AppError> {
        let resp = self.client.get(&file.url).send().await.map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Failed to download mod file {}: {e}", file.filename),
            )
        })?;

        if !resp.status().is_success() {
            return Err(AppError::new(
                AppErrorCode::NetworkError,
                format!(
                    "Failed to download mod file {}: status {}",
                    file.filename,
                    resp.status()
                ),
            ));
        }

        let bytes = resp.bytes().await.map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Failed to read mod file bytes {}: {e}", file.filename),
            )
        })?;

        Self::verify_file_bytes(&bytes, &file.hashes, &file.filename)?;

        let final_dest = if target_path.is_dir() {
            target_path.join(&file.filename)
        } else {
            target_path.to_path_buf()
        };

        if let Some(parent) = final_dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to create mod directory {}: {e}", parent.display()),
                )
            })?;
        }

        std::fs::write(&final_dest, &bytes).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to write mod file {}: {e}", final_dest.display()),
            )
        })?;

        Ok(())
    }

    /// Verifies SHA-1 and SHA-512 hashes against provided bytes.
    pub fn verify_file_bytes(
        bytes: &[u8],
        hashes: &ModFileHashes,
        filename: &str,
    ) -> Result<(), AppError> {
        if let Some(ref expected_sha1) = hashes.sha1 {
            let mut hasher = Sha1::new();
            hasher.update(bytes);
            let actual = format!("{:x}", hasher.finalize());
            if !actual.eq_ignore_ascii_case(expected_sha1) {
                return Err(AppError::new(
                    AppErrorCode::HashMismatch,
                    format!(
                        "SHA-1 mismatch for {filename}: expected {expected_sha1}, got {actual}"
                    ),
                ));
            }
        }

        if let Some(ref expected_sha512) = hashes.sha512 {
            let mut hasher = Sha512::new();
            hasher.update(bytes);
            let actual = format!("{:x}", hasher.finalize());
            if !actual.eq_ignore_ascii_case(expected_sha512) {
                return Err(AppError::new(
                    AppErrorCode::HashMismatch,
                    format!(
                        "SHA-512 mismatch for {filename}: expected {expected_sha512}, got {actual}"
                    ),
                ));
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_SEARCH_JSON: &str = r#"{
        "hits": [
            {
                "project_id": "AANobbMI",
                "project_type": "mod",
                "slug": "sodium",
                "author": "jellysquid3",
                "title": "Sodium",
                "description": "Modern rendering engine for Minecraft",
                "categories": ["optimization"],
                "versions": ["1.20.4", "1.20.2"],
                "downloads": 15000000,
                "follows": 50000,
                "icon_url": "https://cdn.modrinth.com/icon.png"
            }
        ],
        "offset": 0,
        "limit": 10,
        "total_hits": 1
    }"#;

    const SAMPLE_VERSIONS_JSON: &str = r#"[
        {
            "id": "v12345",
            "project_id": "AANobbMI",
            "name": "Sodium 0.5.8 for 1.20.4",
            "version_number": "0.5.8",
            "game_versions": ["1.20.4"],
            "loaders": ["fabric", "quilt"],
            "date_published": "2024-02-12T16:00:00Z",
            "files": [
                {
                    "url": "https://cdn.modrinth.com/sodium-0.5.8.jar",
                    "filename": "sodium-fabric-0.5.8.jar",
                    "primary": true,
                    "size": 1048576,
                    "hashes": {
                        "sha1": "2fd4e1c67a2d28fced849ee1bb76e7391b93eb12",
                        "sha512": "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"
                    }
                }
            ],
            "dependencies": [
                {
                    "project_id": "P7dR8mSH",
                    "version_id": null,
                    "file_name": null,
                    "dependency_type": "required"
                },
                {
                    "project_id": "mOgUt4GM",
                    "version_id": null,
                    "file_name": null,
                    "dependency_type": "optional"
                }
            ]
        }
    ]"#;

    #[test]
    fn test_modrinth_search_parsing() {
        let results =
            ModrinthClient::parse_search_results(SAMPLE_SEARCH_JSON).expect("parse search");
        assert_eq!(results.len(), 1);
        let mod_res = &results[0];
        assert_eq!(mod_res.project_id, "AANobbMI");
        assert_eq!(mod_res.slug, "sodium");
        assert_eq!(mod_res.title, "Sodium");
        assert_eq!(mod_res.downloads, 15000000);
        assert_eq!(mod_res.categories, vec!["optimization"]);
    }

    #[test]
    fn test_modrinth_versions_parsing() {
        let versions =
            ModrinthClient::parse_versions(SAMPLE_VERSIONS_JSON).expect("parse versions");
        assert_eq!(versions.len(), 1);
        let ver = &versions[0];
        assert_eq!(ver.version_id, "v12345");
        assert_eq!(ver.project_id, "AANobbMI");
        assert_eq!(ver.loaders, vec!["fabric", "quilt"]);
        assert_eq!(ver.files.len(), 1);
        assert_eq!(ver.files[0].filename, "sodium-fabric-0.5.8.jar");
        assert_eq!(ver.dependencies.len(), 2);
        assert_eq!(
            ver.dependencies[0].dependency_type,
            DependencyType::Required
        );
        assert_eq!(ver.dependencies[0].project_id.as_deref(), Some("P7dR8mSH"));
        assert_eq!(
            ver.dependencies[1].dependency_type,
            DependencyType::Optional
        );
    }

    #[tokio::test]
    async fn test_modrinth_rate_limiting() {
        let mut limiter = RateLimiter::new(2.0, 100.0);
        limiter.acquire().await;
        limiter.acquire().await;
        // Third acquire should smoothly replenish tokens without panic
        limiter.acquire().await;
    }

    #[tokio::test]
    async fn test_modrinth_cache_hit() {
        let client = ModrinthClient::new().unwrap();
        let test_url = "https://api.modrinth.com/v2/test";
        {
            let mut cache = client.cache.lock().await;
            cache.insert(
                test_url.to_string(),
                (Instant::now(), "cached_response".to_string()),
            );
        }

        let body = client
            .fetch_cached(test_url, true)
            .await
            .expect("cached read");
        assert_eq!(body, "cached_response");
    }

    #[test]
    fn test_modrinth_hash_verification() {
        // "test" sha1 = a94a8fe5ccb19ba61c4c0873d391e987982fbbd3
        let bytes = b"test";
        let valid_hashes = ModFileHashes {
            sha1: Some("a94a8fe5ccb19ba61c4c0873d391e987982fbbd3".to_string()),
            sha512: None,
        };
        assert!(ModrinthClient::verify_file_bytes(bytes, &valid_hashes, "test.jar").is_ok());

        let invalid_hashes = ModFileHashes {
            sha1: Some("0000000000000000000000000000000000000000".to_string()),
            sha512: None,
        };
        let err = ModrinthClient::verify_file_bytes(bytes, &invalid_hashes, "test.jar");
        assert!(err.is_err());
        assert_eq!(err.unwrap_err().code(), AppErrorCode::HashMismatch);
    }

    #[test]
    fn test_modrinth_retry_after() {
        let mut limiter = RateLimiter::new(10.0, 5.0);
        limiter.set_cooldown(Duration::from_secs(1));
        assert!(limiter.cooldown_until.is_some());
    }
}
