use md5::{Digest, Md5};
use uuid::Uuid;

/// Generates a deterministic offline UUID matching OpenJDK's
/// `UUID.nameUUIDFromBytes(("OfflinePlayer:" + username).getBytes(UTF_8))`
///
/// Note: Username case is strictly preserved. `Steve` != `steve`.
pub fn generate_offline_uuid(username: &str) -> Uuid {
    let mut hasher = Md5::new();
    hasher.update(b"OfflinePlayer:");
    hasher.update(username.as_bytes());
    let mut hash = hasher.finalize();

    // Set version to 3 (MD5-based UUID)
    hash[6] = (hash[6] & 0x0f) | 0x30;
    // Set variant to IETF (Leach-Salz)
    hash[8] = (hash[8] & 0x3f) | 0x80;

    Uuid::from_bytes(hash.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_case_sensitivity() {
        let u1 = generate_offline_uuid("Steve");
        let u2 = generate_offline_uuid("steve");
        assert_ne!(u1, u2, "Offline UUID must be case sensitive");
    }
}