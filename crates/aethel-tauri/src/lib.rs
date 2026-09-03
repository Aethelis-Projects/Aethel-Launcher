use aethel_auth::generate_offline_uuid;
use aethel_core::{BackendEvent, Instance};
use aethel_launch::{build_launch_receipt, JavaVersion, LaunchConfiguration, LaunchReceipt};
use aethel_manifest::VersionPackage;
use std::path::PathBuf;

#[tauri::command]
#[specta::specta]
fn get_launcher_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
#[specta::specta]
fn get_offline_uuid(username: String) -> String {
    generate_offline_uuid(&username).to_string()
}

#[tauri::command]
#[specta::specta]
fn get_instances() -> Result<Vec<Instance>, String> {
    Ok(vec![])
}

#[tauri::command]
#[specta::specta]
fn get_launch_receipt(game_version: String, username: String) -> Result<LaunchReceipt, String> {
    let fixture = include_str!("../../aethel-manifest/tests/fixtures/1.20.4.json");
    let pkg = VersionPackage::parse(fixture).map_err(|e| e.to_string())?;
    let offline_uuid = generate_offline_uuid(&username).to_string();

    let config = LaunchConfiguration {
        java_path: PathBuf::from("javaw.exe"),
        java_version: JavaVersion::V21,
        game_dir: PathBuf::from(format!("instances/{game_version}")),
        assets_dir: PathBuf::from("assets"),
        natives_dir: PathBuf::from(format!("instances/{game_version}/natives")),
        version_package: pkg,
        classpath_entries: vec![
            PathBuf::from("libraries/client.jar"),
            PathBuf::from("libraries/lwjgl.jar"),
        ],
        player_name: username,
        player_uuid: offline_uuid,
        auth_access_token: "offline-token".to_string(),
        user_type: "mojang".to_string(),
        memory_min_mb: Some(1024),
        memory_max_mb: Some(4096),
        custom_jvm_args: Some(vec!["-XX:+UseG1GC".to_string()]),
    };

    build_launch_receipt(&config, None).map_err(|e| e.to_string())
}

pub fn create_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .commands(tauri_specta::collect_commands![
            get_launcher_version,
            get_offline_uuid,
            get_instances,
            get_launch_receipt
        ])
        .events(tauri_specta::collect_events![BackendEvent])
}
