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
    tauri_build::build();
}
