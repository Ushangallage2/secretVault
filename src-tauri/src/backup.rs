//! Copy the encrypted `.vault` to a local/cloud-sync folder and/or Google Drive.
//! Tokens stay in the OS keychain — never inside the uploaded vault file.

use crate::keychain;
use crate::vault::VaultSettings;
use base64::Engine;
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::time::Duration;

const DRIVE_SCOPE: &str = "https://www.googleapis.com/auth/drive.file";
const REDIRECT_PORT: u16 = 17843;
const REDIRECT_URI: &str = "http://127.0.0.1:17843";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupStatus {
    pub drive_connected: bool,
    /// True when a Drive folder URL is set (even if OAuth is not connected).
    #[serde(default)]
    pub drive_wanted: bool,
    /// ISO-8601 time of last successful push.
    pub last_ok: Option<String>,
    /// Human summary of the last successful destinations.
    #[serde(default)]
    pub last_detail: Option<String>,
    pub last_error: Option<String>,
}

impl Default for BackupStatus {
    fn default() -> Self {
        Self {
            drive_connected: keychain::has_drive_refresh(),
            drive_wanted: false,
            last_ok: None,
            last_detail: None,
            last_error: None,
        }
    }
}

fn meta_path(vault_path: &Path) -> PathBuf {
    let stem = vault_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("vault");
    match vault_path.parent() {
        Some(dir) => dir.join(format!("{stem}.backup-status.json")),
        None => PathBuf::from(format!("{stem}.backup-status.json")),
    }
}

pub fn load_status(vault_path: &Path) -> BackupStatus {
    let mut status = BackupStatus::default();
    if let Ok(bytes) = fs::read(meta_path(vault_path)) {
        if let Ok(saved) = serde_json::from_slice::<BackupStatus>(&bytes) {
            status.last_ok = saved.last_ok;
            status.last_detail = saved.last_detail;
            status.last_error = saved.last_error;
        }
    }
    status.drive_connected = keychain::has_drive_refresh();
    status
}

pub fn store_status(vault_path: &Path, status: &BackupStatus) {
    let _ = fs::write(
        meta_path(vault_path),
        serde_json::to_vec_pretty(status).unwrap_or_default(),
    );
}

pub fn destinations_configured(settings: &VaultSettings) -> bool {
    !settings.backup_folder.trim().is_empty()
        || (keychain::has_drive_refresh() && !settings.drive_folder_url.trim().is_empty())
}

pub fn push_vault(vault_path: &Path, settings: &VaultSettings) -> Result<String, String> {
    if !vault_path.is_file() {
        return Err("vault file not found on disk".into());
    }
    let mut parts = Vec::new();
    let mut errors = Vec::new();

    let folder = settings.backup_folder.trim();
    if !folder.is_empty() {
        match copy_to_folder(vault_path, folder) {
            Ok(msg) => parts.push(msg),
            Err(e) => errors.push(e),
        }
    }

    let drive_url = settings.drive_folder_url.trim();
    if keychain::has_drive_refresh() {
        if drive_url.is_empty() {
            if folder.is_empty() {
                errors.push("Google Drive is connected but no folder URL is set".into());
            }
        } else {
            match push_drive(vault_path, settings, drive_url) {
                Ok(()) => parts.push("Google Drive".into()),
                Err(e) => errors.push(e),
            }
        }
    } else if !drive_url.is_empty() && folder.is_empty() {
        errors.push("Drive folder URL is set but Google Drive is not connected".into());
    }

    if parts.is_empty() {
        if errors.is_empty() {
            return Err("set a backup folder and/or connect Google Drive first".into());
        }
        return Err(errors.join("; "));
    }
    let mut msg = format!("Pushed encrypted vault ({})", parts.join(" + "));
    if !errors.is_empty() {
        msg.push_str(&format!(" · warnings: {}", errors.join("; ")));
    }
    Ok(msg)
}

fn copy_to_folder(vault_path: &Path, folder: &str) -> Result<String, String> {
    let dest_dir = Path::new(folder);
    if !dest_dir.is_dir() {
        return Err(format!("backup folder does not exist: {}", dest_dir.display()));
    }
    let name = vault_path
        .file_name()
        .ok_or_else(|| "vault has no file name".to_string())?;
    let dest = dest_dir.join(name);
    fs::copy(vault_path, &dest).map_err(|e| format!("folder backup failed: {e}"))?;
    Ok(format!("folder: {}", dest.display()))
}

fn push_drive(vault_path: &Path, settings: &VaultSettings, drive_url: &str) -> Result<(), String> {
    let folder_id = parse_folder_id(drive_url)
        .ok_or_else(|| "invalid Google Drive folder URL or id".to_string())?;
    let client_id = settings.drive_client_id.trim();
    if client_id.is_empty() {
        return Err("Google Drive client id is missing".into());
    }
    upload_to_drive(vault_path, client_id, &folder_id)
}

pub fn connect_drive(client_id: &str, client_secret: &str) -> Result<String, String> {
    let client_id = client_id.trim();
    if client_id.is_empty() {
        return Err("paste your Google OAuth Desktop client id first".into());
    }
    if !client_secret.trim().is_empty() {
        keychain::store_drive_client_secret(client_secret)?;
    }

    let verifier = pkce_verifier();
    let challenge = pkce_challenge(&verifier);
    let auth = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
        urlencoding::encode(client_id),
        urlencoding::encode(REDIRECT_URI),
        urlencoding::encode(DRIVE_SCOPE),
        urlencoding::encode(&challenge),
    );

    open_browser(&auth)?;
    let code = wait_for_oauth_code()?;
    let refresh = exchange_code(client_id, &code, &verifier)?;
    keychain::store_drive_refresh(&refresh)?;
    Ok("Google Drive connected. Choose a Drive folder, then Push or enable auto-backup.".into())
}

pub fn disconnect_drive() -> Result<(), String> {
    keychain::clear_drive_refresh()?;
    Ok(())
}

fn parse_folder_id(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    if let Some(rest) = s.split("/folders/").nth(1) {
        let id = rest.split(['?', '&', '/']).next().unwrap_or("").trim();
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }
    if let Some(idx) = s.find("id=") {
        let rest = &s[idx + 3..];
        let id = rest.split(['&', '#']).next().unwrap_or("").trim();
        if looks_like_id(id) {
            return Some(id.to_string());
        }
    }
    if looks_like_id(s) {
        return Some(s.to_string());
    }
    None
}

fn looks_like_id(s: &str) -> bool {
    s.len() >= 10 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn wait_for_oauth_code() -> Result<String, String> {
    let listener = TcpListener::bind(("127.0.0.1", REDIRECT_PORT)).map_err(|e| {
        format!("could not listen on {REDIRECT_URI}: {e}. Add this redirect URI to your Google OAuth client.")
    })?;
    let (mut stream, _) = listener
        .accept()
        .map_err(|e| format!("oauth callback: {e}"))?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(180)));
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).unwrap_or(0);
    let req = String::from_utf8_lossy(&buf[..n]);
    let first = req.lines().next().unwrap_or("");
    let html = "<html><body style='font-family:sans-serif;background:#102a2e;color:#e8f7f4;padding:2rem'><p>Secret Vault is connected. You can close this tab.</p></body></html>";
    let _ = write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
    let path = first.split_whitespace().nth(1).unwrap_or("");
    let query = path.split('?').nth(1).unwrap_or("");
    for pair in query.split('&') {
        let mut it = pair.splitn(2, '=');
        let key = it.next();
        let val = it.next().unwrap_or("");
        if key == Some("code") && !val.is_empty() {
            return urlencoding::decode(val)
                .map(|s| s.into_owned())
                .map_err(|e| e.to_string());
        }
        if key == Some("error") {
            return Err(format!("Google denied access: {val}"));
        }
    }
    Err("no authorization code in Google callback".into())
}

fn open_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("could not open browser: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("could not open browser: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| format!("could not open browser: {e}"))?;
        return Ok(());
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = url;
        Err("cannot open a browser on this OS".into())
    }
}

fn exchange_code(client_id: &str, code: &str, verifier: &str) -> Result<String, String> {
    let mut form = vec![
        ("code", code.to_string()),
        ("client_id", client_id.to_string()),
        ("redirect_uri", REDIRECT_URI.to_string()),
        ("grant_type", "authorization_code".into()),
        ("code_verifier", verifier.to_string()),
    ];
    if let Some(secret) = keychain::load_drive_client_secret() {
        form.push(("client_secret", secret));
    }
    let resp: TokenResponse = http_client()?
        .post("https://oauth2.googleapis.com/token")
        .form(&form)
        .send()
        .map_err(|e| format!("token request: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Google token error: {e}"))?
        .json()
        .map_err(|e| format!("token json: {e}"))?;
    resp.refresh_token
        .filter(|t| !t.is_empty())
        .ok_or_else(|| "Google did not return a refresh token. Reconnect and grant offline access.".into())
}

fn access_token(client_id: &str) -> Result<String, String> {
    let refresh = keychain::load_drive_refresh()?;
    let mut form = vec![
        ("client_id", client_id.to_string()),
        ("refresh_token", refresh),
        ("grant_type", "refresh_token".into()),
    ];
    if let Some(secret) = keychain::load_drive_client_secret() {
        form.push(("client_secret", secret));
    }
    let resp: TokenResponse = http_client()?
        .post("https://oauth2.googleapis.com/token")
        .form(&form)
        .send()
        .map_err(|e| format!("refresh token: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Google refresh error: {e}"))?
        .json()
        .map_err(|e| format!("refresh json: {e}"))?;
    resp.access_token
        .ok_or_else(|| "Google did not return an access token".into())
}

fn upload_to_drive(vault_path: &Path, client_id: &str, folder_id: &str) -> Result<(), String> {
    let token = access_token(client_id)?;
    let name = vault_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("secret-vault.vault");
    let bytes = fs::read(vault_path).map_err(|e| e.to_string())?;
    let client = http_client()?;

    let q = format!(
        "name = '{}' and '{}' in parents and trashed = false",
        name.replace('\'', r"\'"),
        folder_id
    );
    let listed: FileList = client
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(&token)
        .query(&[("q", q.as_str()), ("fields", "files(id,name)"), ("pageSize", "5")])
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| format!("Drive list: {e}"))?
        .json()
        .map_err(|e| e.to_string())?;

    if let Some(existing) = listed.files.into_iter().next() {
        client
            .patch(format!(
                "https://www.googleapis.com/upload/drive/v3/files/{}?uploadType=media",
                existing.id
            ))
            .bearer_auth(&token)
            .header("Content-Type", "application/octet-stream")
            .body(bytes)
            .send()
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| format!("Drive update: {e}"))?;
        return Ok(());
    }

    let metadata = serde_json::json!({
        "name": name,
        "parents": [folder_id],
        "mimeType": "application/octet-stream",
    });
    let meta = serde_json::to_vec(&metadata).map_err(|e| e.to_string())?;
    let mut form = reqwest::blocking::multipart::Form::new();
    form = form.part(
        "metadata",
        reqwest::blocking::multipart::Part::bytes(meta).mime_str("application/json; charset=UTF-8").map_err(|e| e.to_string())?,
    );
    form = form.part(
        "file",
        reqwest::blocking::multipart::Part::bytes(bytes)
            .file_name(name.to_string())
            .mime_str("application/octet-stream")
            .map_err(|e| e.to_string())?,
    );
    client
        .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
        .bearer_auth(&token)
        .multipart(form)
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| format!("Drive create: {e}"))?;
    Ok(())
}

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .user_agent("SecretVault/0.2")
        .build()
        .map_err(|e| e.to_string())
}

fn pkce_verifier() -> String {
    let mut raw = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut raw);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(raw)
}

fn pkce_challenge(verifier: &str) -> String {
    let hash = Sha256::digest(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash)
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
}

#[derive(Deserialize)]
struct FileList {
    #[serde(default)]
    files: Vec<DriveFile>,
}

#[derive(Deserialize)]
struct DriveFile {
    id: String,
}

#[cfg(test)]
mod tests {
    use super::parse_folder_id;

    #[test]
    fn folder_id_from_share_url() {
        assert_eq!(
            parse_folder_id("https://drive.google.com/drive/folders/abcDEF123_-xyz?usp=sharing"),
            Some("abcDEF123_-xyz".into())
        );
    }

    #[test]
    fn folder_id_from_open_url() {
        assert_eq!(
            parse_folder_id("https://drive.google.com/open?id=abcDEF123_-xyz"),
            Some("abcDEF123_-xyz".into())
        );
    }

    #[test]
    fn folder_id_raw() {
        assert_eq!(parse_folder_id("abcDEF123_-xyz"), Some("abcDEF123_-xyz".into()));
    }
}
