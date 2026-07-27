export type EntryType = "secret" | "command" | "note";

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
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface VaultSettings {
  autoLockMinutes: number;
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
}

export type FilterKind = "all" | "secret" | "command" | "note" | "favorite";

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
