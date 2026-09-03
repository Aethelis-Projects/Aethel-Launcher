use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AppErrorCode {
    NoDiskSpace,
    NetworkError,
    HashMismatch,
    JavaNotFound,
    JavaIncompatible,
    ClasspathTooLong,
    InvalidManifest,
    ZipSlipDetected,
    AuthFailed,
    InstanceNotFound,
    InternalError,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Application error [{code:?}]: {message}")]
    App { code: AppErrorCode, message: String },
}

impl AppError {
    pub fn new(code: AppErrorCode, message: impl Into<String>) -> Self {
        Self::App {
            code,
            message: message.into(),
        }
    }

    pub fn code(&self) -> AppErrorCode {
        match self {
            Self::Io(_) => AppErrorCode::InternalError,
            Self::Json(_) => AppErrorCode::InvalidManifest,
            Self::Database(_) => AppErrorCode::InternalError,
            Self::App { code, .. } => *code,
        }
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
