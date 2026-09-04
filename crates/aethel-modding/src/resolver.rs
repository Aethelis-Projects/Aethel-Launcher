use std::collections::HashSet;
use std::sync::Arc;
use tracing::{debug, warn};

use crate::modrinth::ModrinthClient;
use crate::types::{
    DependencyConflict, DependencyType, InstalledMod, ModVersion, ResolutionResult,
};
use aethel_core::AppError;

/// Resolves mod dependencies recursively with cycle and incompatibility detection.
pub struct DependencyResolver {
    modrinth: Arc<ModrinthClient>,
}

impl DependencyResolver {
    pub fn new(modrinth: Arc<ModrinthClient>) -> Self {
        Self { modrinth }
    }

    /// Resolves dependencies for a set of target mod versions against currently installed mods.
    pub async fn resolve(
        &self,
        mods: &[ModVersion],
        installed: &[InstalledMod],
        game_version: &str,
        loader: &str,
    ) -> Result<ResolutionResult, AppError> {
        let installed_project_ids: HashSet<String> = installed
            .iter()
            .filter_map(|m| m.project_id.clone())
            .collect();

        // Also index installed mod IDs/names for incompatibility checks
        let installed_mod_ids: HashSet<String> =
            installed.iter().map(|m| m.id.to_lowercase()).collect();

        let mut to_install: Vec<ModVersion> = Vec::new();
        let mut optional_suggestions: Vec<ModVersion> = Vec::new();
        let mut conflicts: Vec<DependencyConflict> = Vec::new();

        let mut visited_projects: HashSet<String> = HashSet::new();
        let mut recursion_stack: HashSet<String> = HashSet::new();

        // Seed to_install with initial requested mods
        for m in mods {
            to_install.push(m.clone());
            visited_projects.insert(m.project_id.clone());
        }

        let mut index = 0;
        while index < to_install.len() {
            let current = to_install[index].clone();
            let current_id = current.project_id.clone();
            recursion_stack.insert(current_id.clone());

            for dep in &current.dependencies {
                let Some(ref dep_proj_id) = dep.project_id else {
                    continue;
                };

                match dep.dependency_type {
                    DependencyType::Incompatible => {
                        // Check if incompatible mod is already installed or pending install
                        let is_installed = installed_project_ids.contains(dep_proj_id)
                            || installed_mod_ids.contains(&dep_proj_id.to_lowercase());
                        let is_pending = to_install.iter().any(|m| &m.project_id == dep_proj_id);

                        if is_installed || is_pending {
                            conflicts.push(DependencyConflict {
                                mod_a: current.name.clone(),
                                mod_b: dep_proj_id.clone(),
                                reason: format!(
                                    "Mod '{}' is incompatible with '{}'",
                                    current.name, dep_proj_id
                                ),
                            });
                        }
                    }
                    DependencyType::Required => {
                        // Check cycle
                        if recursion_stack.contains(dep_proj_id) {
                            debug!(
                                "Cyclic dependency detected: {} -> {}",
                                current.name, dep_proj_id
                            );
                            continue;
                        }

                        // Check if already installed
                        if installed_project_ids.contains(dep_proj_id) {
                            debug!(
                                "Dependency '{}' is already installed, skipping download",
                                dep_proj_id
                            );
                            continue;
                        }

                        // Check if already in to_install or visited
                        if visited_projects.contains(dep_proj_id) {
                            continue;
                        }

                        visited_projects.insert(dep_proj_id.clone());

                        // Fetch candidate versions
                        match self
                            .modrinth
                            .get_project_versions(dep_proj_id, Some(game_version), Some(loader))
                            .await
                        {
                            Ok(versions) => {
                                if let Some(best) = versions.into_iter().next() {
                                    debug!(
                                        "Resolved required dependency: {} -> {}",
                                        dep_proj_id, best.name
                                    );
                                    to_install.push(best);
                                } else {
                                    warn!(
                                        "No matching version found for dependency: {}",
                                        dep_proj_id
                                    );
                                }
                            }
                            Err(e) => {
                                warn!(
                                    "Failed to fetch dependency versions for {}: {}",
                                    dep_proj_id, e
                                );
                            }
                        }
                    }
                    DependencyType::Optional => {
                        if !installed_project_ids.contains(dep_proj_id)
                            && !visited_projects.contains(dep_proj_id)
                        {
                            if let Ok(versions) = self
                                .modrinth
                                .get_project_versions(dep_proj_id, Some(game_version), Some(loader))
                                .await
                            {
                                if let Some(best) = versions.into_iter().next() {
                                    optional_suggestions.push(best);
                                }
                            }
                        }
                    }
                    DependencyType::Embedded => {}
                }
            }

            recursion_stack.remove(&current_id);
            index += 1;
        }

        Ok(ResolutionResult {
            to_install,
            optional_suggestions,
            conflicts,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{ModDependency, ModFile, ModFileHashes};

    fn make_test_mod(id: &str, name: &str, deps: Vec<(&str, DependencyType)>) -> ModVersion {
        ModVersion {
            version_id: format!("ver-{id}"),
            project_id: id.to_string(),
            version_number: "1.0.0".to_string(),
            name: name.to_string(),
            game_versions: vec!["1.20.4".to_string()],
            loaders: vec!["fabric".to_string()],
            files: vec![ModFile {
                url: format!("https://cdn.example.com/{id}.jar"),
                filename: format!("{id}.jar"),
                primary: true,
                size: 1024,
                hashes: ModFileHashes {
                    sha1: None,
                    sha512: None,
                },
            }],
            dependencies: deps
                .into_iter()
                .map(|(dep_id, dep_type)| ModDependency {
                    project_id: Some(dep_id.to_string()),
                    version_id: None,
                    file_name: None,
                    dependency_type: dep_type,
                })
                .collect(),
            date_published: "2024-01-01T00:00:00Z".to_string(),
        }
    }

    #[tokio::test]
    async fn test_resolver_skips_installed_mods() {
        let client = Arc::new(ModrinthClient::new().unwrap());
        let resolver = DependencyResolver::new(client);

        // Mod A requires Mod B
        let mod_a = make_test_mod("mod-a", "Mod A", vec![("mod-b", DependencyType::Required)]);

        // Mod B is already installed
        let installed = vec![InstalledMod {
            id: "mod-b".to_string(),
            name: "Mod B".to_string(),
            version: "1.0.0".to_string(),
            file_name: "mod-b.jar".to_string(),
            enabled: true,
            description: None,
            authors: vec![],
            project_id: Some("mod-b".to_string()),
        }];

        let result = resolver
            .resolve(&[mod_a], &installed, "1.20.4", "fabric")
            .await
            .expect("resolve");

        // to_install should only contain Mod A, Mod B must be skipped!
        assert_eq!(result.to_install.len(), 1);
        assert_eq!(result.to_install[0].project_id, "mod-a");
        assert!(result.conflicts.is_empty());
    }

    #[tokio::test]
    async fn test_resolver_incompatible_mods() {
        let client = Arc::new(ModrinthClient::new().unwrap());
        let resolver = DependencyResolver::new(client);

        // Mod A is incompatible with Mod C
        let mod_a = make_test_mod(
            "mod-a",
            "Mod A",
            vec![("mod-c", DependencyType::Incompatible)],
        );

        // Mod C is already installed
        let installed = vec![InstalledMod {
            id: "mod-c".to_string(),
            name: "Mod C".to_string(),
            version: "1.0.0".to_string(),
            file_name: "mod-c.jar".to_string(),
            enabled: true,
            description: None,
            authors: vec![],
            project_id: Some("mod-c".to_string()),
        }];

        let result = resolver
            .resolve(&[mod_a], &installed, "1.20.4", "fabric")
            .await
            .expect("resolve");

        assert_eq!(result.conflicts.len(), 1);
        assert_eq!(result.conflicts[0].mod_a, "Mod A");
        assert_eq!(result.conflicts[0].mod_b, "mod-c");
    }

    #[tokio::test]
    async fn test_resolver_cyclic_dependency_detection() {
        let client = Arc::new(ModrinthClient::new().unwrap());
        let resolver = DependencyResolver::new(client);

        // Mod A requires Mod B; Mod B requires Mod A
        let mod_a = make_test_mod("mod-a", "Mod A", vec![("mod-b", DependencyType::Required)]);
        let mod_b = make_test_mod("mod-b", "Mod B", vec![("mod-a", DependencyType::Required)]);

        // Seed with both to test cycle in to_install list
        let result = resolver
            .resolve(&[mod_a, mod_b], &[], "1.20.4", "fabric")
            .await
            .expect("resolve");

        // Should complete without hanging or panicking
        assert_eq!(result.to_install.len(), 2);
    }
}
