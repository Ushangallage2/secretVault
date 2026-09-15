export type EntryType = "secret" | "command" | "note" | "jasper" | "file";

export interface Entry {
  id: string;
  type: EntryType;
  title: string;
  username: string;
  password: string;
  body: string;
  url: string;
  tags: string[];
  favorite: boolean;
  fileName: string;
  mimeType: string;
  /** Base64 file bytes (binary). JRXML text may be in `body` instead. */
  fileContent: string;
  byteSize: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  deletedAt?: string | null;
}

export interface VaultSettings {
  autoLockMinutes: number;
  autoBackup: boolean;
  backupFolder: string;
  driveFolderUrl: string;
  driveClientId: string;
}

export interface VaultData {
  version: number;
  entries: Entry[];
  settings: VaultSettings;
}

export interface SessionInfo {
  path: string;
  entryCount: number;
  settings: VaultSettings;
}

export interface UpsertPayload {
  id?: string;
  type: EntryType;
  title: string;
  username?: string;
  password?: string;
  body?: string;
  url?: string;
  tags?: string[];
  favorite?: boolean;
  fileName?: string;
  mimeType?: string;
  fileContent?: string;
  byteSize?: number;
}

export type FilterKind =
  | "all"
  | "secret"
  | "command"
  | "note"
  | "jasper"
  | "file"
  | "favorite"
  | "trash";

export interface ImportDraft {
  type: EntryType;
  title: string;
  username: string;
  password: string;
  body: string;
  url: string;
  tags: string[];
  favorite: boolean;
  source: string;
}

export interface ImportPreview {
  drafts: ImportDraft[];
  secrets: number;
  commands: number;
  notes: number;
  skipped: number;
}

export interface ImportResult {
  imported: number;
  entryCount: number;
}

export interface FileAttachment {
  fileName: string;
  mimeType: string;
  fileContent: string;
  body: string;
  byteSize: number;
  suggestedTitle: string;
  isText: boolean;
}
