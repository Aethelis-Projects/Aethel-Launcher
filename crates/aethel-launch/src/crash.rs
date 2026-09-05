use serde::Deserialize;
use std::time::Duration;

use aethel_core::{
    types::{CrashPattern, CrashReport},
    AppError, AppErrorCode,
};

/// Heuristic analyzer for Minecraft crash logs.
pub struct CrashAnalyzer;

impl CrashAnalyzer {
    /// Analyzes the log output and exit code to produce a structured `CrashReport`.
    pub fn analyze(exit_code: Option<i32>, logs: &[String]) -> CrashReport {
        let full_log = logs.join("\n");
        let (pattern, diagnosis, suggestion) = Self::detect_pattern(logs);

        CrashReport {
            pattern,
            diagnosis,
            suggestion,
            full_log,
            exit_code,
            upload_url: None,
        }
    }

    /// Scans log lines for known failure patterns.
    pub fn detect_pattern(lines: &[String]) -> (CrashPattern, String, String) {
        for line in lines.iter().rev() {
            // 1. Out of Memory
            if line.contains("java.lang.OutOfMemoryError")
                || line.contains(
                    "There is insufficient memory for the Java Runtime Environment to continue",
                )
                || line.contains("GC overhead limit exceeded")
                || line.contains("Java heap space")
            {
                return (
                    CrashPattern::OutOfMemory,
                    "The game ran out of allocated memory (Java heap space exhaustion).".to_string(),
                    "Allocate more RAM in Instance Settings (e.g., increase to 4096MB or 6144MB) or close other running programs.".to_string(),
                );
            }

            // 2. Outdated Modloader ASM (Unsupported class file major version)
            if line.contains("Unsupported class file major version") {
                return (
                    CrashPattern::OutdatedLoaderAsm,
                    "Модлоадер устарел для этой версии Minecraft".to_string(),
                    "Обновите Loader до последней стабильной версии: Instance Manager → Overview → Modloader.".to_string(),
                );
            }

            // 3. Wrong Java Version
            if line.contains(
                "has been compiled by a more recent version of the Java Runtime Environment",
            ) || line.contains("Unsupported major.minor version")
            {
                let expected = Self::extract_class_version(line);
                return (
                    CrashPattern::WrongJavaVersion {
                        expected: expected.unwrap_or(17),
                        actual: None,
                    },
                    "A mod or the game was compiled for a newer Java version than the active runtime.".to_string(),
                    format!(
                        "Switch to Java {} or higher in Instance Settings.",
                        expected.unwrap_or(17)
                    ),
                );
            }

            // 3. GPU Driver / OpenGL failure
            if line.contains("Pixel format not accelerated")
                || line.contains("Failed to create GLFW window")
                || line.contains("wglChoosePixelFormatARB")
                || line.contains("GLFW error 65542")
                || line.contains("org.lwjgl.LWJGLException")
                || line.contains("ig4icd64.dll")
                || line.contains("nvoglv64.dll")
                || line.contains("atio6axx.dll")
            {
                return (
                    CrashPattern::GpuDriverIssue,
                    "The graphics driver failed to initialize the OpenGL display surface.".to_string(),
                    "Update your graphics card drivers (NVIDIA, AMD, or Intel) to the latest version.".to_string(),
                );
            }

            // 4. Mod Conflict
            if line.contains("net.fabricmc.loader.impl.FormattedException")
                || line.contains("ModResolutionException")
                || line.contains("Duplicate mods found")
                || line.contains("Mixin prepare failed")
                || line.contains("net.minecraftforge.fml.loading.EarlyLoadingException")
                || line.contains("Incompatible mod set found")
            {
                let snippet = line.chars().take(120).collect::<String>();
                return (
                    CrashPattern::ModConflict(snippet),
                    "A mod incompatibility or conflict was detected during startup.".to_string(),
                    "Check mod dependencies and resolve version conflicts in your mods folder."
                        .to_string(),
                );
            }

            // 5. ClassNotFound
            if let Some(idx) = line.find("java.lang.ClassNotFoundException: ") {
                let class_name = line[idx + "java.lang.ClassNotFoundException: ".len()..]
                    .split_whitespace()
                    .next()
                    .unwrap_or("unknown")
                    .trim_matches(|c: char| c == '"' || c == '\'' || c == ':' || c == ';')
                    .to_string();
                return (
                    CrashPattern::ClassNotFound(class_name.clone()),
                    format!("Required Java class was not found: {class_name}"),
                    "A required mod library or dependency is missing. Verify all installed mods."
                        .to_string(),
                );
            }

            // 6. NoClassDefFoundError
            if let Some(idx) = line.find("java.lang.NoClassDefFoundError: ") {
                let class_name = line[idx + "java.lang.NoClassDefFoundError: ".len()..]
                    .split_whitespace()
                    .next()
                    .unwrap_or("unknown")
                    .trim_matches(|c: char| c == '"' || c == '\'' || c == ':' || c == ';')
                    .to_string();
                return (
                    CrashPattern::NoClassDefFound(class_name.clone()),
                    format!("Class definition missing at runtime: {class_name}"),
                    "A dependency failed to load or is incompatible with this version.".to_string(),
                );
            }

            // 7. UnsatisfiedLinkError
            if let Some(idx) = line.find("java.lang.UnsatisfiedLinkError: ") {
                let lib_name = line[idx + "java.lang.UnsatisfiedLinkError: ".len()..]
                    .chars()
                    .take(80)
                    .collect::<String>();
                return (
                    CrashPattern::UnsatisfiedLink(lib_name.clone()),
                    format!("Failed to load native library: {lib_name}"),
                    "Ensure your Java architecture (64-bit) matches your OS and that native libraries are not corrupted.".to_string(),
                );
            }
        }

        (
            CrashPattern::Unknown,
            "The game crashed or exited unexpectedly with an unclassified error.".to_string(),
            "Review the full game log or upload it to mclo.gs for an automated report.".to_string(),
        )
    }

    /// Extracts target Java major version from class file version number.
    /// E.g. class file version 65.0 -> Java 21; 61.0 -> Java 17; 52.0 -> Java 8.
    fn extract_class_version(line: &str) -> Option<u32> {
        let marker = "class file version ";
        if let Some(pos) = line.find(marker) {
            let after = &line[pos + marker.len()..];
            let num_str = after.split('.').next()?;
            if let Ok(class_ver) = num_str.trim().parse::<u32>() {
                if class_ver >= 45 {
                    return Some(class_ver - 44);
                }
            }
        }
        None
    }
}

#[derive(Deserialize)]
struct MclogsResponse {
    success: bool,
    url: Option<String>,
    error: Option<String>,
}

/// Uploads crash or game log content to `mclo.gs` service.
pub async fn upload_to_mclogs(log_content: &str) -> Result<String, AppError> {
    upload_to_mclogs_endpoint("https://api.mclo.gs/1/log", log_content).await
}

/// Uploads log content to a specific mclo.gs-compatible endpoint (allows mocking in tests).
pub async fn upload_to_mclogs_endpoint(
    endpoint: &str,
    log_content: &str,
) -> Result<String, AppError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Failed to build HTTP client: {e}"),
            )
        })?;

    let params = [("content", log_content)];
    let response = client
        .post(endpoint)
        .form(&params)
        .send()
        .await
        .map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Failed to connect to mclo.gs API: {e}"),
            )
        })?;

    let status = response.status();
    let body = response.text().await.map_err(|e| {
        AppError::new(
            AppErrorCode::NetworkError,
            format!("Failed to read response body: {e}"),
        )
    })?;

    if !status.is_success() {
        return Err(AppError::new(
            AppErrorCode::NetworkError,
            format!("mclo.gs API returned error status {status}: {body}"),
        ));
    }

    let parsed: MclogsResponse = serde_json::from_str(&body).map_err(|e| {
        AppError::new(
            AppErrorCode::NetworkError,
            format!("Failed to deserialize mclo.gs response: {e}"),
        )
    })?;

    if parsed.success {
        parsed.url.ok_or_else(|| {
            AppError::new(
                AppErrorCode::NetworkError,
                "mclo.gs API returned success: true but missing 'url' field",
            )
        })
    } else {
        Err(AppError::new(
            AppErrorCode::NetworkError,
            parsed
                .error
                .unwrap_or_else(|| "Unknown mclo.gs error".to_string()),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crash_out_of_memory() {
        let lines = vec![
            "[12:00:00] [main/INFO]: Starting Minecraft...".to_string(),
            "[12:00:05] [main/ERROR]: Exception in thread \"main\" java.lang.OutOfMemoryError: Java heap space".to_string(),
        ];
        let report = CrashAnalyzer::analyze(Some(1), &lines);
        assert_eq!(report.pattern, CrashPattern::OutOfMemory);
        assert!(report.suggestion.contains("Allocate more RAM"));
    }

    #[test]
    fn test_crash_class_not_found() {
        let lines = vec![
            "[12:00:01] [main/ERROR]: java.lang.ClassNotFoundException: com.example.MissingMod"
                .to_string(),
        ];
        let report = CrashAnalyzer::analyze(Some(1), &lines);
        match report.pattern {
            CrashPattern::ClassNotFound(class) => assert_eq!(class, "com.example.MissingMod"),
            other => panic!("Expected ClassNotFound, got {:?}", other),
        }
    }

    #[test]
    fn test_crash_no_class_def_found() {
        let lines = vec![
            "[12:00:01] [main/ERROR]: java.lang.NoClassDefFoundError: net/minecraft/client/gui/Screen".to_string(),
        ];
        let report = CrashAnalyzer::analyze(Some(1), &lines);
        match report.pattern {
            CrashPattern::NoClassDefFound(class) => {
                assert_eq!(class, "net/minecraft/client/gui/Screen")
            }
            other => panic!("Expected NoClassDefFound, got {:?}", other),
        }
    }

    #[test]
    fn test_crash_wrong_java_version() {
        let lines = vec![
            "[12:00:01] [main/ERROR]: Exception in thread \"main\" java.lang.UnsupportedClassVersionError: MyMod has been compiled by a more recent version of the Java Runtime Environment (class file version 65.0), this version of the Java Runtime Environment only recognizes class file versions up to 61.0".to_string(),
        ];
        let report = CrashAnalyzer::analyze(Some(1), &lines);
        match report.pattern {
            CrashPattern::WrongJavaVersion { expected, .. } => assert_eq!(expected, 21),
            other => panic!("Expected WrongJavaVersion, got {:?}", other),
        }
    }

    #[test]
    fn test_crash_gpu_driver_issue() {
        let lines = vec![
            "[12:00:01] [main/ERROR]: org.lwjgl.LWJGLException: Pixel format not accelerated"
                .to_string(),
        ];
        let report = CrashAnalyzer::analyze(Some(1), &lines);
        assert_eq!(report.pattern, CrashPattern::GpuDriverIssue);
        assert!(report
            .suggestion
            .contains("Update your graphics card drivers"));
    }

    #[test]
    fn test_crash_mod_conflict() {
        let lines = vec![
            "[12:00:01] [main/ERROR]: net.fabricmc.loader.impl.FormattedException: Incompatible mod set found!".to_string(),
        ];
        let report = CrashAnalyzer::analyze(Some(1), &lines);
        match report.pattern {
            CrashPattern::ModConflict(_) => (),
            other => panic!("Expected ModConflict, got {:?}", other),
        }
    }

    #[test]
    fn test_crash_unsatisfied_link() {
        let lines = vec![
            "[12:00:01] [main/ERROR]: java.lang.UnsatisfiedLinkError: Failed to load lwjgl64.dll"
                .to_string(),
        ];
        let report = CrashAnalyzer::analyze(Some(1), &lines);
        match report.pattern {
            CrashPattern::UnsatisfiedLink(lib) => assert!(lib.contains("lwjgl64.dll")),
            other => panic!("Expected UnsatisfiedLink, got {:?}", other),
        }
    }

    #[test]
    fn test_crash_outdated_loader_asm() {
        let lines = vec![
            "[main/ERROR]: java.lang.IllegalArgumentException: Unsupported class file major version 69"
                .to_string(),
        ];
        let report = CrashAnalyzer::analyze(Some(1), &lines);
        assert_eq!(report.pattern, CrashPattern::OutdatedLoaderAsm);
        assert!(report.suggestion.contains("Instance Manager"));
    }

    #[test]
    fn test_crash_unknown() {
        let lines =
            vec!["[12:00:01] [main/INFO]: Exited without specific error message".to_string()];
        let report = CrashAnalyzer::analyze(Some(1), &lines);
        assert_eq!(report.pattern, CrashPattern::Unknown);
    }
}
