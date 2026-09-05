#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(debug_assertions)]
use specta_typescript::{BigIntExportBehavior, Typescript};
use std::path::PathBuf;
use tauri::Manager;

use aethel_launch::{build_launch_receipt, JavaVersion, LaunchConfiguration};
use aethel_manifest::VersionPackage;

fn handle_dry_run(is_json: bool) {
    let fixture = include_str!("../../crates/aethel-manifest/tests/fixtures/1.20.4.json");
    let pkg = VersionPackage::parse(fixture).expect("Failed to parse fixture 1.20.4");

    let config = LaunchConfiguration {
        java_path: PathBuf::from("C:/java/bin/javaw.exe"),
        java_version: JavaVersion::V21,
        game_dir: PathBuf::from("C:/aethel/instances/1.20.4"),
        assets_dir: PathBuf::from("C:/aethel/assets"),
        natives_dir: PathBuf::from("C:/aethel/instances/1.20.4/natives"),
        version_package: pkg,
        classpath_entries: vec![
            PathBuf::from("C:/aethel/libraries/client.jar"),
            PathBuf::from("C:/aethel/libraries/lwjgl.jar"),
        ],
        player_name: "Steve".to_string(),
        player_uuid: "5627dd98-e6be-3c21-b8a8-e92344183641".to_string(),
        auth_access_token: "dry-run-token".to_string(),
        user_type: "mojang".to_string(),
        memory_min_mb: Some(1024),
        memory_max_mb: Some(4096),
        custom_jvm_args: Some(vec!["-XX:+UseG1GC".to_string()]),
    };

    match build_launch_receipt(&config, None) {
        Ok(receipt) => {
            if is_json {
                println!("{}", serde_json::to_string_pretty(&receipt).unwrap());
            } else {
                println!("=== Aethel Launcher Dry Run Receipt ===");
                println!("Command: {}", receipt.command);
                println!("Classpath Tier: {}", receipt.classpath_tier);
                println!("Arguments ({} total):", receipt.arguments.len());
                for arg in &receipt.arguments {
                    println!("  {arg}");
                }
            }
        }
        Err(e) => {
            eprintln!("Dry run error: {e}");
            std::process::exit(1);
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--dry-run") {
        let is_json = args.iter().any(|a| a == "--json");
        handle_dry_run(is_json);
        return;
    }

    let builder = aethel_tauri::create_specta_builder();

    let bindings_path = if std::path::Path::new("src/bindings.ts").exists()
        || std::path::Path::new("src").is_dir()
    {
        "src/bindings.ts"
    } else {
        "../src/bindings.ts"
    };

    if args.iter().any(|a| a == "--export-bindings") {
        builder
            .export(
                specta_typescript::Typescript::default()
                    .bigint(specta_typescript::BigIntExportBehavior::Number),
                bindings_path,
            )
            .expect("Failed to export TypeScript bindings");
        println!("TypeScript bindings successfully exported to {bindings_path}");
        return;
    }

    #[cfg(debug_assertions)]
    builder
        .export(
            Typescript::default().bigint(BigIntExportBehavior::Number),
            bindings_path,
        )
        .expect("Failed to export TypeScript bindings");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
