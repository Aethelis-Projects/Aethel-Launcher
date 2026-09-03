use std::fs::File;
use std::io::Write;
use std::sync::Arc;
use tempfile::tempdir;
use zip::write::{SimpleFileOptions, ZipWriter};

use aethel_core::{AppErrorCode, HashAlgorithm};
use aethel_download::{
    atomic_rename, check_disk_space, compute_file_hash, extract_archive_safe, DownloadEngine,
};

#[test]
fn test_zip_slip_prevention() {
    let dir = tempdir().expect("Failed to create tempdir");
    let zip_path = dir.path().join("malicious.zip");
    let extract_dir = dir.path().join("extracted");

    // Construct a malicious zip containing ../../escaped.txt
    let file = File::create(&zip_path).expect("Failed to create zip");
    let mut zip = ZipWriter::new(file);

    let options = SimpleFileOptions::default();
    zip.start_file("../../escaped.txt", options)
        .expect("Failed to start file");
    zip.write_all(b"malicious payload")
        .expect("Failed to write payload");
    zip.finish().expect("Failed to finish zip");

    let res = extract_archive_safe(&zip_path, &extract_dir);
    assert!(res.is_err(), "Must reject zip slip archive");
    let err = res.unwrap_err();
    assert_eq!(err.code(), AppErrorCode::ZipSlipDetected);

    // Verify escaped file was never created
    assert!(!dir.path().join("escaped.txt").exists());
}

#[test]
fn test_safe_zip_extraction() {
    let dir = tempdir().expect("Failed to create tempdir");
    let zip_path = dir.path().join("safe.zip");
    let extract_dir = dir.path().join("extracted");

    let file = File::create(&zip_path).expect("Failed to create zip");
    let mut zip = ZipWriter::new(file);

    let options = SimpleFileOptions::default();
    zip.start_file("nested/hello.txt", options)
        .expect("Failed to start file");
    zip.write_all(b"welcome to aethel")
        .expect("Failed to write content");
    zip.finish().expect("Failed to finish zip");

    let res = extract_archive_safe(&zip_path, &extract_dir).expect("Safe extraction must succeed");
    assert_eq!(res.len(), 1);
    let extracted_content = std::fs::read_to_string(&res[0]).expect("Read extracted file");
    assert_eq!(extracted_content, "welcome to aethel");
}

#[test]
fn test_atomic_rename() {
    let dir = tempdir().expect("Failed to create tempdir");
    let from = dir.path().join("file.part");
    let to = dir.path().join("file.final");

    std::fs::write(&from, "data to rename").expect("Write source");
    atomic_rename(&from, &to).expect("Atomic rename must succeed");

    assert!(!from.exists());
    assert!(to.exists());
    assert_eq!(std::fs::read_to_string(&to).unwrap(), "data to rename");
}

#[test]
fn test_hash_computation() {
    let dir = tempdir().expect("Failed to create tempdir");
    let file_path = dir.path().join("test_hash.bin");
    std::fs::write(&file_path, b"hello minecraft").expect("Write test data");

    // SHA-1 of "hello minecraft" is 0205c49d7dadcddde7b919c2b0763dd43d1679f0
    let sha1 = compute_file_hash(&file_path, HashAlgorithm::Sha1).expect("Compute sha1");
    assert_eq!(sha1, "0205c49d7dadcddde7b919c2b0763dd43d1679f0");

    // SHA-512 of "hello minecraft"
    let sha512 = compute_file_hash(&file_path, HashAlgorithm::Sha512).expect("Compute sha512");
    assert_eq!(sha512.len(), 128);
}

#[test]
fn test_disk_space_check() {
    let dir = tempdir().expect("Failed to create tempdir");

    // Reasonable size succeeds
    let res = check_disk_space(dir.path(), 1024);
    assert!(res.is_ok());

    // Huge size fails with NoDiskSpace on Windows
    #[cfg(windows)]
    {
        let res_huge = check_disk_space(dir.path(), u64::MAX - 100);
        assert!(res_huge.is_err());
        assert_eq!(res_huge.unwrap_err().code(), AppErrorCode::NoDiskSpace);
    }
}

#[tokio::test]
async fn test_per_host_semaphore() {
    let engine = DownloadEngine::new(4);
    let sem1 = engine.get_semaphore("piston-meta.mojang.com").await;
    let sem2 = engine.get_semaphore("piston-meta.mojang.com").await;
    let sem3 = engine.get_semaphore("api.modrinth.com").await;

    assert_eq!(sem1.available_permits(), 4);
    assert_eq!(sem3.available_permits(), 4);
    assert!(
        Arc::ptr_eq(&sem1, &sem2),
        "Same host must reuse identical semaphore"
    );
    assert!(
        !Arc::ptr_eq(&sem1, &sem3),
        "Different hosts must have distinct semaphores"
    );
}
