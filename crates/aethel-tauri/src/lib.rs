use aethel_auth::{generate_offline_uuid, storage::SecureStorage};
use aethel_core::{AccountMetadata, BackendEvent, Instance};
use aethel_launch::{build_launch_receipt, JavaVersion, LaunchConfiguration, LaunchReceipt};
use aethel_manifest::VersionPackage;
use aethel_storage::Database;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

static DB: OnceLock<Mutex<Database>> = OnceLock::new();

pub fn get_app_data_dir() -> PathBuf {
    if let Ok(custom) = std::env::var("AETHEL_DATA_DIR") {
        PathBuf::from(custom)
    } else {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("aethel")
    }
}

pub fn get_database() -> Result<std::sync::MutexGuard<'static, Database>, String> {
    let mutex = DB.get_or_init(|| {
        let dir = get_app_data_dir();
        let _ = std::fs::create_dir_all(&dir);
        let db_path = dir.join("aethel.db");
        let db = Database::open(&db_path).unwrap_or_else(|_| {
            Database::in_memory().expect("Failed to create in-memory database fallback")
        });
        Mutex::new(db)
    });
    mutex.lock().map_err(|e| e.to_string())
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
) -> Result<LaunchReceipt, String> {
    let version = game_version.unwrap_or_else(|| "1.20.4".to_string());
    let fixture = include_str!("../../aethel-manifest/tests/fixtures/1.20.4.json");
    let pkg = VersionPackage::parse(fixture).map_err(|e| e.to_string())?;

    let config = LaunchConfiguration {
        java_path: PathBuf::from("javaw.exe"),
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
        custom_jvm_args: Some(vec!["-XX:+UseG1GC".to_string()]),
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
) -> Result<LaunchReceipt, String> {
    let version = game_version.unwrap_or_else(|| "1.20.4".to_string());
    let fixture = include_str!("../../aethel-manifest/tests/fixtures/1.20.4.json");
    let pkg = VersionPackage::parse(fixture).map_err(|e| e.to_string())?;

    let db = get_database()?;
    let active = db.get_active_account().map_err(|e| e.to_string())?;

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
                vec!["-XX:+UseG1GC".to_string()],
            )
        }
        Some(acc) if acc.account_type == "authlib" => {
            let mut jvm_args = vec!["-XX:+UseG1GC".to_string()];
            if let Some(ref server_url) = acc.server_url {
                let cache_dir = get_app_data_dir().join("libraries");
                let injector = aethel_auth::authlib::AuthlibInjector::new(cache_dir);
                let jar_path = injector.jar_path();
                jvm_args.push(injector.java_agent_arg(&jar_path, server_url));
            }
            (
                acc.username,
                acc.uuid,
                "0".to_string(),
                "mojang".to_string(),
                jvm_args,
            )
        }
        Some(acc) => {
            // offline account
            (
                acc.username,
                acc.uuid,
                "0".to_string(),
                "legacy".to_string(),
                vec!["-XX:+UseG1GC".to_string()],
            )
        }
        None => (
            "Player".to_string(),
            "00000000-0000-0000-0000-000000000000".to_string(),
            "0".to_string(),
            "legacy".to_string(),
            vec!["-XX:+UseG1GC".to_string()],
        ),
    };

    let config = LaunchConfiguration {
        java_path: PathBuf::from("javaw.exe"),
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

pub fn create_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .commands(tauri_specta::collect_commands![
            get_launcher_version,
            get_offline_uuid,
            get_instances,
            get_launch_receipt,
            launch_with_stub_identity,
            launch_with_active_identity,
            login_microsoft,
            login_offline,
            login_authlib,
            get_accounts,
            get_active_account,
            set_active_account,
            logout
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
        let receipt = launch_with_stub_identity(Some("1.20.4".to_string()), Some(2048))
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

        let receipt = launch_with_active_identity(Some("1.20.4".to_string()), Some(3072))
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

        let receipt = launch_with_active_identity(None, None).expect("launch receipt");
        assert!(receipt.arguments.contains(&"ElyPlayer".to_string()));

        let has_agent = receipt
            .arguments
            .iter()
            .any(|a| a.starts_with("-javaagent:") && a.contains("ely.by"));
        assert!(has_agent, "Receipt should contain authlib -javaagent arg");

        logout(acc.uuid).expect("logout");
    }
}
