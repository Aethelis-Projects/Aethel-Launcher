use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum HashAlgorithm {
    Sha1,
    Sha512,
    Murmur2,
}
