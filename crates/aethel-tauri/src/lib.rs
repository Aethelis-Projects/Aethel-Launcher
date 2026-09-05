use aethel_auth::{generate_offline_uuid, storage::SecureStorage};
use aethel_core::{
    types::{
        ModpackInspectResult, ModpackSearchResult as CoreModpackSearchResult, ResourcePackEntry,
        ShaderPackEntry, WorldEntry,
    },
    AccountMetadata, BackendEvent, CrashReport, EffectiveInstanceSettings, GlobalSettings,
    Instance, InstanceSettings, JavaInfo,
};
use aethel_java::{
    detect_system_java as scan_system_java, GCPreset, InstalledRuntime, JavaProvider, JavaResolver,
};
use aethel_launch::{
    build_classpath, build_launch_receipt, provision_instance, resolve_version_package,
    upload_to_mclogs, CrashAnalyzer, JavaVersion, LaunchConfiguration, LaunchReceipt,
    ProcessSupervisor,
};
use aethel_manifest::VersionPackage;
use aethel_modding::{
    CurseForgeImporter, DependencyResolver, ExportOptions, FabricInstaller, ForgeInstaller,
    InstalledMod, InstanceExporter, InstanceImporter, ModManager, ModSearchResult, ModUpdate,
    ModVersion, ModloaderType, ModloaderVersion, ModpackArchiveType, ModpackExporter,
    ModpackImporter, ModrinthClient, ModrinthIndex, NeoForgeInstaller, QuiltInstaller,
    ResolutionResult,
};
use aethel_storage::Database;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub mod updater;
pub use updater::*;

pub mod discord_rpc;
pub use discord_rpc::*;

pub mod instances_manager;
pub use instances_manager::*;

static DISCORD_RPC: std::sync::OnceLock<DiscordRpcService> = std::sync::OnceLock::new();

pub fn get_discord_rpc() -> &'static DiscordRpcService {
    DISCORD_RPC.get_or_init(DiscordRpcService::new)
}

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
                    last_mclo_gs_url: None,
                    last_mclo_gs_at: None,
                    settings_json: None,
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
                    last_mclo_gs_url: None,
                    last_mclo_gs_at: None,
                    settings_json: None,
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
                    last_mclo_gs_url: None,
                    last_mclo_gs_at: None,
                    settings_json: None,
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

pub fn resolve_instance_classpath(
    app_data_dir: &std::path::Path,
    version: &str,
    pkg: &VersionPackage,
) -> Vec<PathBuf> {
    let client_jar = app_data_dir
        .join("versions")
        .join(version)
        .join(format!("{version}.jar"));

    let libraries_dir = app_data_dir.join("libraries");
    let ctx = aethel_manifest::OsContext::current();
    let mut lib_paths = Vec::new();
    for lib in &pkg.libraries {
        if lib.is_applicable(&ctx) {
            if let Some(art) = lib.get_artifact() {
                if let Some(ref p_str) = art.path {
                    let p = libraries_dir.join(p_str);
                    if p.exists() {
                        lib_paths.push(p);
                    }
                }
            }
        }
    }

    if lib_paths.is_empty() {
        lib_paths.push(libraries_dir.join("lwjgl.jar"));
    }

    build_classpath(client_jar, lib_paths)
}

#[tauri::command]
#[specta::specta]
fn get_launch_receipt(game_version: String, username: String) -> Result<LaunchReceipt, String> {
    let fixture = include_str!("../../aethel-manifest/tests/fixtures/1.20.4.json");
    let pkg = VersionPackage::parse(fixture).map_err(|e| e.to_string())?;
    let offline_uuid = generate_offline_uuid(&username).to_string();

    let classpath_entries = resolve_instance_classpath(&get_app_data_dir(), &game_version, &pkg);

    let config = LaunchConfiguration {
        java_path: PathBuf::from("javaw.exe"),
        java_version: JavaVersion::V21,
        game_dir: PathBuf::from(format!("instances/{game_version}")),
        assets_dir: PathBuf::from("assets"),
        natives_dir: PathBuf::from(format!("instances/{game_version}/natives")),
        version_package: pkg,
        classpath_entries,
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

pub fn resolve_best_existing_java(game_version: &str, manual_path: Option<&str>) -> PathBuf {
    if let Some(p) = manual_path {
        let trimmed = p.trim();
        if !trimmed.is_empty() && trimmed != "auto" {
            return PathBuf::from(trimmed);
        }
    }
    let req_major = JavaResolver::fallback_version(game_version);
    let runtimes_dir = get_app_data_dir().join("runtimes");
    let resolver = JavaResolver::new(runtimes_dir);
    let installed = resolver.list_installed_runtimes();
    if let Some(matching) = installed.iter().find(|r| r.major == req_major) {
        return PathBuf::from(&matching.path);
    }
    let sys = scan_system_java();
    if let Some(matching) = sys.iter().find(|j| j.major == req_major) {
        return matching.path.clone();
    }
    PathBuf::from("javaw.exe")
}

pub fn major_to_launch_version(major: u32) -> JavaVersion {
    match major {
        8 => JavaVersion::V8,
        16 => JavaVersion::V16,
        17 => JavaVersion::V17,
        21 => JavaVersion::V21,
        other => JavaVersion::Custom(other),
    }
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
    let fixture = match version.as_str() {
        "1.7.10" => include_str!("../../aethel-manifest/tests/fixtures/1.7.10.json"),
        "1.12.2" => include_str!("../../aethel-manifest/tests/fixtures/1.12.2.json"),
        "1.16.5" => include_str!("../../aethel-manifest/tests/fixtures/1.16.5.json"),
        "1.21.1" => include_str!("../../aethel-manifest/tests/fixtures/1.21.1.json"),
        _ => include_str!("../../aethel-manifest/tests/fixtures/1.20.4.json"),
    };
    let pkg = VersionPackage::parse(fixture).map_err(|e| e.to_string())?;

    let db = get_database()?;
    let active = db.get_active_account().map_err(|e| e.to_string())?;

    let req_major = JavaResolver::fallback_version(&version);
    let preset = match gc_preset.as_deref() {
        Some("ZGC") => GCPreset::ZGC,
        Some("GenerationalZGC") => GCPreset::GenerationalZGC,
        Some("Parallel") => GCPreset::Parallel,
        _ => GCPreset::G1GC,
    };
    let mut base_jvm_args = preset.to_jvm_args(req_major);

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

    let resolved_java = resolve_best_existing_java(&version, java_path.as_deref());

    let classpath_entries = resolve_instance_classpath(&get_app_data_dir(), &version, &pkg);

    let config = LaunchConfiguration {
        java_path: resolved_java,
        java_version: major_to_launch_version(req_major),
        game_dir: PathBuf::from(format!("instances/{version}")),
        assets_dir: PathBuf::from("assets"),
        natives_dir: PathBuf::from(format!("instances/{version}/natives")),
        version_package: pkg,
        classpath_entries,
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
fn get_installed_runtimes() -> Result<Vec<InstalledRuntime>, String> {
    let runtimes_dir = get_app_data_dir().join("runtimes");
    let resolver = JavaResolver::new(runtimes_dir);
    Ok(resolver.list_installed_runtimes())
}

#[tauri::command]
#[specta::specta]
async fn download_runtime(
    major: u32,
    provider: Option<String>,
) -> Result<InstalledRuntime, String> {
    let runtimes_dir = get_app_data_dir().join("runtimes");
    let resolver = JavaResolver::new(runtimes_dir);
    let prov = match provider.as_deref() {
        Some("Zulu") | Some("zulu") => JavaProvider::Zulu,
        _ => JavaProvider::Adoptium,
    };
    let path = resolver
        .ensure_jre_with_provider(major, prov)
        .await
        .map_err(|e| e.to_string())?;
    Ok(InstalledRuntime {
        major,
        path: path.to_string_lossy().to_string(),
        provider: prov.to_string(),
        version_str: format!("Java {major}"),
    })
}

#[tauri::command]
#[specta::specta]
fn delete_runtime(major: u32) -> Result<(), String> {
    let runtimes_dir = get_app_data_dir().join("runtimes");
    let resolver = JavaResolver::new(runtimes_dir);
    resolver.delete_runtime(major).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn get_recommended_java(game_version: String) -> u32 {
    JavaResolver::fallback_version(&game_version)
}

#[tauri::command]
#[specta::specta]
async fn resolve_java_for_instance(
    game_version: String,
    manual_path: Option<String>,
    provider: Option<String>,
) -> Result<String, String> {
    if let Some(ref p) = manual_path {
        let trimmed = p.trim();
        if !trimmed.is_empty() && trimmed != "auto" {
            return Ok(trimmed.to_string());
        }
    }
    let req_major = JavaResolver::fallback_version(&game_version);
    let runtimes_dir = get_app_data_dir().join("runtimes");
    let resolver = JavaResolver::new(runtimes_dir);
    let installed = resolver.list_installed_runtimes();
    if let Some(matching) = installed.iter().find(|r| r.major == req_major) {
        return Ok(matching.path.clone());
    }
    let sys = scan_system_java();
    if let Some(matching) = sys.iter().find(|j| j.major == req_major) {
        return Ok(matching.path.to_string_lossy().to_string());
    }

    let prov = match provider.as_deref() {
        Some("Zulu") | Some("zulu") => JavaProvider::Zulu,
        _ => JavaProvider::Adoptium,
    };

    let path = resolver
        .ensure_jre_with_provider(req_major, prov)
        .await
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
#[specta::specta]
async fn upload_crash_to_mclogs(
    instance_id: Option<String>,
    log_content: String,
) -> Result<String, String> {
    let url = upload_to_mclogs(&log_content)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(ref inst_id) = instance_id {
        if let Ok(db) = get_database() {
            let now = chrono::Utc::now().to_rfc3339();
            let _ = db.update_instance_mclogs(inst_id, Some(&url), Some(&now));
        }
    }

    Ok(url)
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
    let app_data = get_app_data_dir();
    let (maybe_instance, active, global_settings) = {
        let db = get_database()?;
        (
            db.get_instance(&instance_id).map_err(|e| e.to_string())?,
            db.get_active_account().map_err(|e| e.to_string())?,
            db.get_global_settings().map_err(|e| e.to_string())?,
        )
    };

    let version_str = game_version
        .or_else(|| maybe_instance.as_ref().map(|i| i.game_version.clone()))
        .unwrap_or_else(|| "1.20.4".to_string());

    let inst_settings = maybe_instance
        .as_ref()
        .map(|i| i.settings())
        .unwrap_or_default();
    let effective = inst_settings.resolve(&global_settings);

    let eff_memory_max = memory_max_mb.unwrap_or(effective.memory_max_mb);
    let eff_memory_min = effective.memory_min_mb;
    let eff_java_path = java_path.or(effective.java_path);
    let eff_jvm_args = effective.jvm_args;
    let eff_gc_preset = gc_preset.unwrap_or(effective.gc_preset);

    let instance_dir = app_data.join("instances").join(&instance_id);
    let dirs = [
        "natives",
        "mods",
        "config",
        "saves",
        "resourcepacks",
        "shaderpacks",
        "logs",
        "crash-reports",
    ];
    for d in &dirs {
        let _ = std::fs::create_dir_all(instance_dir.join(d));
    }
    let template_options = instance_dir.join("options.txt.template");
    let options_file = instance_dir.join("options.txt");
    if template_options.exists() && !options_file.exists() {
        let _ = std::fs::copy(&template_options, &options_file);
    }

    let pkg = resolve_version_package(&app_data, &version_str)
        .await
        .map_err(|e| e.to_string())?;

    let ctx = aethel_manifest::OsContext::current();
    let report = provision_instance(
        std::slice::from_ref(&pkg),
        &ctx,
        &version_str,
        &instance_dir,
        &app_data,
        eff_java_path.as_deref(),
        true,
        true,
    )
    .await
    .map_err(|e| e.to_string())?;
    let req_major = report.java_version.major();
    let preset = match eff_gc_preset.as_str() {
        "ZGC" => GCPreset::ZGC,
        "GenerationalZGC" => GCPreset::GenerationalZGC,
        "Parallel" => GCPreset::Parallel,
        _ => GCPreset::G1GC,
    };
    let mut base_jvm_args = preset.to_jvm_args(req_major);
    if let Some(extra) = eff_jvm_args {
        for arg in extra.split_whitespace() {
            base_jvm_args.push(arg.to_string());
        }
    }

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
                let cache_dir = app_data.join("libraries");
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
        Some(acc) => (
            acc.username,
            acc.uuid,
            "0".to_string(),
            "legacy".to_string(),
            base_jvm_args,
        ),
        None => (
            "Player".to_string(),
            "00000000-0000-0000-0000-000000000000".to_string(),
            "0".to_string(),
            "legacy".to_string(),
            base_jvm_args,
        ),
    };

    let config = LaunchConfiguration {
        java_path: report.java_path,
        java_version: report.java_version,
        game_dir: instance_dir.clone(),
        assets_dir: report.assets_root,
        natives_dir: report.natives_dir,
        version_package: pkg,
        classpath_entries: report.classpath,
        player_name,
        player_uuid,
        auth_access_token,
        user_type,
        memory_min_mb: Some(eff_memory_min),
        memory_max_mb: Some(eff_memory_max),
        custom_jvm_args: Some(custom_jvm_args),
    };

    let mut receipt = build_launch_receipt(&config, None).map_err(|e| e.to_string())?;
    receipt.working_dir = instance_dir;

    if let Some(mut inst) = maybe_instance.as_ref().cloned() {
        inst.last_played_at = Some(chrono::Utc::now().to_rfc3339());
        if let Ok(db) = get_database() {
            let _ = db.insert_instance(&inst);
        }
    }

    let rpc_enabled = global_settings.discord_rpc_enabled;
    if rpc_enabled {
        let inst_name = maybe_instance
            .as_ref()
            .map(|i| i.name.as_str())
            .unwrap_or("Minecraft");
        let loader_name = maybe_instance.as_ref().and_then(|i| i.loader.as_deref());
        get_discord_rpc().set_playing_game(inst_name, &version_str, loader_name, "ru");
    }

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

    let mut proc = match ProcessSupervisor::spawn(&receipt, Some(log_cb)).await {
        Ok(p) => p,
        Err(e) => {
            if rpc_enabled {
                get_discord_rpc().set_in_launcher("ru");
            }
            return Err(e.to_string());
        }
    };

    let pid = proc.pid();

    let _ = BackendEvent::ProcessStarted {
        instance_id: instance_id.clone(),
        pid,
    }
    .emit(&app);

    let app_exit = app.clone();
    let inst_exit = instance_id;
    let start_instant = std::time::Instant::now();
    tauri::async_runtime::spawn(async move {
        let (status_res, logs) = match proc.wait().await {
            Ok(status) => (Ok(status), proc.logs()),
            Err(e) => (Err(e), Vec::new()),
        };

        let elapsed_secs = start_instant.elapsed().as_secs();
        let now_iso = chrono::Utc::now().to_rfc3339();
        if let Ok(db) = get_database() {
            let _ = db.update_instance_playtime(&inst_exit, elapsed_secs, &now_iso);
        }

        match status_res {
            Ok(status) => {
                let code = status.code();
                if status.success() {
                    let _ = BackendEvent::ProcessExited {
                        instance_id: inst_exit,
                        exit_code: code,
                    }
                    .emit(&app_exit);
                } else {
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
        if rpc_enabled {
            get_discord_rpc().set_in_launcher("ru");
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
async fn download_and_install_update(
    channel: Option<String>,
    download_url: Option<String>,
) -> Result<(), String> {
    let url = match download_url {
        Some(u) if !u.trim().is_empty() => u,
        _ => {
            let info = check_for_updates_internal(channel, None, env!("CARGO_PKG_VERSION"))
                .await?
                .ok_or_else(|| "No update available to download".to_string())?;
            info.download_url.ok_or_else(|| {
                "No compatible installer asset found for this platform".to_string()
            })?
        }
    };

    let updates_dir = get_app_data_dir().join("updates");
    std::fs::create_dir_all(&updates_dir).map_err(|e| e.to_string())?;

    let filename = url
        .split('/')
        .next_back()
        .unwrap_or("aethel-update-installer")
        .to_string();
    let dest_path = updates_dir.join(&filename);

    let client = reqwest::Client::builder()
        .user_agent("aethel-launcher/0.1.0 (Aethelis Projects)")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Download failed with status: {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&dest_path, bytes).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new(&dest_path)
            .spawn()
            .map_err(|e| format!("Failed to spawn installer: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&dest_path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o755);
            let _ = std::fs::set_permissions(&dest_path, perms);
        }

        std::process::Command::new(&dest_path)
            .spawn()
            .map_err(|e| format!("Failed to spawn installer: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&dest_path)
            .spawn()
            .map_err(|e| format!("Failed to open installer: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
async fn import_modpack(
    file_path: String,
    instance_name: Option<String>,
) -> Result<Instance, String> {
    let archive_path = std::path::Path::new(&file_path);
    let archive_type =
        ModpackImporter::detect_archive_type(archive_path).map_err(|e| e.to_string())?;

    let inst_id = uuid::Uuid::new_v4().to_string();
    let instance_dir = get_app_data_dir().join("instances").join(&inst_id);

    let (name, game_version, loader, loader_version) = match archive_type {
        ModpackArchiveType::Modrinth => {
            let index = ModpackImporter::read_index(archive_path).map_err(|e| e.to_string())?;
            let name = instance_name.unwrap_or(index.name);
            let res = ModpackImporter::import(archive_path, &instance_dir, &inst_id)
                .await
                .map_err(|e| e.to_string())?;
            (name, res.game_version, res.loader, res.loader_version)
        }
        ModpackArchiveType::CurseForge => {
            let manifest =
                CurseForgeImporter::read_manifest(archive_path).map_err(|e| e.to_string())?;
            let name = instance_name.unwrap_or(manifest.name);
            let res = CurseForgeImporter::import(archive_path, &instance_dir, &inst_id)
                .await
                .map_err(|e| e.to_string())?;
            (name, res.game_version, res.loader, res.loader_version)
        }
        ModpackArchiveType::AethelBackup => {
            let orig = InstanceImporter::read_metadata(archive_path).map_err(|e| e.to_string())?;
            let name = instance_name.unwrap_or(orig.name);
            let mut inst =
                InstanceImporter::import(archive_path, &instance_dir).map_err(|e| e.to_string())?;
            inst.id = inst_id;
            inst.name = name;
            inst.created_at = chrono::Utc::now().to_rfc3339();
            let db = get_database()?;
            db.insert_instance(&inst).map_err(|e| e.to_string())?;
            return Ok(inst);
        }
    };

    let inst = Instance {
        id: inst_id,
        name,
        game_version,
        loader,
        loader_version,
        java_path: None,
        memory_min_mb: Some(1024),
        memory_max_mb: Some(4096),
        jvm_args: None,
        last_played_at: None,
        total_playtime_seconds: 0,
        icon_path: None,
        banner_path: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        last_mclo_gs_url: None,
        last_mclo_gs_at: None,
        settings_json: None,
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

#[tauri::command]
#[specta::specta]
fn get_global_settings() -> Result<GlobalSettings, String> {
    let db = get_database()?;
    db.get_global_settings().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn update_global_settings(settings: GlobalSettings) -> Result<(), String> {
    let db = get_database()?;
    db.set_global_settings(&settings)
        .map_err(|e| e.to_string())?;
    let rpc = get_discord_rpc();
    rpc.set_enabled(settings.discord_rpc_enabled);
    if settings.discord_rpc_enabled {
        rpc.set_in_launcher("ru");
    } else {
        rpc.clear();
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
fn get_instance_settings(instance_id: String) -> Result<InstanceSettings, String> {
    let db = get_database()?;
    let inst = db
        .get_instance(&instance_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Instance {instance_id} not found"))?;
    Ok(inst.settings())
}

#[tauri::command]
#[specta::specta]
fn update_instance_settings(instance_id: String, settings: InstanceSettings) -> Result<(), String> {
    let db = get_database()?;
    db.update_instance_settings(&instance_id, &settings)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn get_effective_instance_settings(
    instance_id: String,
) -> Result<EffectiveInstanceSettings, String> {
    let db = get_database()?;
    let global = db.get_global_settings().map_err(|e| e.to_string())?;
    let inst = db
        .get_instance(&instance_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Instance {instance_id} not found"))?;
    Ok(inst.settings().resolve(&global))
}

#[tauri::command]
#[specta::specta]
fn set_discord_rpc_enabled(enabled: bool, locale: Option<String>) -> Result<(), String> {
    let db = get_database()?;
    let mut global = db.get_global_settings().map_err(|e| e.to_string())?;
    global.discord_rpc_enabled = enabled;
    db.set_global_settings(&global).map_err(|e| e.to_string())?;

    let rpc = get_discord_rpc();
    rpc.set_enabled(enabled);
    if enabled {
        let loc = locale.unwrap_or_else(|| "ru".to_string());
        rpc.set_in_launcher(&loc);
    } else {
        rpc.clear();
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
fn set_discord_rpc_activity(locale: String) -> Result<(), String> {
    let db = get_database()?;
    let global = db.get_global_settings().map_err(|e| e.to_string())?;
    if global.discord_rpc_enabled {
        get_discord_rpc().set_in_launcher(&locale);
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
fn open_instance_folder(instance_id: String, subfolder: Option<String>) -> Result<(), String> {
    let mut path = get_app_data_dir().join("instances").join(&instance_id);
    if let Some(sub) = subfolder {
        path = path.join(sub);
    }
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    open::that(&path).map_err(|e| format!("Failed to open {}: {e}", path.display()))
}

#[tauri::command]
#[specta::specta]
fn update_instance_name(instance_id: String, name: String) -> Result<(), String> {
    let db = get_database()?;
    db.update_instance_name(&instance_id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn update_instance_icon(instance_id: String, icon_path: Option<String>) -> Result<(), String> {
    let db = get_database()?;
    db.update_instance_icon(&instance_id, icon_path.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn get_instance_resourcepacks(instance_id: String) -> Result<Vec<ResourcePackEntry>, String> {
    let dir = get_app_data_dir().join("instances").join(&instance_id);
    Ok(instances_manager::scan_resourcepacks(&dir))
}

#[tauri::command]
#[specta::specta]
fn toggle_instance_resourcepack(
    instance_id: String,
    pack_name: String,
    enabled: bool,
) -> Result<(), String> {
    let dir = get_app_data_dir().join("instances").join(&instance_id);
    let options_path = dir.join("options.txt");
    instances_manager::set_active_resourcepack_status(&options_path, &pack_name, enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn get_instance_shaderpacks(instance_id: String) -> Result<Vec<ShaderPackEntry>, String> {
    let dir = get_app_data_dir().join("instances").join(&instance_id);
    Ok(instances_manager::scan_shaderpacks(&dir))
}

#[tauri::command]
#[specta::specta]
fn set_instance_active_shaderpack(
    instance_id: String,
    shader_name: Option<String>,
) -> Result<(), String> {
    let dir = get_app_data_dir().join("instances").join(&instance_id);
    instances_manager::write_active_shaderpack(&dir, shader_name.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
fn get_instance_worlds(instance_id: String) -> Result<Vec<WorldEntry>, String> {
    let dir = get_app_data_dir().join("instances").join(&instance_id);
    Ok(instances_manager::scan_worlds(&dir))
}

#[tauri::command]
#[specta::specta]
fn inspect_modpack(file_path: String) -> Result<ModpackInspectResult, String> {
    instances_manager::inspect_modpack_archive(std::path::Path::new(&file_path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
async fn search_modpacks(
    query: String,
    provider: String,
    loader: Option<String>,
    game_version: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<CoreModpackSearchResult>, String> {
    let lim = limit.unwrap_or(20).clamp(1, 50);
    let mut results = Vec::new();

    let client = reqwest::Client::builder()
        .user_agent("aethel-launcher/0.1.0 (Aethelis Projects)")
        .build()
        .map_err(|e| e.to_string())?;

    // 1. Modrinth
    if provider == "modrinth" || provider == "all" {
        let mut facets = vec![r#"["project_type:modpack"]"#.to_string()];
        if let Some(ref gv) = game_version {
            if !gv.is_empty() {
                facets.push(format!(r#"["versions:{}"]"#, gv));
            }
        }
        if let Some(ref ld) = loader {
            if !ld.is_empty() && ld != "all" {
                facets.push(format!(r#"["categories:{}"]"#, ld.to_lowercase()));
            }
        }
        let facets_param = format!("[{}]", facets.join(","));
        let url = format!(
            "https://api.modrinth.com/v2/search?query={}&facets={}&limit={}",
            urlencoding::encode(&query),
            urlencoding::encode(&facets_param),
            lim
        );

        if let Ok(resp) = client.get(&url).send().await {
            if resp.status().is_success() {
                if let Ok(val) = resp.json::<serde_json::Value>().await {
                    if let Some(hits) = val["hits"].as_array() {
                        for h in hits {
                            let project_id = h["project_id"].as_str().unwrap_or_default().to_string();
                            let title = h["title"].as_str().unwrap_or_default().to_string();
                            let summary = h["description"].as_str().unwrap_or_default().to_string();
                            let author = h["author"].as_str().unwrap_or_default().to_string();
                            let downloads = h["downloads"].as_u64().unwrap_or(0);
                            let icon_url = h["icon_url"].as_str().map(|s| s.to_string());
                            let categories = h["categories"]
                                .as_array()
                                .map(|arr| arr.iter().filter_map(|c| c.as_str().map(String::from)).collect())
                                .unwrap_or_default();
                            let supported_game_versions = h["versions"]
                                .as_array()
                                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                                .unwrap_or_default();

                            results.push(CoreModpackSearchResult {
                                provider: "modrinth".to_string(),
                                project_id,
                                title,
                                summary,
                                author,
                                downloads,
                                icon_url,
                                categories,
                                latest_version: None,
                                supported_game_versions,
                            });
                        }
                    }
                }
            }
        }
    }

    // 2. CurseForge
    if provider == "curseforge" || provider == "all" {
        let mut url = format!(
            "https://api.curseforge.com/v1/mods/search?gameId=432&classId=4471&searchFilter={}&pageSize={}",
            urlencoding::encode(&query),
            lim
        );
        if let Some(ref gv) = game_version {
            if !gv.is_empty() {
                url.push_str(&format!("&gameVersion={}", urlencoding::encode(gv)));
            }
        }
        if let Some(ref ld) = loader {
            let mod_loader_type = match ld.to_lowercase().as_str() {
                "forge" => Some(1),
                "fabric" => Some(4),
                "quilt" => Some(5),
                "neoforge" => Some(6),
                _ => None,
            };
            if let Some(mlt) = mod_loader_type {
                url.push_str(&format!("&modLoaderType={mlt}"));
            }
        }

        let resp = client
            .get(&url)
            .header("x-api-key", aethel_modding::DEFAULT_CURSEFORGE_KEY)
            .send()
            .await;

        if let Ok(r) = resp {
            if r.status().is_success() {
                if let Ok(val) = r.json::<serde_json::Value>().await {
                    if let Some(data) = val["data"].as_array() {
                        for m in data {
                            let project_id = m["id"].to_string();
                            let title = m["name"].as_str().unwrap_or_default().to_string();
                            let summary = m["summary"].as_str().unwrap_or_default().to_string();
                            let author = m["authors"]
                                .as_array()
                                .and_then(|a| a.first())
                                .and_then(|a| a["name"].as_str())
                                .unwrap_or("Unknown")
                                .to_string();
                            let downloads = m["downloadCount"].as_u64().unwrap_or(0);
                            let icon_url = m["logo"]["thumbnailUrl"].as_str().map(|s| s.to_string());
                            let categories = m["categories"]
                                .as_array()
                                .map(|arr| arr.iter().filter_map(|c| c["name"].as_str().map(String::from)).collect())
                                .unwrap_or_default();
                            let latest_file_id = m["mainFileId"].to_string();

                            results.push(CoreModpackSearchResult {
                                provider: "curseforge".to_string(),
                                project_id,
                                title,
                                summary,
                                author,
                                downloads,
                                icon_url,
                                categories,
                                latest_version: Some(latest_file_id),
                                supported_game_versions: vec![],
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(results)
}

#[tauri::command]
#[specta::specta]
async fn install_online_modpack(
    provider: String,
    project_id: String,
    version_id: Option<String>,
    instance_name: String,
) -> Result<Instance, String> {
    let client = reqwest::Client::builder()
        .user_agent("aethel-launcher/0.1.0 (Aethelis Projects)")
        .build()
        .map_err(|e| e.to_string())?;

    let temp_dir = std::env::temp_dir().join("aethel_modpacks");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let (download_url, file_ext) = if provider == "curseforge" {
        let file_id = version_id.ok_or_else(|| "CurseForge requires a file ID".to_string())?;
        let url = format!(
            "https://api.curseforge.com/v1/mods/{project_id}/files/{file_id}/download-url"
        );
        let resp = client
            .get(&url)
            .header("x-api-key", aethel_modding::DEFAULT_CURSEFORGE_KEY)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("CurseForge file API error: {}", resp.status()));
        }

        let val = resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
        let dl = val["data"].as_str().ok_or_else(|| "Missing download URL in CurseForge response".to_string())?;
        (dl.to_string(), "zip")
    } else {
        let url = if let Some(ref vid) = version_id {
            format!("https://api.modrinth.com/v2/version/{vid}")
        } else {
            format!("https://api.modrinth.com/v2/project/{project_id}/version")
        };

        let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("Modrinth version API error: {}", resp.status()));
        }

        let val = resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
        let ver_obj = if val.is_array() {
            val.as_array().and_then(|a| a.first()).ok_or_else(|| "No versions found for modpack".to_string())?
        } else {
            &val
        };

        let files = ver_obj["files"].as_array().ok_or_else(|| "Missing files array".to_string())?;
        let primary_file = files.iter().find(|f| f["primary"].as_bool().unwrap_or(false)).or_else(|| files.first())
            .ok_or_else(|| "No files in version".to_string())?;

        let dl = primary_file["url"].as_str().ok_or_else(|| "Missing file URL".to_string())?;
        (dl.to_string(), "mrpack")
    };

    let temp_archive_path = temp_dir.join(format!("{}.{}", uuid::Uuid::new_v4(), file_ext));
    let resp = client.get(&download_url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Download failed with status: {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&temp_archive_path, bytes).map_err(|e| e.to_string())?;

    let inst = import_modpack(
        temp_archive_path.to_string_lossy().to_string(),
        Some(instance_name),
    )
    .await;

    let _ = std::fs::remove_file(temp_archive_path);
    inst
}

#[tauri::command]
#[specta::specta]
async fn pick_file_dialog(
    title: Option<String>,
    filter_name: Option<String>,
    filter_extensions: Vec<String>,
) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let filter_str = if filter_extensions.is_empty() {
            "All Files (*.*)|*.*".to_string()
        } else {
            let exts = filter_extensions
                .iter()
                .map(|e| format!("*.{}", e.trim_start_matches('.')))
                .collect::<Vec<_>>()
                .join(";");
            let name = filter_name.unwrap_or_else(|| "Supported Files".to_string());
            format!("{name} ({exts})|{exts}|All Files (*.*)|*.*")
        };
        let title_str = title.unwrap_or_else(|| "Select File".to_string());

        let ps_script = format!(
            "Add-Type -AssemblyName System.Windows.Forms; \
             $f = New-Object System.Windows.Forms.OpenFileDialog; \
             $f.Title = '{title}'; \
             $f.Filter = '{filter}'; \
             if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{ $f.FileName }}",
            title = title_str.replace('\'', "''"),
            filter = filter_str.replace('\'', "''")
        );

        let out = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .output()
            .map_err(|e| e.to_string())?;

        let res = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if res.is_empty() {
            Ok(None)
        } else {
            Ok(Some(res))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (title, filter_name, filter_extensions);
        Ok(None)
    }
}

#[tauri::command]
#[specta::specta]
async fn prepare_silent_update_and_restart(
    app: tauri::AppHandle,
    download_url: Option<String>,
) -> Result<(), String> {
    let url = match download_url {
        Some(u) if !u.trim().is_empty() => u,
        _ => {
            let info = check_for_updates_internal(None, None, env!("CARGO_PKG_VERSION"))
                .await?
                .ok_or_else(|| "No update available".to_string())?;
            info.download_url.ok_or_else(|| "No download URL available".to_string())?
        }
    };

    let client = reqwest::Client::builder()
        .user_agent("aethel-launcher/0.1.0 (Aethelis Projects)")
        .build()
        .map_err(|e| e.to_string())?;

    let temp_dir = std::env::temp_dir().join("aethel_update");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let filename = url.split('/').next_back().unwrap_or("Aethel-Installer.exe");
    let dest_installer = temp_dir.join(filename);

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Download failed with status {}", resp.status()));
    }
    let installer_bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&dest_installer, installer_bytes).map_err(|e| e.to_string())?;

    let launcher_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let launcher_pid = std::process::id();
    let app_data = get_app_data_dir();

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let script_path = temp_dir.join("aethel_update.bat");
        let script = format!(
            r#"@echo off
setlocal
set "PID={pid}"
set "INSTALLER={installer}"
set "EXE={exe}"
set "LOG={log}"

:wait_loop
tasklist /FI "PID eq %PID%" 2>NUL | find /I "%PID%" >NUL
if not errorlevel 1 (
    timeout /T 1 /NOBREAK >NUL
    goto wait_loop
)

"%INSTALLER%" /S
set "CODE=%ERRORLEVEL%"
if %CODE% NEQ 0 (
    echo Installer failed with %CODE% > "%LOG%"
)

start "" "%EXE%"
del "%~f0" >NUL 2>&1
exit /b %CODE%
"#,
            pid = launcher_pid,
            installer = dest_installer.to_string_lossy(),
            exe = launcher_exe.to_string_lossy(),
            log = app_data.join("update_failed.log").to_string_lossy()
        );
        std::fs::write(&script_path, script).map_err(|e| e.to_string())?;

        std::process::Command::new("cmd.exe")
            .args(["/C", script_path.to_str().unwrap()])
            .creation_flags(0x08000000 | 0x00000008)
            .spawn()
            .map_err(|e| format!("Failed to spawn updater: {e}"))?;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let script_path = temp_dir.join("aethel_update.sh");
        let script = format!(
            r#"#!/usr/bin/env sh
PID={pid}
INSTALLER="{installer}"
EXE="{exe}"
LOG="{log}"

while kill -0 "$PID" 2>/dev/null; do
    sleep 1
done

chmod +x "$INSTALLER" 2>/dev/null
"$INSTALLER" --silent 2>"$LOG" || "$INSTALLER" 2>"$LOG"

"$EXE" &
rm -f "$0"
"#,
            pid = launcher_pid,
            installer = dest_installer.to_string_lossy(),
            exe = launcher_exe.to_string_lossy(),
            log = app_data.join("update_failed.log").to_string_lossy()
        );
        std::fs::write(&script_path, &script).map_err(|e| e.to_string())?;
        if let Ok(meta) = std::fs::metadata(&script_path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o755);
            let _ = std::fs::set_permissions(&script_path, perms);
        }

        std::process::Command::new("sh")
            .arg(&script_path)
            .spawn()
            .map_err(|e| format!("Failed to spawn updater: {e}"))?;
    }

    app.exit(0);
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
            launch_with_active_identity,
            launch_instance,
            detect_system_java,
            download_jre,
            get_installed_runtimes,
            download_runtime,
            delete_runtime,
            get_recommended_java,
            resolve_java_for_instance,
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
            import_instance_backup,
            get_global_settings,
            update_global_settings,
            get_instance_settings,
            update_instance_settings,
            get_effective_instance_settings,
            set_discord_rpc_enabled,
            set_discord_rpc_activity,
            open_instance_folder,
            update_instance_name,
            update_instance_icon,
            get_instance_resourcepacks,
            toggle_instance_resourcepack,
            get_instance_shaderpacks,
            set_instance_active_shaderpack,
            get_instance_worlds,
            inspect_modpack,
            search_modpacks,
            install_online_modpack,
            pick_file_dialog,
            prepare_silent_update_and_restart
        ])
        .events(tauri_specta::collect_events![BackendEvent])
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::Mutex as TokioMutex;

    static TEST_LOCK: TokioMutex<()> = TokioMutex::const_new(());

    #[test]
    fn test_launch_receipt_dry_run() {
        let _lock = TEST_LOCK.blocking_lock();
        let receipt =
            launch_with_active_identity(Some("1.20.4".to_string()), Some(2048), None, None)
                .expect("should produce valid launch receipt");

        assert!(receipt.arguments.contains(&"-Xmx2048M".to_string()));
    }

    #[test]
    fn test_offline_account_flow() {
        let _lock = TEST_LOCK.blocking_lock();
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
        let _lock = TEST_LOCK.blocking_lock();
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
        let _lock = TEST_LOCK.blocking_lock();
        let detected = detect_system_java().expect("detect java");
        let _ = detected.len();

        let receipt = launch_with_active_identity(
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
        let _lock = TEST_LOCK.lock().await;
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
            last_mclo_gs_url: None,
            last_mclo_gs_at: None,
            settings_json: None,
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

    #[tokio::test]
    async fn test_java_runtime_management_and_recommendations() {
        let _lock = TEST_LOCK.lock().await;
        assert_eq!(get_recommended_java("1.16.5".to_string()), 8);
        assert_eq!(get_recommended_java("1.20.4".to_string()), 17);
        assert_eq!(get_recommended_java("1.21.1".to_string()), 21);
        assert_eq!(get_recommended_java("26.2".to_string()), 25);
        assert_eq!(get_recommended_java("25w02a".to_string()), 25);

        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("AETHEL_DATA_DIR", temp.path().to_str().unwrap());

        let initial_list = get_installed_runtimes().expect("list runtimes");
        assert!(initial_list.is_empty());

        // Create a dummy java-17 runtime
        let jre17_bin = temp.path().join("runtimes").join("java-17").join("bin");
        std::fs::create_dir_all(&jre17_bin).unwrap();
        let exe_name = if cfg!(windows) { "javaw.exe" } else { "java" };
        std::fs::write(jre17_bin.join(exe_name), b"mock-jre").unwrap();
        std::fs::write(
            temp.path()
                .join("runtimes")
                .join("java-17")
                .join("provider.txt"),
            "Adoptium",
        )
        .unwrap();

        let list = get_installed_runtimes().expect("list runtimes after creation");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].major, 17);
        assert_eq!(list[0].provider, "Adoptium");

        // Test resolve_java_for_instance finds this runtime for 1.20.4
        let resolved = resolve_java_for_instance("1.20.4".to_string(), None, None)
            .await
            .expect("resolve java");
        assert!(resolved.contains("java-17"));

        // Test manual override
        let manual = resolve_java_for_instance(
            "1.20.4".to_string(),
            Some("C:/custom/bin/java.exe".to_string()),
            None,
        )
        .await
        .expect("resolve manual java");
        assert_eq!(manual, "C:/custom/bin/java.exe");

        // Test delete_runtime
        delete_runtime(17).expect("delete runtime");
        let list_after_del = get_installed_runtimes().expect("list runtimes after delete");
        assert!(list_after_del.is_empty());

        std::env::remove_var("AETHEL_DATA_DIR");
    }

    #[test]
    #[allow(deprecated)]
    fn test_two_level_settings_and_discord_rpc_commands() {
        let _lock = TEST_LOCK.blocking_lock();
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("AETHEL_DATA_DIR", temp.path().to_str().unwrap());

        // 1. Test get_global_settings defaults
        let global = get_global_settings().expect("get global settings");
        assert_eq!(global.theme, "dark");
        assert!(!global.discord_rpc_enabled);
        assert_eq!(global.default_memory_max_mb, 4096);

        // 2. Test update_global_settings
        let updated_global = GlobalSettings {
            theme: "light".to_string(),
            discord_rpc_enabled: true,
            update_channel: "beta".to_string(),
            default_java_path: Some("C:/custom/javaw.exe".to_string()),
            default_java_mode: "manual".to_string(),
            default_java_provider: "Adoptium".to_string(),
            default_memory_min_mb: 2048,
            default_memory_max_mb: 6144,
            default_gc_preset: "ZGC".to_string(),
            default_jvm_args: Some("-XX:+UseZGC".to_string()),
        };
        update_global_settings(updated_global).expect("update global settings");

        let fetched_global = get_global_settings().expect("fetch global");
        assert_eq!(fetched_global.theme, "light");
        assert!(fetched_global.discord_rpc_enabled);
        assert_eq!(fetched_global.default_memory_max_mb, 6144);

        // 3. Test instance settings inheritance
        let instances = get_instances().expect("get instances");
        assert!(!instances.is_empty());
        let target_id = instances[0].id.clone();

        // First, reset instance to global defaults (all None)
        update_instance_settings(target_id.clone(), InstanceSettings::default())
            .expect("reset instance settings to defaults");

        // Effective settings: memory defaults to per-instance fallback (4096 MB), GC to ZGC
        let effective_inherited =
            get_effective_instance_settings(target_id.clone()).expect("get effective settings");
        assert_eq!(effective_inherited.memory_max_mb, 4096);
        assert_eq!(effective_inherited.gc_preset, "ZGC");
        assert_eq!(
            effective_inherited.java_path.as_deref(),
            Some("C:/custom/javaw.exe")
        );
        assert!(!effective_inherited.has_overrides);

        // Now set per-instance override
        let inst_override = InstanceSettings {
            java_path: None,
            memory_min_mb: Some(1024),
            memory_max_mb: Some(8192),
            gc_preset: Some("G1GC".to_string()),
            jvm_args: None,
        };
        update_instance_settings(target_id.clone(), inst_override)
            .expect("update instance settings");

        // Verify effective settings now reflect override
        let effective_after = get_effective_instance_settings(target_id.clone())
            .expect("get effective settings after override");
        assert_eq!(effective_after.memory_max_mb, 8192);
        assert_eq!(effective_after.gc_preset, "G1GC");
        assert_eq!(
            effective_after.java_path.as_deref(),
            Some("C:/custom/javaw.exe") // inherited from global
        );
        assert!(effective_after.has_overrides);

        // 4. Test Discord RPC toggle command
        set_discord_rpc_enabled(false, None).expect("disable discord rpc");
        let g = get_global_settings().expect("global");
        assert!(!g.discord_rpc_enabled);

        set_discord_rpc_enabled(true, Some("ru".to_string())).expect("enable discord rpc");
        let g2 = get_global_settings().expect("global");
        assert!(g2.discord_rpc_enabled);

        std::env::remove_var("AETHEL_DATA_DIR");
    }
}
