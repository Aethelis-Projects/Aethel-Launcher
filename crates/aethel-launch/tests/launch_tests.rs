use std::path::PathBuf;
use tempfile::tempdir;

use aethel_core::AppErrorCode;
use aethel_launch::{build_launch_receipt, JavaVersion, LaunchConfiguration};
use aethel_manifest::VersionPackage;

fn get_mock_config(
    java_version: JavaVersion,
    total_libs: usize,
    custom_path_prefix: Option<&str>,
) -> (LaunchConfiguration, tempfile::TempDir) {
    let dir = tempdir().expect("Failed to create tempdir");
    let content = include_str!("../../aethel-manifest/tests/fixtures/1.20.4.json");
    let pkg = VersionPackage::parse(content).expect("Failed to parse 1.20.4");

    let prefix = custom_path_prefix.unwrap_or("C:/games/minecraft/libraries");
    let mut classpath = Vec::new();
    for i in 0..total_libs {
        classpath.push(PathBuf::from(format!(
            "{prefix}/library_with_a_very_long_package_name_and_version_artifact_number_{i}.jar"
        )));
    }

    let config = LaunchConfiguration {
        java_path: PathBuf::from("C:/java/bin/javaw.exe"),
        java_version,
        game_dir: dir.path().to_path_buf(),
        assets_dir: dir.path().join("assets"),
        natives_dir: dir.path().join("natives"),
        version_package: pkg,
        classpath_entries: classpath,
        player_name: "Steve".to_string(),
        player_uuid: "5627dd98-e6be-3c21-b8a8-e92344183641".to_string(),
        auth_access_token: "mock-token".to_string(),
        user_type: "mojang".to_string(),
        memory_min_mb: Some(1024),
        memory_max_mb: Some(4096),
        custom_jvm_args: Some(vec!["-XX:+UseG1GC".to_string()]),
    };

    (config, dir)
}

#[test]
fn test_classpath_ladder_tier1_direct() {
    let (config, _dir) = get_mock_config(JavaVersion::V21, 5, None);
    let receipt = build_launch_receipt(&config, None).expect("Build receipt");

    assert_eq!(receipt.classpath_tier, "Tier1_Direct");
    assert!(receipt.arguments.contains(&"-cp".to_string()));
    assert!(!receipt.environment.contains_key("CLASSPATH"));
}

#[test]
fn test_classpath_ladder_tier2_java8_envvar() {
    // 295 libs produces ~30.3k chars (exceeds 30k CLI limit, fits in 32k env block)
    let (config, _dir) = get_mock_config(JavaVersion::V8, 295, None);
    let receipt = build_launch_receipt(&config, None).expect("Build receipt");

    assert_eq!(receipt.classpath_tier, "Tier2_EnvVar");
    // Crucial requirement: -cp MUST be stripped so CLASSPATH env var is honored
    assert!(!receipt.arguments.contains(&"-cp".to_string()));
    assert!(receipt.environment.contains_key("CLASSPATH"));
    let cp_env = receipt.environment.get("CLASSPATH").unwrap();
    assert!(cp_env.contains("library_with_a_very_long_package_name"));
}

#[test]
fn test_classpath_ladder_tier3_java17_argfile() {
    let (config, _dir) = get_mock_config(JavaVersion::V17, 350, None);
    let receipt = build_launch_receipt(&config, None).expect("Build receipt");

    assert!(receipt.classpath_tier.starts_with("Tier3_ArgFile"));
    assert!(!receipt.arguments.contains(&"-cp".to_string()));
    let has_argfile = receipt.arguments.iter().any(|arg| arg.starts_with('@'));
    assert!(has_argfile, "Arguments must contain @argfile argument");
}

#[test]
fn test_classpath_ladder_tier3_cyrillic_java21() {
    let (config, _dir) = get_mock_config(
        JavaVersion::V21,
        350,
        Some("C:/Игры/Aethel Launcher/libraries"),
    );
    let receipt = build_launch_receipt(&config, None).expect("Build receipt");

    assert_eq!(receipt.classpath_tier, "Tier3_ArgFile_Utf8");
    let argfile_arg = receipt
        .arguments
        .iter()
        .find(|arg| arg.starts_with('@'))
        .unwrap();
    let argfile_path = PathBuf::from(&argfile_arg[1..]);
    assert!(argfile_path.exists());

    let content = std::fs::read_to_string(&argfile_path).expect("Read argfile");
    assert!(content.contains("Игры"));
}

#[test]
fn test_classpath_ladder_tier4_limit_exceeded() {
    // 600 libs exceeds 32k environment block limit
    let (config, _dir) = get_mock_config(JavaVersion::V8, 600, None);
    let res = build_launch_receipt(&config, None);

    assert!(res.is_err());
    let err = res.unwrap_err();
    assert_eq!(err.code(), AppErrorCode::ClasspathTooLong);
}

#[test]
fn test_legacy_1_7_10_command_synthesis() {
    let dir = tempdir().expect("tempdir");
    let content = include_str!("../../aethel-manifest/tests/fixtures/1.7.10.json");
    let pkg = VersionPackage::parse(content).expect("1.7.10");

    let config = LaunchConfiguration {
        java_path: PathBuf::from("javaw.exe"),
        java_version: JavaVersion::V8,
        game_dir: dir.path().to_path_buf(),
        assets_dir: dir.path().join("assets"),
        natives_dir: dir.path().join("natives"),
        version_package: pkg,
        classpath_entries: vec![PathBuf::from("minecraft.jar")],
        player_name: "Иван".to_string(),
        player_uuid: "custom-uuid".to_string(),
        auth_access_token: "token123".to_string(),
        user_type: "mojang".to_string(),
        memory_min_mb: Some(512),
        memory_max_mb: Some(1024),
        custom_jvm_args: None,
    };

    let receipt = build_launch_receipt(&config, None).expect("receipt");
    assert!(receipt.arguments.contains(&"Иван".to_string()));
    assert!(receipt.arguments.contains(&"--gameDir".to_string()));
    assert!(receipt
        .arguments
        .contains(&"net.minecraft.client.main.Main".to_string()));
}

#[test]
fn test_client_jar_placed_first_in_classpath() {
    let client_jar = PathBuf::from("C:/minecraft/versions/1.20.4/1.20.4.jar");
    let lib1 = PathBuf::from("C:/minecraft/libraries/lib1.jar");
    let lib2 = PathBuf::from("C:/minecraft/libraries/lib2.jar");
    let cp = aethel_launch::build_classpath(
        client_jar.clone(),
        vec![lib1.clone(), client_jar.clone(), lib2.clone()],
    );
    assert_eq!(cp.len(), 3);
    assert_eq!(cp[0], client_jar);
    assert_eq!(cp[1], lib1);
    assert_eq!(cp[2], lib2);
}

#[test]
fn test_classpath_substitution_in_jvm_args() {
    let (config, _dir) = get_mock_config(JavaVersion::V21, 5, None);
    let receipt = build_launch_receipt(&config, None).expect("Build receipt");
    assert!(!receipt
        .arguments
        .iter()
        .any(|arg| arg.contains("${classpath}")));
    let cp_idx = receipt
        .arguments
        .iter()
        .position(|arg| arg == "-cp" || arg == "-classpath");
    assert!(cp_idx.is_some(), "Expected -cp in arguments");
    let cp_val = &receipt.arguments[cp_idx.unwrap() + 1];
    assert!(cp_val.contains("library_with_a_very_long_package_name"));
}

#[test]
fn test_legacy_version_adds_classpath_flag() {
    let dir = tempdir().expect("tempdir");
    let content = include_str!("../../aethel-manifest/tests/fixtures/1.7.10.json");
    let pkg = VersionPackage::parse(content).expect("1.7.10");

    let client_jar = dir
        .path()
        .join("versions")
        .join("1.7.10")
        .join("1.7.10.jar");
    let config = LaunchConfiguration {
        java_path: PathBuf::from("javaw.exe"),
        java_version: JavaVersion::V8,
        game_dir: dir.path().to_path_buf(),
        assets_dir: dir.path().join("assets"),
        natives_dir: dir.path().join("natives"),
        version_package: pkg,
        classpath_entries: vec![client_jar.clone(), PathBuf::from("custom_lib.jar")],
        player_name: "Steve".to_string(),
        player_uuid: "custom-uuid".to_string(),
        auth_access_token: "token123".to_string(),
        user_type: "mojang".to_string(),
        memory_min_mb: Some(512),
        memory_max_mb: Some(1024),
        custom_jvm_args: None,
    };

    let receipt = build_launch_receipt(&config, None).expect("receipt");
    let cp_idx = receipt.arguments.iter().position(|arg| arg == "-cp");
    assert!(cp_idx.is_some(), "1.7.10 must have -cp injected");
    let cp_val = &receipt.arguments[cp_idx.unwrap() + 1];
    assert!(cp_val.contains("1.7.10.jar"));
    assert!(cp_val.contains("custom_lib.jar"));

    let main_class_idx = receipt
        .arguments
        .iter()
        .position(|arg| arg == "net.minecraft.client.main.Main")
        .unwrap();
    assert!(main_class_idx > cp_idx.unwrap() + 1);
}

#[tokio::test]
async fn test_process_supervisor_envs_passed_tier2() {
    let dir = tempdir().expect("tempdir");
    let mut envs = std::collections::HashMap::new();
    envs.insert(
        "CLASSPATH".to_string(),
        "my_custom_tier2_classpath".to_string(),
    );

    let (java_path, args) = if cfg!(windows) {
        (
            PathBuf::from("cmd.exe"),
            vec!["/C".to_string(), "echo %CLASSPATH%".to_string()],
        )
    } else {
        (
            PathBuf::from("sh"),
            vec!["-c".to_string(), "echo $CLASSPATH".to_string()],
        )
    };

    let receipt = aethel_launch::LaunchReceipt {
        java_path,
        working_dir: dir.path().to_path_buf(),
        command: "test".to_string(),
        arguments: args,
        environment: envs,
        classpath_tier: "Tier2_EnvVar".to_string(),
    };

    let mut proc = aethel_launch::ProcessSupervisor::spawn(&receipt, None)
        .await
        .expect("spawn test proc");
    let status = proc.wait().await.expect("wait test proc");
    assert!(status.success());
    let logs = proc.logs();
    assert!(
        logs.iter()
            .any(|line| line.contains("my_custom_tier2_classpath")),
        "Expected child process to output CLASSPATH from environment: {:?}",
        logs
    );
}

#[tokio::test]
async fn test_client_jar_downloaded_if_missing() {
    let dir = tempdir().expect("tempdir");
    let content = include_str!("../../aethel-manifest/tests/fixtures/1.7.10.json");
    let pkg = VersionPackage::parse(content).expect("1.7.10");

    let versions_dir = dir.path().join("versions");
    let jar_path = aethel_launch::ensure_client_jar(&versions_dir, "1.7.10", &pkg)
        .await
        .expect("ensure_client_jar");

    assert!(jar_path.exists());
    assert_eq!(jar_path, versions_dir.join("1.7.10").join("1.7.10.jar"));

    let jar_path_2 = aethel_launch::ensure_client_jar(&versions_dir, "1.7.10", &pkg)
        .await
        .expect("ensure_client_jar cached");
    assert_eq!(jar_path, jar_path_2);
}
