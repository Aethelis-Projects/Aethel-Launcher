use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tracing::{info, warn};

use crate::LaunchReceipt;
use aethel_core::{AppError, AppErrorCode};

#[cfg(windows)]
pub struct JobObject {
    handle: windows_sys::Win32::Foundation::HANDLE,
}

#[cfg(windows)]
unsafe impl Send for JobObject {}
#[cfg(windows)]
unsafe impl Sync for JobObject {}

#[cfg(windows)]
impl JobObject {
    pub fn create() -> Result<Self, AppError> {
        unsafe {
            let handle = windows_sys::Win32::System::JobObjects::CreateJobObjectW(
                std::ptr::null_mut(),
                std::ptr::null(),
            );
            if handle.is_null() || handle == windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE {
                return Err(AppError::new(
                    AppErrorCode::InternalError,
                    "Failed to create Windows Job Object",
                ));
            }

            let mut info: windows_sys::Win32::System::JobObjects::JOBOBJECT_EXTENDED_LIMIT_INFORMATION =
                std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags =
                windows_sys::Win32::System::JobObjects::JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            let res = windows_sys::Win32::System::JobObjects::SetInformationJobObject(
                handle,
                windows_sys::Win32::System::JobObjects::JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of::<
                    windows_sys::Win32::System::JobObjects::JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                >() as u32,
            );

            if res == 0 {
                windows_sys::Win32::Foundation::CloseHandle(handle);
                return Err(AppError::new(
                    AppErrorCode::InternalError,
                    "Failed to configure Job Object with KILL_ON_JOB_CLOSE",
                ));
            }

            Ok(Self { handle })
        }
    }

    /// Assigns a process handle to this Job Object.
    ///
    /// # Safety
    /// Caller must ensure `process_handle` is a valid Win32 process handle.
    pub unsafe fn assign_process(
        &self,
        process_handle: windows_sys::Win32::Foundation::HANDLE,
    ) -> Result<(), AppError> {
        let res = windows_sys::Win32::System::JobObjects::AssignProcessToJobObject(
            self.handle,
            process_handle,
        );
        if res == 0 {
            return Err(AppError::new(
                AppErrorCode::InternalError,
                "Failed to assign process to Job Object",
            ));
        }
        Ok(())
    }

    pub fn terminate(&self, exit_code: u32) -> Result<(), AppError> {
        unsafe {
            let res =
                windows_sys::Win32::System::JobObjects::TerminateJobObject(self.handle, exit_code);
            if res == 0 {
                return Err(AppError::new(
                    AppErrorCode::InternalError,
                    "Failed to terminate Job Object",
                ));
            }
            Ok(())
        }
    }

    pub fn raw_handle(&self) -> windows_sys::Win32::Foundation::HANDLE {
        self.handle
    }
}

#[cfg(windows)]
impl Drop for JobObject {
    fn drop(&mut self) {
        if !self.handle.is_null()
            && self.handle != windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE
        {
            unsafe {
                windows_sys::Win32::Foundation::CloseHandle(self.handle);
            }
        }
    }
}

/// A running supervised child process.
pub struct SupervisedProcess {
    pid: u32,
    child: Child,
    #[cfg(windows)]
    _job: Option<JobObject>,
    log_buffer: Arc<Mutex<Vec<String>>>,
    stdout_task: Option<tokio::task::JoinHandle<()>>,
    stderr_task: Option<tokio::task::JoinHandle<()>>,
}

impl SupervisedProcess {
    /// Returns the PID of the spawned process.
    pub fn pid(&self) -> u32 {
        self.pid
    }

    /// Returns a clone of all collected log lines so far.
    pub fn logs(&self) -> Vec<String> {
        self.log_buffer
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    /// Waits for the process to exit, draining stdout and stderr.
    pub async fn wait(&mut self) -> Result<std::process::ExitStatus, AppError> {
        let status = self.child.wait().await.map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed waiting for child process: {e}"),
            )
        })?;

        if let Some(handle) = self.stdout_task.take() {
            let _ = handle.await;
        }
        if let Some(handle) = self.stderr_task.take() {
            let _ = handle.await;
        }

        Ok(status)
    }

    /// Attempts graceful shutdown with a timeout, falling back to force kill.
    pub async fn shutdown(
        &mut self,
        timeout: Duration,
    ) -> Result<std::process::ExitStatus, AppError> {
        info!(
            "Initiating graceful shutdown for process (PID: {})",
            self.pid
        );

        tokio::select! {
            res = self.child.wait() => {
                match res {
                    Ok(status) => {
                        info!("Process (PID: {}) exited cleanly", self.pid);
                        Ok(status)
                    }
                    Err(e) => {
                        Err(AppError::new(AppErrorCode::InternalError, format!("Error waiting during shutdown: {e}")))
                    }
                }
            }
            _ = tokio::time::sleep(timeout) => {
                warn!("Process (PID: {}) timed out after {:?}; force killing", self.pid, timeout);
                self.force_kill().await?;
                self.child.wait().await.map_err(|e| {
                    AppError::new(AppErrorCode::InternalError, format!("Failed waiting after kill: {e}"))
                })
            }
        }
    }

    /// Forcefully kills the process tree.
    pub async fn force_kill(&mut self) -> Result<(), AppError> {
        #[cfg(windows)]
        {
            if let Some(ref job) = self._job {
                let _ = job.terminate(1);
            }
        }

        self.child.kill().await.map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to kill process: {e}"),
            )
        })
    }
}

/// Type alias for asynchronous log stream line consumer.
pub type LogCallback = Arc<dyn Fn(&str) + Send + Sync + 'static>;

/// Supervisor responsible for launching and managing Minecraft processes.
pub struct ProcessSupervisor;

impl ProcessSupervisor {
    /// Spawns a supervised process from a `LaunchReceipt`.
    pub async fn spawn(
        receipt: &LaunchReceipt,
        log_callback: Option<LogCallback>,
    ) -> Result<SupervisedProcess, AppError> {
        let mut cmd = Command::new(&receipt.java_path);
        cmd.current_dir(&receipt.working_dir);
        cmd.args(&receipt.arguments);
        cmd.envs(&receipt.environment);

        tracing::info!(
            "Spawning Minecraft: {:?} {:?}, env: {:?}, workdir: {:?}",
            receipt.java_path,
            receipt.arguments,
            receipt.environment,
            receipt.working_dir
        );

        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        cmd.kill_on_drop(true);

        #[cfg(unix)]
        {
            cmd.process_group(0);
        }

        #[cfg(windows)]
        let job = match JobObject::create() {
            Ok(j) => Some(j),
            Err(e) => {
                warn!("Failed to create Job Object (process might not terminate on crash): {e}");
                None
            }
        };

        let mut child = cmd.spawn().map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to spawn process {:?}: {e}", receipt.java_path),
            )
        })?;

        let pid = child.id().ok_or_else(|| {
            AppError::new(
                AppErrorCode::InternalError,
                "Failed to get child process ID",
            )
        })?;

        #[cfg(windows)]
        {
            if let Some(ref j) = job {
                if let Some(handle) = child.raw_handle() {
                    let res = unsafe { j.assign_process(handle as _) };
                    if let Err(e) = res {
                        warn!("Failed to assign process to Job Object: {e}");
                    }
                }
            }
        }

        let log_buffer = Arc::new(Mutex::new(Vec::<String>::new()));

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let stdout_task = if let Some(out) = stdout {
            let buf = Arc::clone(&log_buffer);
            let cb = log_callback.clone();
            Some(tokio::spawn(async move {
                let mut reader = BufReader::new(out).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    if let Ok(mut lock) = buf.lock() {
                        lock.push(line.clone());
                    }
                    if let Some(ref callback) = cb {
                        callback(&line);
                    }
                }
            }))
        } else {
            None
        };

        let stderr_task = if let Some(err) = stderr {
            let buf = Arc::clone(&log_buffer);
            let cb = log_callback;
            Some(tokio::spawn(async move {
                let mut reader = BufReader::new(err).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    if let Ok(mut lock) = buf.lock() {
                        lock.push(line.clone());
                    }
                    if let Some(ref callback) = cb {
                        callback(&line);
                    }
                }
            }))
        } else {
            None
        };

        Ok(SupervisedProcess {
            pid,
            child,
            #[cfg(windows)]
            _job: job,
            log_buffer,
            stdout_task,
            stderr_task,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::path::PathBuf;

    #[cfg(windows)]
    #[test]
    fn test_job_object_creation() {
        let job = JobObject::create();
        assert!(job.is_ok(), "Should successfully create Windows Job Object");
    }

    #[tokio::test]
    async fn test_supervisor_spawn_and_log_capture() {
        let (cmd, args) = if cfg!(windows) {
            (
                "cmd.exe",
                vec![
                    "/c".to_string(),
                    "echo Hello Supervised Process".to_string(),
                ],
            )
        } else {
            ("echo", vec!["Hello Supervised Process".to_string()])
        };

        let receipt = LaunchReceipt {
            java_path: PathBuf::from(cmd),
            working_dir: std::env::current_dir().unwrap(),
            command: cmd.to_string(),
            arguments: args,
            environment: HashMap::new(),
            classpath_tier: "Tier1_Direct".to_string(),
            main_class: String::new(),
            classpath: Vec::new(),
        };

        let captured = Arc::new(Mutex::new(Vec::new()));
        let captured_clone = Arc::clone(&captured);
        let cb = Arc::new(move |line: &str| {
            captured_clone.lock().unwrap().push(line.to_string());
        });

        let mut proc = ProcessSupervisor::spawn(&receipt, Some(cb))
            .await
            .expect("Failed to spawn supervised process");

        assert!(proc.pid() > 0);
        let status = proc.wait().await.expect("Failed to wait for process");
        assert!(status.success());

        let logs = proc.logs();
        let log_text = logs.join("\n");
        assert!(
            log_text.contains("Hello Supervised Process"),
            "Logs must capture stdout: {log_text}"
        );
    }

    #[tokio::test]
    async fn test_supervisor_shutdown_timeout() {
        // Spawn a process that sleeps
        let (cmd, args) = if cfg!(windows) {
            (
                "ping",
                vec!["127.0.0.1".to_string(), "-n".to_string(), "5".to_string()],
            )
        } else {
            ("sleep", vec!["5".to_string()])
        };

        let receipt = LaunchReceipt {
            java_path: PathBuf::from(cmd),
            working_dir: std::env::current_dir().unwrap(),
            command: cmd.to_string(),
            arguments: args,
            environment: HashMap::new(),
            classpath_tier: "Tier1_Direct".to_string(),
            main_class: String::new(),
            classpath: Vec::new(),
        };

        let mut proc = ProcessSupervisor::spawn(&receipt, None)
            .await
            .expect("Spawn sleep process");

        // Force shutdown after 100ms timeout
        let status = proc.shutdown(Duration::from_millis(100)).await;
        assert!(
            status.is_ok(),
            "Shutdown should succeed via timeout force kill"
        );
    }
}
