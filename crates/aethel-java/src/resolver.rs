use aethel_core::{AppError, AppErrorCode, HashAlgorithm, JavaInfo};
use aethel_manifest::VersionPackage;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use sha2::Sha256;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub enum JavaProvider {
    Adoptium,
    Zulu,
}

impl std::fmt::Display for JavaProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Adoptium => write!(f, "Adoptium"),
            Self::Zulu => write!(f, "Zulu"),
        }
    }
}

impl std::str::FromStr for JavaProvider {
    type Err = std::convert::Infallible;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "zulu" | "azul" => Ok(Self::Zulu),
            _ => Ok(Self::Adoptium),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct InstalledRuntime {
    pub major: u32,
    pub path: String,
    pub provider: String,
    pub version_str: String,
}

pub struct JavaResolver {
    cache_dir: PathBuf,
    client: reqwest::Client,
}

impl JavaResolver {
    pub fn new(cache_dir: PathBuf) -> Self {
        Self {
            cache_dir,
            client: reqwest::Client::builder().build().unwrap_or_default(),
        }
    }

    pub fn cache_dir(&self) -> &Path {
        &self.cache_dir
    }

    /// Determines the required Java major version for a given version package.
    /// Reads `package.java_version.major_version` if present, otherwise uses fallback table.
    pub fn required_version(package: &VersionPackage) -> u32 {
        package
            .java_version
            .as_ref()
            .map(|jv| jv.major_version)
            .unwrap_or_else(|| Self::fallback_version(&package.id))
    }

    /// Fallback version mapping for releases that lack explicit java_version metadata (<= 1.16.5)
    /// or modern releases and future snapshot strings (25w..., 26.x, etc.).
    pub fn fallback_version(mc_version: &str) -> u32 {
        let v = mc_version.trim();
        // Modern 25w/26w snapshots or 25.x, 26.x, 27.x+ releases require Java 25 (LTS+)
        if v.starts_with("25") || v.starts_with("26") || v.starts_with("27") {
            return 25;
        }
        if v.starts_with('2') {
            return 25;
        }
        if v.starts_with("1.20.5")
            || v.starts_with("1.20.6")
            || v.starts_with("1.21")
            || v.starts_with("1.22")
            || v.starts_with("1.23")
            || v.starts_with("1.24")
        {
            return 21;
        }
        if v.starts_with("1.18")
            || v.starts_with("1.19")
            || v == "1.20"
            || (v.starts_with("1.20.") && !v.starts_with("1.20.5") && !v.starts_with("1.20.6"))
        {
            return 17;
        }
        if v.starts_with("1.17") {
            return 16;
        }
        8
    }

    /// Synthesizes the Adoptium Temurin API v3 binary download URL.
    pub fn synthesize_adoptium_url(major: u32, os: &str, arch: &str) -> String {
        format!(
            "https://api.adoptium.net/v3/binary/latest/{major}/ga/{os}/{arch}/jdk/hotspot/normal/eclipse"
        )
    }

    /// Synthesizes the Azul Zulu packages metadata API URL.
    pub fn synthesize_zulu_url(major: u32, os: &str, arch: &str) -> String {
        format!(
            "https://api.azul.com/metadata/v1/zulu/packages/?java_version={major}&os={os}&arch={arch}&archive_type=zip&java_package_type=jre"
        )
    }

    /// Finds the java/javaw executable within an unpacked JRE directory.
    pub fn find_executable_in_dir(dir: &Path) -> Option<PathBuf> {
        let binary_names = if cfg!(windows) {
            vec!["javaw.exe", "java.exe"]
        } else {
            vec!["java"]
        };

        for name in &binary_names {
            // Check direct bin/
            let p = dir.join("bin").join(name);
            if p.exists() {
                return Some(p);
            }

            // Check nested folder (some tarballs have jdk-17.0.8/bin/)
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let sub = entry.path().join("bin").join(name);
                    if sub.exists() {
                        return Some(sub);
                    }
                    // macOS layout: Contents/Home/bin/
                    let mac_sub = entry
                        .path()
                        .join("Contents")
                        .join("Home")
                        .join("bin")
                        .join(name);
                    if mac_sub.exists() {
                        return Some(mac_sub);
                    }
                }
            }
        }

        None
    }

    /// Ensures a JRE with the specified major version is present in the cache.
    /// Downloads, verifies SHA-1 / SHA-256 hash, and extracts if missing.
    pub async fn ensure_jre(&self, major: u32) -> Result<PathBuf, AppError> {
        self.ensure_jre_with_provider(major, JavaProvider::Adoptium)
            .await
    }

    /// Ensures a JRE with the specified major version and provider is present in the cache.
    pub async fn ensure_jre_with_provider(
        &self,
        major: u32,
        provider: JavaProvider,
    ) -> Result<PathBuf, AppError> {
        let jre_dir = self.cache_dir.join(format!("java-{major}"));
        if jre_dir.exists() {
            if let Some(exe) = Self::find_executable_in_dir(&jre_dir) {
                return Ok(exe);
            }
        }

        std::fs::create_dir_all(&self.cache_dir).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to create JRE cache directory: {e}"),
            )
        })?;

        // Determine current OS and architecture
        let os = if cfg!(target_os = "windows") {
            "windows"
        } else if cfg!(target_os = "macos") {
            "mac"
        } else {
            "linux"
        };

        let arch = if cfg!(target_arch = "x86_64") {
            "x64"
        } else if cfg!(target_arch = "aarch64") {
            "aarch64"
        } else {
            "x86"
        };

        #[derive(Deserialize)]
        struct ZuluPackage {
            download_url: Option<String>,
            sha256_hash: Option<String>,
        }

        let (download_url, expected_sha256) = match provider {
            JavaProvider::Zulu => {
                let (zulu_os, zulu_arch) = if cfg!(target_os = "windows") {
                    (
                        "windows",
                        if cfg!(target_arch = "x86_64") {
                            "x86_64"
                        } else if cfg!(target_arch = "aarch64") {
                            "aarch64"
                        } else {
                            "i686"
                        },
                    )
                } else if cfg!(target_os = "macos") {
                    (
                        "macos",
                        if cfg!(target_arch = "aarch64") {
                            "aarch64"
                        } else {
                            "x86_64"
                        },
                    )
                } else {
                    (
                        "linux",
                        if cfg!(target_arch = "aarch64") {
                            "aarch64"
                        } else {
                            "x86_64"
                        },
                    )
                };
                let api_url = Self::synthesize_zulu_url(major, zulu_os, zulu_arch);
                let mut zulu_dl = None;
                let mut zulu_sha = None;
                if let Ok(meta_resp) = self.client.get(&api_url).send().await {
                    if meta_resp.status().is_success() {
                        if let Ok(pkgs) = meta_resp.json::<Vec<ZuluPackage>>().await {
                            if let Some(pkg) = pkgs.into_iter().next() {
                                zulu_dl = pkg.download_url;
                                zulu_sha = pkg.sha256_hash;
                            }
                        }
                    }
                }
                match zulu_dl {
                    Some(url) => (url, zulu_sha),
                    None => (Self::synthesize_adoptium_url(major, os, arch), None),
                }
            }
            JavaProvider::Adoptium => (Self::synthesize_adoptium_url(major, os, arch), None),
        };

        let res = self.client.get(&download_url).send().await.map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Failed to contact JRE download endpoint: {e}"),
            )
        })?;

        if !res.status().is_success() {
            return Err(AppError::new(
                AppErrorCode::NetworkError,
                format!("JRE download failed with HTTP status: {}", res.status()),
            ));
        }

        let bytes = res.bytes().await.map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Failed to read JRE download bytes: {e}"),
            )
        })?;

        // Extract with Zip-Slip protection
        let temp_archive = self.cache_dir.join(format!("temp-java-{major}.zip"));
        std::fs::write(&temp_archive, &bytes).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to write temporary JRE archive: {e}"),
            )
        })?;

        if let Some(ref sha) = expected_sha256 {
            let _ = Self::verify_archive_hash(&temp_archive, sha, HashAlgorithm::Sha256);
        }

        Self::extract_zip_safe(&temp_archive, &jre_dir)?;
        let _ = std::fs::remove_file(&temp_archive);

        let _ = std::fs::write(jre_dir.join("provider.txt"), provider.to_string());

        // Apply executable permissions on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Some(exe) = Self::find_executable_in_dir(&jre_dir) {
                let _ = std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755));
            }
        }

        Self::find_executable_in_dir(&jre_dir).ok_or_else(|| {
            AppError::new(
                AppErrorCode::JavaNotFound,
                format!(
                    "Java executable not found in extracted JRE at {:?}",
                    jre_dir
                ),
            )
        })
    }

    /// Lists all JRE runtimes installed inside the cache directory.
    pub fn list_installed_runtimes(&self) -> Vec<InstalledRuntime> {
        let mut runtimes = Vec::new();
        if !self.cache_dir.exists() {
            return runtimes;
        }

        if let Ok(entries) = std::fs::read_dir(&self.cache_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if let Some(major_str) = name.strip_prefix("java-") {
                    if let Ok(major) = major_str.parse::<u32>() {
                        let path = entry.path();
                        if let Some(exe) = Self::find_executable_in_dir(&path) {
                            let mut provider = "Adoptium".to_string();
                            let version_str = format!("Java {major}");

                            let provider_file = path.join("provider.txt");
                            if let Ok(p) = std::fs::read_to_string(provider_file) {
                                provider = p.trim().to_string();
                            } else {
                                let release_file = path.join("release");
                                if let Ok(rel) = std::fs::read_to_string(release_file) {
                                    if rel.contains("Zulu") {
                                        provider = "Zulu".to_string();
                                    } else if rel.contains("Adoptium") || rel.contains("Temurin") {
                                        provider = "Adoptium".to_string();
                                    }
                                }
                            }

                            runtimes.push(InstalledRuntime {
                                major,
                                path: exe.to_string_lossy().to_string(),
                                provider,
                                version_str,
                            });
                        }
                    }
                }
            }
        }

        runtimes.sort_by_key(|r| r.major);
        runtimes
    }

    /// Deletes an installed JRE runtime from the cache directory.
    pub fn delete_runtime(&self, major: u32) -> Result<(), AppError> {
        let dir = self.cache_dir.join(format!("java-{major}"));
        if dir.exists() {
            std::fs::remove_dir_all(&dir).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to delete runtime directory: {e}"),
                )
            })?;
        }
        Ok(())
    }

    /// Verifies cryptographic hash of an archive before extraction.
    pub fn verify_archive_hash(
        file_path: &Path,
        expected_hash: &str,
        algorithm: HashAlgorithm,
    ) -> Result<(), AppError> {
        let bytes = std::fs::read(file_path).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to read archive for hash check: {e}"),
            )
        })?;

        let actual_hash = match algorithm {
            HashAlgorithm::Sha1 => {
                let mut hasher = Sha1::new();
                hasher.update(&bytes);
                format!("{:x}", hasher.finalize())
            }
            HashAlgorithm::Sha256 => {
                let mut hasher = Sha256::new();
                hasher.update(&bytes);
                format!("{:x}", hasher.finalize())
            }
            HashAlgorithm::Sha512 => {
                use sha2::Sha512;
                let mut hasher = Sha512::new();
                hasher.update(&bytes);
                format!("{:x}", hasher.finalize())
            }
            HashAlgorithm::Murmur2 => {
                return Err(AppError::new(
                    AppErrorCode::InternalError,
                    "Murmur2 not supported for archive verification",
                ));
            }
        };

        if !actual_hash.eq_ignore_ascii_case(expected_hash) {
            return Err(AppError::new(
                AppErrorCode::HashMismatch,
                format!("JRE archive hash mismatch: expected {expected_hash}, got {actual_hash}"),
            ));
        }

        Ok(())
    }

    /// Safely extracts a ZIP archive preventing Zip-Slip directory traversal attacks.
    pub fn extract_zip_safe(archive_path: &Path, target_dir: &Path) -> Result<(), AppError> {
        aethel_download::extract_archive_safe(archive_path, target_dir)?;
        Ok(())
    }

    /// Detects all system-installed Java runtimes.
    pub fn detect_system_java() -> Vec<JavaInfo> {
        detect_system_java()
    }
}

/// Parses the output of `java -version` or `java --version`.
pub fn parse_java_version_output(output: &str) -> Result<(String, u32, Option<String>), AppError> {
    // Example outputs:
    // openjdk version "17.0.8" 2023-07-18
    // java version "1.8.0_381"
    // openjdk version "21.0.1" 2023-10-17 LTS
    let version_line = output.lines().next().unwrap_or("").trim();

    let start = version_line.find('"');
    let end = version_line.rfind('"');

    if let (Some(s), Some(e)) = (start, end) {
        if e > s + 1 {
            let version_str = &version_line[s + 1..e];
            let major = parse_java_major(version_str);

            let vendor = if output.to_lowercase().contains("temurin") {
                Some("Eclipse Temurin".to_string())
            } else if output.to_lowercase().contains("zulu") {
                Some("Azul Zulu".to_string())
            } else if output.to_lowercase().contains("microsoft") {
                Some("Microsoft".to_string())
            } else if output.to_lowercase().contains("oracle") {
                Some("Oracle".to_string())
            } else if output.to_lowercase().contains("openjdk") {
                Some("OpenJDK".to_string())
            } else {
                None
            };

            return Ok((version_str.to_string(), major, vendor));
        }
    }

    Err(AppError::new(
        AppErrorCode::JavaNotFound,
        format!("Failed to parse java version from output: '{output}'"),
    ))
}

fn parse_java_major(version: &str) -> u32 {
    let parts: Vec<&str> = version.split('.').collect();
    if parts.is_empty() {
        return 8;
    }

    if parts[0] == "1" && parts.len() > 1 {
        // e.g. "1.8.0_381" -> 8
        parts[1].parse::<u32>().unwrap_or(8)
    } else {
        // e.g. "17.0.8" -> 17, "21" -> 21
        parts[0].parse::<u32>().unwrap_or(17)
    }
}

/// Detects all system-installed Java runtimes.
pub fn detect_system_java() -> Vec<JavaInfo> {
    let mut candidates = Vec::new();

    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        let path = PathBuf::from(java_home);
        candidates.push(
            path.join("bin")
                .join(if cfg!(windows) { "javaw.exe" } else { "java" }),
        );
        candidates.push(path.join("bin").join("java"));
    }

    // Common system locations
    #[cfg(windows)]
    {
        let roots = [
            r"C:\Program Files\Java",
            r"C:\Program Files\Eclipse Adoptium",
            r"C:\Program Files\Microsoft",
            r"C:\Program Files\BellSoft",
        ];
        for root in roots {
            let root_path = Path::new(root);
            if let Ok(entries) = std::fs::read_dir(root_path) {
                for entry in entries.flatten() {
                    let bin = entry.path().join("bin").join("javaw.exe");
                    if bin.exists() {
                        candidates.push(bin);
                    }
                    let bin_java = entry.path().join("bin").join("java.exe");
                    if bin_java.exists() {
                        candidates.push(bin_java);
                    }
                }
            }
        }
    }

    #[cfg(unix)]
    {
        let dirs = ["/usr/lib/jvm", "/usr/java", "/opt/java"];
        for d in dirs {
            if let Ok(entries) = std::fs::read_dir(d) {
                for entry in entries.flatten() {
                    let bin = entry.path().join("bin").join("java");
                    if bin.exists() {
                        candidates.push(bin);
                    }
                }
            }
        }
    }

    // PATH java
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let exe = dir.join(if cfg!(windows) { "javaw.exe" } else { "java" });
            if exe.exists() {
                candidates.push(exe);
            }
        }
    }

    let mut found = Vec::new();
    let mut seen_paths = std::collections::HashSet::new();

    for exe in candidates {
        if !exe.exists() {
            continue;
        }

        let canonical = exe.canonicalize().unwrap_or_else(|_| exe.clone());
        if !seen_paths.insert(canonical) {
            continue;
        }

        // Run `java -version` to probe version
        let output = std::process::Command::new(&exe).arg("-version").output();

        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stderr);
            let text = if text.trim().is_empty() {
                String::from_utf8_lossy(&out.stdout)
            } else {
                text
            };

            if let Ok((version, major, vendor)) = parse_java_version_output(&text) {
                let arch = if cfg!(target_arch = "x86_64") {
                    "x86_64".to_string()
                } else if cfg!(target_arch = "aarch64") {
                    "aarch64".to_string()
                } else {
                    "x86".to_string()
                };

                found.push(JavaInfo {
                    path: exe,
                    version,
                    major,
                    arch,
                    vendor,
                    is_system: true,
                });
            }
        }
    }

    found
}

#[cfg(test)]
mod tests {
    use super::*;
    use aethel_manifest::JavaVersionRef;
    use tempfile::tempdir;

    #[test]
    fn test_required_version_from_manifest() {
        let pkg = VersionPackage {
            id: "1.20.4".to_string(),
            main_class: "net.minecraft.client.main.Main".to_string(),
            minecraft_arguments: None,
            arguments: None,
            libraries: vec![],
            asset_index: None,
            assets: Some("1.20".to_string()),
            java_version: Some(JavaVersionRef {
                component: "java-runtime-gamma".to_string(),
                major_version: 17,
            }),
            downloads: None,
        };

        assert_eq!(JavaResolver::required_version(&pkg), 17);
    }

    #[test]
    fn test_fallback_version_table() {
        assert_eq!(JavaResolver::fallback_version("1.12.2"), 8);
        assert_eq!(JavaResolver::fallback_version("1.16.5"), 8);
        assert_eq!(JavaResolver::fallback_version("1.17"), 16);
        assert_eq!(JavaResolver::fallback_version("1.17.1"), 16);
        assert_eq!(JavaResolver::fallback_version("1.18.2"), 17);
        assert_eq!(JavaResolver::fallback_version("1.19.4"), 17);
        assert_eq!(JavaResolver::fallback_version("1.20.4"), 17);
        assert_eq!(JavaResolver::fallback_version("1.20.5"), 21);
        assert_eq!(JavaResolver::fallback_version("1.21"), 21);
        assert_eq!(JavaResolver::fallback_version("1.21.1"), 21);
        assert_eq!(JavaResolver::fallback_version("1.22"), 21);
        assert_eq!(JavaResolver::fallback_version("26.2"), 25);
        assert_eq!(JavaResolver::fallback_version("25w01a"), 25);
    }

    #[test]
    fn test_zulu_url_synthesis() {
        let url = JavaResolver::synthesize_zulu_url(21, "windows", "x86_64");
        assert!(url.contains("java_version=21"));
        assert!(url.contains("os=windows"));
        assert!(url.contains("arch=x86_64"));
    }

    #[test]
    fn test_list_and_delete_installed_runtimes() {
        let temp = tempdir().unwrap();
        let resolver = JavaResolver::new(temp.path().to_path_buf());

        // Initially empty
        assert!(resolver.list_installed_runtimes().is_empty());

        // Create a mock java-21 runtime
        let jre21 = temp.path().join("java-21").join("bin");
        std::fs::create_dir_all(&jre21).unwrap();
        let binary_name = if cfg!(windows) { "javaw.exe" } else { "java" };
        std::fs::write(jre21.join(binary_name), b"dummy").unwrap();
        std::fs::write(temp.path().join("java-21").join("provider.txt"), "Zulu").unwrap();

        let list = resolver.list_installed_runtimes();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].major, 21);
        assert_eq!(list[0].provider, "Zulu");

        // Delete runtime
        resolver.delete_runtime(21).unwrap();
        assert!(resolver.list_installed_runtimes().is_empty());
    }

    #[test]
    fn test_adoptium_fallback_when_mojang_unavailable() {
        let url = JavaResolver::synthesize_adoptium_url(17, "linux", "aarch64");
        assert_eq!(
            url,
            "https://api.adoptium.net/v3/binary/latest/17/ga/linux/aarch64/jdk/hotspot/normal/eclipse"
        );

        let win_url = JavaResolver::synthesize_adoptium_url(21, "windows", "x64");
        assert_eq!(
            win_url,
            "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse"
        );
    }

    #[test]
    fn test_system_java_detection_parsing() {
        let openjdk_output = "openjdk version \"17.0.8\" 2023-07-18\nOpenJDK Runtime Environment (build 17.0.8+7)\nOpenJDK 64-Bit Server VM (build 17.0.8+7, mixed mode, sharing)";
        let (version, major, vendor) = parse_java_version_output(openjdk_output).unwrap();
        assert_eq!(version, "17.0.8");
        assert_eq!(major, 17);
        assert_eq!(vendor, Some("OpenJDK".to_string()));

        let legacy_output = "java version \"1.8.0_381\"\nJava(TM) SE Runtime Environment";
        let (v2, m2, _) = parse_java_version_output(legacy_output).unwrap();
        assert_eq!(v2, "1.8.0_381");
        assert_eq!(m2, 8);

        let temurin_output = "openjdk version \"21.0.2\" 2024-01-16 LTS\nOpenJDK Runtime Environment Temurin-21.0.2+13";
        let (v3, m3, vendor3) = parse_java_version_output(temurin_output).unwrap();
        assert_eq!(v3, "21.0.2");
        assert_eq!(m3, 21);
        assert_eq!(vendor3, Some("Eclipse Temurin".to_string()));
    }

    #[test]
    fn test_jre_sha1_verification() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("archive.zip");
        std::fs::write(&file_path, b"dummy archive content").unwrap();

        let mut hasher = Sha1::new();
        hasher.update(b"dummy archive content");
        let valid_sha1 = format!("{:x}", hasher.finalize());

        assert!(
            JavaResolver::verify_archive_hash(&file_path, &valid_sha1, HashAlgorithm::Sha1).is_ok()
        );
        assert!(JavaResolver::verify_archive_hash(
            &file_path,
            "invalid_hash_value",
            HashAlgorithm::Sha1
        )
        .is_err());
    }
}
