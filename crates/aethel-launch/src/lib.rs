use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use aethel_core::{AppError, AppErrorCode};
use aethel_manifest::{OsContext, VersionPackage};

/// Supported or detected Java major version.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum JavaVersion {
    V8,
    V16,
    V17,
    V21,
    Custom(u32),
}

impl JavaVersion {
    pub fn major(&self) -> u32 {
        match self {
            Self::V8 => 8,
            Self::V16 => 16,
            Self::V17 => 17,
            Self::V21 => 21,
            Self::Custom(v) => *v,
        }
    }

    pub fn supports_argfile(&self) -> bool {
        self.major() >= 9
    }

    pub fn is_utf8_argfile_default(&self) -> bool {
        self.major() >= 18
    }
}

/// Strategy for delivering the game classpath to the JVM.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ClasspathStrategy {
    Direct,
    EnvVar,
    ArgFile(PathBuf),
}

/// Structured receipt representing synthesized launch parameters.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
pub struct LaunchReceipt {
    pub java_path: PathBuf,
    pub working_dir: PathBuf,
    pub command: String,
    pub arguments: Vec<String>,
    pub environment: HashMap<String, String>,
    pub classpath_tier: String,
}

/// Complete configuration for launching an instance.
#[derive(Debug, Clone)]
pub struct LaunchConfiguration {
    pub java_path: PathBuf,
    pub java_version: JavaVersion,
    pub game_dir: PathBuf,
    pub assets_dir: PathBuf,
    pub natives_dir: PathBuf,
    pub version_package: VersionPackage,
    pub classpath_entries: Vec<PathBuf>,
    pub player_name: String,
    pub player_uuid: String,
    pub auth_access_token: String,
    pub user_type: String,
    pub memory_min_mb: Option<u32>,
    pub memory_max_mb: Option<u32>,
    pub custom_jvm_args: Option<Vec<String>>,
}

/// Replaces standard Minecraft template variables in argument strings.
pub fn substitute_template(template: &str, vars: &HashMap<&str, String>) -> String {
    let mut result = template.to_string();
    for (&k, v) in vars {
        result = result.replace(&format!("${{{k}}}"), v);
    }
    result
}

/// Checks if Windows 8.3 short path is available.
#[cfg(windows)]
pub fn get_short_path(path: &Path) -> Option<PathBuf> {
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Storage::FileSystem::GetShortPathNameW;

    let path_wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut buffer = vec![0u16; 1024];

    unsafe {
        let len = GetShortPathNameW(path_wide.as_ptr(), buffer.as_mut_ptr(), buffer.len() as u32);
        if len > 0 && (len as usize) < buffer.len() {
            let short = std::ffi::OsString::from_wide(&buffer[..len as usize]);
            let short_path = PathBuf::from(short);
            // Verify it was actually shortened (does not contain spaces and is ASCII)
            let s = short_path.to_string_lossy();
            if !s.contains(' ') && s.is_ascii() {
                return Some(short_path);
            }
        }
    }
    None
}

#[cfg(not(windows))]
pub fn get_short_path(_path: &Path) -> Option<PathBuf> {
    None
}

/// Resolves the 4-tier classpath ladder.
pub fn build_launch_receipt(
    config: &LaunchConfiguration,
    argfile_target_path: Option<&Path>,
) -> Result<LaunchReceipt, AppError> {
    let target_os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    };

    let ctx = OsContext::current();

    // 1. Build template variable mapping
    let mut vars = HashMap::new();
    vars.insert("auth_player_name", config.player_name.clone());
    vars.insert("version_name", config.version_package.id.clone());
    vars.insert(
        "game_directory",
        config.game_dir.to_string_lossy().to_string(),
    );
    vars.insert(
        "assets_root",
        config.assets_dir.to_string_lossy().to_string(),
    );
    vars.insert(
        "assets_index_name",
        config
            .version_package
            .assets
            .clone()
            .unwrap_or_else(|| "legacy".to_string()),
    );
    vars.insert("auth_uuid", config.player_uuid.clone());
    vars.insert("auth_access_token", config.auth_access_token.clone());
    vars.insert("user_type", config.user_type.clone());
    vars.insert("version_type", "release".to_string());
    vars.insert(
        "natives_directory",
        config.natives_dir.to_string_lossy().to_string(),
    );
    vars.insert("launcher_name", "aethel-launcher".to_string());
    vars.insert("launcher_version", env!("CARGO_PKG_VERSION").to_string());
    vars.insert("clientid", "".to_string());
    vars.insert("auth_xuid", "".to_string());

    let classpath_delimiter = if target_os == "windows" { ";" } else { ":" };
    let full_classpath = config
        .classpath_entries
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(classpath_delimiter);

    vars.insert("classpath", full_classpath.clone());

    // 2. Synthesize base JVM arguments
    let mut jvm_args = Vec::new();

    // Memory arguments
    if let Some(min_mb) = config.memory_min_mb {
        jvm_args.push(format!("-Xms{min_mb}M"));
    }
    if let Some(max_mb) = config.memory_max_mb {
        jvm_args.push(format!("-Xmx{max_mb}M"));
    }

    // Custom JVM args
    if let Some(ref extra) = config.custom_jvm_args {
        jvm_args.extend(extra.clone());
    }

    // Version-defined JVM arguments
    let raw_jvm_args = config.version_package.jvm_arguments(&ctx);
    for raw in &raw_jvm_args {
        jvm_args.push(substitute_template(raw, &vars));
    }

    // 3. Synthesize game arguments
    let raw_game_args = config.version_package.game_arguments(&ctx);
    let mut game_args = Vec::new();
    for raw in &raw_game_args {
        game_args.push(substitute_template(raw, &vars));
    }

    // 4. Calculate total command line length to choose Classpath Strategy
    let total_cli_len: usize = config.java_path.to_string_lossy().len()
        + jvm_args.iter().map(|a| a.len() + 1).sum::<usize>()
        + config.version_package.main_class.len()
        + 1
        + game_args.iter().map(|a| a.len() + 1).sum::<usize>();

    let mut env_vars = HashMap::new();
    let classpath_tier: String;
    let mut final_jvm_args = Vec::new();

    if total_cli_len < 30_000 {
        // --- TIER 1: Direct Spawn ---
        classpath_tier = "Tier1_Direct".to_string();
        final_jvm_args = jvm_args;
    } else if !config.java_version.supports_argfile() {
        // --- TIER 2: Env Var CLASSPATH (Java 8 or fallback) ---
        if full_classpath.len() > 32_000 {
            return Err(AppError::new(
                AppErrorCode::ClasspathTooLong,
                "Classpath exceeds environment block limit (32KB). Please reduce installed mods or move instance to a shorter folder.",
            ));
        }

        classpath_tier = "Tier2_EnvVar".to_string();
        env_vars.insert("CLASSPATH".to_string(), full_classpath);

        // Strip -cp and ${classpath} from JVM args so env var takes precedence
        let mut i = 0;
        while i < jvm_args.len() {
            if jvm_args[i] == "-cp" || jvm_args[i] == "-classpath" {
                i += 1;
                if i < jvm_args.len() {
                    i += 1; // skip value
                }
            } else {
                final_jvm_args.push(jvm_args[i].clone());
                i += 1;
            }
        }
    } else {
        // --- TIER 3: @argfile (Java 9+) ---
        let argfile_path = argfile_target_path
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| config.game_dir.join("classpath.args"));

        let mut argfile_content = String::new();
        argfile_content.push_str("-cp\n");

        let mut all_shortened = true;
        let mut short_entries = Vec::new();

        for entry in &config.classpath_entries {
            if let Some(short) = get_short_path(entry) {
                short_entries.push(short.to_string_lossy().to_string());
            } else {
                all_shortened = false;
                short_entries.push(entry.to_string_lossy().to_string());
            }
        }

        let argfile_cp = short_entries.join(classpath_delimiter);

        if config.java_version.is_utf8_argfile_default() || target_os != "windows" {
            // Java 18+ or Unix: Always write UTF-8 argfile
            argfile_content.push_str(&argfile_cp);
            std::fs::write(&argfile_path, argfile_content.as_bytes()).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to write argfile: {e}"),
                )
            })?;
            classpath_tier = "Tier3_ArgFile_Utf8".to_string();
        } else if all_shortened {
            // Java 9-17 Windows: Successfully shortened to ASCII
            argfile_content.push_str(&argfile_cp);
            std::fs::write(&argfile_path, argfile_content.as_bytes()).map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to write argfile: {e}"),
                )
            })?;
            classpath_tier = "Tier3_ArgFile_Ascii83".to_string();
        } else {
            // 8.3 disabled on volume: check system ACP encoding (windows-1251)
            let (cow, _, had_errors) = encoding_rs::WINDOWS_1251.encode(&argfile_cp);
            if !had_errors {
                let mut bytes = "-cp\n".as_bytes().to_vec();
                bytes.extend_from_slice(&cow);
                std::fs::write(&argfile_path, bytes).map_err(|e| {
                    AppError::new(
                        AppErrorCode::InternalError,
                        format!("Failed to write argfile: {e}"),
                    )
                })?;
                classpath_tier = "Tier3_ArgFile_ACP".to_string();
            } else {
                // Characters outside ACP: Fall back to Tier 2 (CLASSPATH env var has native UTF-16 support on Windows)
                if full_classpath.len() > 32_000 {
                    return Err(AppError::new(
                        AppErrorCode::ClasspathTooLong,
                        "Classpath exceeds environment block limit (32KB). Please reduce installed mods or move instance to a shorter folder.",
                    ));
                }
                classpath_tier = "Tier2_EnvVar_Fallback".to_string();
                env_vars.insert("CLASSPATH".to_string(), full_classpath);
            }
        }

        // Clean -cp from arguments
        let mut i = 0;
        while i < jvm_args.len() {
            if jvm_args[i] == "-cp" || jvm_args[i] == "-classpath" {
                i += 1;
                if i < jvm_args.len() {
                    i += 1; // skip value
                }
            } else {
                final_jvm_args.push(jvm_args[i].clone());
                i += 1;
            }
        }

        if classpath_tier.starts_with("Tier3") {
            final_jvm_args.push(format!("@{}", argfile_path.display()));
        }
    }

    // Combine all launch arguments: [jvm_args, main_class, game_args]
    let mut all_arguments = final_jvm_args;
    all_arguments.push(config.version_package.main_class.clone());
    all_arguments.extend(game_args);

    Ok(LaunchReceipt {
        java_path: config.java_path.clone(),
        working_dir: config.game_dir.clone(),
        command: config.java_path.to_string_lossy().to_string(),
        arguments: all_arguments,
        environment: env_vars,
        classpath_tier,
    })
}

/// Process supervisor supporting Windows Job Objects and Unix process groups.
pub struct ProcessSupervisor;

impl ProcessSupervisor {
    /// Spawns the Java process attached to a Job Object on Windows.
    pub fn spawn(receipt: &LaunchReceipt) -> Result<u32, AppError> {
        let mut cmd = std::process::Command::new(&receipt.java_path);
        cmd.current_dir(&receipt.working_dir);
        cmd.args(&receipt.arguments);

        for (k, v) in &receipt.environment {
            cmd.env(k, v);
        }

        #[cfg(windows)]
        {
            use windows_sys::Win32::System::JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            };

            let child = cmd.spawn().map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to spawn process: {e}"),
                )
            })?;
            let pid = child.id();

            unsafe {
                let job = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
                if !job.is_null() {
                    let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

                    let res = SetInformationJobObject(
                        job,
                        JobObjectExtendedLimitInformation,
                        &info as *const _ as *const _,
                        std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                    );

                    if res != 0 {
                        use std::os::windows::io::AsRawHandle;
                        AssignProcessToJobObject(job, child.as_raw_handle());
                    }
                }
            }

            Ok(pid)
        }

        #[cfg(not(windows))]
        {
            let child = cmd.spawn().map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to spawn process: {e}"),
                )
            })?;
            Ok(child.id())
        }
    }
}
