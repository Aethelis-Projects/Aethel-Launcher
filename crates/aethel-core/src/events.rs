use crate::error::AppErrorCode;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::time::Duration;
use tauri_specta::Event;
use tokio::sync::mpsc;
use tokio::time::interval;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct DownloadProgressItem {
    pub task_id: String,
    pub current: u64,
    pub total: u64,
    pub speed_bps: u64,
    pub file_name: String,
}

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
    DownloadBatchProgress {
        items: Vec<DownloadProgressItem>,
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
    ProcessLogBatch {
        instance_id: String,
        lines: Vec<String>,
    },
    ProcessExited {
        instance_id: String,
        exit_code: Option<i32>,
    },
    InstanceUpdated {
        instance_id: String,
    },
}

/// A 15 Hz (~66ms) rate-limited batcher for high-throughput events (downloads, logs).
pub struct RateLimitedBatcher<T: Send + 'static> {
    sender: mpsc::UnboundedSender<T>,
}

impl<T: Send + 'static> RateLimitedBatcher<T> {
    pub fn new<F>(rate_hz: u64, mut on_batch: F) -> Self
    where
        F: FnMut(Vec<T>) + Send + 'static,
    {
        let (sender, mut receiver) = mpsc::unbounded_channel::<T>();
        let interval_duration = Duration::from_millis(1000 / rate_hz.max(1));

        tokio::spawn(async move {
            let mut ticker = interval(interval_duration);
            let mut buffer = Vec::new();

            loop {
                tokio::select! {
                    Some(item) = receiver.recv() => {
                        buffer.push(item);
                    }
                    _ = ticker.tick() => {
                        if !buffer.is_empty() {
                            let batch = std::mem::take(&mut buffer);
                            on_batch(batch);
                        }
                    }
                    else => {
                        if !buffer.is_empty() {
                            let batch = std::mem::take(&mut buffer);
                            on_batch(batch);
                        }
                        break;
                    }
                }
            }
        });

        Self { sender }
    }

    pub fn send(&self, item: T) -> Result<(), mpsc::error::SendError<T>> {
        self.sender.send(item)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[tokio::test]
    async fn test_rate_limited_batcher() {
        let batches = Arc::new(Mutex::new(Vec::new()));
        let batches_clone = batches.clone();

        let batcher = RateLimitedBatcher::<u32>::new(15, move |items| {
            batches_clone.lock().unwrap().push(items);
        });

        for i in 0..10 {
            batcher.send(i).unwrap();
        }

        tokio::time::sleep(Duration::from_millis(150)).await;

        let locked = batches.lock().unwrap();
        assert!(!locked.is_empty());
        let total_items: usize = locked.iter().map(|b| b.len()).sum();
        assert_eq!(total_items, 10);
    }
}
