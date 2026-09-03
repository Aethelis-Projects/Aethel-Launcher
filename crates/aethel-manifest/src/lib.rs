use aethel_core::{AppError, AppErrorCode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Latest versions in the version manifest.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LatestVersion {
    pub release: String,
    pub snapshot: String,
}

/// An entry in the version manifest list.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VersionManifestEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub url: String,
    pub time: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
    pub sha1: String,
    #[serde(rename = "complianceLevel")]
    pub compliance_level: Option<u32>,
}

/// The root Mojang `version_manifest_v2.json` payload.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VersionManifestV2 {
    pub latest: LatestVersion,
    pub versions: Vec<VersionManifestEntry>,
}

impl VersionManifestV2 {
    pub fn parse(json_str: &str) -> Result<Self, AppError> {
        serde_json::from_str(json_str).map_err(|e| {
            AppError::new(
                AppErrorCode::InvalidManifest,
                format!("Failed to parse version manifest v2: {e}"),
            )
        })
    }
}

/// Reference to an asset index within a version package.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AssetIndexRef {
    pub id: String,
    pub sha1: String,
    pub size: u64,
    #[serde(rename = "totalSize")]
    pub total_size: u64,
    pub url: String,
}

/// Java version recommendation from version manifest.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct JavaVersionRef {
    pub component: String,
    #[serde(rename = "majorVersion")]
    pub major_version: u32,
}

/// An individual download artifact.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ArtifactDownload {
    pub path: Option<String>,
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

/// Version downloads including client, server, and mappings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VersionDownloads {
    pub client: ArtifactDownload,
    #[serde(rename = "client_mappings")]
    pub client_mappings: Option<ArtifactDownload>,
    pub server: Option<ArtifactDownload>,
    #[serde(rename = "server_mappings")]
    pub server_mappings: Option<ArtifactDownload>,
}

/// Extraction rule excluding meta files.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExtractRule {
    pub exclude: Option<Vec<String>>,
}

/// Library downloads container.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct LibraryDownloads {
    pub artifact: Option<ArtifactDownload>,
    pub classifiers: Option<HashMap<String, ArtifactDownload>>,
}

/// OS rule constraint.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OsRule {
    pub name: Option<String>,
    pub arch: Option<String>,
    pub version: Option<String>,
}

/// Evaluation rule for libraries and arguments.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Rule {
    pub action: String,
    pub os: Option<OsRule>,
    pub features: Option<HashMap<String, bool>>,
}

/// Context of the current operating system and environment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OsContext {
    pub name: String, // "windows", "linux", "osx"
    pub arch: String, // "x86", "x86_64", "arm64"
    pub features: HashMap<String, bool>,
}

impl OsContext {
    pub fn current() -> Self {
        let name = if cfg!(target_os = "windows") {
            "windows"
        } else if cfg!(target_os = "macos") {
            "osx"
        } else {
            "linux"
        };

        let arch = if cfg!(target_arch = "x86_64") {
            "x86_64"
        } else if cfg!(target_arch = "aarch64") {
            "arm64"
        } else {
            "x86"
        };

        Self {
            name: name.to_string(),
            arch: arch.to_string(),
            features: HashMap::new(),
        }
    }

    pub fn new(name: &str, arch: &str) -> Self {
        Self {
            name: name.to_string(),
            arch: arch.to_string(),
            features: HashMap::new(),
        }
    }
}

/// Evaluates a list of Mojang rules.
pub fn evaluate_rules(rules: &[Rule], ctx: &OsContext) -> bool {
    if rules.is_empty() {
        return true;
    }

    let mut allowed = false;

    for rule in rules {
        let mut matches = true;

        if let Some(ref os_rule) = rule.os {
            if let Some(ref req_name) = os_rule.name {
                if req_name != &ctx.name {
                    matches = false;
                }
            }

            if let Some(ref req_arch) = os_rule.arch {
                if req_arch != &ctx.arch {
                    matches = false;
                }
            }
        }

        if let Some(ref req_features) = rule.features {
            for (key, &val) in req_features {
                if ctx.features.get(key).copied().unwrap_or(false) != val {
                    matches = false;
                    break;
                }
            }
        }

        if matches {
            allowed = rule.action == "allow";
        }
    }

    allowed
}

/// Library dependency declaration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Library {
    pub name: String,
    pub downloads: Option<LibraryDownloads>,
    pub rules: Option<Vec<Rule>>,
    pub natives: Option<HashMap<String, String>>,
    pub extract: Option<ExtractRule>,
}

impl Library {
    /// Determines whether this library should be included on the given target OS.
    pub fn is_applicable(&self, ctx: &OsContext) -> bool {
        match &self.rules {
            Some(rules) => evaluate_rules(rules, ctx),
            None => true,
        }
    }

    /// Returns the main artifact download for this library.
    pub fn get_artifact(&self) -> Option<&ArtifactDownload> {
        self.downloads.as_ref().and_then(|d| d.artifact.as_ref())
    }

    /// Resolves the native classifier artifact for the target OS context.
    pub fn get_native_classifier(&self, ctx: &OsContext) -> Option<&ArtifactDownload> {
        let natives = self.natives.as_ref()?;
        let classifier_template = natives.get(&ctx.name)?;

        // Expand classifier template (e.g. natives-windows-${arch} -> natives-windows-64)
        let arch_suffix = if ctx.arch == "x86_64" {
            "64"
        } else if ctx.arch == "x86" {
            "32"
        } else {
            "arm64"
        };
        let classifier_key = classifier_template.replace("${arch}", arch_suffix);

        self.downloads
            .as_ref()
            .and_then(|d| d.classifiers.as_ref())
            .and_then(|c| c.get(&classifier_key))
    }
}

/// An argument entry which can either be a simple string or a rule-conditional argument.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(untagged)]
pub enum ArgumentValue {
    Simple(String),
    Multiple(Vec<String>),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConditionalArgument {
    pub rules: Vec<Rule>,
    pub value: ArgumentValue,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(untagged)]
pub enum ArgumentEntry {
    Plain(String),
    Conditional(ConditionalArgument),
}

impl ArgumentEntry {
    pub fn evaluate(&self, ctx: &OsContext) -> Vec<String> {
        match self {
            ArgumentEntry::Plain(s) => vec![s.clone()],
            ArgumentEntry::Conditional(c) => {
                if evaluate_rules(&c.rules, ctx) {
                    match &c.value {
                        ArgumentValue::Simple(s) => vec![s.clone()],
                        ArgumentValue::Multiple(v) => v.clone(),
                    }
                } else {
                    vec![]
                }
            }
        }
    }
}

/// Container for modern game and JVM arguments.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct Arguments {
    #[serde(default)]
    pub game: Vec<ArgumentEntry>,
    #[serde(default)]
    pub jvm: Vec<ArgumentEntry>,
}

/// Full version package manifest (e.g. 1.7.10.json, 1.20.4.json).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VersionPackage {
    pub id: String,
    #[serde(rename = "mainClass")]
    pub main_class: String,
    #[serde(rename = "minecraftArguments")]
    pub minecraft_arguments: Option<String>,
    pub arguments: Option<Arguments>,
    pub libraries: Vec<Library>,
    #[serde(rename = "assetIndex")]
    pub asset_index: Option<AssetIndexRef>,
    pub assets: Option<String>,
    pub downloads: Option<VersionDownloads>,
    #[serde(rename = "javaVersion")]
    pub java_version: Option<JavaVersionRef>,
}

/// Parses a legacy `minecraftArguments` space-delimited string with quote handling.
pub fn parse_legacy_args(s: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;

    for ch in s.chars() {
        match ch {
            '"' => {
                in_quotes = !in_quotes;
            }
            ' ' if !in_quotes => {
                if !current.is_empty() {
                    args.push(current.clone());
                    current.clear();
                }
            }
            _ => {
                current.push(ch);
            }
        }
    }

    if !current.is_empty() {
        args.push(current);
    }

    args
}

impl VersionPackage {
    pub fn parse(json_str: &str) -> Result<Self, AppError> {
        serde_json::from_str(json_str).map_err(|e| {
            AppError::new(
                AppErrorCode::InvalidManifest,
                format!("Failed to parse version package JSON: {e}"),
            )
        })
    }

    /// Evaluates and returns game arguments for the specified OS context.
    pub fn game_arguments(&self, ctx: &OsContext) -> Vec<String> {
        if let Some(ref legacy) = self.minecraft_arguments {
            parse_legacy_args(legacy)
        } else if let Some(ref args) = self.arguments {
            args.game
                .iter()
                .flat_map(|entry| entry.evaluate(ctx))
                .collect()
        } else {
            Vec::new()
        }
    }

    /// Evaluates and returns JVM arguments for the specified OS context.
    pub fn jvm_arguments(&self, ctx: &OsContext) -> Vec<String> {
        if let Some(ref args) = self.arguments {
            args.jvm
                .iter()
                .flat_map(|entry| entry.evaluate(ctx))
                .collect()
        } else {
            // Default JVM arguments for older legacy versions (pre-1.13)
            vec![
                "-Djava.library.path=${natives_directory}".to_string(),
                "-cp".to_string(),
                "${classpath}".to_string(),
            ]
        }
    }

    /// Returns all applicable libraries for the given OS context.
    pub fn applicable_libraries(&self, ctx: &OsContext) -> Vec<&Library> {
        self.libraries
            .iter()
            .filter(|lib| lib.is_applicable(ctx))
            .collect()
    }
}

/// An object descriptor inside the asset index.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

/// Full asset index file (e.g. `12.json` for 1.20.4).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AssetIndex {
    pub objects: HashMap<String, AssetObject>,
}

impl AssetIndex {
    pub fn parse(json_str: &str) -> Result<Self, AppError> {
        serde_json::from_str(json_str).map_err(|e| {
            AppError::new(
                AppErrorCode::InvalidManifest,
                format!("Failed to parse asset index: {e}"),
            )
        })
    }
}

/// Task descriptor for downloading a game asset.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssetDownloadTask {
    pub logical_path: String,
    pub hash: String,
    pub size: u64,
    pub target_base_dir: PathBuf,
}

impl AssetDownloadTask {
    pub fn new(
        logical_path: impl Into<String>,
        hash: impl Into<String>,
        size: u64,
        target_base_dir: impl AsRef<Path>,
    ) -> Self {
        Self {
            logical_path: logical_path.into(),
            hash: hash.into(),
            size,
            target_base_dir: target_base_dir.as_ref().to_path_buf(),
        }
    }

    /// Computes the standard Minecraft physical asset path: `assets/objects/<hash[0:2]>/<full_hash>`.
    pub fn physical_path(&self) -> PathBuf {
        let prefix = &self.hash[..2.min(self.hash.len())];
        self.target_base_dir
            .join("objects")
            .join(prefix)
            .join(&self.hash)
    }

    /// Standard Mojang CDN URL for the asset.
    pub fn url(&self) -> String {
        let prefix = &self.hash[..2.min(self.hash.len())];
        format!(
            "https://resources.download.minecraft.net/{prefix}/{}",
            self.hash
        )
    }
}
