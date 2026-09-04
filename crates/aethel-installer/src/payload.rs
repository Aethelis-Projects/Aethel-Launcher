#[cfg(has_embedded_payload)]
static EMBEDDED_PAYLOAD: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/embedded_payload.bin"));

/// Returns the embedded launcher payload if one was compiled into this binary.
pub fn get_embedded_payload() -> Option<&'static [u8]> {
    #[cfg(has_embedded_payload)]
    {
        if !EMBEDDED_PAYLOAD.is_empty() {
            return Some(EMBEDDED_PAYLOAD);
        }
    }
    None
}
