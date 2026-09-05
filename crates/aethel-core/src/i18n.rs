use crate::error::AppErrorCode;

/// Returns a human-readable English explanation with troubleshooting guidance for an `AppErrorCode`.
///
/// Intended for dev-mode diagnostics, CLI outputs, and logging.
/// In production, the graphical user interface localizes the error code via frontend dictionary keys.
pub fn humanize_error(code: AppErrorCode) -> &'static str {
    match code {
        AppErrorCode::NoDiskSpace => {
            "Insufficient free disk space. Free up disk space on your selected installation drive."
        }
        AppErrorCode::NetworkError => {
            "Network connection error. Check your internet access, proxy settings, or DNS."
        }
        AppErrorCode::HashMismatch => {
            "Integrity verification failed. The downloaded file checksum did not match the manifest."
        }
        AppErrorCode::JavaNotFound => {
            "Java Runtime Environment (JRE) was not found at the configured binary path."
        }
        AppErrorCode::JavaIncompatible => {
            "Java version mismatch. The configured Java version is incompatible with this game version."
        }
        AppErrorCode::ClasspathTooLong => {
            "Classpath limit exceeded. The assembled classpath string exceeds operating system limits."
        }
        AppErrorCode::InvalidManifest => {
            "Manifest structure is corrupted or failed JSON schema validation."
        }
        AppErrorCode::ZipSlipDetected => {
            "Zip Slip security alert: archive contains an entry with illegal directory traversal paths."
        }
        AppErrorCode::AuthFailed => {
            "Authentication failed. Please verify credentials or refresh your login session."
        }
        AppErrorCode::KeyringAccessFailed => {
            "Failed to access the operating system credential store (Keyring)."
        }
        AppErrorCode::EncryptionFailed => {
            "Cryptographic failure: unable to encrypt credentials with AES-GCM."
        }
        AppErrorCode::DecryptionFailed => {
            "Cryptographic failure: unable to decrypt credentials with AES-GCM."
        }
        AppErrorCode::InstanceNotFound => {
            "Instance not found. The specified instance ID does not exist in local storage."
        }
        AppErrorCode::LaunchProvisionFailed => {
            "Launch preparation failed. Required game client or library files could not be verified."
        }
        AppErrorCode::InternalError => {
            "An unexpected internal error occurred. Please consult the launcher log console."
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_humanize_error_covers_all_variants() {
        let codes = [
            AppErrorCode::NoDiskSpace,
            AppErrorCode::NetworkError,
            AppErrorCode::HashMismatch,
            AppErrorCode::JavaNotFound,
            AppErrorCode::JavaIncompatible,
            AppErrorCode::ClasspathTooLong,
            AppErrorCode::InvalidManifest,
            AppErrorCode::ZipSlipDetected,
            AppErrorCode::AuthFailed,
            AppErrorCode::KeyringAccessFailed,
            AppErrorCode::EncryptionFailed,
            AppErrorCode::DecryptionFailed,
            AppErrorCode::InstanceNotFound,
            AppErrorCode::LaunchProvisionFailed,
            AppErrorCode::InternalError,
        ];

        for code in codes {
            let msg = humanize_error(code);
            assert!(!msg.is_empty());
        }
    }
}
