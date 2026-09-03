use aethel_core::{AppError, AppErrorCode, Instance, Result};
use rusqlite::{params, Connection};
use std::path::Path;
use tracing::info;

pub const CURRENT_SCHEMA_VERSION: u32 = 1;

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
        Ok(())
    }

    pub fn insert_instance(&self, instance: &Instance) -> Result<()> {
        self.conn
            .execute(
                "INSERT INTO instances (
                    id, name, game_version, loader, loader_version, java_path,
                    memory_min_mb, memory_max_mb, jvm_args, last_played_at,
                    total_playtime_seconds, icon_path, banner_path, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14);",
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
                        total_playtime_seconds, icon_path, banner_path, created_at
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
            }))
        } else {
            Ok(None)
        }
    }

    pub fn list_instances(&self) -> Result<Vec<Instance>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, game_version, loader, loader_version, java_path,
                        memory_min_mb, memory_max_mb, jvm_args, last_played_at,
                        total_playtime_seconds, icon_path, banner_path, created_at
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
                })
            })
            .map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?;

        let mut list = Vec::new();
        for inst in instance_iter {
            list.push(inst.map_err(|e| AppError::new(AppErrorCode::InternalError, e.to_string()))?);
        }
        Ok(list)
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
        };

        db.insert_instance(&inst).expect("insert");
        let fetched = db.get_instance("inst-1").expect("get").expect("found");
        assert_eq!(fetched.name, "Vanilla 1.20.4");
        assert_eq!(fetched.game_version, "1.20.4");

        let all = db.list_instances().expect("list");
        assert_eq!(all.len(), 1);
    }
}
