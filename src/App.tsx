import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open, save, ask } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { listen } from "@tauri-apps/api/event";
import { api, type UpdateInfo } from "./api";
import type {
  Entry,
  EntryType,
  FilterKind,
  ImportDraft,
  ImportPreview,
  SessionInfo,
  UpsertPayload,
} from "./types";
import { UnlockScreen } from "./components/UnlockScreen";
import { Sidebar } from "./components/Sidebar";
import { EntryList } from "./components/EntryList";
import { EntryDetail } from "./components/EntryDetail";
import { EntryEditor } from "./components/EntryEditor";
import { ImportReview } from "./components/ImportReview";
import { AboutBackup } from "./components/AboutBackup";
import { UpdateOffer } from "./components/UpdateOffer";
import { CommandPalette } from "./components/CommandPalette";
import { GoldOutline } from "./components/GoldOutline";

const LAST_PATH_KEY = "secret-vault-last-path";
const REMEMBER_KEY = "secret-vault-remember-unlock";
const SKIP_AUTO_KEY = "secret-vault-skip-auto-unlock";

export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [trashed, setTrashed] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Entry | null | "new">(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rememberUnlock, setRememberUnlock] = useState(
    () => localStorage.getItem(REMEMBER_KEY) === "1",
  );
  const idleTimer = useRef<number | null>(null);

  const showToast = (msg: string, ms = 2200) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), ms);
  };

  const refresh = useCallback(async () => {
    const [list, bin] = await Promise.all([api.listEntries(), api.listTrashed()]);
    setEntries(list);
    setTrashed(bin);
    const s = await api.getSession();
    setSession(s);
  }, []);

  const lock = useCallback(async () => {
    await api.lockVault();
    // Prevent immediate auto-unlock in this app session; next cold launch still auto-opens.
    sessionStorage.setItem(SKIP_AUTO_KEY, "1");
    setSession(null);
    setEntries([]);
    setTrashed([]);
    setSelectedId(null);
    setEditing(null);
    if (localStorage.getItem(REMEMBER_KEY) === "1") {
      showToast("Locked — you’ll stay signed in next launch");
    } else {
      showToast("Vault locked");
    }
  }, []);

  const forgetUnlock = useCallback(async () => {
    const path = session?.path ?? localStorage.getItem(LAST_PATH_KEY);
    if (path) await api.keychainClearUnlock(path);
    localStorage.removeItem(REMEMBER_KEY);
    sessionStorage.removeItem(SKIP_AUTO_KEY);
    setRememberUnlock(false);
    showToast("Saved unlock forgotten");
  }, [session?.path]);

  const lockRequirePassword = useCallback(async () => {
    const path = session?.path ?? localStorage.getItem(LAST_PATH_KEY);
    if (path) await api.keychainClearUnlock(path);
    localStorage.removeItem(REMEMBER_KEY);
    sessionStorage.setItem(SKIP_AUTO_KEY, "1");
    setRememberUnlock(false);
    await api.lockVault();
    setSession(null);
    setEntries([]);
    setTrashed([]);
    setSelectedId(null);
    setEditing(null);
    showToast("Locked — password required next time");
  }, [session?.path]);

  const resetIdle = useCallback(() => {
    if (!session) return;
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    const mins = session.settings.autoLockMinutes || 10;
    idleTimer.current = window.setTimeout(() => {
      void lock();
      showToast("Vault locked after idle");
    }, mins * 60 * 1000);
  }, [session, lock]);

  useEffect(() => {
    if (!session) return;
    const onActivity = () => resetIdle();
    window.addEventListener("keydown", onActivity);
    window.addEventListener("mousemove", onActivity);
    window.addEventListener("click", onActivity);
    resetIdle();
    return () => {
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("click", onActivity);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [session, resetIdle]);

  useEffect(() => {
    if (!session) return;
    void api
      .checkForUpdate()
      .then(setUpdate)
      .catch(() => setUpdate(null));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let gone = false;
    let unlisten: (() => void) | undefined;
    void listen<{ ok: boolean; message: string }>("backup-result", (event) => {
      if (gone) return;
      if (!event.payload.ok) {
        showToast(`Backup failed: ${event.payload.message}`, 6000);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      gone = true;
      unlisten?.();
    };
  }, [session]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onUnlocked = useCallback(
    async (info: SessionInfo, path: string, remember: boolean) => {
      localStorage.setItem(LAST_PATH_KEY, path);
      setRememberUnlock(remember);
      setSession(info);
      setError(null);
      await refresh();
    },
    [refresh],
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) for (const t of e.tags) set.add(t);
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const source = filter === "trash" ? trashed : entries;
    const q = query.trim().toLowerCase();
    return source
      .filter((e) => {
        if (filter === "trash") {
          /* already trashed */
        } else {
          if (filter === "favorite" && !e.favorite) return false;
          if (filter === "secret" && e.type !== "secret") return false;
          if (filter === "command" && e.type !== "command") return false;
          if (filter === "note" && e.type !== "note") return false;
          if (filter === "jasper" && e.type !== "jasper") return false;
          if (filter === "file" && e.type !== "file") return false;
        }
        if (tagFilter && !e.tags.includes(tagFilter)) return false;
        if (!q) return true;
        const hay = [
          e.title,
          e.username,
          e.body,
          e.url,
          e.fileName,
          e.mimeType,
          e.tags.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        if (filter !== "trash" && a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [entries, trashed, query, filter, tagFilter]);

  const selected =
    (filter === "trash" ? trashed : entries).find((e) => e.id === selectedId) ?? null;

  const copy = async (text: string, label: string, entryId?: string) => {
    if (!text) return;
    await writeText(text);
    showToast(`Copied ${label}`);
    if (entryId) {
      await api.touchEntry(entryId);
      await refresh();
    }
    window.setTimeout(async () => {
      try {
        await writeText("");
      } catch {
        /* ignore */
      }
    }, 30000);
  };

  const handleSave = async (payload: UpsertPayload) => {
    await api.upsertEntry(payload);
    setEditing(null);
    await refresh();
    showToast("Saved");
  };

  const handleDelete = async (id: string) => {
    await api.deleteEntry(id);
    if (selectedId === id) setSelectedId(null);
    setUndoId(id);
    await refresh();
    showToast("Moved to trash", 7000);
  };

  const handleUndo = async () => {
    if (!undoId) return;
    await api.restoreEntry(undoId);
    setUndoId(null);
    await refresh();
    showToast("Restored");
  };

  const handleRestore = async (id: string) => {
    await api.restoreEntry(id);
    await refresh();
    showToast("Restored");
  };

  const handlePurge = async (id: string) => {
    if (!window.confirm("Permanently delete this entry? This cannot be undone.")) return;
    await api.purgeEntry(id);
    if (selectedId === id) setSelectedId(null);
    await refresh();
    showToast("Deleted forever");
  };

  const handleExport = async () => {
    const dest = await save({
      title: "Export vault file",
      defaultPath: "secret-vault.vault",
      filters: [{ name: "Secret Vault", extensions: ["vault"] }],
    });
    if (!dest) return;
    await api.exportVault(dest);
    showToast("Exported encrypted vault");
  };

  const toggleFavorite = async (entry: Entry) => {
    await api.upsertEntry({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      username: entry.username,
      password: entry.password,
      body: entry.body,
      url: entry.url,
      tags: entry.tags,
      favorite: !entry.favorite,
      fileName: entry.fileName,
      mimeType: entry.mimeType,
      fileContent: entry.fileContent,
      byteSize: entry.byteSize,
    });
    await refresh();
  };

  const handleExportAttached = async (entry: Entry) => {
    const dest = await save({
      title: entry.type === "jasper" ? "Export Jasper file" : "Save file",
      defaultPath: entry.fileName || `${entry.title}.bin`,
    });
    if (!dest) return;
    await api.exportEntryFile(entry.id, dest);
    showToast("File exported");
    await api.touchEntry(entry.id);
    await refresh();
  };

  const handleImport = async () => {
    try {
      const defaults = await api.defaultImportPaths();
      const useDefaults = await ask(
        `Import from your known files?\n\n• ${defaults[0]}\n• ${defaults[1]}\n\nChoose No to pick other text files.`,
        { title: "Import into vault", kind: "info" },
      );

      let paths: string[] = [];
      if (useDefaults) {
        paths = defaults;
      } else {
        const picked = await open({
          multiple: true,
          filters: [{ name: "Text", extensions: ["txt", "md", "cmds", "text"] }],
        });
        if (!picked) return;
        paths = Array.isArray(picked) ? picked : [picked];
      }

      setImportBusy(true);
      const preview = await api.previewImport(paths);
      setImportPreview(preview);
      if (preview.drafts.length === 0) {
        showToast("Nothing useful found to import");
        setImportPreview(null);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setImportBusy(false);
    }
  };

  const confirmImport = async (drafts: ImportDraft[]) => {
    setImportBusy(true);
    try {
      const result = await api.commitImport(drafts);
      setImportPreview(null);
      await refresh();
      showToast(`Imported ${result.imported} entries`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setImportBusy(false);
    }
  };

  if (!session) {
    return (
      <div className="app-root">
        <GoldOutline />
        <UnlockScreen
          lastPath={localStorage.getItem(LAST_PATH_KEY)}
          error={error}
          onError={setError}
          onUnlocked={onUnlocked}
          pickFile={async () => {
            const path = await open({
              multiple: false,
              filters: [{ name: "Secret Vault", extensions: ["vault"] }],
            });
            return typeof path === "string" ? path : null;
          }}
          pickSave={async () => {
            const path = await save({
              title: "Create new vault",
              defaultPath: "secret-vault.vault",
              filters: [{ name: "Secret Vault", extensions: ["vault"] }],
            });
            return path;
          }}
        />
      </div>
    );
  }

  return (
    <div className="app-root">
      <GoldOutline />
      <div className="app-shell">
      <Sidebar
        filter={filter}
        onFilter={setFilter}
        path={session.path}
        rememberUnlock={rememberUnlock}
        trashCount={trashed.length}
        onLogout={() => void lock()}
        onLockRequirePassword={() => void lockRequirePassword()}
        onForgetUnlock={() => void forgetUnlock()}
        onExport={() => void handleExport()}
        onImport={() => void handleImport()}
        onAbout={() => setShowAbout(true)}
        onNew={(type: EntryType) =>
          setEditing({
            id: "",
            type,
            title: "",
            username: "",
            password: "",
            body: "",
            url: "",
            tags: type === "jasper" ? ["jasper"] : [],
            favorite: false,
            fileName: "",
            mimeType: "",
            fileContent: "",
            byteSize: 0,
            createdAt: "",
            updatedAt: "",
            lastUsedAt: null,
          })
        }
      />

      <main className="main-pane">
        <header className="toolbar">
          <input
            className="search"
            placeholder="Search titles, usernames, tags, commands… (⌘K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {allTags.length > 0 && (
            <label className="tag-filter">
              <span className="tag-filter-label">Tag</span>
              <select
                value={tagFilter ?? ""}
                onChange={(e) => setTagFilter(e.target.value || null)}
                aria-label="Filter by tag"
              >
                <option value="">Any tag</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="toolbar-meta">
            {filtered.length} / {filter === "trash" ? trashed.length : entries.length}
            {filter === "trash" && trashed.length > 0 && (
              <button
                type="button"
                className="subtle"
                onClick={() =>
                  void (async () => {
                    if (!window.confirm("Permanently delete everything in trash?")) return;
                    await api.emptyTrash();
                    setSelectedId(null);
                    await refresh();
                    showToast("Trash emptied");
                  })()
                }
              >
                Empty trash
              </button>
            )}
          </div>
        </header>
        <UpdateOffer
          update={update}
          variant="banner"
          onToast={showToast}
          onDetails={() => setShowAbout(true)}
        />

        <div className="content-split">
          <EntryList
            entries={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <EntryDetail
            entry={selected}
            trashed={filter === "trash"}
            onEdit={() => selected && filter !== "trash" && setEditing(selected)}
            onDelete={() => selected && void handleDelete(selected.id)}
            onRestore={() => selected && void handleRestore(selected.id)}
            onPurge={() => selected && void handlePurge(selected.id)}
            onCopy={copy}
            onToggleFavorite={() => selected && void toggleFavorite(selected)}
            onExportFile={(e) => void handleExportAttached(e)}
          />
        </div>
      </main>

      {editing && (
        <EntryEditor
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {showAbout && session && (
        <AboutBackup
          settings={session.settings}
          onClose={() => setShowAbout(false)}
          onToast={showToast}
          onSettings={async (s) => {
            const next = await api.updateSettings({
              autoLockMinutes: s.autoLockMinutes,
              autoBackup: s.autoBackup,
              backupFolder: s.backupFolder,
              driveFolderUrl: s.driveFolderUrl,
              driveClientId: s.driveClientId,
            });
            setSession({ ...session, settings: next });
          }}
        />
      )}

      {importPreview && (
        <ImportReview
          preview={importPreview}
          busy={importBusy}
          onClose={() => setImportPreview(null)}
          onConfirm={confirmImport}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        entries={entries}
        onClose={() => setPaletteOpen(false)}
        onSelect={(entry) => {
          setFilter("all");
          setSelectedId(entry.id);
          setPaletteOpen(false);
        }}
        onCopy={(entry) => {
          if (entry.type === "secret") {
            void copy(entry.password || entry.username, entry.password ? "password" : "username", entry.id);
          } else {
            void copy(entry.body || entry.title, entry.type, entry.id);
          }
          setPaletteOpen(false);
        }}
      />

      {toast && (
        <div className="toast">
          <span>{toast}</span>
          {undoId && toast.startsWith("Moved to trash") && (
            <button type="button" className="link" onClick={() => void handleUndo()}>
              Undo
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
