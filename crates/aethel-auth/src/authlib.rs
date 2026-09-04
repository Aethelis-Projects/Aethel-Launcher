use aethel_core::{AppError, AppErrorCode};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;
use std::path::{Path, PathBuf};

pub const AUTHLIB_INJECTOR_VERSION: &str = "1.2.5";
pub const AUTHLIB_INJECTOR_SHA256: &str =
    "3bc9ebdc583b36abd2a65b626c4b9f35f21177fbf42a851606eaaea3fd42ee0f";

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AuthlibProfile {
    pub username: String,
    pub server_url: String,
    pub java_agent: String,
}

pub struct AuthlibInjector {
    cache_dir: PathBuf,
}

impl AuthlibInjector {
    pub fn new(cache_dir: PathBuf) -> Self {
        Self { cache_dir }
    }

    pub fn cache_dir(&self) -> &Path {
        &self.cache_dir
    }

    pub fn jar_path(&self) -> PathBuf {
        self.cache_dir
            .join(format!("authlib-injector-{AUTHLIB_INJECTOR_VERSION}.jar"))
    }

    pub async fn ensure_downloaded(&self) -> Result<PathBuf, AppError> {
        let jar_path = self.jar_path();

        if jar_path.exists() {
            if self.verify_sha256(&jar_path)? {
                return Ok(jar_path);
            }
            let _ = std::fs::remove_file(&jar_path);
        }

        let url = format!(
            "https://github.com/yushijinhun/authlib-injector/releases/download/v{AUTHLIB_INJECTOR_VERSION}/authlib-injector-{AUTHLIB_INJECTOR_VERSION}.jar"
        );

        let res = reqwest::get(&url).await.map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Failed to download authlib-injector: {e}"),
            )
        })?;

        if !res.status().is_success() {
            return Err(AppError::new(
                AppErrorCode::NetworkError,
                format!("HTTP error downloading authlib-injector: {}", res.status()),
            ));
        }

        let bytes = res.bytes().await.map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Failed to read authlib-injector response body: {e}"),
            )
        })?;

        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let actual_hash = format!("{:x}", hasher.finalize());

        if actual_hash != AUTHLIB_INJECTOR_SHA256 {
            return Err(AppError::new(
                AppErrorCode::HashMismatch,
                format!(
                    "authlib-injector SHA-256 mismatch: expected {AUTHLIB_INJECTOR_SHA256}, got {actual_hash}"
                ),
            ));
        }

        std::fs::create_dir_all(&self.cache_dir).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to create authlib cache directory: {e}"),
            )
        })?;

        std::fs::write(&jar_path, &bytes).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to write authlib-injector jar: {e}"),
            )
        })?;

        Ok(jar_path)
    }

    pub fn verify_sha256(&self, path: &Path) -> Result<bool, AppError> {
        let bytes = std::fs::read(path).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to read file for hash check: {e}"),
            )
        })?;

        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let hash = format!("{:x}", hasher.finalize());

        Ok(hash == AUTHLIB_INJECTOR_SHA256)
    }

    pub fn java_agent_arg(&self, jar_path: &Path, server_url: &str) -> String {
        format!("-javaagent:{}={}", jar_path.display(), server_url)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_java_agent_arg() {
        let dir = tempdir().unwrap();
        let injector = AuthlibInjector::new(dir.path().to_path_buf());
        let jar = PathBuf::from("C:/cache/authlib-injector-1.2.5.jar");
        let arg = injector.java_agent_arg(&jar, "https://ely.by/api/authlib-injector");

        assert_eq!(
            arg,
            "-javaagent:C:/cache/authlib-injector-1.2.5.jar=https://ely.by/api/authlib-injector"
        );
    }

    #[test]
    fn test_sha256_verification_logic() {
        let dir = tempdir().unwrap();
        let injector = AuthlibInjector::new(dir.path().to_path_buf());

        // File with invalid content
        let dummy_file = dir.path().join("dummy.jar");
        std::fs::write(&dummy_file, b"corrupted bytes").unwrap();

        assert!(!injector.verify_sha256(&dummy_file).unwrap());
    }
}
