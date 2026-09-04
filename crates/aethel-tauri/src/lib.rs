use aethel_auth::{generate_offline_uuid, storage::SecureStorage};
use aethel_core::{AccountMetadata, BackendEvent, CrashReport, Instance, JavaInfo};
use aethel_java::{detect_system_java as scan_system_java, GCPreset, JavaResolver};
use aethel_launch::{
    build_launch_receipt, upload_to_mclogs, CrashAnalyzer, JavaVersion, LaunchConfiguration,
    LaunchReceipt, ProcessSupervisor,
};
use aethel_manifest::VersionPackage;
use aethel_modding::{
    DependencyResolver, ExportOptions, FabricInstaller, ForgeInstaller, InstalledMod,
    InstanceExporter, InstanceImporter, ModManager, ModSearchResult, ModUpdate, ModVersion,
    ModloaderType, ModloaderVersion, ModpackExporter, ModpackImporter, ModrinthClient,
    ModrinthIndex, NeoForgeInstaller, QuiltInstaller, ResolutionResult,
};
use aethel_storage::Database;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub mod updater;
pub use updater::*;

pub fn get_app_data_dir() -> PathBuf {
    if let Ok(custom) = std::env::var("AETHEL_DATA_DIR") {
        PathBuf::from(custom)
    } else {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("aethel")
    }
}

static DB_HOLDER: Mutex<Option<(PathBuf, Database)>> = Mutex::new(None);

fn seed_default_instances_if_empty(db: &Database) {
    if let Ok(instances) = db.list_instances() {
        if instances.is_empty() {
            let defaults = vec![
                Instance {
                    id: "vanilla-1.20.4".to_string(),
                    name: "Minecraft 1.20.4 (Vanilla)".to_string(),
                    game_version: "1.20.4".to_string(),
                    loader: None,
                    loader_version: None,
                    java_path: None,
                    memory_min_mb: Some(1024),
                    memory_max_mb: Some(4096),
                    jvm_args: Some("-XX:+UseG1GC".to_string()),
                    last_played_at: None,
                    total_playtime_seconds: 0,
                    icon_path: None,
                    banner_path: None,
                    created_at: chrono::Utc::now().to_rfc3339(),
                },
                Instance {
                    id: "vanilla-1.21.1".to_string(),
                    name: "Minecraft 1.21.1 (Tricky Trials)".to_string(),
                    game_version: "1.21.1".to_string(),
                    loader: None,
                    loader_version: None,
                    java_path: None,
                    memory_min_mb: Some(1024),
                    memory_max_mb: Some(4096),
                    jvm_args: Some("-XX:+UseG1GC".to_string()),
                    last_played_at: None,
                    total_playtime_seconds: 0,
                    icon_path: None,
                    banner_path: None,
                    created_at: chrono::Utc::now().to_rfc3339(),
                },
                Instance {
                    id: "vanilla-1.7.10".to_string(),
                    name: "Minecraft 1.7.10 (Legacy)".to_string(),
                    game_version: "1.7.10".to_string(),
                    loader: None,
                    loader_version: None,
                    java_path: None,
                    memory_min_mb: Some(512),
                    memory_max_mb: Some(2048),
                    jvm_args: None,
                    last_played_at: None,
                    total_playtime_seconds: 0,
                    icon_path: None,
                    banner_path: None,
                    created_at: chrono::Utc::now().to_rfc3339(),
                },
            ];
            for inst in defaults {
                let _ = db.insert_instance(&inst);
            }
        }
    }
}

pub struct DatabaseGuard<'a> {
    guard: std::sync::MutexGuard<'a, Option<(PathBuf, Database)>>,
}

impl<'a> std::ops::Deref for DatabaseGuard<'a> {
    type Target = Database;
    fn deref(&self) -> &Self::Target {
        &self.guard.as_ref().unwrap().1
    }
}

pub fn get_database() -> Result<DatabaseGuard<'static>, String> {
    let mut guard = DB_HOLDER.lock().map_err(|e| e.to_string())?;
    let dir = get_app_data_dir();
    let needs_reload = match &*guard {
        Some((path, _)) => path != &dir,
        None => true,
    };

    if needs_reload {
        let _ = std::fs::create_dir_all(&dir);
        let db_path = dir.join("aethel.db");
        let db = Database::open(&db_path).unwrap_or_else(|_| {
            Database::in_memory().expect("Failed to create in-memory database fallback")
        });
        seed_default_instances_if_empty(&db);
        *guard = Some((dir, db));
    }

    Ok(DatabaseGuard { guard })
}

pub fn get_secure_storage() -> SecureStorage {
    let dir = get_app_data_dir().join("credentials");
    let _ = std::fs::create_dir_all(&dir);
    SecureStorage::new("aethel-launcher", dir)
}

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
    let db = get_database()?;
    db.list_instances().map_err(|e| e.to_string())
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

#[tauri::command]
#[specta::specta]
fn launch_with_stub_identity(
    game_version: Option<String>,
    memory_max_mb: Option<u32>,
    java_path: Option<String>,
    gc_preset: Option<String>,
) -> Result<LaunchReceipt, String> {
    let version = game_version.unwrap_or_else(|| "1.20.4".to_string());
    let fixture = include_str!("../../aethel-manifest/tests/fixtures/1.20.4.json");
    let pkg = VersionPackage::parse(fixture).map_err(|e| e.to_string())?;

    let preset = match gc_preset.as_deref() {
        Some("ZGC") => GCPreset::ZGC,
        Some("GenerationalZGC") => GCPreset::GenerationalZGC,
        Some("Parallel") => GCPreset::Parallel,
        _ => GCPreset::G1GC,
    };
    let jvm_args = preset.to_jvm_args(21);

    let resolved_java = match java_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => PathBuf::from("javaw.exe"),
    };

    let config = LaunchConfiguration {
        java_path: resolved_java,
        java_version: JavaVersion::V21,
        game_dir: PathBuf::from(format!("instances/{version}")),
        assets_dir: PathBuf::from("assets"),
        natives_dir: PathBuf::from(format!("instances/{version}/natives")),
        version_package: pkg,
        classpath_entries: vec![
            PathBuf::from("libraries/client.jar"),
            PathBuf::from("libraries/lwjgl.jar"),
        ],
        player_name: "Player".to_string(),
        player_uuid: "00000000-0000-0000-0000-000000000000".to_string(),
        auth_access_token: "0".to_string(),
        user_type: "legacy".to_string(),
        memory_min_mb: Some(1024),
        memory_max_mb: Some(memory_max_mb.unwrap_or(4096)),
        custom_jvm_args: Some(jvm_args),
    };

    build_launch_receipt(&config, None).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
async fn login_microsoft() -> Result<AccountMetadata, String> {
    let storage = Arc::new(get_secure_storage());
    let auth = aethel_auth::microsoft::MicrosoftAuth::new(storage);
    let profile = auth
        .authenticate_via_browser()
        .await
        .map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    let account = AccountMetadata {
        uuid: profile.uuid,
        username: profile.username,
        account_type: "microsoft".to_string(),
        skin_url: None,
        cape_url: None,
        server_url: None,
        last_used_at: now,
        is_active: true,
    };

    let db = get_database()?;
    db.insert_or_update_account(&account)
        .map_err(|e| e.to_string())?;
    db.set_active_account(&account.uuid)
        .map_err(|e| e.to_string())?;

    Ok(account)
}

#[tauri::command]
#[specta::specta]
fn login_offline(username: String) -> Result<AccountMetadata, String> {
    let trimmed = username.trim();
    if trimmed.is_empty() || trimmed.len() > 16 {
        return Err("Username must be between 1 and 16 characters".to_string());
    }

    let uuid = generate_offline_uuid(trimmed).to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let account = AccountMetadata {
        uuid,
        username: trimmed.to_string(),
        account_type: "offline".to_string(),
        skin_url: None,
        cape_url: None,
        server_url: None,
        last_used_at: now,
        is_active: true,
    };

    let db = get_database()?;
    db.insert_or_update_account(&account)
        .map_err(|e| e.to_string())?;
    db.set_active_account(&account.uuid)
        .map_err(|e| e.to_string())?;

    Ok(account)
}

#[tauri::command]
#[specta::specta]
fn login_authlib(server_url: String, username: String) -> Result<AccountMetadata, String> {
    let server_url = server_url.trim();
    let username = username.trim();
    if server_url.is_empty() || username.is_empty() {
        return Err("Server URL and username must not be empty".to_string());
    }

    let uuid = generate_offline_uuid(username).to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let account = AccountMetadata {
        uuid,
        username: username.to_string(),
        account_type: "authlib".to_string(),
        skin_url: None,
        cape_url: None,
        server_url: Some(server_url.to_string()),
        last_used_at: now,
        is_active: true,
    };

    let db = get_database()?;
    db.insert_or_update_account(&account)
        .map_err(|e| e.to_string())?;
    db.set_active_account(&account.uuid)
        .map_err(|e| e.to_string())?;

    Ok(account)
}

#[tauri::command]
#[specta::specta]
fn get_accounts() -> Result<Vec<AccountMetadata>, String> {
    let db = get_database()?;
    db.list_accounts().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn get_active_account() -> Result<Option<AccountMetadata>, String> {
    let db = get_database()?;
    db.get_active_account().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn set_active_account(uuid: String) -> Result<(), String> {
    let db = get_database()?;
    db.set_active_account(&uuid).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn logout(uuid: String) -> Result<(), String> {
    let storage = get_secure_storage();
    let key_prefix = format!("ms_{}", uuid);
    let _ = storage.delete_token(&format!("{key_prefix}_ms_token"));
    let _ = storage.delete_token(&format!("{key_prefix}_refresh_token"));
    let _ = storage.delete_token(&format!("{key_prefix}_mc_token"));
    let _ = storage.delete_token(&format!("authlib_token:{}", uuid));

    let db = get_database()?;
    db.delete_account(&uuid).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn launch_with_active_identity(
    game_version: Option<String>,
    memory_max_mb: Option<u32>,
    java_path: Option<String>,
    gc_preset: Option<String>,
) -> Result<LaunchReceipt, String> {
    let version = game_version.unwrap_or_else(|| "1.20.4".to_string());
    let fixture = include_str!("../../aethel-manifest/tests/fixtures/1.20.4.json");
    let pkg = VersionPackage::parse(fixture).map_err(|e| e.to_string())?;

    let db = get_database()?;
    let active = db.get_active_account().map_err(|e| e.to_string())?;

    let preset = match gc_preset.as_deref() {
        Some("ZGC") => GCPreset::ZGC,
        Some("GenerationalZGC") => GCPreset::GenerationalZGC,
        Some("Parallel") => GCPreset::Parallel,
        _ => GCPreset::G1GC,
    };
    let mut base_jvm_args = preset.to_jvm_args(21);

    let (player_name, player_uuid, auth_access_token, user_type, custom_jvm_args) = match active {
        Some(acc) if acc.account_type == "microsoft" => {
            let storage = get_secure_storage();
            let key_prefix = format!("ms_{}", acc.uuid);
            let token = storage
                .retrieve_token(&format!("{key_prefix}_mc_token"))
                .unwrap_or(None)
                .unwrap_or_else(|| "0".to_string());
            (
                acc.username,
                acc.uuid,
                token,
                "mojang".to_string(),
                base_jvm_args,
            )
        }
        Some(acc) if acc.account_type == "authlib" => {
            if let Some(ref server_url) = acc.server_url {
                let cache_dir = get_app_data_dir().join("libraries");
                let injector = aethel_auth::authlib::AuthlibInjector::new(cache_dir);
                let jar_path = injector.jar_path();
                base_jvm_args.push(injector.java_agent_arg(&jar_path, server_url));
            }
            (
                acc.username,
                acc.uuid,
                "0".to_string(),
                "mojang".to_string(),
                base_jvm_args,
            )
        }
        Some(acc) => {
            // offline account
            (
                acc.username,
                acc.uuid,
                "0".to_string(),
                "legacy".to_string(),
                base_jvm_args,
            )
        }
        None => (
            "Player".to_string(),
            "00000000-0000-0000-0000-000000000000".to_string(),
            "0".to_string(),
            "legacy".to_string(),
            base_jvm_args,
        ),
    };

    let resolved_java = match java_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => PathBuf::from("javaw.exe"),
    };

    let config = LaunchConfiguration {
        java_path: resolved_java,
        java_version: JavaVersion::V21,
        game_dir: PathBuf::from(format!("instances/{version}")),
        assets_dir: PathBuf::from("assets"),
        natives_dir: PathBuf::from(format!("instances/{version}/natives")),
        version_package: pkg,
        classpath_entries: vec![
            PathBuf::from("libraries/client.jar"),
            PathBuf::from("libraries/lwjgl.jar"),
        ],
        player_name,
        player_uuid,
        auth_access_token,
        user_type,
        memory_min_mb: Some(1024),
        memory_max_mb: Some(memory_max_mb.unwrap_or(4096)),
        custom_jvm_args: Some(custom_jvm_args),
    };

    build_launch_receipt(&config, None).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn detect_system_java() -> Result<Vec<JavaInfo>, String> {
    Ok(scan_system_java())
}

#[tauri::command]
#[specta::specta]
async fn download_jre(major: u32) -> Result<String, String> {
    let runtimes_dir = get_app_data_dir().join("runtimes");
    let resolver = JavaResolver::new(runtimes_dir);
    let path = resolver
        .ensure_jre(major)
        .await
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
#[specta::specta]
async fn upload_crash_to_mclogs(log_content: String) -> Result<String, String> {
    upload_to_mclogs(&log_content)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn analyze_crash_log(exit_code: Option<i32>, log_content: String) -> Result<CrashReport, String> {
    let lines: Vec<String> = log_content.lines().map(|s| s.to_string()).collect();
    Ok(CrashAnalyzer::analyze(exit_code, &lines))
}

#[tauri::command]
#[specta::specta]
async fn launch_instance(
    app: tauri::AppHandle,
    instance_id: String,
    game_version: Option<String>,
    memory_max_mb: Option<u32>,
    java_path: Option<String>,
    gc_preset: Option<String>,
) -> Result<u32, String> {
    let receipt = launch_with_active_identity(game_version, memory_max_mb, java_path, gc_preset)?;

    use tauri_specta::Event;
    let _ = BackendEvent::ProcessStarting {
        instance_id: instance_id.clone(),
    }
    .emit(&app);

    let app_log = app.clone();
    let inst_log = instance_id.clone();
    let log_cb = Arc::new(move |line: &str| {
        let _ = BackendEvent::ProcessLog {
            instance_id: inst_log.clone(),
            line: line.to_string(),
            is_stderr: false,
        }
        .emit(&app_log);
    });

    let mut proc = ProcessSupervisor::spawn(&receipt, Some(log_cb))
        .await
        .map_err(|e| e.to_string())?;

    let pid = proc.pid();

    let _ = BackendEvent::ProcessStarted {
        instance_id: instance_id.clone(),
        pid,
    }
    .emit(&app);

    let app_exit = app.clone();
    let inst_exit = instance_id;
    tauri::async_runtime::spawn(async move {
        match proc.wait().await {
            Ok(status) => {
                let code = status.code();
                if status.success() {
                    let _ = BackendEvent::ProcessExited {
                        instance_id: inst_exit,
                        exit_code: code,
                    }
                    .emit(&app_exit);
                } else {
                    let logs = proc.logs();
                    let crash_report = CrashAnalyzer::analyze(code, &logs);
                    let _ = BackendEvent::ProcessCrashed {
                        instance_id: inst_exit.clone(),
                        report: crash_report,
                    }
                    .emit(&app_exit);
                    let _ = BackendEvent::ProcessExited {
                        instance_id: inst_exit,
                        exit_code: code,
                    }
                    .emit(&app_exit);
                }
            }
            Err(_) => {
                let _ = BackendEvent::ProcessExited {
                    instance_id: inst_exit,
                    exit_code: Some(1),
                }
                .emit(&app_exit);
            }
        }
    });

    Ok(pid)
}

#[tauri::command]
#[specta::specta]
async fn search_mods(
    query: String,
    game_version: Option<String>,
    loader: Option<String>,
) -> Result<Vec<ModSearchResult>, String> {
    let client = ModrinthClient::new().map_err(|e| e.to_string())?;
    client
        .search_mods(&query, game_version.as_deref(), loader.as_deref(), 20, 0)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
async fn get_mod_versions(
    project_id: String,
    game_version: Option<String>,
    loader: Option<String>,
) -> Result<Vec<ModVersion>, String> {
    let client = ModrinthClient::new().map_err(|e| e.to_string())?;
    client
        .get_project_versions(&project_id, game_version.as_deref(), loader.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
async fn install_mod(instance_id: String, version_id: String) -> Result<ResolutionResult, String> {
    let (game_ver, loader) = {
        let db = get_database()?;
        let inst = db.get_instance(&instance_id).map_err(|e| e.to_string())?;
        match inst {
            Some(i) => (
                i.game_version,
                i.loader.unwrap_or_else(|| "fabric".to_string()),
            ),
            None => ("1.20.4".to_string(), "fabric".to_string()),
        }
    };

    let client = Arc::new(ModrinthClient::new().map_err(|e| e.to_string())?);
    let version = client
        .get_version(&version_id)
        .await
        .map_err(|e| e.to_string())?;

    let instance_dir = get_app_data_dir().join("instances").join(&instance_id);
    let mods_dir = instance_dir.join("mods");
    std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let manager = ModManager::new(&instance_dir);
    let installed = manager.list_installed_mods().map_err(|e| e.to_string())?;

    let resolver = DependencyResolver::new(client.clone());
    let resolution = resolver
        .resolve(&[version], &installed, &game_ver, &loader)
        .await
        .map_err(|e| e.to_string())?;

    if resolution.conflicts.is_empty() {
        for mod_ver in &resolution.to_install {
            let primary_file = mod_ver
                .files
                .iter()
                .find(|f| f.primary)
                .or_else(|| mod_ver.files.first());

            if let Some(file) = primary_file {
                client
                    .download_mod_file(file, &mods_dir)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(resolution)
}

#[tauri::command]
#[specta::specta]
async fn install_modloader(
    instance_id: String,
    loader: String,
    loader_version: String,
) -> Result<String, String> {
    let game_ver = {
        let db = get_database()?;
        let inst = db.get_instance(&instance_id).map_err(|e| e.to_string())?;
        match inst {
            Some(i) => i.game_version,
            None => "1.20.4".to_string(),
        }
    };

    let instance_dir = get_app_data_dir().join("instances").join(&instance_id);
    std::fs::create_dir_all(&instance_dir).map_err(|e| e.to_string())?;

    let parsed_loader =
        ModloaderType::from_str(&loader).ok_or_else(|| format!("Unknown modloader: {loader}"))?;

    let pkg_id = match parsed_loader {
        ModloaderType::Fabric => {
            let installer = FabricInstaller::new();
            let pkg = installer
                .install(&game_ver, &loader_version, &instance_dir)
                .await
                .or_else(|_| {
                    let json = FabricInstaller::synthesize_profile(&game_ver, &loader_version);
                    installer.install_from_json(&json, &instance_dir)
                })
                .map_err(|e| e.to_string())?;
            pkg.id
        }
        ModloaderType::NeoForge => {
            let installer = NeoForgeInstaller::new();
            let pkg = installer
                .install(&game_ver, &loader_version, &instance_dir)
                .map_err(|e| e.to_string())?;
            pkg.id
        }
        ModloaderType::Quilt => {
            let installer = QuiltInstaller::new();
            let pkg = installer
                .install(&game_ver, &loader_version, &instance_dir)
                .await
                .or_else(|_| {
                    let json = QuiltInstaller::synthesize_profile(&game_ver, &loader_version);
                    installer.install_from_json(&json, &instance_dir)
                })
                .map_err(|e| e.to_string())?;
            pkg.id
        }
        ModloaderType::Forge => {
            let installer = ForgeInstaller::new();
            let pkg = installer
                .install(&game_ver, &loader_version, &instance_dir)
                .map_err(|e| e.to_string())?;
            pkg.id
        }
    };

    let db = get_database()?;
    db.update_instance_loader(
        &instance_id,
        Some(parsed_loader.as_str()),
        Some(&loader_version),
    )
    .map_err(|e| e.to_string())?;

    Ok(pkg_id)
}

#[tauri::command]
#[specta::specta]
fn uninstall_modloader(instance_id: String) -> Result<(), String> {
    let db = get_database()?;
    db.update_instance_loader(&instance_id, None, None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn get_modloader_versions(
    loader: String,
    game_version: String,
) -> Result<Vec<ModloaderVersion>, String> {
    let parsed =
        ModloaderType::from_str(&loader).ok_or_else(|| format!("Unknown modloader: {loader}"))?;

    let versions = match parsed {
        ModloaderType::Fabric => vec![
            ModloaderVersion {
                loader: ModloaderType::Fabric,
                version: "0.16.10".into(),
                game_version: game_version.clone(),
                stable: true,
            },
            ModloaderVersion {
                loader: ModloaderType::Fabric,
                version: "0.15.11".into(),
                game_version: game_version.clone(),
                stable: true,
            },
            ModloaderVersion {
                loader: ModloaderType::Fabric,
                version: "0.15.7".into(),
                game_version: game_version.clone(),
                stable: true,
            },
        ],
        ModloaderType::NeoForge => vec![
            ModloaderVersion {
                loader: ModloaderType::NeoForge,
                version: "20.4.160-beta".into(),
                game_version: game_version.clone(),
                stable: true,
            },
            ModloaderVersion {
                loader: ModloaderType::NeoForge,
                version: "20.4.80-beta".into(),
                game_version: game_version.clone(),
                stable: true,
            },
        ],
        ModloaderType::Quilt => vec![
            ModloaderVersion {
                loader: ModloaderType::Quilt,
                version: "0.26.1".into(),
                game_version: game_version.clone(),
                stable: true,
            },
            ModloaderVersion {
                loader: ModloaderType::Quilt,
                version: "0.25.0".into(),
                game_version: game_version.clone(),
                stable: true,
            },
        ],
        ModloaderType::Forge => vec![
            ModloaderVersion {
                loader: ModloaderType::Forge,
                version: "49.0.30".into(),
                game_version: game_version.clone(),
                stable: true,
            },
            ModloaderVersion {
                loader: ModloaderType::Forge,
                version: "47.2.20".into(),
                game_version: game_version.clone(),
                stable: true,
            },
        ],
    };

    Ok(versions)
}

#[tauri::command]
#[specta::specta]
fn list_installed_mods(instance_id: String) -> Result<Vec<InstalledMod>, String> {
    let instance_dir = get_app_data_dir().join("instances").join(&instance_id);
    let manager = ModManager::new(instance_dir);
    manager.list_installed_mods().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn toggle_mod(instance_id: String, file_name: String, enabled: bool) -> Result<(), String> {
    let instance_dir = get_app_data_dir().join("instances").join(&instance_id);
    let manager = ModManager::new(instance_dir);
    manager
        .toggle_mod(&file_name, enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn delete_mod(instance_id: String, file_name: String) -> Result<(), String> {
    let instance_dir = get_app_data_dir().join("instances").join(&instance_id);
    let manager = ModManager::new(instance_dir);
    manager.delete_mod(&file_name).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
async fn check_mod_updates(instance_id: String) -> Result<Vec<ModUpdate>, String> {
    let (game_ver, loader) = {
        let db = get_database()?;
        let inst = db.get_instance(&instance_id).map_err(|e| e.to_string())?;
        match inst {
            Some(i) => (
                i.game_version,
                i.loader.unwrap_or_else(|| "fabric".to_string()),
            ),
            None => ("1.20.4".to_string(), "fabric".to_string()),
        }
    };
    let instance_dir = get_app_data_dir().join("instances").join(&instance_id);
    let manager = ModManager::new(instance_dir);
    let client = ModrinthClient::new().map_err(|e| e.to_string())?;
    manager
        .check_updates(&game_ver, &loader, &client)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
async fn check_for_updates(channel: Option<String>) -> Result<Option<UpdateInfo>, String> {
    check_for_updates_internal(channel, None, env!("CARGO_PKG_VERSION")).await
}

#[tauri::command]
#[specta::specta]
async fn download_and_install_update(_channel: Option<String>) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
#[specta::specta]
async fn import_modpack(
    file_path: String,
    instance_name: Option<String>,
) -> Result<Instance, String> {
    let mrpack_path = std::path::Path::new(&file_path);
    let index = ModpackImporter::read_index(mrpack_path).map_err(|e| e.to_string())?;

    let inst_id = uuid::Uuid::new_v4().to_string();
    let name = instance_name.unwrap_or(index.name);
    let instance_dir = get_app_data_dir().join("instances").join(&inst_id);

    let import_res = ModpackImporter::import(mrpack_path, &instance_dir, &inst_id)
        .await
        .map_err(|e| e.to_string())?;

    let inst = Instance {
        id: inst_id,
        name,
        game_version: import_res.game_version,
        loader: import_res.loader,
        loader_version: import_res.loader_version,
        java_path: None,
        memory_min_mb: Some(1024),
        memory_max_mb: Some(4096),
        jvm_args: None,
        last_played_at: None,
        total_playtime_seconds: 0,
        icon_path: None,
        banner_path: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    let db = get_database()?;
    db.insert_instance(&inst).map_err(|e| e.to_string())?;

    Ok(inst)
}

#[tauri::command]
#[specta::specta]
fn export_modpack(
    instance_id: String,
    output_path: String,
    name: String,
    version: String,
    summary: Option<String>,
) -> Result<(), String> {
    let inst = {
        let db = get_database()?;
        db.get_instance(&instance_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Instance not found".to_string())?
    };

    let instance_dir = get_app_data_dir().join("instances").join(&instance_id);

    let mut dependencies = std::collections::HashMap::new();
    dependencies.insert("minecraft".to_string(), inst.game_version);
    if let (Some(l), Some(lv)) = (inst.loader, inst.loader_version) {
        let key = match l.as_str() {
            "fabric" => "fabric-loader",
            "neoforge" => "neoforge",
            "quilt" => "quilt-loader",
            "forge" => "forge",
            _ => "fabric-loader",
        };
        dependencies.insert(key.to_string(), lv);
    }

    let metadata = ModrinthIndex {
        format_version: 1,
        game: "minecraft".to_string(),
        version_id: version,
        name,
        summary,
        files: vec![],
        dependencies,
    };

    ModpackExporter::export(&instance_dir, std::path::Path::new(&output_path), &metadata)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn export_instance_backup(
    instance_id: String,
    output_path: String,
    include_saves: bool,
) -> Result<(), String> {
    let inst = {
        let db = get_database()?;
        db.get_instance(&instance_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Instance not found".to_string())?
    };

    let instance_dir = get_app_data_dir().join("instances").join(&instance_id);
    let options = ExportOptions {
        include_saves,
        include_resourcepacks: true,
        include_shaderpacks: true,
    };

    InstanceExporter::export(
        &instance_dir,
        &inst,
        std::path::Path::new(&output_path),
        &options,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn import_instance_backup(file_path: String) -> Result<Instance, String> {
    let zip_path = std::path::Path::new(&file_path);
    let orig_inst = InstanceImporter::read_metadata(zip_path).map_err(|e| e.to_string())?;

    let new_id = uuid::Uuid::new_v4().to_string();
    let target_dir = get_app_data_dir().join("instances").join(&new_id);

    let mut inst = InstanceImporter::import(zip_path, &target_dir).map_err(|e| e.to_string())?;
    inst.id = new_id;
    inst.name = orig_inst.name;
    inst.created_at = chrono::Utc::now().to_rfc3339();

    let db = get_database()?;
    db.insert_instance(&inst).map_err(|e| e.to_string())?;

    Ok(inst)
}

#[tauri::command]
#[specta::specta]
fn delete_instance(instance_id: String) -> Result<(), String> {
    let db = get_database()?;
    db.delete_instance(&instance_id)
        .map_err(|e| e.to_string())?;

    let instance_dir = get_app_data_dir().join("instances").join(&instance_id);
    if instance_dir.exists() {
        let _ = std::fs::remove_dir_all(instance_dir);
    }
    Ok(())
}

pub fn create_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            get_launcher_version,
            get_offline_uuid,
            get_instances,
            delete_instance,
            get_launch_receipt,
            launch_with_stub_identity,
            launch_with_active_identity,
            launch_instance,
            detect_system_java,
            download_jre,
            upload_crash_to_mclogs,
            analyze_crash_log,
            login_microsoft,
            login_offline,
            login_authlib,
            get_accounts,
            get_active_account,
            set_active_account,
            logout,
            search_mods,
            get_mod_versions,
            install_mod,
            install_modloader,
            uninstall_modloader,
            get_modloader_versions,
            list_installed_mods,
            toggle_mod,
            delete_mod,
            check_mod_updates,
            check_for_updates,
            download_and_install_update,
            import_modpack,
            export_modpack,
            export_instance_backup,
            import_instance_backup
        ])
        .events(tauri_specta::collect_events![BackendEvent])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;

    static TEST_LOCK: StdMutex<()> = StdMutex::new(());

    #[test]
    fn test_launch_with_stub_identity_dry_run() {
        let _lock = TEST_LOCK.lock().unwrap();
        let receipt = launch_with_stub_identity(Some("1.20.4".to_string()), Some(2048), None, None)
            .expect("should produce valid launch receipt");

        assert!(receipt.arguments.contains(&"Player".to_string()));
        assert!(receipt
            .arguments
            .contains(&"00000000-0000-0000-0000-000000000000".to_string()));
        assert!(receipt.arguments.contains(&"0".to_string()));
        assert!(receipt.arguments.contains(&"legacy".to_string()));
        assert!(receipt.arguments.contains(&"-Xmx2048M".to_string()));
    }

    #[test]
    fn test_offline_account_flow() {
        let _lock = TEST_LOCK.lock().unwrap();
        let acc = login_offline("TestCrafter".to_string()).expect("login offline");
        assert_eq!(acc.username, "TestCrafter");
        assert_eq!(acc.account_type, "offline");

        let active = get_active_account()
            .expect("get active")
            .expect("active acc");
        assert_eq!(active.username, "TestCrafter");

        let receipt =
            launch_with_active_identity(Some("1.20.4".to_string()), Some(3072), None, None)
                .expect("launch receipt");
        assert!(receipt.arguments.contains(&"TestCrafter".to_string()));
        assert!(receipt.arguments.contains(&"-Xmx3072M".to_string()));

        logout(acc.uuid).expect("logout");
    }

    #[test]
    fn test_authlib_account_launch() {
        let _lock = TEST_LOCK.lock().unwrap();
        let acc = login_authlib(
            "https://authlib-injector.yggdrasil.ely.by".to_string(),
            "ElyPlayer".to_string(),
        )
        .expect("login authlib");
        assert_eq!(acc.username, "ElyPlayer");
        assert_eq!(acc.account_type, "authlib");

        let receipt = launch_with_active_identity(None, None, None, None).expect("launch receipt");
        assert!(receipt.arguments.contains(&"ElyPlayer".to_string()));

        let has_agent = receipt
            .arguments
            .iter()
            .any(|a| a.starts_with("-javaagent:") && a.contains("ely.by"));
        assert!(has_agent, "Receipt should contain authlib -javaagent arg");

        logout(acc.uuid).expect("logout");
    }

    #[test]
    fn test_system_java_and_gc_flags() {
        let _lock = TEST_LOCK.lock().unwrap();
        let detected = detect_system_java().expect("detect java");
        let _ = detected.len();

        let receipt = launch_with_stub_identity(
            Some("1.20.4".to_string()),
            Some(4096),
            Some("C:/custom/java/bin/javaw.exe".to_string()),
            Some("Parallel".to_string()),
        )
        .expect("launch receipt with custom java & parallel GC");

        assert_eq!(
            receipt.java_path,
            PathBuf::from("C:/custom/java/bin/javaw.exe")
        );
        assert!(receipt
            .arguments
            .contains(&"-XX:+UseParallelGC".to_string()));
    }

    #[test]
    fn test_analyze_crash_log_command() {
        let report = analyze_crash_log(
            Some(1),
            "[main/ERROR]: Exception in thread \"main\" java.lang.OutOfMemoryError: Java heap space".to_string(),
        )
        .expect("analyze crash log");

        assert_eq!(report.pattern, aethel_core::CrashPattern::OutOfMemory);
        assert!(report.suggestion.contains("Allocate more RAM"));
    }

    #[test]
    fn test_modloader_versions_query() {
        let fabric = get_modloader_versions("fabric".into(), "1.20.4".into()).unwrap();
        assert!(!fabric.is_empty());
        assert_eq!(fabric[0].loader, ModloaderType::Fabric);

        let neoforge = get_modloader_versions("neoforge".into(), "1.20.4".into()).unwrap();
        assert!(!neoforge.is_empty());

        let quilt = get_modloader_versions("quilt".into(), "1.20.4".into()).unwrap();
        assert!(!quilt.is_empty());

        let forge = get_modloader_versions("forge".into(), "1.20.4".into()).unwrap();
        assert!(!forge.is_empty());

        assert!(get_modloader_versions("invalid_loader".into(), "1.20.4".into()).is_err());
    }

    #[tokio::test]
    async fn test_mod_management_commands() {
        let _lock = TEST_LOCK.lock().unwrap();
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("AETHEL_DATA_DIR", temp.path().to_str().unwrap());

        let inst_id = format!(
            "test-mod-inst-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );

        let db = get_database().unwrap();
        let inst = aethel_core::Instance {
            id: inst_id.clone(),
            name: "Mod Test Instance".into(),
            game_version: "1.20.4".into(),
            loader: None,
            loader_version: None,
            java_path: None,
            memory_min_mb: None,
            memory_max_mb: None,
            jvm_args: None,
            last_played_at: None,
            total_playtime_seconds: 0,
            icon_path: None,
            banner_path: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.insert_instance(&inst).unwrap();
        drop(db);

        // Test install modloader
        let pkg_id = install_modloader(inst_id.clone(), "neoforge".into(), "20.4.80-beta".into())
            .await
            .expect("install neoforge");
        assert_eq!(pkg_id, "neoforge-20.4.80-beta");

        let db = get_database().unwrap();
        let fetched = db.get_instance(&inst_id).unwrap().unwrap();
        assert_eq!(fetched.loader.as_deref(), Some("neoforge"));
        assert_eq!(fetched.loader_version.as_deref(), Some("20.4.80-beta"));
        drop(db);

        // Test uninstall modloader
        uninstall_modloader(inst_id.clone()).unwrap();
        let db = get_database().unwrap();
        let fetched = db.get_instance(&inst_id).unwrap().unwrap();
        assert_eq!(fetched.loader, None);
        drop(db);

        // Create a dummy mod jar in the instance's mods directory
        let mods_dir = temp.path().join("instances").join(&inst_id).join("mods");
        std::fs::create_dir_all(&mods_dir).unwrap();
        let jar_path = mods_dir.join("sample-mod.jar");
        std::fs::write(&jar_path, b"PK\x05\x06dummy-zip").unwrap();

        let list = list_installed_mods(inst_id.clone()).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].file_name, "sample-mod.jar");
        assert!(list[0].enabled);

        // Toggle disable
        toggle_mod(inst_id.clone(), "sample-mod.jar".into(), false).unwrap();
        assert!(!jar_path.exists());
        assert!(mods_dir.join("sample-mod.jar.disabled").exists());

        // Toggle enable
        toggle_mod(inst_id.clone(), "sample-mod.jar.disabled".into(), true).unwrap();
        assert!(jar_path.exists());

        // Delete
        delete_mod(inst_id.clone(), "sample-mod.jar".into()).unwrap();
        assert!(!jar_path.exists());

        // Test export_instance_backup & import_instance_backup
        let backup_zip = temp.path().join("instance_backup.zip");
        export_instance_backup(inst_id.clone(), backup_zip.to_str().unwrap().into(), true)
            .expect("export instance backup");
        assert!(backup_zip.exists());

        let imported = import_instance_backup(backup_zip.to_str().unwrap().into())
            .expect("import instance backup");
        assert_eq!(imported.name, "Mod Test Instance");
        assert_ne!(imported.id, inst_id);

        // Test export_modpack
        let exported_mrpack = temp.path().join("exported.mrpack");
        export_modpack(
            inst_id.clone(),
            exported_mrpack.to_str().unwrap().into(),
            "Exported Pack".into(),
            "1.0.0".into(),
            Some("Summary".into()),
        )
        .expect("export modpack");
        assert!(exported_mrpack.exists());

        // Test delete_instance
        delete_instance(inst_id.clone()).expect("delete instance");
        let db = get_database().unwrap();
        assert!(db.get_instance(&inst_id).unwrap().is_none());
        drop(db);

        std::env::remove_var("AETHEL_DATA_DIR");
    }
}
