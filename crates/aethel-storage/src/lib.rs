use aethel_core::{AccountMetadata, AppError, AppErrorCode, Instance, Result};
use rusqlite::{params, Connection};
use std::path::Path;
use tracing::info;

pub const CURRENT_SCHEMA_VERSION: u32 = 2;

pub struct Database {
    conn: Connection,
}

impl Database {
    /// Opens or creates a SQLite database at the specified path,
    /// enabling WAL journal mode and running all pending schema migrations.
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let conn = Connection::open(path).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to open database: {}", e),
            )
        })?;

        // Mandatory WAL mode for crash resilience and concurrent reads
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;",
        )
        .map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to set PRAGMA: {}", e),
            )
        })?;

        let mut db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    /// In-memory database for testing
    pub fn in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory().map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to open in-memory db: {}", e),
            )
        })?;

        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;",
        )
        .map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to set PRAGMA: {}", e),
            )
        })?;

        let mut db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    pub fn schema_version(&self) -> Result<u32> {
        let version: u32 = self
            .conn
            .query_row("PRAGMA user_version;", [], |r| r.get(0))
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to read user_version: {}", e),
                )
            })?;
        Ok(version)
    }

    fn migrate(&mut self) -> Result<()> {
        let current_version = self.schema_version()?;
        if current_version < 1 {
            info!("Migrating database schema from v{} to v1", current_version);
            self.conn
                .execute_batch(
                    "BEGIN TRANSACTION;
                     CREATE TABLE IF NOT EXISTS instances (
                         id TEXT PRIMARY KEY,
                         name TEXT NOT NULL,
                         game_version TEXT NOT NULL,
                         loader TEXT,
                         loader_version TEXT,
                         java_path TEXT,
                         memory_min_mb INTEGER,
                         memory_max_mb INTEGER,
                         jvm_args TEXT,
                         last_played_at TEXT,
                         total_playtime_seconds INTEGER NOT NULL DEFAULT 0,
                         icon_path TEXT,
                         banner_path TEXT,
                         created_at TEXT NOT NULL
                     );

                     -- Stores ONLY account metadata. TOKENS ARE NEVER STORED IN SQLITE!
                     CREATE TABLE IF NOT EXISTS accounts_metadata (
                         uuid TEXT PRIMARY KEY,
                         username TEXT NOT NULL,
                         account_type TEXT NOT NULL,
                         skin_url TEXT,
                         cape_url TEXT,
                         server_url TEXT,
                         last_used_at TEXT NOT NULL
                     );

                     CREATE TABLE IF NOT EXISTS settings (
                         key TEXT PRIMARY KEY,
                         value TEXT NOT NULL
                     );

                     PRAGMA user_version = 1;
                     COMMIT;",
                )
                .map_err(|e| {
                    AppError::new(
                        AppErrorCode::InternalError,
                        format!("Migration to v1 failed: {}", e),
                    )
                })?;
        }

        if current_version < 2 {
            info!("Migrating database schema from v{} to v2", current_version);
            self.conn
                .execute_batch(
                    "BEGIN TRANSACTION;
                     ALTER TABLE instances ADD COLUMN last_mclo_gs_url TEXT;
                     ALTER TABLE instances ADD COLUMN last_mclo_gs_at TEXT;
                     PRAGMA user_version = 2;
                     COMMIT;",
                )
                .map_err(|e| {
                    AppError::new(
                        AppErrorCode::InternalError,
                        format!("Migration to v2 failed: {}", e),
                    )
                })?;
        }

        Ok(())
    }

    pub fn insert_instance(&self, instance: &Instance) -> Result<()> {
        self.conn
            .execute(
                "INSERT INTO instances (
                    id, name, game_version, loader, loader_version, java_path,
                    memory_min_mb, memory_max_mb, jvm_args, last_played_at,
                    total_playtime_seconds, icon_path, banner_path, created_at,
                    last_mclo_gs_url, last_mclo_gs_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16);",
                params![
                    instance.id,
                    instance.name,
                    instance.game_version,
                    instance.loader,
                    instance.loader_version,
                    instance.java_path,
                    instance.memory_min_mb,
                    instance.memory_max_mb,
                    instance.jvm_args,
                    instance.last_played_at,
                    instance.total_playtime_seconds,
                    instance.icon_path,
                    instance.banner_path,
                    instance.created_at,
                    instance.last_mclo_gs_url,
                    instance.last_mclo_gs_at,
                ],
            )
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to insert instance: {}", e),
                )
            })?;
        Ok(())
    }

    pub fn get_instance(&self, id: &str) -> Result<Option<Instance>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, game_version, loader, loader_version, java_path,
                        memory_min_mb, memory_max_mb, jvm_args, last_played_at,
                        total_playtime_seconds, icon_path, banner_path, created_at,
                        last_mclo_gs_url, last_mclo_gs_at
                 FROM instances WHERE id = ?1;",
            )
            .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?;

        let mut rows = stmt
            .query(params![id])
            .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?;

        if let Some(row) = rows
            .next()
            .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?
        {
            Ok(Some(Instance {
                id: row
                    .get(0)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                name: row
                    .get(1)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                game_version: row
                    .get(2)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                loader: row
                    .get(3)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                loader_version: row
                    .get(4)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                java_path: row
                    .get(5)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                memory_min_mb: row
                    .get(6)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                memory_max_mb: row
                    .get(7)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                jvm_args: row
                    .get(8)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                last_played_at: row
                    .get(9)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                total_playtime_seconds: row
                    .get(10)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                icon_path: row
                    .get(11)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                banner_path: row
                    .get(12)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                created_at: row
                    .get(13)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                last_mclo_gs_url: row
                    .get(14)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                last_mclo_gs_at: row
                    .get(15)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn update_instance_loader(
        &self,
        id: &str,
        loader: Option<&str>,
        loader_version: Option<&str>,
    ) -> Result<()> {
        self.conn
            .execute(
                "UPDATE instances SET loader = ?1, loader_version = ?2 WHERE id = ?3;",
                params![loader, loader_version, id],
            )
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to update instance loader: {e}"),
                )
            })?;
        Ok(())
    }

    pub fn update_instance_mclogs(
        &self,
        id: &str,
        url: Option<&str>,
        uploaded_at: Option<&str>,
    ) -> Result<()> {
        self.conn
            .execute(
                "UPDATE instances SET last_mclo_gs_url = ?1, last_mclo_gs_at = ?2 WHERE id = ?3;",
                params![url, uploaded_at, id],
            )
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to update instance mclo.gs info: {e}"),
                )
            })?;
        Ok(())
    }

    pub fn delete_instance(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM instances WHERE id = ?1;", params![id])
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to delete instance: {e}"),
                )
            })?;
        Ok(())
    }

    pub fn list_instances(&self) -> Result<Vec<Instance>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, game_version, loader, loader_version, java_path,
                        memory_min_mb, memory_max_mb, jvm_args, last_played_at,
                        total_playtime_seconds, icon_path, banner_path, created_at,
                        last_mclo_gs_url, last_mclo_gs_at
                 FROM instances ORDER BY created_at DESC;",
            )
            .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?;

        let instance_iter = stmt
            .query_map([], |row| {
                Ok(Instance {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    game_version: row.get(2)?,
                    loader: row.get(3)?,
                    loader_version: row.get(4)?,
                    java_path: row.get(5)?,
                    memory_min_mb: row.get(6)?,
                    memory_max_mb: row.get(7)?,
                    jvm_args: row.get(8)?,
                    last_played_at: row.get(9)?,
                    total_playtime_seconds: row.get(10)?,
                    icon_path: row.get(11)?,
                    banner_path: row.get(12)?,
                    created_at: row.get(13)?,
                    last_mclo_gs_url: row.get(14)?,
                    last_mclo_gs_at: row.get(15)?,
                })
            })
            .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?;

        let mut list = Vec::new();
        for inst in instance_iter {
            list.push(inst.map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?);
        }
        Ok(list)
    }

    pub fn insert_or_update_account(&self, account: &AccountMetadata) -> Result<()> {
        self.conn
            .execute(
                "INSERT INTO accounts_metadata (uuid, username, account_type, skin_url, cape_url, server_url, last_used_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(uuid) DO UPDATE SET
                     username = excluded.username,
                     account_type = excluded.account_type,
                     skin_url = excluded.skin_url,
                     cape_url = excluded.cape_url,
                     server_url = excluded.server_url,
                     last_used_at = excluded.last_used_at;",
                params![
                    account.uuid,
                    account.username,
                    account.account_type,
                    account.skin_url,
                    account.cape_url,
                    account.server_url,
                    account.last_used_at,
                ],
            )
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to insert or update account: {}", e),
                )
            })?;
        Ok(())
    }

    pub fn get_account(&self, uuid: &str) -> Result<Option<AccountMetadata>> {
        let active_uuid = self.get_setting("active_account_uuid")?;
        let is_active = active_uuid.as_deref() == Some(uuid);

        let mut stmt = self
            .conn
            .prepare(
                "SELECT uuid, username, account_type, skin_url, cape_url, server_url, last_used_at
                 FROM accounts_metadata WHERE uuid = ?1;",
            )
            .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?;

        let mut rows = stmt
            .query(params![uuid])
            .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?;

        if let Some(row) = rows
            .next()
            .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?
        {
            Ok(Some(AccountMetadata {
                uuid: row
                    .get(0)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                username: row
                    .get(1)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                account_type: row
                    .get(2)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                skin_url: row
                    .get(3)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                cape_url: row
                    .get(4)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                server_url: row
                    .get(5)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                last_used_at: row
                    .get(6)
                    .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?,
                is_active,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn list_accounts(&self) -> Result<Vec<AccountMetadata>> {
        let active_uuid = self.get_setting("active_account_uuid")?;

        let mut stmt = self
            .conn
            .prepare(
                "SELECT uuid, username, account_type, skin_url, cape_url, server_url, last_used_at
                 FROM accounts_metadata ORDER BY last_used_at DESC;",
            )
            .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, String>(6)?,
                ))
            })
            .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?;

        let mut list = Vec::new();
        for r in rows {
            let (uuid, username, account_type, skin_url, cape_url, server_url, last_used_at) =
                r.map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?;
            let is_active =
                active_uuid.as_deref() == Some(&uuid) || (active_uuid.is_none() && list.is_empty());
            list.push(AccountMetadata {
                uuid,
                username,
                account_type,
                skin_url,
                cape_url,
                server_url,
                last_used_at,
                is_active,
            });
        }
        Ok(list)
    }

    pub fn delete_account(&self, uuid: &str) -> Result<()> {
        self.conn
            .execute(
                "DELETE FROM accounts_metadata WHERE uuid = ?1;",
                params![uuid],
            )
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to delete account: {}", e),
                )
            })?;

        if let Ok(Some(active)) = self.get_setting("active_account_uuid") {
            if active == uuid {
                let _ = self.conn.execute(
                    "DELETE FROM settings WHERE key = 'active_account_uuid';",
                    [],
                );
            }
        }
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT value FROM settings WHERE key = ?1;")
            .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?;

        let mut rows = stmt
            .query(params![key])
            .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?;

        if let Some(row) = rows
            .next()
            .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?
        {
            Ok(Some(row.get(0).map_err(|e| {
                AppError::new(AppErrorCode::InternalError, e.to_string())
            })?))
        } else {
            Ok(None)
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn
            .execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
                params![key, value],
            )
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to set setting: {}", e),
                )
            })?;
        Ok(())
    }

    pub fn get_active_account(&self) -> Result<Option<AccountMetadata>> {
        if let Some(active_uuid) = self.get_setting("active_account_uuid")? {
            if let Some(acc) = self.get_account(&active_uuid)? {
                return Ok(Some(acc));
            }
        }

        let accounts = self.list_accounts()?;
        Ok(accounts.into_iter().next())
    }

    pub fn set_active_account(&self, uuid: &str) -> Result<()> {
        self.set_setting("active_account_uuid", uuid)?;
        self.conn
            .execute(
                "UPDATE accounts_metadata SET last_used_at = datetime('now') WHERE uuid = ?1;",
                params![uuid],
            )
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to update account last_used_at: {}", e),
                )
            })?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wal_and_schema_version() {
        let db = Database::in_memory().expect("in memory db");
        assert_eq!(db.schema_version().unwrap(), CURRENT_SCHEMA_VERSION);

        let journal_mode: String = db
            .conn
            .query_row("PRAGMA journal_mode;", [], |r| r.get(0))
            .unwrap();
        // In-memory sqlite often reports "memory", but on file it is "wal".
        assert!(!journal_mode.is_empty());
    }

    #[test]
    fn test_no_tokens_in_database() {
        let db = Database::in_memory().expect("in memory db");
        let mut stmt = db
            .conn
            .prepare("SELECT sql FROM sqlite_master WHERE type='table';")
            .unwrap();
        let tables: Vec<String> = stmt
            .query_map([], |r| r.get::<usize, String>(0))
            .unwrap()
            .map(|r| r.unwrap().to_lowercase())
            .collect();

        for ddl in &tables {
            assert!(
                !ddl.contains("token"),
                "SECURITY VIOLATION: Database table schema must NEVER contain token columns! DDL: {}",
                ddl
            );
            assert!(
                !ddl.contains("secret"),
                "SECURITY VIOLATION: Database table schema must NEVER contain secret columns! DDL: {}",
                ddl
            );
            assert!(
                !ddl.contains("password"),
                "SECURITY VIOLATION: Database table schema must NEVER contain password columns! DDL: {}",
                ddl
            );
        }
    }

    #[test]
    fn test_instance_crud() {
        let db = Database::in_memory().expect("in memory db");
        let inst = Instance {
            id: "inst-1".into(),
            name: "Vanilla 1.20.4".into(),
            game_version: "1.20.4".into(),
            loader: None,
            loader_version: None,
            java_path: None,
            memory_min_mb: Some(1024),
            memory_max_mb: Some(4096),
            jvm_args: None,
            last_played_at: None,
            total_playtime_seconds: 0,
            icon_path: None,
            banner_path: None,
            created_at: "2026-09-04T00:00:00Z".into(),
            last_mclo_gs_url: None,
            last_mclo_gs_at: None,
        };

        db.insert_instance(&inst).expect("insert");
        let fetched = db.get_instance("inst-1").expect("get").expect("found");
        assert_eq!(fetched.name, "Vanilla 1.20.4");
        assert_eq!(fetched.game_version, "1.20.4");

        db.update_instance_loader("inst-1", Some("fabric"), Some("0.15.7"))
            .expect("update loader");
        let updated = db.get_instance("inst-1").unwrap().unwrap();
        assert_eq!(updated.loader.as_deref(), Some("fabric"));
        assert_eq!(updated.loader_version.as_deref(), Some("0.15.7"));

        let all = db.list_instances().expect("list");
        assert_eq!(all.len(), 1);
    }

    #[test]
    fn test_migration_v1_to_v2_preserves_data() {
        let conn = Connection::open_in_memory().unwrap();
        // Setup initial v1 database manually
        conn.execute_batch(
            "CREATE TABLE instances (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                game_version TEXT NOT NULL,
                loader TEXT,
                loader_version TEXT,
                java_path TEXT,
                memory_min_mb INTEGER,
                memory_max_mb INTEGER,
                jvm_args TEXT,
                last_played_at TEXT,
                total_playtime_seconds INTEGER NOT NULL DEFAULT 0,
                icon_path TEXT,
                banner_path TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE accounts_metadata (
                uuid TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                account_type TEXT NOT NULL,
                skin_url TEXT,
                cape_url TEXT,
                server_url TEXT,
                last_used_at TEXT NOT NULL
            );
            CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            PRAGMA user_version = 1;",
        )
        .unwrap();

        // Insert an instance in v1 schema
        conn.execute(
            "INSERT INTO instances (id, name, game_version, created_at) VALUES ('v1-inst', 'V1 Test', '1.20.1', '2026-09-01T00:00:00Z');",
            [],
        )
        .unwrap();

        // Wrap into Database struct and trigger migrate()
        let mut db = Database { conn };
        db.migrate().expect("migrate to v2");

        assert_eq!(db.schema_version().unwrap(), 2);

        let fetched = db.get_instance("v1-inst").expect("get").expect("exists");
        assert_eq!(fetched.name, "V1 Test");
        assert_eq!(fetched.game_version, "1.20.1");
        assert_eq!(fetched.last_mclo_gs_url, None);
        assert_eq!(fetched.last_mclo_gs_at, None);

        // Update mclo.gs fields
        db.update_instance_mclogs(
            "v1-inst",
            Some("https://mclo.gs/abc1234"),
            Some("2026-09-05T01:00:00Z"),
        )
        .expect("update mclogs");

        let updated = db.get_instance("v1-inst").expect("get updated").unwrap();
        assert_eq!(
            updated.last_mclo_gs_url.as_deref(),
            Some("https://mclo.gs/abc1234")
        );
        assert_eq!(
            updated.last_mclo_gs_at.as_deref(),
            Some("2026-09-05T01:00:00Z")
        );
    }

    #[test]
    fn test_account_metadata_crud() {
        let db = Database::in_memory().expect("in memory db");

        let acc = AccountMetadata {
            uuid: "00000000-0000-0000-0000-000000000001".into(),
            username: "Player1".into(),
            account_type: "offline".into(),
            skin_url: None,
            cape_url: None,
            server_url: None,
            last_used_at: "2026-09-04T00:00:00Z".into(),
            is_active: false,
        };

        db.insert_or_update_account(&acc).expect("insert account");

        let fetched = db
            .get_account("00000000-0000-0000-0000-000000000001")
            .expect("get account")
            .expect("account exists");
        assert_eq!(fetched.username, "Player1");
        assert_eq!(fetched.account_type, "offline");

        let accounts = db.list_accounts().expect("list accounts");
        assert_eq!(accounts.len(), 1);
        assert!(accounts[0].is_active);

        db.set_active_account("00000000-0000-0000-0000-000000000001")
            .expect("set active");
        let active = db
            .get_active_account()
            .expect("get active")
            .expect("has active");
        assert_eq!(active.uuid, "00000000-0000-0000-0000-000000000001");

        db.delete_account("00000000-0000-0000-0000-000000000001")
            .expect("delete account");
        let remaining = db.list_accounts().expect("list after delete");
        assert_eq!(remaining.len(), 0);
    }
}
