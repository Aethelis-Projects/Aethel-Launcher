use aethel_auth::generate_offline_uuid;
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

#[derive(Deserialize)]
struct VectorFile {
    vectors: Vec<VectorEntry>,
}

#[derive(Deserialize)]
struct VectorEntry {
    name: String,
    input: String,
    uuid: String,
}

#[test]
fn verify_against_jvm_benchmark_vectors() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let vectors_path = manifest_dir.join("tests").join("vectors.json");
    
    let content = fs::read_to_string(&vectors_path)
        .unwrap_or_else(|e| panic!("Failed to read vectors.json at {:?}: {}", vectors_path, e));
    let parsed: VectorFile = serde_json::from_str(&content)
        .expect("Failed to deserialize vectors.json");

    assert!(!parsed.vectors.is_empty(), "Vectors file must contain test cases");

    for entry in &parsed.vectors {
        let calculated = generate_offline_uuid(&entry.name);
        assert_eq!(
            calculated.to_string(),
            entry.uuid,
            "UUID mismatch for input '{}' (name: '{}'). Expected JVM output {}, got {}",
            entry.input,
            entry.name,
            entry.uuid,
            calculated
        );
    }
}