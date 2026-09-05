pub mod gc;
pub mod resolver;

pub use gc::GCPreset;
pub use resolver::{
    detect_system_java, detect_system_javas, parse_java_version_output, test_java_path,
    DetectedJava, InstalledRuntime, JavaProvider, JavaResolver, JavaSource, JavaTestResult,
};
