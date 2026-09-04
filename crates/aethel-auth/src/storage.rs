use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aethel_core::{AppError, AppErrorCode};
use keyring::{Entry, Error as KeyringError};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub struct SecureStorage {
    service_name: String,
    fallback_dir: PathBuf,
}

#[derive(Serialize, Deserialize)]
struct EncryptedData {
    nonce: Vec<u8>,
    ciphertext: Vec<u8>,
}

impl SecureStorage {
    pub fn new(service_name: impl Into<String>, fallback_dir: PathBuf) -> Self {
        Self {
            service_name: service_name.into(),
            fallback_dir,
        }
    }

    pub fn store_token(&self, key: &str, value: &str) -> Result<(), AppError> {
        // Attempt system keyring first
        match Entry::new(&self.service_name, key) {
            Ok(entry) => match entry.set_password(value) {
                Ok(_) => Ok(()),
                Err(e) => {
                    tracing::debug!(
                        "Keyring set_password failed ({}), using encrypted file fallback",
                        e
                    );
                    self.store_encrypted(key, value)
                }
            },
            Err(e) => {
                tracing::debug!(
                    "Keyring entry creation failed ({}), using encrypted file fallback",
                    e
                );
                self.store_encrypted(key, value)
            }
        }
    }

    pub fn retrieve_token(&self, key: &str) -> Result<Option<String>, AppError> {
        // Attempt system keyring first
        match Entry::new(&self.service_name, key) {
            Ok(entry) => match entry.get_password() {
                Ok(val) => Ok(Some(val)),
                Err(KeyringError::NoEntry) => {
                    // Check fallback file in case it was stored there previously
                    self.retrieve_encrypted(key)
                }
                Err(e) => {
                    tracing::debug!(
                        "Keyring get_password failed ({}), reading from encrypted file fallback",
                        e
                    );
                    self.retrieve_encrypted(key)
                }
            },
            Err(e) => {
                tracing::debug!(
                    "Keyring entry creation failed ({}), reading from encrypted file fallback",
                    e
                );
                self.retrieve_encrypted(key)
            }
        }
    }

    pub fn delete_token(&self, key: &str) -> Result<(), AppError> {
        if let Ok(entry) = Entry::new(&self.service_name, key) {
            let _ = entry.delete_credential();
        }
        let file_path = self.fallback_dir.join(format!("{key}.enc"));
        if file_path.exists() {
            let _ = std::fs::remove_file(file_path);
        }
        Ok(())
    }

    pub fn store_encrypted(&self, key: &str, value: &str) -> Result<(), AppError> {
        let master_key = self.load_or_generate_master_key()?;

        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let cipher = Aes256Gcm::new(&master_key);
        let ciphertext = cipher.encrypt(nonce, value.as_bytes()).map_err(|e| {
            AppError::new(
                AppErrorCode::EncryptionFailed,
                format!("AES-GCM encryption failed: {e}"),
            )
        })?;

        let encrypted_data = EncryptedData {
            nonce: nonce_bytes.to_vec(),
            ciphertext,
        };

        let file_path = self.fallback_dir.join(format!("{key}.enc"));
        let json = serde_json::to_string(&encrypted_data).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Serialization failed: {e}"),
            )
        })?;

        std::fs::write(&file_path, json).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to write encrypted token file: {e}"),
            )
        })?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(metadata) = std::fs::metadata(&file_path) {
                let mut perms = metadata.permissions();
                perms.set_mode(0o600);
                let _ = std::fs::set_permissions(&file_path, perms);
            }
        }

        Ok(())
    }

    pub fn retrieve_encrypted(&self, key: &str) -> Result<Option<String>, AppError> {
        let file_path = self.fallback_dir.join(format!("{key}.enc"));

        if !file_path.exists() {
            return Ok(None);
        }

        let master_key = self.load_or_generate_master_key()?;
        let json = std::fs::read_to_string(&file_path).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to read encrypted token file: {e}"),
            )
        })?;

        let encrypted_data: EncryptedData = serde_json::from_str(&json).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Deserialization failed: {e}"),
            )
        })?;

        let nonce = Nonce::from_slice(&encrypted_data.nonce);
        let cipher = Aes256Gcm::new(&master_key);
        let plaintext = cipher
            .decrypt(nonce, encrypted_data.ciphertext.as_ref())
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::DecryptionFailed,
                    format!("AES-GCM decryption failed: {e}"),
                )
            })?;

        String::from_utf8(plaintext).map(Some).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Decrypted token is not valid UTF-8: {e}"),
            )
        })
    }

    fn load_or_generate_master_key(&self) -> Result<Key<Aes256Gcm>, AppError> {
        let key_path = self.fallback_dir.join("master.key");

        if key_path.exists() {
            let key_bytes = std::fs::read(&key_path).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to read master key: {e}"),
                )
            })?;

            if key_bytes.len() != 32 {
                return Err(AppError::new(
                    AppErrorCode::InternalError,
                    "Invalid master key size in storage",
                ));
            }

            Ok(*Key::<Aes256Gcm>::from_slice(&key_bytes))
        } else {
            let mut key_bytes = [0u8; 32];
            OsRng.fill_bytes(&mut key_bytes);

            std::fs::create_dir_all(&self.fallback_dir).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to create storage directory: {e}"),
                )
            })?;

            std::fs::write(&key_path, key_bytes).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to write master key: {e}"),
                )
            })?;

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(metadata) = std::fs::metadata(&key_path) {
                    let mut perms = metadata.permissions();
                    perms.set_mode(0o600);
                    let _ = std::fs::set_permissions(&key_path, perms);
                }
            }

            Ok(*Key::<Aes256Gcm>::from_slice(&key_bytes))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_encrypted_storage_roundtrip() {
        let dir = tempdir().unwrap();
        let storage = SecureStorage::new("aethel-test", dir.path().to_path_buf());

        storage
            .store_encrypted("test-token", "secret-oauth-token-12345")
            .unwrap();
        let retrieved = storage.retrieve_encrypted("test-token").unwrap();

        assert_eq!(retrieved, Some("secret-oauth-token-12345".to_string()));
    }

    #[test]
    fn test_encrypted_storage_missing_key() {
        let dir = tempdir().unwrap();
        let storage = SecureStorage::new("aethel-test", dir.path().to_path_buf());

        let retrieved = storage.retrieve_encrypted("nonexistent").unwrap();
        assert_eq!(retrieved, None);
    }

    #[test]
    fn test_master_key_generation_and_reuse() {
        let dir = tempdir().unwrap();
        let storage = SecureStorage::new("aethel-test", dir.path().to_path_buf());

        storage.store_encrypted("key1", "val1").unwrap();
        let master_key_path = dir.path().join("master.key");
        assert!(master_key_path.exists());

        let key1 = std::fs::read(&master_key_path).unwrap();
        assert_eq!(key1.len(), 32);

        // Store another key and assert master key remains unchanged
        storage.store_encrypted("key2", "val2").unwrap();
        let key2 = std::fs::read(&master_key_path).unwrap();
        assert_eq!(key1, key2);

        assert_eq!(
            storage.retrieve_encrypted("key1").unwrap(),
            Some("val1".to_string())
        );
        assert_eq!(
            storage.retrieve_encrypted("key2").unwrap(),
            Some("val2".to_string())
        );
    }

    #[test]
    fn test_encrypted_storage_permissions() {
        let dir = tempdir().unwrap();
        let storage = SecureStorage::new("aethel-test", dir.path().to_path_buf());

        storage.store_encrypted("perm-test", "val").unwrap();

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let file_path = dir.path().join("perm-test.enc");
            let perms = std::fs::metadata(&file_path).unwrap().permissions();
            assert_eq!(perms.mode() & 0o777, 0o600);
        }
    }
}
