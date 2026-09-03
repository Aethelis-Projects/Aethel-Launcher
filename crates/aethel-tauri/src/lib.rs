use aethel_auth::generate_offline_uuid;
use aethel_core::{BackendEvent, Instance};

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

pub fn create_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .commands(tauri_specta::collect_commands![
            get_launcher_version,
            get_offline_uuid,
            get_instances
        ])
        .events(tauri_specta::collect_events![BackendEvent])
}

