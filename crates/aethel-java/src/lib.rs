pub mod gc;
pub mod resolver;

pub use gc::GCPreset;
pub use resolver::{detect_system_java, parse_java_version_output, JavaResolver};
