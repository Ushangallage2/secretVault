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

export interface AppAbout {
  name: string;
  version: string;
  developer: string;
  repoUrl: string;
  releasesUrl: string;
}

export interface BackupStatus {
  driveConnected: boolean;
  driveWanted: boolean;
  lastOk: string | null;
  lastDetail: string | null;
  lastError: string | null;
}

export interface InstallerInfo {
  id: string;
  label: string;
  filename: string;
  available: boolean;
  source: string;
}

export interface UpdateInfo {
  current: string;
  latest: string | null;
  pending: boolean;
  downloadUrl: string | null;
  filename: string | null;
  notes: string | null;
  htmlUrl: string | null;
  status: string;
  error: string | null;
}

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
  listTrashed: () => invoke<Entry[]>("list_trashed"),
  upsertEntry: (payload: UpsertPayload) => invoke<Entry>("upsert_entry", { payload }),
  deleteEntry: (id: string) => invoke<void>("delete_entry", { id }),
  restoreEntry: (id: string) => invoke<Entry>("restore_entry", { id }),
  purgeEntry: (id: string) => invoke<void>("purge_entry", { id }),
  emptyTrash: () => invoke<number>("empty_trash"),
  changeMasterPassword: (current: string, newPassword: string) =>
    invoke<void>("change_master_password", { current, newPassword }),
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
  getAppAbout: () => invoke<AppAbout>("get_app_about"),
  getBackupStatus: () => invoke<BackupStatus>("get_backup_status"),
  pushVaultBackup: () => invoke<string>("push_vault_backup"),
  connectGoogleDrive: (clientId: string, clientSecret: string) =>
    invoke<string>("connect_google_drive", { clientId, clientSecret }),
  disconnectGoogleDrive: () => invoke<void>("disconnect_google_drive"),
  storeDriveClientSecret: (secret: string) =>
    invoke<void>("store_drive_client_secret", { secret }),
  listInstallers: () => invoke<InstallerInfo[]>("list_installers"),
  saveInstaller: (kind: string, dest: string) =>
    invoke<string>("save_installer", { kind, dest }),
  checkForUpdate: () => invoke<UpdateInfo>("check_for_update"),
  downloadUpdate: (dest: string) => invoke<string>("download_update", { dest }),
};
