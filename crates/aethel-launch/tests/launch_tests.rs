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
        version_package_chain: None,
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
        version_package_chain: None,
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
    assert!(receipt.arguments.contains(&"--userProperties".to_string()));
    let user_prop_idx = receipt
        .arguments
        .iter()
        .position(|a| a == "--userProperties")
        .expect("has --userProperties");
    assert_eq!(
        receipt.arguments.get(user_prop_idx + 1),
        Some(&"{}".to_string()),
        "userProperties must be substituted with '{{}}' object"
    );
    assert!(
        !receipt
            .arguments
            .iter()
            .any(|a| a.contains("${user_properties}")),
        "unexpanded ${{user_properties}} must not be present"
    );
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
        version_package_chain: None,
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
        main_class: String::new(),
        classpath: Vec::new(),
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

#[test]
fn test_version_gated_jvm_flags() {
    use aethel_launch::is_flag_allowed_for_java;
    assert!(!is_flag_allowed_for_java(
        "--sun-misc-unsafe-memory-access=allow",
        21
    ));
    assert!(is_flag_allowed_for_java(
        "--sun-misc-unsafe-memory-access=allow",
        22
    ));
    assert!(is_flag_allowed_for_java(
        "--sun-misc-unsafe-memory-access=allow",
        25
    ));
    assert!(is_flag_allowed_for_java("-XX:+UseG1GC", 21));
}

#[test]
fn test_fabric_chain_uses_knot_mainclass() {
    let vanilla_content = include_str!("../../aethel-manifest/tests/fixtures/1.20.4.json");
    let fabric_content =
        include_str!("../../aethel-manifest/tests/fixtures/1.20.4-fabric-0.15.7.json");
    let vanilla = VersionPackage::parse(vanilla_content).expect("vanilla");
    let fabric = VersionPackage::parse(fabric_content).expect("fabric");
    let chain = vec![vanilla.clone(), fabric.clone()];

    let config = LaunchConfiguration {
        java_path: PathBuf::from("javaw.exe"),
        java_version: JavaVersion::V17,
        game_dir: PathBuf::from("instances/test"),
        assets_dir: PathBuf::from("assets"),
        natives_dir: PathBuf::from("natives"),
        version_package: vanilla,
        version_package_chain: Some(chain),
        classpath_entries: vec![
            PathBuf::from("versions/1.20.4/1.20.4.jar"),
            PathBuf::from("libraries/net/fabricmc/fabric-loader/0.15.7/fabric-loader-0.15.7.jar"),
        ],
        player_name: "Steve".to_string(),
        player_uuid: "00000000-0000-0000-0000-000000000000".to_string(),
        auth_access_token: "mock-token".to_string(),
        user_type: "mojang".to_string(),
        memory_min_mb: Some(1024),
        memory_max_mb: Some(4096),
        custom_jvm_args: None,
    };

    let receipt = build_launch_receipt(&config, None).expect("Build receipt");
    assert_eq!(
        receipt.main_class,
        "net.fabricmc.loader.impl.launch.knot.KnotClient"
    );
    assert!(receipt
        .classpath
        .iter()
        .any(|p| p.to_string_lossy().contains("fabric-loader")));
}

#[test]
fn test_neoforge_chain_uses_bootstrap_launcher() {
    let vanilla_content = include_str!("../../aethel-manifest/tests/fixtures/1.21.1.json");
    let neoforge_content =
        include_str!("../../aethel-manifest/tests/fixtures/1.21.1-neoforge-21.1.65.json");
    let vanilla = VersionPackage::parse(vanilla_content).expect("vanilla");
    let neoforge = VersionPackage::parse(neoforge_content).expect("neoforge");
    let chain = vec![vanilla.clone(), neoforge];

    let config = LaunchConfiguration {
        java_path: PathBuf::from("javaw.exe"),
        java_version: JavaVersion::V21,
        game_dir: PathBuf::from("instances/test-neoforge"),
        assets_dir: PathBuf::from("assets"),
        natives_dir: PathBuf::from("natives"),
        version_package: vanilla,
        version_package_chain: Some(chain),
        classpath_entries: vec![
            PathBuf::from("versions/1.21.1/1.21.1.jar"),
            PathBuf::from("libraries/net/neoforged/neoforge/21.1.65/neoforge-21.1.65.jar"),
        ],
        player_name: "Steve".to_string(),
        player_uuid: "00000000-0000-0000-0000-000000000000".to_string(),
        auth_access_token: "mock-token".to_string(),
        user_type: "mojang".to_string(),
        memory_min_mb: Some(1024),
        memory_max_mb: Some(4096),
        custom_jvm_args: None,
    };

    let receipt = build_launch_receipt(&config, None).expect("Build receipt");
    assert_eq!(
        receipt.main_class,
        "cpw.mods.bootstraplauncher.BootstrapLauncher"
    );
}

#[test]
fn test_vanilla_chain_uses_minecraft_main() {
    let vanilla_content = include_str!("../../aethel-manifest/tests/fixtures/1.20.4.json");
    let vanilla = VersionPackage::parse(vanilla_content).expect("vanilla");
    let chain = vec![vanilla.clone()];

    let config = LaunchConfiguration {
        java_path: PathBuf::from("javaw.exe"),
        java_version: JavaVersion::V17,
        game_dir: PathBuf::from("instances/test-vanilla"),
        assets_dir: PathBuf::from("assets"),
        natives_dir: PathBuf::from("natives"),
        version_package: vanilla,
        version_package_chain: Some(chain),
        classpath_entries: vec![PathBuf::from("versions/1.20.4/1.20.4.jar")],
        player_name: "Steve".to_string(),
        player_uuid: "00000000-0000-0000-0000-000000000000".to_string(),
        auth_access_token: "mock-token".to_string(),
        user_type: "mojang".to_string(),
        memory_min_mb: Some(1024),
        memory_max_mb: Some(4096),
        custom_jvm_args: None,
    };

    let receipt = build_launch_receipt(&config, None).expect("Build receipt");
    assert_eq!(receipt.main_class, "net.minecraft.client.main.Main");
}

#[test]
fn test_chain_deduplicates_libraries() {
    let vanilla_content = include_str!("../../aethel-manifest/tests/fixtures/1.20.4.json");
    let fabric_content =
        include_str!("../../aethel-manifest/tests/fixtures/1.20.4-fabric-0.15.7.json");
    let vanilla = VersionPackage::parse(vanilla_content).expect("vanilla");
    let fabric = VersionPackage::parse(fabric_content).expect("fabric");
    let chain = vec![vanilla.clone(), fabric];

    // Simulate duplicate entries in classpath_entries
    let duplicate_cp = vec![
        PathBuf::from("versions/1.20.4/1.20.4.jar"),
        PathBuf::from("libraries/com/google/guava/guava.jar"),
        PathBuf::from("libraries/com/google/guava/guava.jar"),
        PathBuf::from("libraries/net/fabricmc/fabric-loader/0.15.7/fabric-loader-0.15.7.jar"),
        PathBuf::from("libraries/com/google/guava/guava.jar"),
    ];

    let config = LaunchConfiguration {
        java_path: PathBuf::from("javaw.exe"),
        java_version: JavaVersion::V17,
        game_dir: PathBuf::from("instances/test-dedup"),
        assets_dir: PathBuf::from("assets"),
        natives_dir: PathBuf::from("natives"),
        version_package: vanilla,
        version_package_chain: Some(chain),
        classpath_entries: duplicate_cp,
        player_name: "Steve".to_string(),
        player_uuid: "00000000-0000-0000-0000-000000000000".to_string(),
        auth_access_token: "mock-token".to_string(),
        user_type: "mojang".to_string(),
        memory_min_mb: Some(1024),
        memory_max_mb: Some(4096),
        custom_jvm_args: None,
    };

    let receipt = build_launch_receipt(&config, None).expect("Build receipt");
    let paths: Vec<String> = receipt
        .classpath
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    let unique: std::collections::HashSet<_> = paths.iter().cloned().collect();
    assert_eq!(paths.len(), unique.len());
    assert_eq!(paths.len(), 3); // 1.20.4.jar + guava.jar + fabric-loader.jar
}

#[test]
fn test_ws19_maven_name_to_path() {
    use aethel_launch::maven_name_to_path;
    assert_eq!(
        maven_name_to_path("net.fabricmc:fabric-loader:0.17.0"),
        Some("net/fabricmc/fabric-loader/0.17.0/fabric-loader-0.17.0.jar".to_string())
    );
    assert_eq!(
        maven_name_to_path("org.ow2.asm:asm:9.6"),
        Some("org/ow2/asm/asm/9.6/asm-9.6.jar".to_string())
    );
    assert_eq!(
        maven_name_to_path("net.neoforged:neoforge:21.1.65"),
        Some("net/neoforged/neoforge/21.1.65/neoforge-21.1.65.jar".to_string())
    );
}

#[tokio::test]
async fn test_ws19_provision_fails_loudly_on_missing_artifact() {
    use aethel_core::AppErrorCode;
    use aethel_launch::provision_instance;
    use aethel_manifest::{OsContext, VersionPackage};

    let temp = tempfile::tempdir().unwrap();
    let app_data = temp.path();
    let inst_dir = app_data.join("instances").join("missing-artifact-test");
    let ctx = OsContext::current();

    let json = serde_json::json!({
        "id": "test-missing-loader",
        "inheritsFrom": "1.20.4",
        "mainClass": "net.fabricmc.loader.impl.launch.knot.KnotClient",
        "type": "release",
        "libraries": [
            {
                "name": "net.fabricmc:fabric-loader:99.99.99"
            }
        ]
    });
    let pkg = VersionPackage::parse(&json.to_string()).unwrap();

    let res = provision_instance(
        &[pkg],
        &ctx,
        "1.20.4",
        &inst_dir,
        app_data,
        None,
        false,
        false, // downloads disabled
    )
    .await;

    assert!(res.is_err());
    let err = res.unwrap_err();
    assert_eq!(err.code(), AppErrorCode::LaunchProvisionFailed);
    let msg = err.to_string();
    assert!(msg.contains("Pre-flight classpath check failed"));
    assert!(msg.contains("fabric-loader-99.99.99.jar"));
}

#[tokio::test]
async fn test_ws19_fabric_classpath_contains_fabric_loader_jar() {
    use aethel_launch::provision_instance;
    use aethel_manifest::{OsContext, VersionPackage};

    let temp = tempfile::tempdir().unwrap();
    let app_data = temp.path();
    let inst_dir = app_data.join("instances").join("fabric-loader-test");
    let ctx = OsContext::current();

    let loader_path = app_data
        .join("libraries")
        .join("net/fabricmc/fabric-loader/0.15.7/fabric-loader-0.15.7.jar");
    std::fs::create_dir_all(loader_path.parent().unwrap()).unwrap();
    std::fs::write(&loader_path, b"mock-fabric-loader-jar").unwrap();

    let mixin_path = app_data
        .join("libraries")
        .join("net/fabricmc/sponge-mixin/0.12.5+mixin.0.8.5/sponge-mixin-0.12.5+mixin.0.8.5.jar");
    std::fs::create_dir_all(mixin_path.parent().unwrap()).unwrap();
    std::fs::write(&mixin_path, b"mock-sponge-mixin-jar").unwrap();

    let client_jar = app_data.join("versions/1.20.4/1.20.4.jar");
    std::fs::create_dir_all(client_jar.parent().unwrap()).unwrap();
    std::fs::write(&client_jar, b"mock-client-jar").unwrap();

    let fabric_fixture =
        include_str!("../../../crates/aethel-manifest/tests/fixtures/1.20.4-fabric-0.15.7.json");
    let fabric_pkg = VersionPackage::parse(fabric_fixture).unwrap();

    let report = provision_instance(
        &[fabric_pkg],
        &ctx,
        "1.20.4",
        &inst_dir,
        app_data,
        None,
        false,
        false,
    )
    .await
    .expect("provision instance succeeds when loader jar is pre-cached");

    let has_loader = report
        .classpath
        .iter()
        .any(|p| p.to_string_lossy().contains("fabric-loader-0.15.7.jar"));
    assert!(
        has_loader,
        "Classpath must include fabric-loader-0.15.7.jar"
    );
}
