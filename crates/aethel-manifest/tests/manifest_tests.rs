use aethel_manifest::{
    evaluate_rules, parse_legacy_args, AssetDownloadTask, AssetIndex, OsContext, VersionManifestV2,
    VersionPackage,
};
use std::path::PathBuf;

#[test]
fn test_parse_version_manifest_v2() {
    let content = include_str!("fixtures/version_manifest_v2.json");
    let manifest = VersionManifestV2::parse(content).expect("Failed to parse version manifest v2");
    assert!(!manifest.latest.release.is_empty());
    assert!(!manifest.latest.snapshot.is_empty());
    assert!(manifest.versions.len() > 100);

    let v1204 = manifest.versions.iter().find(|v| v.id == "1.20.4");
    assert!(v1204.is_some());
    assert_eq!(v1204.unwrap().version_type, "release");
}

#[test]
fn test_legacy_args_parser() {
    let sample = r#"--username ${auth_player_name} --version ${version_name} --gameDir "C:\My Games\Minecraft" --assetsDir ${assets_root}"#;
    let parsed = parse_legacy_args(sample);
    assert_eq!(
        parsed,
        vec![
            "--username",
            "${auth_player_name}",
            "--version",
            "${version_name}",
            "--gameDir",
            "C:\\My Games\\Minecraft",
            "--assetsDir",
            "${assets_root}"
        ]
    );
}

#[test]
fn test_parse_legacy_1_7_10() {
    let content = include_str!("fixtures/1.7.10.json");
    let pkg = VersionPackage::parse(content).expect("Failed to parse 1.7.10");
    assert_eq!(pkg.id, "1.7.10");
    assert_eq!(pkg.main_class, "net.minecraft.client.main.Main");
    assert!(pkg.minecraft_arguments.is_some());

    let ctx = OsContext::new("windows", "x86_64");
    let game_args = pkg.game_arguments(&ctx);
    assert!(game_args.contains(&"--username".to_string()));
    assert!(game_args.contains(&"${auth_player_name}".to_string()));

    let applicable_libs = pkg.applicable_libraries(&ctx);
    assert!(!applicable_libs.is_empty());
}

#[test]
fn test_parse_1_12_2() {
    let content = include_str!("fixtures/1.12.2.json");
    let pkg = VersionPackage::parse(content).expect("Failed to parse 1.12.2");
    assert_eq!(pkg.id, "1.12.2");
    assert_eq!(pkg.main_class, "net.minecraft.client.main.Main");

    let ctx = OsContext::new("windows", "x86_64");
    let applicable_libs = pkg.applicable_libraries(&ctx);
    assert!(!applicable_libs.is_empty());
}

#[test]
fn test_parse_modern_1_20_4_and_1_21_1() {
    for (_file, ver) in [
        ("fixtures/1.20.4.json", "1.20.4"),
        ("fixtures/1.21.1.json", "1.21.1"),
    ] {
        let content = if ver == "1.20.4" {
            include_str!("fixtures/1.20.4.json")
        } else {
            include_str!("fixtures/1.21.1.json")
        };
        let pkg = VersionPackage::parse(content).unwrap_or_else(|e| panic!("Failed {ver}: {e}"));
        assert_eq!(pkg.id, ver);
        assert!(pkg.arguments.is_some());

        let ctx = OsContext::new("windows", "x86_64");
        let jvm_args = pkg.jvm_arguments(&ctx);
        assert!(!jvm_args.is_empty());

        let game_args = pkg.game_arguments(&ctx);
        assert!(!game_args.is_empty());
    }
}

#[test]
fn test_platform_rule_evaluation_matrix() {
    let content = include_str!("fixtures/1.20.4.json");
    let pkg = VersionPackage::parse(content).expect("Failed to parse 1.20.4");

    let platforms = [
        OsContext::new("windows", "x86_64"),
        OsContext::new("linux", "x86_64"),
        OsContext::new("linux", "arm64"),
        OsContext::new("osx", "x86_64"),
        OsContext::new("osx", "arm64"),
    ];

    for ctx in &platforms {
        let libs = pkg.applicable_libraries(ctx);
        assert!(
            !libs.is_empty(),
            "Applicable libraries must not be empty for platform {}:{}",
            ctx.name,
            ctx.arch
        );

        // Verify that OS-specific libraries are correctly filtered
        for lib in libs {
            if let Some(ref rules) = lib.rules {
                assert!(
                    evaluate_rules(rules, ctx),
                    "Library {} rejected by rules for {}:{}",
                    lib.name,
                    ctx.name,
                    ctx.arch
                );
            }
        }
    }
}

#[test]
fn test_asset_download_mapping() {
    let content = include_str!("fixtures/asset_index_1.20.json");
    let asset_index = AssetIndex::parse(content).expect("Failed to parse asset index");
    assert!(!asset_index.objects.is_empty());

    let (logical_path, obj) = asset_index.objects.iter().next().unwrap();
    let task = AssetDownloadTask::new(
        logical_path,
        &obj.hash,
        obj.size,
        PathBuf::from("C:/game/assets"),
    );

    let phys = task.physical_path();
    let expected_prefix = &obj.hash[..2];
    assert!(phys.to_string_lossy().contains(expected_prefix));
    assert!(phys.to_string_lossy().ends_with(&obj.hash));

    let url = task.url();
    assert!(url.starts_with("https://resources.download.minecraft.net/"));
    assert!(url.ends_with(&obj.hash));
}
