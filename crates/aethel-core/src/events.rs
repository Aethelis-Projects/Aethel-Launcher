use crate::error::AppErrorCode;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type, Event)]
#[serde(tag = "type", content = "data")]
pub enum BackendEvent {
    DownloadProgress {
        task_id: String,
        current: u64,
        total: u64,
        speed_bps: u64,
        file_name: String,
    },
    DownloadCompleted {
        task_id: String,
    },
    DownloadFailed {
        task_id: String,
        error_code: AppErrorCode,
        message: String,
    },
    ProcessStarting {
        instance_id: String,
    },
    ProcessStarted {
        instance_id: String,
        pid: u32,
    },
    ProcessLog {
        instance_id: String,
        line: String,
        is_stderr: bool,
    },
    ProcessExited {
        instance_id: String,
        exit_code: Option<i32>,
    },
    InstanceUpdated {
        instance_id: String,
    },
}