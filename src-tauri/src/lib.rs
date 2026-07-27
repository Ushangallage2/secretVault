mod importer;
mod keychain;
mod vault;

use importer::{drafts_to_entries, preview_paths, ImportDraft, ImportPreview};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use vault::{Entry, EntryType, OpenVault, VaultData, VaultError, VaultSettings};

struct AppState {
    vault: Mutex<Option<OpenVault>>,
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
    let info = SessionInfo {
        path: vault.path().display().to_string(),
        entry_count: vault.data.entries.len(),
        settings: vault.data.settings.clone(),
    };
    *state.vault.lock() = Some(vault);
    Ok(info)
}

#[tauri::command]
fn unlock_vault(state: State<'_, Arc<AppState>>, path: String, password: String) -> Result<SessionInfo, String> {
    let vault = OpenVault::unlock(&path, &password).map_err(|e| e.to_string())?;
    let info = SessionInfo {
        path: vault.path().display().to_string(),
        entry_count: vault.data.entries.len(),
        settings: vault.data.settings.clone(),
    };
    *state.vault.lock() = Some(vault);
    Ok(info)
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
    let info = SessionInfo {
        path: vault.path().display().to_string(),
        entry_count: vault.data.entries.len(),
        settings: vault.data.settings.clone(),
    };
    *state.vault.lock() = Some(vault);
    Ok(info)
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
    state.with_vault(|v| {
        Ok(SessionInfo {
            path: v.path().display().to_string(),
            entry_count: v.data.entries.len(),
            settings: v.data.settings.clone(),
        })
    })
}

#[tauri::command]
fn get_vault_data(state: State<'_, Arc<AppState>>) -> Result<VaultData, String> {
    state.with_vault(|v| Ok(v.data.clone()))
}

#[tauri::command]
fn list_entries(state: State<'_, Arc<AppState>>) -> Result<Vec<Entry>, String> {
    state.with_vault(|v| Ok(v.data.entries.clone()))
}

#[tauri::command]
fn upsert_entry(state: State<'_, Arc<AppState>>, payload: UpsertPayload) -> Result<Entry, String> {
    state.with_vault_mut(|v| {
        let now = chrono::Utc::now();
        let entry = Entry {
            id: payload.id.unwrap_or_default(),
            entry_type: payload.entry_type,
            title: payload.title.trim().to_string(),
            username: payload.username,
            password: payload.password,
            body: payload.body,
            url: payload.url,
            tags: payload.tags,
            favorite: payload.favorite,
            created_at: now,
            updated_at: now,
            last_used_at: None,
        };
        if entry.title.is_empty() {
            return Err(VaultError::msg("title is required"));
        }
        if !entry.id.is_empty() {
            if let Some(old) = v.data.entries.iter().find(|e| e.id == entry.id) {
                let mut merged = entry;
                merged.created_at = old.created_at;
                merged.last_used_at = old.last_used_at;
                return v.upsert_entry(merged);
            }
        }
        v.upsert_entry(entry)
    })
}

#[tauri::command]
fn delete_entry(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.with_vault_mut(|v| v.delete_entry(&id))
}

#[tauri::command]
fn touch_entry(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.with_vault_mut(|v| v.touch_used(&id))
}

#[tauri::command]
fn update_settings(
    state: State<'_, Arc<AppState>>,
    settings: VaultSettings,
) -> Result<VaultSettings, String> {
    state.with_vault_mut(|v| {
        v.data.settings = settings.clone();
        v.save()?;
        Ok(settings)
    })
}

#[tauri::command]
fn export_vault(state: State<'_, Arc<AppState>>, dest: String) -> Result<(), String> {
    state.with_vault(|v| v.export_copy(&dest))
}

#[tauri::command]
fn save_vault(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.with_vault_mut(|v| v.save())
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
    state: State<'_, Arc<AppState>>,
    drafts: Vec<ImportDraft>,
) -> Result<ImportResult, String> {
    if drafts.is_empty() {
        return Err("Nothing to import".into());
    }
    let entries = drafts_to_entries(drafts);
    state.with_vault_mut(|v| {
        let imported = v.import_entries(entries)?;
        Ok(ImportResult {
            imported,
            entry_count: v.data.entries.len(),
        })
    })
}

#[tauri::command]
fn default_import_paths() -> Vec<String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    vec![
        format!("{home}/Downloads/message.txt"),
        format!("{home}/Documents/important commands/cmds"),
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(AppState {
        vault: Mutex::new(None),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
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
            upsert_entry,
            delete_entry,
            touch_entry,
            update_settings,
            export_vault,
            save_vault,
            preview_import,
            commit_import,
            default_import_paths,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Secret Vault");
}
