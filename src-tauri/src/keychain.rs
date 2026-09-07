//! macOS Keychain (via `keyring`) helpers for optional "remember unlock".
//! Stores the master password as an OS-protected secret — never on disk in plaintext.
//! Anyone with access to this Mac login can unlock remembered vaults.

use keyring::Entry;
use std::path::{Path, PathBuf};

const SERVICE: &str = "com.secretvault.desktop";

/// Normalize vault path so store / has / load / clear all use the same Keychain account.
fn account_for(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let p = Path::new(trimmed);
    if let Ok(canon) = p.canonicalize() {
        return canon.to_string_lossy().into_owned();
    }
    // File may not exist yet (create flow) — still absolute-normalize when possible.
    if p.is_absolute() {
        return PathBuf::from(trimmed).to_string_lossy().into_owned();
    }
    trimmed.to_string()
}

fn entry_for(path: &str) -> Result<Entry, String> {
    let account = account_for(path);
    if account.is_empty() {
        return Err("vault path required".into());
    }
    Entry::new(SERVICE, &account).map_err(|e| format!("Keychain entry: {e}"))
}

pub fn has_unlock(path: &str) -> bool {
    match entry_for(path) {
        Ok(entry) => entry.get_password().is_ok(),
        Err(_) => false,
    }
}

pub fn store_unlock(path: &str, password: &str) -> Result<(), String> {
    let entry = entry_for(path)?;
    entry
        .set_password(password)
        .map_err(|e| format!("Could not save unlock to macOS Keychain: {e}"))
}

pub fn load_unlock(path: &str) -> Result<String, String> {
    let entry = entry_for(path)?;
    entry
        .get_password()
        .map_err(|e| format!("Could not read unlock from macOS Keychain: {e}"))
}

pub fn clear_unlock(path: &str) -> Result<(), String> {
    let entry = entry_for(path)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        // Already gone is fine — treat as success.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not clear Keychain unlock: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::account_for;

    #[test]
    fn account_trims() {
        assert_eq!(account_for("  /tmp/x.vault  "), "/tmp/x.vault");
    }
}

