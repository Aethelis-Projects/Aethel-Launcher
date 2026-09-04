fn main() {
    // Ensure dist directory exists for tauri::generate_context! during cargo check/clippy/test
    let dist_dir = std::path::Path::new("dist");
    if !dist_dir.exists() {
        let _ = std::fs::create_dir_all(dist_dir);
        let _ = std::fs::write(
            dist_dir.join("index.html"),
            "<!doctype html><html><body></body></html>",
        );
    }

    println!("cargo:rerun-if-env-changed=AETHEL_PAYLOAD_FILE");
    println!("cargo:rerun-if-env-changed=AETHEL_PAYLOAD_SHA256");
    println!("cargo::rustc-check-cfg=cfg(has_embedded_payload)");

    let out_dir = std::env::var("OUT_DIR").unwrap();
    let dest_path = std::path::Path::new(&out_dir).join("embedded_payload.bin");

    if let Ok(payload_file) = std::env::var("AETHEL_PAYLOAD_FILE") {
        let path = std::path::Path::new(&payload_file);
        if path.exists() {
            println!("cargo:rustc-cfg=has_embedded_payload");
            let data = std::fs::read(path).expect("Failed to read AETHEL_PAYLOAD_FILE");
            if let Ok(expected_sha256) = std::env::var("AETHEL_PAYLOAD_SHA256") {
                use sha2::{Digest, Sha256};
                let mut hasher = Sha256::new();
                hasher.update(&data);
                let hash = format!("{:x}", hasher.finalize());
                assert_eq!(
                    hash.to_lowercase(),
                    expected_sha256.to_lowercase(),
                    "Payload SHA256 mismatch!"
                );
            }
            std::fs::write(&dest_path, &data).expect("Failed to write embedded_payload.bin");
        } else {
            std::fs::write(&dest_path, b"").expect("Failed to write dummy embedded_payload.bin");
        }
    } else {
        std::fs::write(&dest_path, b"").expect("Failed to write dummy embedded_payload.bin");
    }

    tauri_build::build();
}
