use specta_typescript::{BigIntExportBehavior, Typescript};

fn main() {
    let builder = aethel_tauri::create_specta_builder();
    builder
        .export(
            Typescript::default().bigint(BigIntExportBehavior::Number),
            "src/bindings.ts",
        )
        .expect("Failed to export TypeScript bindings");
    println!("Successfully exported TypeScript bindings to src/bindings.ts");
}
