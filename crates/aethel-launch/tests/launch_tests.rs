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
