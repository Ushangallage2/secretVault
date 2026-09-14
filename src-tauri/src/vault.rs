use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{Argon2, ParamsBuilder, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chrono::{DateTime, Utc};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;
use uuid::Uuid;
use zeroize::{Zeroize, ZeroizeOnDrop};

pub const MAGIC: &[u8; 8] = b"SECRTVLT";
/// Older builds used this magic; still accepted when unlocking existing files.
pub const MAGIC_LEGACY: &[u8; 8] = b"ELEOSVLT";
pub const FORMAT_VERSION: u8 = 1;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

#[derive(Debug, Error)]
pub enum VaultError {
    #[error("{0}")]
    Message(String),
    #[error("wrong master password")]
    WrongPassword,
    #[error("not unlocked")]
    Locked,
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("crypto: {0}")]
    Crypto(String),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

impl VaultError {
    pub fn msg(s: impl Into<String>) -> Self {
        Self::Message(s.into())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EntryType {
    Secret,
    Command,
    Note,
    /// JasperReports source (.jrxml) or compiled (.jasper) — first-class in the UI.
    Jasper,
    /// Any other attached file stored inside the encrypted vault.
    File,
}

/// Soft/hard limits for attachments stored inside the encrypted JSON vault.
pub const MAX_ATTACHMENT_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    #[serde(rename = "type")]
    pub entry_type: EntryType,
    pub title: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub favorite: bool,
    /// Original filename for jasper / file entries.
    #[serde(default)]
    pub file_name: String,
    #[serde(default)]
    pub mime_type: String,
    /// Base64-encoded file bytes (binary attachments). Text JRXML may live in `body` instead.
    #[serde(default)]
    pub file_content: String,
    #[serde(default)]
    pub byte_size: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub last_used_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSettings {
    pub auto_lock_minutes: u32,
    /// Copy the encrypted .vault into this folder after each save (Drive Desktop, iCloud, USB, …).
    #[serde(default)]
    pub auto_backup: bool,
    #[serde(default)]
    pub backup_folder: String,
    /// Google Drive folder URL or folder id for internet upload.
    #[serde(default)]
    pub drive_folder_url: String,
    /// OAuth Desktop client id from Google Cloud Console (stored in the encrypted vault).
    #[serde(default)]
    pub drive_client_id: String,
}

impl Default for VaultSettings {
    fn default() -> Self {
        Self {
            auto_lock_minutes: 10,
            auto_backup: false,
            backup_folder: String::new(),
            drive_folder_url: String::new(),
            drive_client_id: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultData {
    pub version: u32,
    pub entries: Vec<Entry>,
    pub settings: VaultSettings,
}

impl Default for VaultData {
    fn default() -> Self {
        Self {
            version: 1,
            entries: Vec::new(),
            settings: VaultSettings::default(),
        }
    }
}

#[derive(Zeroize, ZeroizeOnDrop)]
struct MasterKey([u8; KEY_LEN]);

pub struct OpenVault {
    path: PathBuf,
    key: MasterKey,
    pub data: VaultData,
}

fn argon2_params() -> argon2::Params {
    // Memory-hard but reasonable for desktop unlock (~64 MiB)
    ParamsBuilder::new()
        .m_cost(65536)
        .t_cost(3)
        .p_cost(1)
        .output_len(KEY_LEN)
        .build()
        .expect("valid argon2 params")
}

fn derive_key(password: &str, salt_bytes: &[u8]) -> Result<MasterKey, VaultError> {
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, Version::V0x13, argon2_params());
    let mut key = [0u8; KEY_LEN];
    argon2
        .hash_password_into(password.as_bytes(), salt_bytes, &mut key)
        .map_err(|e| VaultError::Crypto(e.to_string()))?;
    Ok(MasterKey(key))
}

fn encrypt(key: &MasterKey, plaintext: &[u8]) -> Result<(Vec<u8>, [u8; NONCE_LEN]), VaultError> {
    let cipher = Aes256Gcm::new_from_slice(&key.0)
        .map_err(|e| VaultError::Crypto(e.to_string()))?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| VaultError::Crypto(e.to_string()))?;
    Ok((ciphertext, nonce_bytes))
}

fn decrypt(key: &MasterKey, nonce_bytes: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, VaultError> {
    let cipher = Aes256Gcm::new_from_slice(&key.0)
        .map_err(|e| VaultError::Crypto(e.to_string()))?;
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| VaultError::WrongPassword)
}

fn pack_file(salt: &[u8], nonce: &[u8], ciphertext: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + 1 + SALT_LEN + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.push(FORMAT_VERSION);
    out.extend_from_slice(salt);
    out.extend_from_slice(nonce);
    out.extend_from_slice(ciphertext);
    out
}

fn unpack_file(bytes: &[u8]) -> Result<(&[u8], &[u8], &[u8]), VaultError> {
    let min = 8 + 1 + SALT_LEN + NONCE_LEN + 16;
    if bytes.len() < min {
        return Err(VaultError::msg("vault file too short or corrupt"));
    }
    if &bytes[0..8] != MAGIC && &bytes[0..8] != MAGIC_LEGACY {
        return Err(VaultError::msg("not a Secret Vault file"));
    }
    if bytes[8] != FORMAT_VERSION {
        return Err(VaultError::msg(format!(
            "unsupported vault version {}",
            bytes[8]
        )));
    }
    let salt = &bytes[9..9 + SALT_LEN];
    let nonce = &bytes[9 + SALT_LEN..9 + SALT_LEN + NONCE_LEN];
    let ciphertext = &bytes[9 + SALT_LEN + NONCE_LEN..];
    Ok((salt, nonce, ciphertext))
}

impl OpenVault {
    pub fn create(path: impl AsRef<Path>, password: &str) -> Result<Self, VaultError> {
        if password.len() < 8 {
            return Err(VaultError::msg(
                "master password must be at least 8 characters",
            ));
        }
        let path = path.as_ref().to_path_buf();
        if path.exists() {
            return Err(VaultError::msg("file already exists"));
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut salt = [0u8; SALT_LEN];
        OsRng.fill_bytes(&mut salt);
        let key = derive_key(password, &salt)?;
        let data = VaultData::default();
        let mut vault = OpenVault { path, key, data };
        vault.persist_with_salt(&salt)?;
        Ok(vault)
    }

    pub fn unlock(path: impl AsRef<Path>, password: &str) -> Result<Self, VaultError> {
        let path = path.as_ref().to_path_buf();
        let bytes = fs::read(&path)?;
        let (salt, nonce, ciphertext) = unpack_file(&bytes)?;
        let key = derive_key(password, salt)?;
        let plaintext = decrypt(&key, nonce, ciphertext)?;
        let data: VaultData = serde_json::from_slice(&plaintext)?;
        Ok(OpenVault { path, key, data })
    }

    fn persist_with_salt(&mut self, salt: &[u8]) -> Result<(), VaultError> {
        let plaintext = serde_json::to_vec(&self.data)?;
        let (ciphertext, nonce) = encrypt(&self.key, &plaintext)?;
        let packed = pack_file(salt, &nonce, &ciphertext);
        let tmp = self.path.with_extension("vault.tmp");
        fs::write(&tmp, &packed)?;
        fs::rename(&tmp, &self.path)?;
        Ok(())
    }

    pub fn save(&mut self) -> Result<(), VaultError> {
        // Re-read salt from existing file so key stays valid
        let bytes = fs::read(&self.path)?;
        let (salt, _, _) = unpack_file(&bytes)?;
        let salt = salt.to_vec();
        self.persist_with_salt(&salt)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn export_copy(&self, dest: impl AsRef<Path>) -> Result<(), VaultError> {
        fs::copy(&self.path, dest.as_ref())?;
        Ok(())
    }

    pub fn upsert_entry(&mut self, mut entry: Entry) -> Result<Entry, VaultError> {
        let now = Utc::now();
        if entry.id.is_empty() {
            entry.id = Uuid::new_v4().to_string();
            entry.created_at = now;
        }
        entry.updated_at = now;
        entry.tags = normalize_tags(entry.tags);
        if let Some(existing) = self.data.entries.iter_mut().find(|e| e.id == entry.id) {
            *existing = entry.clone();
        } else {
            self.data.entries.push(entry.clone());
        }
        self.save()?;
        Ok(entry)
    }

    pub fn import_entries(&mut self, mut entries: Vec<Entry>) -> Result<usize, VaultError> {
        let now = Utc::now();
        for entry in &mut entries {
            if entry.id.is_empty() {
                entry.id = Uuid::new_v4().to_string();
            }
            entry.created_at = now;
            entry.updated_at = now;
            entry.tags = normalize_tags(entry.tags.clone());
        }
        let n = entries.len();
        self.data.entries.extend(entries);
        self.save()?;
        Ok(n)
    }

    pub fn delete_entry(&mut self, id: &str) -> Result<(), VaultError> {
        let before = self.data.entries.len();
        self.data.entries.retain(|e| e.id != id);
        if self.data.entries.len() == before {
            return Err(VaultError::msg("entry not found"));
        }
        self.save()?;
        Ok(())
    }

    pub fn touch_used(&mut self, id: &str) -> Result<(), VaultError> {
        if let Some(e) = self.data.entries.iter_mut().find(|e| e.id == id) {
            e.last_used_at = Some(Utc::now());
            self.save()?;
        }
        Ok(())
    }
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = tags
        .into_iter()
        .map(|t| t.trim().to_lowercase())
        .filter(|t| !t.is_empty())
        .collect();
    out.sort();
    out.dedup();
    out
}

/// Debug helper: encode vault header info (no secrets)
/// Debug helper reserved for future CLI use
#[allow(dead_code)]
pub fn describe_file(path: &Path) -> Result<String, VaultError> {
    let bytes = fs::read(path)?;
    let _ = unpack_file(&bytes)?;
    Ok(format!(
        "Secret Vault v{} · {} bytes · {}",
        FORMAT_VERSION,
        bytes.len(),
        B64.encode(&bytes[9..9 + 4])
    ))
}
