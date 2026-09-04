use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, Default)]
pub enum GCPreset {
    #[default]
    G1GC,
    ZGC,
    GenerationalZGC,
    Parallel,
}

impl GCPreset {
    /// Returns JVM arguments optimized for this garbage collector preset
    /// and the specified Java major version.
    pub fn to_jvm_args(&self, java_major: u32) -> Vec<String> {
        match self {
            Self::G1GC => Self::g1gc_args(),
            Self::ZGC => {
                if java_major >= 15 {
                    vec!["-XX:+UseZGC".to_string()]
                } else {
                    // ZGC is only production-ready from Java 15+; fallback to G1GC
                    Self::g1gc_args()
                }
            }
            Self::GenerationalZGC => {
                if (21..=22).contains(&java_major) {
                    vec!["-XX:+UseZGC".to_string(), "-XX:+ZGenerational".to_string()]
                } else if java_major >= 23 {
                    // JEP 474: In JDK 23+, Generational ZGC is the non-experimental default.
                    // The -XX:+ZGenerational flag is deprecated/rejected and must not be passed.
                    vec!["-XX:+UseZGC".to_string()]
                } else {
                    // Java < 21 does not support Generational ZGC; fallback to G1GC
                    Self::g1gc_args()
                }
            }
            Self::Parallel => vec!["-XX:+UseParallelGC".to_string()],
        }
    }

    fn g1gc_args() -> Vec<String> {
        vec![
            "-XX:+UseG1GC".to_string(),
            "-XX:+ParallelRefProcEnabled".to_string(),
            "-XX:MaxGCPauseMillis=200".to_string(),
            "-XX:+UnlockExperimentalVMOptions".to_string(),
            "-XX:+DisableExplicitGC".to_string(),
            "-XX:+AlwaysPreTouch".to_string(),
            "-XX:G1NewSizePercent=30".to_string(),
            "-XX:G1MaxNewSizePercent=40".to_string(),
            "-XX:G1ReservePercent=20".to_string(),
            "-XX:G1HeapWastePercent=5".to_string(),
            "-XX:G1MixedGCCountTarget=4".to_string(),
            "-XX:InitiatingHeapOccupancyPercent=15".to_string(),
            "-XX:G1MixedGCLiveThresholdPercent=90".to_string(),
            "-XX:G1RSetUpdatingPauseTimePercent=5".to_string(),
            "-XX:SurvivorRatio=32".to_string(),
            "-XX:+PerfDisableSharedMem".to_string(),
            "-XX:MaxTenuringThreshold=1".to_string(),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_g1gc_always_works() {
        for java_ver in [8, 11, 16, 17, 21, 23] {
            let args = GCPreset::G1GC.to_jvm_args(java_ver);
            assert!(args.contains(&"-XX:+UseG1GC".to_string()));
            assert!(args.contains(&"-XX:+ParallelRefProcEnabled".to_string()));
        }
    }

    #[test]
    fn test_zgc_requires_java15() {
        let args_java8 = GCPreset::ZGC.to_jvm_args(8);
        assert!(args_java8.contains(&"-XX:+UseG1GC".to_string()));
        assert!(!args_java8.contains(&"-XX:+UseZGC".to_string()));

        let args_java11 = GCPreset::ZGC.to_jvm_args(11);
        assert!(args_java11.contains(&"-XX:+UseG1GC".to_string()));

        let args_java17 = GCPreset::ZGC.to_jvm_args(17);
        assert_eq!(args_java17, vec!["-XX:+UseZGC".to_string()]);

        let args_java21 = GCPreset::ZGC.to_jvm_args(21);
        assert_eq!(args_java21, vec!["-XX:+UseZGC".to_string()]);
    }

    #[test]
    fn test_generational_zgc_only_java_21_22() {
        let args_java17 = GCPreset::GenerationalZGC.to_jvm_args(17);
        assert!(args_java17.contains(&"-XX:+UseG1GC".to_string()));

        let args_java21 = GCPreset::GenerationalZGC.to_jvm_args(21);
        assert_eq!(
            args_java21,
            vec!["-XX:+UseZGC".to_string(), "-XX:+ZGenerational".to_string(),]
        );

        let args_java22 = GCPreset::GenerationalZGC.to_jvm_args(22);
        assert_eq!(
            args_java22,
            vec!["-XX:+UseZGC".to_string(), "-XX:+ZGenerational".to_string(),]
        );
    }

    #[test]
    fn test_jep474_java23_no_flag() {
        let args_java23 = GCPreset::GenerationalZGC.to_jvm_args(23);
        assert_eq!(args_java23, vec!["-XX:+UseZGC".to_string()]);
        assert!(
            !args_java23.contains(&"-XX:+ZGenerational".to_string()),
            "JEP 474: In JDK 23+, -XX:+ZGenerational MUST NOT be passed"
        );

        let args_java25 = GCPreset::GenerationalZGC.to_jvm_args(25);
        assert_eq!(args_java25, vec!["-XX:+UseZGC".to_string()]);
        assert!(!args_java25.contains(&"-XX:+ZGenerational".to_string()));
    }

    #[test]
    fn test_parallel_gc() {
        let args = GCPreset::Parallel.to_jvm_args(17);
        assert_eq!(args, vec!["-XX:+UseParallelGC".to_string()]);
    }
}
