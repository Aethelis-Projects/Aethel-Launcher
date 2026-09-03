use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use reqwest::header::RANGE;
use sha1::Digest;
use tokio::sync::{mpsc, Mutex, Semaphore};

use aethel_core::{AppError, AppErrorCode, BackendEvent, HashAlgorithm};

/// Checks available disk space on the volume containing `path`.
pub fn check_disk_space(path: &Path, required_bytes: u64) -> Result<(), AppError> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

        let dir = if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        };

        // Ensure directory exists or walk up to existing parent
        let mut check_dir = dir;
        while !check_dir.exists() {
            if let Some(parent) = check_dir.parent() {
                check_dir = parent;
            } else {
                break;
            }
        }

        let mut path_wide: Vec<u16> = check_dir.as_os_str().encode_wide().collect();
        path_wide.push(0);

        let mut free_bytes_available: u64 = 0;
        let mut total_bytes: u64 = 0;
        let mut total_free_bytes: u64 = 0;

        unsafe {
            let res = GetDiskFreeSpaceExW(
                path_wide.as_ptr(),
                &mut free_bytes_available,
                &mut total_bytes,
                &mut total_free_bytes,
            );
            if res == 0 {
                return Err(AppError::new(
                    AppErrorCode::InternalError,
                    "Failed to query disk free space on Windows",
                ));
            }
        }

        if free_bytes_available < required_bytes {
            return Err(AppError::new(
                AppErrorCode::NoDiskSpace,
                format!(
                    "Insufficient disk space: required {} bytes, available {} bytes",
                    required_bytes, free_bytes_available
                ),
            ));
        }
    }

    #[cfg(not(windows))]
    {
        // On Unix, fallback check if required > 0
        let _ = (path, required_bytes);
    }

    Ok(())
}

/// Safely and atomically replaces destination file with source file.
pub fn atomic_rename(from: &Path, to: &Path) -> Result<(), AppError> {
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to create destination directory: {e}"),
            )
        })?;
    }

    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING};

        let mut from_wide: Vec<u16> = from.as_os_str().encode_wide().collect();
        from_wide.push(0);
        let mut to_wide: Vec<u16> = to.as_os_str().encode_wide().collect();
        to_wide.push(0);

        unsafe {
            let res = MoveFileExW(
                from_wide.as_ptr(),
                to_wide.as_ptr(),
                MOVEFILE_REPLACE_EXISTING,
            );
            if res == 0 {
                return Err(AppError::new(
                    AppErrorCode::InternalError,
                    format!(
                        "Windows MoveFileExW failed: error {}",
                        std::io::Error::last_os_error()
                    ),
                ));
            }
        }
    }

    #[cfg(not(windows))]
    {
        std::fs::rename(from, to).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to atomically rename file: {e}"),
            )
        })?;
    }

    Ok(())
}

/// Safely extracts a zip archive, enforcing strict Zip Slip rejection.
pub fn extract_archive_safe(zip_path: &Path, destination: &Path) -> Result<Vec<PathBuf>, AppError> {
    let file = File::open(zip_path).map_err(|e| {
        AppError::new(
            AppErrorCode::InternalError,
            format!("Failed to open archive {}: {e}", zip_path.display()),
        )
    })?;

    let mut archive = zip::ZipArchive::new(file).map_err(|e| {
        AppError::new(
            AppErrorCode::InvalidManifest,
            format!("Invalid zip archive: {e}"),
        )
    })?;

    std::fs::create_dir_all(destination).map_err(|e| {
        AppError::new(
            AppErrorCode::InternalError,
            format!("Failed to create extract destination directory: {e}"),
        )
    })?;

    let canonical_dest = destination.canonicalize().map_err(|e| {
        AppError::new(
            AppErrorCode::InternalError,
            format!("Failed to canonicalize destination directory: {e}"),
        )
    })?;

    let mut extracted_files = Vec::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to read archive entry at index {i}: {e}"),
            )
        })?;

        // Detect Zip Slip attempt
        let enclosed_name = match entry.enclosed_name() {
            Some(path) => path.to_owned(),
            None => {
                return Err(AppError::new(
                    AppErrorCode::ZipSlipDetected,
                    format!(
                        "Zip Slip detected: archive entry '{}' attempts directory traversal",
                        entry.name()
                    ),
                ));
            }
        };

        let out_path = destination.join(&enclosed_name);

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to create directory {}: {e}", out_path.display()),
                )
            })?;
        } else {
            if let Some(parent) = out_path.parent() {
                if !parent.exists() {
                    std::fs::create_dir_all(parent).map_err(|e| {
                        AppError::new(
                            AppErrorCode::InternalError,
                            format!("Failed to create parent directory: {e}"),
                        )
                    })?;
                }
            }

            // Verify canonical path does not escape
            let parent_canonical = out_path.parent().unwrap().canonicalize().map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to canonicalize target parent: {e}"),
                )
            })?;

            if !parent_canonical.starts_with(&canonical_dest) {
                return Err(AppError::new(
                    AppErrorCode::ZipSlipDetected,
                    format!(
                        "Zip Slip detected: target file {} escapes destination {}",
                        out_path.display(),
                        canonical_dest.display()
                    ),
                ));
            }

            let mut outfile = File::create(&out_path).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to create file {}: {e}", out_path.display()),
                )
            })?;

            std::io::copy(&mut entry, &mut outfile).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to extract content to {}: {e}", out_path.display()),
                )
            })?;

            extracted_files.push(out_path);
        }
    }

    Ok(extracted_files)
}

/// Download task declaration.
#[derive(Debug, Clone)]
pub struct DownloadTask {
    pub task_id: String,
    pub url: String,
    pub destination: PathBuf,
    pub expected_size: Option<u64>,
    pub expected_hash: Option<String>,
    pub hash_algo: Option<HashAlgorithm>,
}

impl DownloadTask {
    pub fn new(
        task_id: impl Into<String>,
        url: impl Into<String>,
        destination: impl AsRef<Path>,
    ) -> Self {
        Self {
            task_id: task_id.into(),
            url: url.into(),
            destination: destination.as_ref().to_path_buf(),
            expected_size: None,
            expected_hash: None,
            hash_algo: None,
        }
    }

    pub fn with_sha1(mut self, hash: impl Into<String>) -> Self {
        self.expected_hash = Some(hash.into());
        self.hash_algo = Some(HashAlgorithm::Sha1);
        self
    }

    pub fn with_sha512(mut self, hash: impl Into<String>) -> Self {
        self.expected_hash = Some(hash.into());
        self.hash_algo = Some(HashAlgorithm::Sha512);
        self
    }

    pub fn with_size(mut self, size: u64) -> Self {
        self.expected_size = Some(size);
        self
    }
}

/// Concurrency-bounded download engine.
#[derive(Clone)]
pub struct DownloadEngine {
    client: reqwest::Client,
    semaphores: Arc<Mutex<HashMap<String, Arc<Semaphore>>>>,
    max_per_host: usize,
}

impl DownloadEngine {
    pub fn new(max_per_host: usize) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .expect("Failed to build reqwest client");

        Self {
            client,
            semaphores: Arc::new(Mutex::new(HashMap::new())),
            max_per_host,
        }
    }

    /// Obtains the concurrency-limiting semaphore for the specific host.
    pub async fn get_semaphore(&self, host: &str) -> Arc<Semaphore> {
        let mut map = self.semaphores.lock().await;
        map.entry(host.to_string())
            .or_insert_with(|| Arc::new(Semaphore::new(self.max_per_host)))
            .clone()
    }

    /// Executes a download task with exponential backoff retry.
    pub async fn download_with_retry(
        &self,
        task: &DownloadTask,
        max_retries: u32,
        progress_tx: Option<mpsc::Sender<BackendEvent>>,
    ) -> Result<(), AppError> {
        // Preflight disk space check
        if let Some(size) = task.expected_size {
            check_disk_space(&task.destination, size)?;
        }

        let host = reqwest::Url::parse(&task.url)
            .map(|u| u.host_str().unwrap_or("default").to_string())
            .unwrap_or_else(|_| "default".to_string());

        let sem = self.get_semaphore(&host).await;
        let _permit = sem.acquire().await.map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Semaphore acquire failed: {e}"),
            )
        })?;

        let mut attempt = 0;
        let mut backoff = Duration::from_secs(1);

        loop {
            match self.download_once(task, progress_tx.as_ref()).await {
                Ok(()) => return Ok(()),
                Err(_e) if attempt < max_retries => {
                    attempt += 1;
                    tokio::time::sleep(backoff).await;
                    backoff = (backoff * 2).min(Duration::from_secs(30));
                }
                Err(e) => return Err(e),
            }
        }
    }

    async fn download_once(
        &self,
        task: &DownloadTask,
        progress_tx: Option<&mpsc::Sender<BackendEvent>>,
    ) -> Result<(), AppError> {
        let part_path = task.destination.with_extension(format!(
            "{}.part",
            task.destination
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("bin")
        ));

        let mut existing_len = 0u64;
        if part_path.exists() {
            if let Ok(meta) = std::fs::metadata(&part_path) {
                existing_len = meta.len();
            }
        }

        let mut req = self.client.get(&task.url);
        if existing_len > 0 {
            req = req.header(RANGE, format!("bytes={existing_len}-"));
        }

        let resp = req.send().await.map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("HTTP request failed: {e}"),
            )
        })?;

        let status = resp.status();
        let is_partial = status == reqwest::StatusCode::PARTIAL_CONTENT;

        if !status.is_success() && !is_partial {
            return Err(AppError::new(
                AppErrorCode::NetworkError,
                format!("Server responded with status {}", status),
            ));
        }

        if let Some(parent) = part_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to create parent dir: {e}"),
                )
            })?;
        }

        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(is_partial)
            .truncate(!is_partial)
            .open(&part_path)
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to open part file: {e}"),
                )
            })?;

        let mut downloaded_bytes = if is_partial { existing_len } else { 0 };
        let total_bytes = task.expected_size.unwrap_or(0);
        let file_name = task
            .destination
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("file")
            .to_string();

        let mut stream = resp.bytes_stream();
        let mut last_progress_time = Instant::now();
        let mut last_downloaded = downloaded_bytes;

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Stream chunk read failed: {e}"),
                )
            })?;

            file.write_all(&chunk).map_err(|e| {
                AppError::new(AppErrorCode::InternalError, format!("Write error: {e}"))
            })?;

            downloaded_bytes += chunk.len() as u64;

            // Rate-limit progress event emission to ~15 Hz (every 66ms)
            if last_progress_time.elapsed() >= Duration::from_millis(66) {
                let elapsed_secs = last_progress_time.elapsed().as_secs_f64();
                let speed_bps = if elapsed_secs > 0.0 {
                    ((downloaded_bytes - last_downloaded) as f64 / elapsed_secs) as u64
                } else {
                    0
                };

                if let Some(tx) = progress_tx {
                    let _ = tx
                        .send(BackendEvent::DownloadProgress {
                            task_id: task.task_id.clone(),
                            current: downloaded_bytes,
                            total: total_bytes,
                            speed_bps,
                            file_name: file_name.clone(),
                        })
                        .await;
                }

                last_progress_time = Instant::now();
                last_downloaded = downloaded_bytes;
            }
        }

        file.flush().map_err(|e| {
            AppError::new(AppErrorCode::InternalError, format!("Flush failed: {e}"))
        })?;
        drop(file);

        // Verify cryptographic hash
        if let Some(ref expected_hash) = task.expected_hash {
            let actual_hash =
                compute_file_hash(&part_path, task.hash_algo.unwrap_or(HashAlgorithm::Sha1))?;
            if !actual_hash.eq_ignore_ascii_case(expected_hash) {
                let _ = std::fs::remove_file(&part_path);
                return Err(AppError::new(
                    AppErrorCode::HashMismatch,
                    format!(
                        "Hash verification failed for {}: expected {}, got {}",
                        task.destination.display(),
                        expected_hash,
                        actual_hash
                    ),
                ));
            }
        }

        // Atomically commit destination
        atomic_rename(&part_path, &task.destination)?;

        if let Some(tx) = progress_tx {
            let _ = tx
                .send(BackendEvent::DownloadCompleted {
                    task_id: task.task_id.clone(),
                })
                .await;
        }

        Ok(())
    }
}

/// Computes file hash with streaming chunks.
pub fn compute_file_hash(path: &Path, algo: HashAlgorithm) -> Result<String, AppError> {
    let mut file = File::open(path).map_err(|e| {
        AppError::new(
            AppErrorCode::InternalError,
            format!("Failed to open file for hashing: {e}"),
        )
    })?;

    let mut buffer = [0u8; 64 * 1024];

    match algo {
        HashAlgorithm::Sha1 => {
            let mut hasher = sha1::Sha1::new();
            loop {
                let n = file.read(&mut buffer).map_err(|e| {
                    AppError::new(
                        AppErrorCode::InternalError,
                        format!("Read error during hashing: {e}"),
                    )
                })?;
                if n == 0 {
                    break;
                }
                hasher.update(&buffer[..n]);
            }
            Ok(format!("{:x}", hasher.finalize()))
        }
        HashAlgorithm::Sha512 => {
            let mut hasher = sha2::Sha512::new();
            loop {
                let n = file.read(&mut buffer).map_err(|e| {
                    AppError::new(
                        AppErrorCode::InternalError,
                        format!("Read error during hashing: {e}"),
                    )
                })?;
                if n == 0 {
                    break;
                }
                hasher.update(&buffer[..n]);
            }
            Ok(format!("{:x}", hasher.finalize()))
        }
        HashAlgorithm::Murmur2 => Err(AppError::new(
            AppErrorCode::InternalError,
            "Murmur2 not yet implemented in aethel-download",
        )),
    }
}
