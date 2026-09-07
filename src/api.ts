import { invoke } from "@tauri-apps/api/core";
import type {
  Entry,
  FileAttachment,
  ImportDraft,
  ImportPreview,
  ImportResult,
  SessionInfo,
  UpsertPayload,
  VaultData,
  VaultSettings,
} from "./types";

export const api = {
  createVault: (path: string, password: string) =>
    invoke<SessionInfo>("create_vault", { path, password }),
  unlockVault: (path: string, password: string) =>
    invoke<SessionInfo>("unlock_vault", { path, password }),
  unlockVaultWithKeychain: (path: string) =>
    invoke<SessionInfo>("unlock_vault_with_keychain", { path }),
  keychainHasUnlock: (path: string) => invoke<boolean>("keychain_has_unlock", { path }),
  keychainStoreUnlock: (path: string, password: string) =>
    invoke<void>("keychain_store_unlock", { path, password }),
  keychainClearUnlock: (path: string) => invoke<void>("keychain_clear_unlock", { path }),
  lockVault: () => invoke<void>("lock_vault"),
  isUnlocked: () => invoke<boolean>("is_unlocked"),
  getSession: () => invoke<SessionInfo>("get_session"),
  getVaultData: () => invoke<VaultData>("get_vault_data"),
  listEntries: () => invoke<Entry[]>("list_entries"),
  upsertEntry: (payload: UpsertPayload) => invoke<Entry>("upsert_entry", { payload }),
  deleteEntry: (id: string) => invoke<void>("delete_entry", { id }),
  touchEntry: (id: string) => invoke<void>("touch_entry", { id }),
  updateSettings: (settings: VaultSettings) =>
    invoke<VaultSettings>("update_settings", { settings }),
  exportVault: (dest: string) => invoke<void>("export_vault", { dest }),
  saveVault: () => invoke<void>("save_vault"),
  previewImport: (paths: string[]) => invoke<ImportPreview>("preview_import", { paths }),
  commitImport: (drafts: ImportDraft[]) =>
    invoke<ImportResult>("commit_import", { drafts }),
  defaultImportPaths: () => invoke<string[]>("default_import_paths"),
  readFileAttachment: (path: string) =>
    invoke<FileAttachment>("read_file_attachment", { path }),
  exportEntryFile: (id: string, dest: string) =>
    invoke<void>("export_entry_file", { id, dest }),
};
