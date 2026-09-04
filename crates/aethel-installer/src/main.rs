#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use aethel_installer::commands::*;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            select_install_folder,
            validate_install_path,
            check_disk_space,
            check_installer_version,
            cancel_installation,
            launch_application,
            start_installation,
            get_default_install_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aethel Installer application");
}
