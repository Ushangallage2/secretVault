mod about;
mod backup;
mod importer;
mod keychain;
mod vault;

use about::{AppAbout, InstallerInfo, UpdateInfo};
use backup::BackupStatus;
use importer::{drafts_to_entries, preview_paths, ImportDraft, ImportPreview};
use base64::Engine;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use vault::{
    Entry, EntryType, OpenVault, VaultData, VaultError, VaultSettings, MAX_ATTACHMENT_BYTES,
};

struct AppState {
    vault: Mutex<Option<OpenVault>>,
    backup: Mutex<BackupStatus>,
}

impl AppState {
    fn with_vault_mut<T>(
        &self,
        f: impl FnOnce(&mut OpenVault) -> Result<T, VaultError>,
    ) -> Result<T, String> {
        let mut guard = self.vault.lock();
        let v = guard.as_mut().ok_or_else(|| VaultError::Locked.to_string())?;
        f(v).map_err(|e| e.to_string())
    }

    fn with_vault<T>(&self, f: impl FnOnce(&OpenVault) -> Result<T, VaultError>) -> Result<T, String> {
        let guard = self.vault.lock();
        let v = guard.as_ref().ok_or_else(|| VaultError::Locked.to_string())?;
        f(v).map_err(|e| e.to_string())
    }
}

fn session_of(v: &OpenVault) -> SessionInfo {
    SessionInfo {
        path: v.path().display().to_string(),
        entry_count: v.active_entries().count(),
        settings: v.data.settings.clone(),
    }
}

fn after_open(state: &Arc<AppState>, mut vault: OpenVault) -> SessionInfo {
    let _ = vault.purge_expired_trash();
    let mut status = backup::load_status(vault.path());
    status.drive_wanted = !vault.data.settings.drive_folder_url.trim().is_empty();
    status.drive_connected = keychain::has_drive_refresh();
    *state.backup.lock() = status;
    let info = session_of(&vault);
    *state.vault.lock() = Some(vault);
    info
}

fn installer_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .resolve("installers", tauri::path::BaseDirectory::Resource)
        .ok()
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupEvent {
    ok: bool,
    message: String,
}

fn try_auto_backup(app: &AppHandle) {
    let state = app.state::<Arc<AppState>>();
    let (path, settings) = {
        let guard = state.vault.lock();
        let Some(v) = guard.as_ref() else { return };
        if !v.data.settings.auto_backup {
            return;
        }
        (v.path().to_path_buf(), v.data.settings.clone())
    };
    if !backup::destinations_configured(&settings) {
        return;
    }
    let state = Arc::clone(state.inner());
    let app = app.clone();
    std::thread::spawn(move || {
        let result = backup::push_vault(&path, &settings);
        let event = match &result {
            Ok(msg) => BackupEvent {
                ok: true,
                message: msg.clone(),
            },
            Err(err) => BackupEvent {
                ok: false,
                message: err.clone(),
            },
        };
        record_backup(
            &state,
            &path,
            !settings.drive_folder_url.trim().is_empty(),
            result,
        );
        let _ = app.emit("backup-result", event);
    });
}

fn record_backup(
    state: &AppState,
    vault_path: &Path,
    drive_wanted: bool,
    result: Result<String, String>,
) {
    let mut status = state.backup.lock();
    status.drive_connected = keychain::has_drive_refresh();
    status.drive_wanted = drive_wanted;
    match result {
        Ok(msg) => {
            status.last_ok = Some(chrono::Utc::now().to_rfc3339());
            status.last_detail = Some(msg);
            status.last_error = None;
        }
        Err(err) => {
            status.last_error = Some(err);
        }
    }
    backup::store_status(vault_path, &status);
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpsertPayload {
    id: Option<String>,
    #[serde(rename = "type")]
    entry_type: EntryType,
    title: String,
    #[serde(default)]
    username: String,
    #[serde(default)]
    password: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    favorite: bool,
    #[serde(default)]
    file_name: String,
    #[serde(default)]
    mime_type: String,
    #[serde(default)]
    file_content: String,
    #[serde(default)]
    byte_size: u64,
    #[serde(default)]
    due_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(default)]
    todo_done: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileAttachment {
    file_name: String,
    mime_type: String,
    file_content: String,
    body: String,
    byte_size: u64,
    suggested_title: String,
    is_text: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionInfo {
    path: String,
    entry_count: usize,
    settings: VaultSettings,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    imported: usize,
    entry_count: usize,
}

#[tauri::command]
fn create_vault(state: State<'_, Arc<AppState>>, path: String, password: String) -> Result<SessionInfo, String> {
    let vault = OpenVault::create(&path, &password).map_err(|e| e.to_string())?;
    Ok(after_open(state.inner(), vault))
}

#[tauri::command]
fn unlock_vault(state: State<'_, Arc<AppState>>, path: String, password: String) -> Result<SessionInfo, String> {
    let vault = OpenVault::unlock(&path, &password).map_err(|e| e.to_string())?;
    Ok(after_open(state.inner(), vault))
}

/// Unlock using a password previously stored in the macOS Keychain.
#[tauri::command]
fn unlock_vault_with_keychain(
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<SessionInfo, String> {
    let password = keychain::load_unlock(&path)?;
    let vault = OpenVault::unlock(&path, &password).map_err(|e| {
        // Stale / wrong saved secret — drop it so the user is not stuck.
        let _ = keychain::clear_unlock(&path);
        e.to_string()
    })?;
    Ok(after_open(state.inner(), vault))
}

#[tauri::command]
fn keychain_has_unlock(path: String) -> bool {
    !path.trim().is_empty() && keychain::has_unlock(&path)
}

#[tauri::command]
fn keychain_store_unlock(path: String, password: String) -> Result<(), String> {
    if path.trim().is_empty() || password.is_empty() {
        return Err("path and password required".into());
    }
    keychain::store_unlock(&path, &password)
}

#[tauri::command]
fn keychain_clear_unlock(path: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Ok(());
    }
    keychain::clear_unlock(&path)
}

#[tauri::command]
fn lock_vault(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    *state.vault.lock() = None;
    Ok(())
}

#[tauri::command]
fn is_unlocked(state: State<'_, Arc<AppState>>) -> bool {
    state.vault.lock().is_some()
}

#[tauri::command]
fn get_session(state: State<'_, Arc<AppState>>) -> Result<SessionInfo, String> {
    state.with_vault(|v| Ok(session_of(v)))
}

#[tauri::command]
fn get_vault_data(state: State<'_, Arc<AppState>>) -> Result<VaultData, String> {
    state.with_vault(|v| Ok(v.data.clone()))
}

#[tauri::command]
fn list_entries(state: State<'_, Arc<AppState>>) -> Result<Vec<Entry>, String> {
    state.with_vault(|v| Ok(v.active_entries().cloned().collect()))
}

#[tauri::command]
fn list_trashed(state: State<'_, Arc<AppState>>) -> Result<Vec<Entry>, String> {
    state.with_vault(|v| Ok(v.trashed_entries().cloned().collect()))
}

#[tauri::command]
fn upsert_entry(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    payload: UpsertPayload,
) -> Result<Entry, String> {
    let saved = state.with_vault_mut(|v| {
        let now = chrono::Utc::now();
        let mut entry = Entry {
            id: payload.id.unwrap_or_default(),
            entry_type: payload.entry_type.clone(),
            title: payload.title.trim().to_string(),
            username: payload.username,
            password: payload.password,
            body: payload.body,
            url: payload.url,
            tags: payload.tags,
            favorite: payload.favorite,
            file_name: payload.file_name,
            mime_type: payload.mime_type,
            file_content: payload.file_content,
            byte_size: payload.byte_size,
            created_at: now,
            updated_at: now,
            last_used_at: None,
            deleted_at: None,
            due_at: payload.due_at,
            todo_done: payload.todo_done,
        };
        if entry.title.is_empty() {
            return Err(VaultError::msg("title is required"));
        }

        // Auto-tag jasper entries so they stay easy to find.
        if entry.entry_type == EntryType::Jasper
            && !entry.tags.iter().any(|t| t.eq_ignore_ascii_case("jasper"))
        {
            entry.tags.push("jasper".into());
        }

        validate_attachment(&entry)?;

        if !entry.id.is_empty() {
            if let Some(old) = v.data.entries.iter().find(|e| e.id == entry.id) {
                // Keep existing file payload if the client omitted it (e.g. favorite toggle).
                if entry.file_content.is_empty() && !old.file_content.is_empty() {
                    entry.file_content = old.file_content.clone();
                    if entry.file_name.is_empty() {
                        entry.file_name = old.file_name.clone();
                    }
                    if entry.mime_type.is_empty() {
                        entry.mime_type = old.mime_type.clone();
                    }
                    if entry.byte_size == 0 {
                        entry.byte_size = old.byte_size;
                    }
                }
                if matches!(entry.entry_type, EntryType::Jasper | EntryType::File)
                    && entry.body.is_empty()
                    && !old.body.is_empty()
                {
                    entry.body = old.body.clone();
                }
                let mut merged = entry;
                merged.created_at = old.created_at;
                merged.last_used_at = old.last_used_at;
                merged.deleted_at = old.deleted_at;
                return v.upsert_entry(merged);
            }
        }

        if matches!(entry.entry_type, EntryType::Jasper | EntryType::File)
            && entry.file_content.is_empty()
            && entry.body.is_empty()
        {
            return Err(VaultError::msg(
                "attach a file before saving a Jasper or File entry",
            ));
        }

        v.upsert_entry(entry)
    })?;
    try_auto_backup(&app);
    Ok(saved)
}

fn validate_attachment(entry: &Entry) -> Result<(), VaultError> {
    if !matches!(entry.entry_type, EntryType::Jasper | EntryType::File) {
        return Ok(());
    }
    if entry.entry_type == EntryType::Jasper {
        let name = entry.file_name.to_lowercase();
        if !name.is_empty()
            && !(name.ends_with(".jrxml") || name.ends_with(".jasper"))
        {
            return Err(VaultError::msg(
                "Jasper entries must use a .jrxml or .jasper file",
            ));
        }
    }
    if !entry.file_content.is_empty() {
        let approx = (entry.file_content.len() * 3) / 4;
        if approx > MAX_ATTACHMENT_BYTES {
            return Err(VaultError::msg(format!(
                "file too large (max {} KB)",
                MAX_ATTACHMENT_BYTES / 1024
            )));
        }
    }
    if entry.body.len() > MAX_ATTACHMENT_BYTES {
        return Err(VaultError::msg(format!(
            "file too large (max {} KB)",
            MAX_ATTACHMENT_BYTES / 1024
        )));
    }
    Ok(())
}

#[tauri::command]
fn read_file_attachment(path: String) -> Result<FileAttachment, String> {
    let path = Path::new(&path);
    if !path.is_file() {
        return Err("file not found".into());
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_ATTACHMENT_BYTES {
        return Err(format!(
            "file too large ({} KB). Max is {} KB",
            bytes.len() / 1024,
            MAX_ATTACHMENT_BYTES / 1024
        ));
    }
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string();
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime_type = mime_for_ext(&ext);
    let is_text = matches!(
        ext.as_str(),
        "jrxml" | "xml" | "txt" | "md" | "json" | "csv" | "sql" | "yml" | "yaml" | "properties" | "html" | "css" | "js" | "ts" | "sh"
    );
    let body = if is_text {
        String::from_utf8_lossy(&bytes).to_string()
    } else {
        String::new()
    };
    // Always keep exact bytes as base64 so export is lossless.
    let file_content = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let suggested_title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&file_name)
        .to_string();

    Ok(FileAttachment {
        file_name,
        mime_type,
        file_content,
        body,
        byte_size: bytes.len() as u64,
        suggested_title,
        is_text,
    })
}

#[tauri::command]
fn export_entry_file(state: State<'_, Arc<AppState>>, id: String, dest: String) -> Result<(), String> {
    state.with_vault(|v| {
        let entry = v
            .data
            .entries
            .iter()
            .find(|e| e.id == id)
            .ok_or_else(|| VaultError::msg("entry not found"))?;
        let bytes = if !entry.file_content.is_empty() {
            base64::engine::general_purpose::STANDARD
                .decode(&entry.file_content)
                .map_err(|e| VaultError::msg(format!("corrupt file data: {e}")))?
        } else if !entry.body.is_empty() {
            entry.body.as_bytes().to_vec()
        } else {
            return Err(VaultError::msg("this entry has no file data"));
        };
        std::fs::write(&dest, bytes).map_err(VaultError::from)?;
        Ok(())
    })
}

fn mime_for_ext(ext: &str) -> String {
    match ext {
        "jrxml" | "xml" => "application/xml",
        "jasper" => "application/octet-stream",
        "json" => "application/json",
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "txt" | "md" | "csv" | "sql" | "log" => "text/plain",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
    .into()
}

#[tauri::command]
fn delete_entry(app: AppHandle, state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.with_vault_mut(|v| v.delete_entry(&id))?;
    try_auto_backup(&app);
    Ok(())
}

#[tauri::command]
fn restore_entry(app: AppHandle, state: State<'_, Arc<AppState>>, id: String) -> Result<Entry, String> {
    let entry = state.with_vault_mut(|v| v.restore_entry(&id))?;
    try_auto_backup(&app);
    Ok(entry)
}

#[tauri::command]
fn purge_entry(app: AppHandle, state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.with_vault_mut(|v| v.purge_entry(&id))?;
    try_auto_backup(&app);
    Ok(())
}

#[tauri::command]
fn empty_trash(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<usize, String> {
    let n = state.with_vault_mut(|v| v.empty_trash())?;
    if n > 0 {
        try_auto_backup(&app);
    }
    Ok(n)
}

#[tauri::command]
fn change_master_password(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    current: String,
    new_password: String,
) -> Result<(), String> {
    let path = state.with_vault_mut(|v| {
        v.change_password(&current, &new_password)?;
        Ok(v.path().display().to_string())
    })?;
    if keychain::has_unlock(&path) {
        keychain::store_unlock(&path, &new_password)?;
    }
    try_auto_backup(&app);
    Ok(())
}

#[tauri::command]
fn touch_entry(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.with_vault_mut(|v| v.touch_used(&id))
}

#[tauri::command]
fn update_settings(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    settings: VaultSettings,
) -> Result<VaultSettings, String> {
    state.with_vault_mut(|v| {
        v.data.settings = settings.clone();
        v.save()?;
        Ok(settings)
    })?;
    try_auto_backup(&app);
    state.with_vault(|v| Ok(v.data.settings.clone()))
}

#[tauri::command]
fn export_vault(state: State<'_, Arc<AppState>>, dest: String) -> Result<(), String> {
    state.with_vault(|v| v.export_copy(&dest))
}

#[tauri::command]
fn save_vault(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.with_vault_mut(|v| v.save())?;
    try_auto_backup(&app);
    Ok(())
}

#[tauri::command]
fn preview_import(paths: Vec<String>) -> Result<ImportPreview, String> {
    if paths.is_empty() {
        return Err("No files selected".into());
    }
    preview_paths(&paths)
}

#[tauri::command]
fn commit_import(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    drafts: Vec<ImportDraft>,
) -> Result<ImportResult, String> {
    if drafts.is_empty() {
        return Err("Nothing to import".into());
    }
    let entries = drafts_to_entries(drafts);
    let result = state.with_vault_mut(|v| {
        let imported = v.import_entries(entries)?;
        Ok(ImportResult {
            imported,
            entry_count: v.active_entries().count(),
        })
    })?;
    try_auto_backup(&app);
    Ok(result)
}

#[tauri::command]
fn default_import_paths() -> Vec<String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    vec![
        format!("{home}/Downloads/message.txt"),
        format!("{home}/Documents/important commands/cmds"),
    ]
}

#[tauri::command]
fn get_app_about() -> AppAbout {
    about::about()
}

#[tauri::command]
fn get_backup_status(state: State<'_, Arc<AppState>>) -> BackupStatus {
    let mut status = state.backup.lock().clone();
    status.drive_connected = keychain::has_drive_refresh();
    if let Ok(wanted) = state.with_vault(|v| Ok(!v.data.settings.drive_folder_url.trim().is_empty())) {
        status.drive_wanted = wanted;
    }
    status
}

#[tauri::command]
async fn push_vault_backup(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let (path, settings) =
        state.with_vault(|v| Ok((v.path().to_path_buf(), v.data.settings.clone())))?;
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let result = backup::push_vault(&path, &settings);
        let wanted = !settings.drive_folder_url.trim().is_empty();
        record_backup(&state, &path, wanted, result.clone());
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn connect_google_drive(
    state: State<'_, Arc<AppState>>,
    client_id: String,
    client_secret: String,
) -> Result<String, String> {
    let persist_id = client_id.trim().to_string();
    let msg = tauri::async_runtime::spawn_blocking(move || {
        backup::connect_drive(&client_id, &client_secret)
    })
    .await
    .map_err(|e| e.to_string())??;
    {
        let mut status = state.backup.lock();
        status.drive_connected = keychain::has_drive_refresh();
        status.last_error = None;
    }
    if !persist_id.is_empty() {
        let _ = state.with_vault_mut(|v| {
            v.data.settings.drive_client_id = persist_id;
            v.save()?;
            Ok(())
        });
    }
    Ok(msg)
}

#[tauri::command]
fn disconnect_google_drive(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    backup::disconnect_drive()?;
    let path = state.with_vault(|v| Ok(v.path().to_path_buf())).ok();
    let mut status = state.backup.lock();
    status.drive_connected = false;
    if let Some(p) = path {
        backup::store_status(&p, &status);
    }
    Ok(())
}

#[tauri::command]
fn store_drive_client_secret(secret: String) -> Result<(), String> {
    keychain::store_drive_client_secret(&secret)
}

#[tauri::command]
async fn list_installers(app: AppHandle) -> Vec<InstallerInfo> {
    let dir = installer_dir(&app);
    tauri::async_runtime::spawn_blocking(move || about::list_installers(dir))
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn save_installer(app: AppHandle, kind: String, dest: String) -> Result<String, String> {
    let dir = installer_dir(&app);
    tauri::async_runtime::spawn_blocking(move || {
        about::save_installer(dir, &kind, Path::new(&dest))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn check_for_update() -> UpdateInfo {
    tauri::async_runtime::spawn_blocking(about::check_for_update)
        .await
        .unwrap_or_else(|e| UpdateInfo {
            current: env!("CARGO_PKG_VERSION").into(),
            latest: None,
            pending: false,
            download_url: None,
            filename: None,
            notes: None,
            html_url: None,
            status: "error".into(),
            error: Some(e.to_string()),
        })
}

#[tauri::command]
async fn download_update(dest: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        about::download_pending_update(Path::new(&dest))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(AppState {
        vault: Mutex::new(None),
        backup: Mutex::new(BackupStatus::default()),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_title(&about::window_title());
            }
            Ok(())
        })
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            create_vault,
            unlock_vault,
            unlock_vault_with_keychain,
            keychain_has_unlock,
            keychain_store_unlock,
            keychain_clear_unlock,
            lock_vault,
            is_unlocked,
            get_session,
            get_vault_data,
            list_entries,
            list_trashed,
            upsert_entry,
            delete_entry,
            restore_entry,
            purge_entry,
            empty_trash,
            change_master_password,
            touch_entry,
            update_settings,
            export_vault,
            save_vault,
            preview_import,
            commit_import,
            default_import_paths,
            read_file_attachment,
            export_entry_file,
            get_app_about,
            get_backup_status,
            push_vault_backup,
            connect_google_drive,
            disconnect_google_drive,
            store_drive_client_secret,
            list_installers,
            save_installer,
            check_for_update,
            download_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Secret Vault");
}
