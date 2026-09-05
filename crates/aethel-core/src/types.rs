use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub game_version: String,
    pub loader: Option<String>,
    pub loader_version: Option<String>,
    pub java_path: Option<String>,
    pub memory_min_mb: Option<u32>,
    pub memory_max_mb: Option<u32>,
    pub jvm_args: Option<String>,
    pub last_played_at: Option<String>,
    pub total_playtime_seconds: u64,
    pub icon_path: Option<String>,
    pub banner_path: Option<String>,
    pub created_at: String,
    pub last_mclo_gs_url: Option<String>,
    pub last_mclo_gs_at: Option<String>,
    pub settings_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct GlobalSettings {
    pub theme: String,
    pub discord_rpc_enabled: bool,
    pub update_channel: String,
    pub default_java_path: Option<String>,
    pub default_java_mode: String,
    pub default_java_provider: String,
    #[deprecated(note = "RAM allocation is exclusively configured per-instance")]
    pub default_memory_min_mb: u32,
    #[deprecated(note = "RAM allocation is exclusively configured per-instance")]
    pub default_memory_max_mb: u32,
    pub default_gc_preset: String,
    pub default_jvm_args: Option<String>,
}

impl Default for GlobalSettings {
    fn default() -> Self {
        #[allow(deprecated)]
        Self {
            theme: "dark".to_string(),
            discord_rpc_enabled: false,
            update_channel: "stable".to_string(),
            default_java_path: None,
            default_java_mode: "auto".to_string(),
            default_java_provider: "Adoptium".to_string(),
            default_memory_min_mb: 1024,
            default_memory_max_mb: 4096,
            default_gc_preset: "G1GC".to_string(),
            default_jvm_args: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default, Type)]
pub struct InstanceSettings {
    pub java_path: Option<String>,
    pub memory_min_mb: Option<u32>,
    pub memory_max_mb: Option<u32>,
    pub gc_preset: Option<String>,
    pub jvm_args: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct EffectiveInstanceSettings {
    pub java_path: Option<String>,
    pub memory_min_mb: u32,
    pub memory_max_mb: u32,
    pub gc_preset: String,
    pub jvm_args: Option<String>,
    pub has_overrides: bool,
}

impl InstanceSettings {
    pub fn resolve(&self, global: &GlobalSettings) -> EffectiveInstanceSettings {
        let has_overrides = self.java_path.is_some()
            || self.memory_min_mb.is_some()
            || self.memory_max_mb.is_some()
            || self.gc_preset.is_some()
            || self.jvm_args.is_some();

        EffectiveInstanceSettings {
            java_path: self
                .java_path
                .clone()
                .or_else(|| global.default_java_path.clone()),
            memory_min_mb: self.memory_min_mb.unwrap_or(1024),
            memory_max_mb: self.memory_max_mb.unwrap_or(4096),
            gc_preset: self
                .gc_preset
                .clone()
                .unwrap_or_else(|| global.default_gc_preset.clone()),
            jvm_args: self
                .jvm_args
                .clone()
                .or_else(|| global.default_jvm_args.clone()),
            has_overrides,
        }
    }
}

impl Instance {
    pub fn settings(&self) -> InstanceSettings {
        if let Some(ref json) = self.settings_json {
            if let Ok(s) = serde_json::from_str::<InstanceSettings>(json) {
                return s;
            }
        }
        InstanceSettings {
            java_path: self.java_path.clone(),
            memory_min_mb: self.memory_min_mb,
            memory_max_mb: self.memory_max_mb,
            gc_preset: None,
            jvm_args: self.jvm_args.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AccountMetadata {
    pub uuid: String,
    pub username: String,
    pub account_type: String,
    pub skin_url: Option<String>,
    pub cape_url: Option<String>,
    pub server_url: Option<String>,
    pub last_used_at: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct JavaInfo {
    pub path: std::path::PathBuf,
    pub version: String,
    pub major: u32,
    pub arch: String,
    pub vendor: Option<String>,
    pub is_system: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum CrashPattern {
    OutOfMemory,
    ClassNotFound(String),
    NoClassDefFound(String),
    UnsatisfiedLink(String),
    WrongJavaVersion { expected: u32, actual: Option<u32> },
    GpuDriverIssue,
    ModConflict(String),
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CrashReport {
    pub pattern: CrashPattern,
    pub diagnosis: String,
    pub suggestion: String,
    pub full_log: String,
    pub exit_code: Option<i32>,
    pub upload_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ResourcePackEntry {
    pub file_name: String,
    pub name: String,
    pub description: Option<String>,
    pub icon_base64: Option<String>,
    pub is_enabled: bool,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ShaderPackEntry {
    pub file_name: String,
    pub name: String,
    pub is_active: bool,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct WorldEntry {
    pub folder_name: String,
    pub level_name: String,
    pub seed: Option<i64>,
    pub last_played: Option<u64>,
    pub game_mode: Option<String>,
    pub size_bytes: u64,
    pub icon_base64: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ModpackInspectResult {
    pub name: String,
    pub version: String,
    pub summary: Option<String>,
    pub game_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub file_count: usize,
    pub author: Option<String>,
    pub icon_base64: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ModpackSearchResult {
    pub provider: String,
    pub project_id: String,
    pub title: String,
    pub summary: String,
    pub author: String,
    pub downloads: u64,
    pub icon_url: Option<String>,
    pub categories: Vec<String>,
    pub latest_version: Option<String>,
    pub supported_game_versions: Vec<String>,
}

#[cfg(test)]
#[allow(deprecated)]
mod tests {
    use super::*;

    #[test]
    fn test_all_inherits_when_no_overrides() {
        let global = GlobalSettings {
            default_memory_max_mb: 4096,
            ..Default::default()
        };
        let instance = InstanceSettings::default(); // all None
        let effective = instance.resolve(&global);
        assert_eq!(effective.memory_max_mb, 4096);
        assert_eq!(effective.memory_min_mb, 1024);
        assert_eq!(effective.gc_preset, "G1GC");
        assert!(!effective.has_overrides);
    }

    #[test]
    fn test_all_overrides_when_all_set() {
        let global = GlobalSettings {
            default_memory_max_mb: 4096,
            ..Default::default()
        };
        let instance = InstanceSettings {
            java_path: Some("C:/custom/java.exe".to_string()),
            memory_min_mb: Some(2048),
            memory_max_mb: Some(8192),
            gc_preset: Some("ZGC".to_string()),
            jvm_args: Some("-XX:+UseZGC".to_string()),
        };
        let effective = instance.resolve(&global);
        assert_eq!(effective.memory_max_mb, 8192);
        assert_eq!(effective.memory_min_mb, 2048);
        assert_eq!(effective.java_path.as_deref(), Some("C:/custom/java.exe"));
        assert_eq!(effective.gc_preset, "ZGC");
        assert_eq!(effective.jvm_args.as_deref(), Some("-XX:+UseZGC"));
        assert!(effective.has_overrides);
    }

    #[test]
    fn test_mixed_inherits_and_overrides() {
        let global = GlobalSettings {
            default_memory_max_mb: 4096,
            default_gc_preset: "G1GC".to_string(),
            ..Default::default()
        };
        let instance = InstanceSettings {
            memory_max_mb: Some(8192), // override
            gc_preset: None,           // inherit
            ..Default::default()
        };
        let effective = instance.resolve(&global);
        assert_eq!(effective.memory_max_mb, 8192);
        assert_eq!(effective.gc_preset, "G1GC");
        assert!(effective.has_overrides);
    }

    #[test]
    fn test_instance_settings_fallback_from_legacy_fields() {
        let inst = Instance {
            id: "legacy-1".to_string(),
            name: "Legacy".to_string(),
            game_version: "1.20.4".to_string(),
            loader: None,
            loader_version: None,
            java_path: Some("javaw.exe".to_string()),
            memory_min_mb: Some(512),
            memory_max_mb: Some(2048),
            jvm_args: Some("-Xnoclassgc".to_string()),
            last_played_at: None,
            total_playtime_seconds: 0,
            icon_path: None,
            banner_path: None,
            created_at: "now".to_string(),
            last_mclo_gs_url: None,
            last_mclo_gs_at: None,
            settings_json: None,
        };

        let settings = inst.settings();
        assert_eq!(settings.java_path.as_deref(), Some("javaw.exe"));
        assert_eq!(settings.memory_min_mb, Some(512));
        assert_eq!(settings.memory_max_mb, Some(2048));
        assert_eq!(settings.jvm_args.as_deref(), Some("-Xnoclassgc"));
    }
}
