use aethel_core::{
    types::{ModpackInspectResult, ResourcePackEntry, ShaderPackEntry, WorldEntry},
    AppError, AppErrorCode,
};
use base64::Engine;
use flate2::read::GzDecoder;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

// ==========================================
// 1. NBT Parser for Minecraft level.dat
// ==========================================

pub struct NbtReader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> NbtReader<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Self { data, pos: 0 }
    }

    pub fn remaining(&self) -> usize {
        self.data.len().saturating_sub(self.pos)
    }

    pub fn read_u8(&mut self) -> Option<u8> {
        if self.pos < self.data.len() {
            let b = self.data[self.pos];
            self.pos += 1;
            Some(b)
        } else {
            None
        }
    }

    pub fn read_i16(&mut self) -> Option<i16> {
        if self.remaining() >= 2 {
            let val = i16::from_be_bytes([self.data[self.pos], self.data[self.pos + 1]]);
            self.pos += 2;
            Some(val)
        } else {
            None
        }
    }

    pub fn read_i32(&mut self) -> Option<i32> {
        if self.remaining() >= 4 {
            let val = i32::from_be_bytes([
                self.data[self.pos],
                self.data[self.pos + 1],
                self.data[self.pos + 2],
                self.data[self.pos + 3],
            ]);
            self.pos += 4;
            Some(val)
        } else {
            None
        }
    }

    pub fn read_i64(&mut self) -> Option<i64> {
        if self.remaining() >= 8 {
            let mut buf = [0u8; 8];
            buf.copy_from_slice(&self.data[self.pos..self.pos + 8]);
            self.pos += 8;
            Some(i64::from_be_bytes(buf))
        } else {
            None
        }
    }

    pub fn read_string(&mut self) -> Option<String> {
        let len = self.read_i16()? as usize;
        if self.remaining() >= len {
            let s = String::from_utf8_lossy(&self.data[self.pos..self.pos + len]).to_string();
            self.pos += len;
            Some(s)
        } else {
            None
        }
    }

    pub fn skip_bytes(&mut self, n: usize) -> bool {
        if self.remaining() >= n {
            self.pos += n;
            true
        } else {
            self.pos = self.data.len();
            false
        }
    }

    pub fn skip_tag_payload(&mut self, tag_id: u8) -> bool {
        match tag_id {
            0 => true,
            1 => self.skip_bytes(1),
            2 => self.skip_bytes(2),
            3 => self.skip_bytes(4),
            4 => self.skip_bytes(8),
            5 => self.skip_bytes(4),
            6 => self.skip_bytes(8),
            7 => {
                let len = match self.read_i32() {
                    Some(l) if l >= 0 => l as usize,
                    _ => return false,
                };
                self.skip_bytes(len)
            }
            8 => {
                let len = match self.read_i16() {
                    Some(l) if l >= 0 => l as usize,
                    _ => return false,
                };
                self.skip_bytes(len)
            }
            9 => {
                let elem_type = match self.read_u8() {
                    Some(t) => t,
                    None => return false,
                };
                let len = match self.read_i32() {
                    Some(l) if l >= 0 => l as usize,
                    _ => return false,
                };
                for _ in 0..len {
                    if !self.skip_tag_payload(elem_type) {
                        return false;
                    }
                }
                true
            }
            10 => {
                loop {
                    let sub_tag = match self.read_u8() {
                        Some(t) => t,
                        None => return false,
                    };
                    if sub_tag == 0 {
                        break;
                    }
                    if self.read_string().is_none() {
                        return false;
                    }
                    if !self.skip_tag_payload(sub_tag) {
                        return false;
                    }
                }
                true
            }
            11 => {
                let len = match self.read_i32() {
                    Some(l) if l >= 0 => l as usize,
                    _ => return false,
                };
                self.skip_bytes(len * 4)
            }
            12 => {
                let len = match self.read_i32() {
                    Some(l) if l >= 0 => l as usize,
                    _ => return false,
                };
                self.skip_bytes(len * 8)
            }
            _ => false,
        }
    }

    pub fn parse_level_dat(
        &mut self,
    ) -> (Option<String>, Option<i64>, Option<u64>, Option<String>) {
        let mut level_name = None;
        let mut seed = None;
        let mut last_played = None;
        let mut game_mode = None;

        let root_tag = match self.read_u8() {
            Some(t) => t,
            None => return (level_name, seed, last_played, game_mode),
        };

        if root_tag != 10 {
            return (level_name, seed, last_played, game_mode);
        }

        let _ = self.read_string();

        self.scan_compound(
            &mut level_name,
            &mut seed,
            &mut last_played,
            &mut game_mode,
            0,
        );

        (level_name, seed, last_played, game_mode)
    }

    fn scan_compound(
        &mut self,
        level_name: &mut Option<String>,
        seed: &mut Option<i64>,
        last_played: &mut Option<u64>,
        game_mode: &mut Option<String>,
        depth: usize,
    ) {
        if depth > 32 {
            return;
        }

        while let Some(tag_id) = self.read_u8() {
            if tag_id == 0 {
                break;
            }

            let name = match self.read_string() {
                Some(s) => s,
                None => break,
            };

            match (tag_id, name.as_str()) {
                (8, "LevelName") => {
                    if let Some(s) = self.read_string() {
                        if level_name.is_none() {
                            *level_name = Some(s);
                        }
                    }
                }
                (4, "RandomSeed") | (4, "seed") => {
                    if let Some(v) = self.read_i64() {
                        if seed.is_none() {
                            *seed = Some(v);
                        }
                    }
                }
                (4, "LastPlayed") => {
                    if let Some(v) = self.read_i64() {
                        if last_played.is_none() && v > 0 {
                            *last_played = Some(v as u64);
                        }
                    }
                }
                (3, "GameType") => {
                    if let Some(gt) = self.read_i32() {
                        if game_mode.is_none() {
                            let mode_str = match gt {
                                0 => "Survival",
                                1 => "Creative",
                                2 => "Adventure",
                                3 => "Spectator",
                                _ => "Unknown",
                            };
                            *game_mode = Some(mode_str.to_string());
                        }
                    }
                }
                (10, _) => {
                    self.scan_compound(level_name, seed, last_played, game_mode, depth + 1);
                }
                _ => {
                    if !self.skip_tag_payload(tag_id) {
                        break;
                    }
                }
            }
        }
    }
}

pub type LevelDatInfo = (Option<String>, Option<i64>, Option<u64>, Option<String>);

pub fn parse_level_dat_file(file_path: &Path) -> Result<LevelDatInfo, AppError> {
    let mut f = File::open(file_path).map_err(|e| {
        AppError::new(
            AppErrorCode::InternalError,
            format!("Failed to open {}: {e}", file_path.display()),
        )
    })?;

    let mut raw_bytes = Vec::new();
    f.read_to_end(&mut raw_bytes).map_err(|e| {
        AppError::new(
            AppErrorCode::InternalError,
            format!("Failed to read {}: {e}", file_path.display()),
        )
    })?;

    let uncompressed = {
        let mut gz_decoder = GzDecoder::new(&raw_bytes[..]);
        let mut decoded = Vec::new();
        if gz_decoder.read_to_end(&mut decoded).is_ok() {
            decoded
        } else {
            raw_bytes
        }
    };

    let mut reader = NbtReader::new(&uncompressed);
    Ok(reader.parse_level_dat())
}

pub fn calculate_dir_size(path: &Path) -> u64 {
    let mut total: u64 = 0;
    if let Ok(entries) = walkdir::WalkDir::new(path)
        .into_iter()
        .collect::<Result<Vec<_>, _>>()
    {
        for entry in entries {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total += meta.len();
                }
            }
        }
    }
    total
}

pub fn read_image_data_url(path: &Path) -> Option<String> {
    if !path.exists() {
        return None;
    }
    let mut bytes = Vec::new();
    if File::open(path)
        .and_then(|mut f| f.read_to_end(&mut bytes))
        .is_ok()
        && !bytes.is_empty()
    {
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let mime = if path.extension().and_then(|e| e.to_str()) == Some("jpg") {
            "image/jpeg"
        } else {
            "image/png"
        };
        Some(format!("data:{mime};base64,{b64}"))
    } else {
        None
    }
}

pub fn read_active_resourcepacks(options_path: &Path) -> Vec<String> {
    if !options_path.exists() {
        return Vec::new();
    }
    if let Ok(content) = std::fs::read_to_string(options_path) {
        for line in content.lines() {
            if let Some(rest) = line.strip_prefix("resourcePacks:") {
                if let Ok(val) = serde_json::from_str::<Vec<String>>(rest.trim()) {
                    return val;
                }
            }
        }
    }
    Vec::new()
}

pub fn set_active_resourcepack_status(
    options_path: &Path,
    pack_name: &str,
    enabled: bool,
) -> Result<(), AppError> {
    let content = if options_path.exists() {
        std::fs::read_to_string(options_path).unwrap_or_default()
    } else {
        String::new()
    };

    let mut current_packs = Vec::new();
    let mut new_lines = Vec::new();

    let target_ref = if pack_name.starts_with("file/") {
        pack_name.to_string()
    } else {
        format!("file/{pack_name}")
    };

    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("resourcePacks:") {
            if let Ok(val) = serde_json::from_str::<Vec<String>>(rest.trim()) {
                current_packs = val;
            }
        } else {
            new_lines.push(line.to_string());
        }
    }

    if enabled {
        if !current_packs
            .iter()
            .any(|p| p == &target_ref || p == pack_name)
        {
            current_packs.push(target_ref);
        }
    } else {
        current_packs.retain(|p| p != &target_ref && p != pack_name);
    }

    let json_str = serde_json::to_string(&current_packs).unwrap_or_else(|_| "[]".to_string());
    new_lines.push(format!("resourcePacks:{json_str}"));

    std::fs::write(options_path, new_lines.join("\n")).map_err(|e| {
        AppError::new(
            AppErrorCode::InternalError,
            format!("Failed to write options.txt: {e}"),
        )
    })?;

    Ok(())
}

pub fn read_active_shaderpack(instance_dir: &Path) -> Option<String> {
    let iris_path = instance_dir.join("config").join("iris.properties");
    if iris_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&iris_path) {
            for line in content.lines() {
                if let Some(rest) = line.strip_prefix("shaderPack=") {
                    let trimmed = rest.trim();
                    if !trimmed.is_empty() && trimmed != "OFF" {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    let opt_shaders = instance_dir.join("optionsshaders.txt");
    if opt_shaders.exists() {
        if let Ok(content) = std::fs::read_to_string(&opt_shaders) {
            for line in content.lines() {
                if let Some(rest) = line.strip_prefix("currentShaderPack=") {
                    let trimmed = rest.trim();
                    if !trimmed.is_empty() && trimmed != "OFF" {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    None
}

pub fn write_active_shaderpack(
    instance_dir: &Path,
    shader_name: Option<&str>,
) -> Result<(), AppError> {
    let name_val = shader_name.unwrap_or("OFF");

    let config_dir = instance_dir.join("config");
    let _ = std::fs::create_dir_all(&config_dir);
    let iris_path = config_dir.join("iris.properties");
    let mut iris_content = String::new();
    if iris_path.exists() {
        if let Ok(existing) = std::fs::read_to_string(&iris_path) {
            for line in existing.lines() {
                if !line.starts_with("shaderPack=") {
                    iris_content.push_str(line);
                    iris_content.push('\n');
                }
            }
        }
    }
    iris_content.push_str(&format!("shaderPack={name_val}\n"));
    let _ = std::fs::write(&iris_path, iris_content);

    let opt_shaders = instance_dir.join("optionsshaders.txt");
    let mut opt_content = String::new();
    if opt_shaders.exists() {
        if let Ok(existing) = std::fs::read_to_string(&opt_shaders) {
            for line in existing.lines() {
                if !line.starts_with("currentShaderPack=") {
                    opt_content.push_str(line);
                    opt_content.push('\n');
                }
            }
        }
    }
    opt_content.push_str(&format!("currentShaderPack={name_val}\n"));
    let _ = std::fs::write(&opt_shaders, opt_content);

    Ok(())
}

pub fn scan_worlds(instance_dir: &Path) -> Vec<WorldEntry> {
    let saves_dir = instance_dir.join("saves");
    if !saves_dir.exists() {
        return Vec::new();
    }

    let mut worlds = Vec::new();
    let entries = match std::fs::read_dir(&saves_dir) {
        Ok(e) => e,
        Err(_) => return worlds,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let folder_name = entry.file_name().to_string_lossy().to_string();
        let level_dat = path.join("level.dat");
        if !level_dat.exists() {
            continue;
        }

        let (level_name, seed, last_played, game_mode) =
            parse_level_dat_file(&level_dat).unwrap_or((None, None, None, None));

        let final_name = level_name.unwrap_or_else(|| folder_name.clone());
        let size_bytes = calculate_dir_size(&path);
        let icon_base64 = read_image_data_url(&path.join("icon.png"));

        worlds.push(WorldEntry {
            folder_name,
            level_name: final_name,
            seed,
            last_played,
            game_mode,
            size_bytes,
            icon_base64,
        });
    }

    worlds.sort_by_key(|a| std::cmp::Reverse(a.last_played));
    worlds
}

pub fn scan_resourcepacks(instance_dir: &Path) -> Vec<ResourcePackEntry> {
    let rp_dir = instance_dir.join("resourcepacks");
    if !rp_dir.exists() {
        let _ = std::fs::create_dir_all(&rp_dir);
        return Vec::new();
    }

    let active_list = read_active_resourcepacks(&instance_dir.join("options.txt"));
    let mut packs = Vec::new();

    let entries = match std::fs::read_dir(&rp_dir) {
        Ok(e) => e,
        Err(_) => return packs,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        let is_zip = path.is_file() && file_name.ends_with(".zip");
        let is_dir = path.is_dir();

        if !is_zip && !is_dir {
            continue;
        }

        let is_enabled = active_list.iter().any(|p| {
            p == &file_name || p == &format!("file/{file_name}") || p.ends_with(&file_name)
        });

        let name = file_name.trim_end_matches(".zip").to_string();
        let mut description = None;
        let mut icon_base64 = None;
        let size_bytes = if is_dir {
            calculate_dir_size(&path)
        } else {
            entry.metadata().map(|m| m.len()).unwrap_or(0)
        };

        if is_zip {
            if let Ok(file) = File::open(&path) {
                if let Ok(mut archive) = ZipArchive::new(file) {
                    if let Ok(mut mcmeta) = archive.by_name("pack.mcmeta") {
                        let mut buf = String::new();
                        if mcmeta.read_to_string(&mut buf).is_ok() {
                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&buf) {
                                if let Some(desc) = val["pack"]["description"].as_str() {
                                    description = Some(desc.to_string());
                                } else if let Some(desc_obj) =
                                    val["pack"]["description"]["text"].as_str()
                                {
                                    description = Some(desc_obj.to_string());
                                }
                            }
                        }
                    }
                    if let Ok(mut icon_file) = archive.by_name("pack.png") {
                        let mut icon_bytes = Vec::new();
                        if icon_file.read_to_end(&mut icon_bytes).is_ok() && !icon_bytes.is_empty()
                        {
                            let b64 = base64::engine::general_purpose::STANDARD.encode(&icon_bytes);
                            icon_base64 = Some(format!("data:image/png;base64,{b64}"));
                        }
                    }
                }
            }
        } else if is_dir {
            let mcmeta_path = path.join("pack.mcmeta");
            if mcmeta_path.exists() {
                if let Ok(buf) = std::fs::read_to_string(&mcmeta_path) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&buf) {
                        if let Some(desc) = val["pack"]["description"].as_str() {
                            description = Some(desc.to_string());
                        } else if let Some(desc_obj) = val["pack"]["description"]["text"].as_str() {
                            description = Some(desc_obj.to_string());
                        }
                    }
                }
            }
            icon_base64 = read_image_data_url(&path.join("pack.png"));
        }

        packs.push(ResourcePackEntry {
            file_name,
            name,
            description,
            icon_base64,
            is_enabled,
            size_bytes,
        });
    }

    packs.sort_by_key(|p| p.name.to_lowercase());
    packs
}

pub fn scan_shaderpacks(instance_dir: &Path) -> Vec<ShaderPackEntry> {
    let sp_dir = instance_dir.join("shaderpacks");
    if !sp_dir.exists() {
        let _ = std::fs::create_dir_all(&sp_dir);
        return Vec::new();
    }

    let active_shader = read_active_shaderpack(instance_dir);
    let mut packs = Vec::new();

    let entries = match std::fs::read_dir(&sp_dir) {
        Ok(e) => e,
        Err(_) => return packs,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        let is_zip = path.is_file() && file_name.ends_with(".zip");
        let is_dir = path.is_dir();

        if !is_zip && !is_dir {
            continue;
        }

        let is_active = active_shader.as_deref() == Some(&file_name);
        let name = file_name.trim_end_matches(".zip").to_string();
        let size_bytes = if is_dir {
            calculate_dir_size(&path)
        } else {
            entry.metadata().map(|m| m.len()).unwrap_or(0)
        };

        packs.push(ShaderPackEntry {
            file_name,
            name,
            is_active,
            size_bytes,
        });
    }

    packs.sort_by_key(|p| p.name.to_lowercase());
    packs
}

pub fn inspect_modpack_archive(archive_path: &Path) -> Result<ModpackInspectResult, AppError> {
    let file = File::open(archive_path).map_err(|e| {
        AppError::new(
            AppErrorCode::InternalError,
            format!(
                "Failed to open modpack archive {}: {e}",
                archive_path.display()
            ),
        )
    })?;

    let mut archive = ZipArchive::new(file).map_err(|e| {
        AppError::new(
            AppErrorCode::InvalidManifest,
            format!("Failed to read ZIP archive: {e}"),
        )
    })?;

    let mut icon_base64 = None;

    for icon_name in &["icon.png", "logo.png", "cover.png", "pack.png"] {
        if let Ok(mut icon_file) = archive.by_name(icon_name) {
            let mut buf = Vec::new();
            if icon_file.read_to_end(&mut buf).is_ok() && !buf.is_empty() {
                let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
                icon_base64 = Some(format!("data:image/png;base64,{b64}"));
                break;
            }
        }
    }

    // 1. Modrinth
    if let Ok(mut index_file) = archive.by_name("modrinth.index.json") {
        let mut content = String::new();
        index_file
            .read_to_string(&mut content)
            .map_err(|e| AppError::new(AppErrorCode::InvalidManifest, e.to_string()))?;

        let index: aethel_modding::ModrinthIndex = serde_json::from_str(&content).map_err(|e| {
            AppError::new(
                AppErrorCode::InvalidManifest,
                format!("Failed to parse modrinth.index.json: {e}"),
            )
        })?;

        let game_version = index
            .dependencies
            .get("minecraft")
            .cloned()
            .unwrap_or_else(|| "1.20.4".to_string());

        let (loader, loader_version) = if let Some(v) = index.dependencies.get("fabric-loader") {
            ("fabric".to_string(), Some(v.clone()))
        } else if let Some(v) = index.dependencies.get("neoforge") {
            ("neoforge".to_string(), Some(v.clone()))
        } else if let Some(v) = index.dependencies.get("quilt-loader") {
            ("quilt".to_string(), Some(v.clone()))
        } else if let Some(v) = index.dependencies.get("forge") {
            ("forge".to_string(), Some(v.clone()))
        } else {
            ("vanilla".to_string(), None)
        };

        return Ok(ModpackInspectResult {
            name: index.name,
            version: index.version_id,
            summary: index.summary,
            game_version,
            loader,
            loader_version,
            file_count: index.files.len(),
            author: None,
            icon_base64,
        });
    }

    // 2. CurseForge
    if let Ok(mut manifest_file) = archive.by_name("manifest.json") {
        let mut content = String::new();
        manifest_file
            .read_to_string(&mut content)
            .map_err(|e| AppError::new(AppErrorCode::InvalidManifest, e.to_string()))?;

        let manifest: aethel_modding::CurseForgeManifest =
            serde_json::from_str(&content).map_err(|e| {
                AppError::new(
                    AppErrorCode::InvalidManifest,
                    format!("Failed to parse CurseForge manifest.json: {e}"),
                )
            })?;

        let (loader, loader_version) = manifest
            .parse_loader()
            .unwrap_or_else(|_| ("vanilla".to_string(), "".to_string()));

        return Ok(ModpackInspectResult {
            name: manifest.name,
            version: manifest.version,
            summary: None,
            game_version: manifest.minecraft.version,
            loader,
            loader_version: if loader_version.is_empty() {
                None
            } else {
                Some(loader_version)
            },
            file_count: manifest.files.len(),
            author: manifest.author,
            icon_base64,
        });
    }

    Err(AppError::new(
        AppErrorCode::InvalidManifest,
        "Archive does not contain modrinth.index.json or manifest.json",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nbt_reader_parses_synthetic_level_dat() {
        // Construct synthetic uncompressed NBT:
        // Tag 10 (Compound) -> Root ""
        //   Tag 8: "LevelName" = "My Survival World"
        //   Tag 4: "RandomSeed" = 1234567890123456789i64
        //   Tag 4: "LastPlayed" = 1725500000000i64
        //   Tag 3: "GameType" = 0i32 (Survival)
        // Tag 0 (End)
        let mut data = Vec::new();
        data.push(10); // Root compound
        data.extend_from_slice(&0u16.to_be_bytes()); // Root name len 0

        // LevelName
        data.push(8);
        data.extend_from_slice(&(9u16).to_be_bytes());
        data.extend_from_slice(b"LevelName");
        let name_bytes = b"My Survival World";
        data.extend_from_slice(&(name_bytes.len() as u16).to_be_bytes());
        data.extend_from_slice(name_bytes);

        // RandomSeed
        data.push(4);
        data.extend_from_slice(&(10u16).to_be_bytes());
        data.extend_from_slice(b"RandomSeed");
        data.extend_from_slice(&(1234567890123456789i64).to_be_bytes());

        // LastPlayed
        data.push(4);
        data.extend_from_slice(&(10u16).to_be_bytes());
        data.extend_from_slice(b"LastPlayed");
        data.extend_from_slice(&(1725500000000i64).to_be_bytes());

        // GameType
        data.push(3);
        data.extend_from_slice(&(8u16).to_be_bytes());
        data.extend_from_slice(b"GameType");
        data.extend_from_slice(&(0i32).to_be_bytes());

        data.push(0); // End

        let mut reader = NbtReader::new(&data);
        let (name, seed, last_played, game_mode) = reader.parse_level_dat();

        assert_eq!(name.as_deref(), Some("My Survival World"));
        assert_eq!(seed, Some(1234567890123456789));
        assert_eq!(last_played, Some(1725500000000));
        assert_eq!(game_mode.as_deref(), Some("Survival"));
    }
}
