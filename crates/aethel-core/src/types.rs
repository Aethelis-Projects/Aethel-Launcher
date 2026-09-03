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
}