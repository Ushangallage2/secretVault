import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open, save, ask } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { api } from "./api";
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

const LAST_PATH_KEY = "secret-vault-last-path";
const REMEMBER_KEY = "secret-vault-remember-unlock";
const SKIP_AUTO_KEY = "secret-vault-skip-auto-unlock";

export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Entry | null | "new">(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rememberUnlock, setRememberUnlock] = useState(
    () => localStorage.getItem(REMEMBER_KEY) === "1",
  );
  const idleTimer = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const refresh = useCallback(async () => {
    const list = await api.listEntries();
    setEntries(list);
    const s = await api.getSession();
    setSession(s);
  }, []);

  const lock = useCallback(async () => {
    await api.lockVault();
    // Prevent immediate auto-unlock in this app session; next cold launch still auto-opens.
    sessionStorage.setItem(SKIP_AUTO_KEY, "1");
    setSession(null);
    setEntries([]);
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
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => {
        if (filter === "favorite" && !e.favorite) return false;
        if (filter === "secret" && e.type !== "secret") return false;
        if (filter === "command" && e.type !== "command") return false;
        if (filter === "note" && e.type !== "note") return false;
        if (tagFilter && !e.tags.includes(tagFilter)) return false;
        if (!q) return true;
        const hay = [e.title, e.username, e.body, e.url, e.tags.join(" ")]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [entries, query, filter, tagFilter]);

  const selected = entries.find((e) => e.id === selectedId) ?? null;

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
    if (!window.confirm("Delete this entry? This cannot be undone.")) return;
    await api.deleteEntry(id);
    if (selectedId === id) setSelectedId(null);
    await refresh();
    showToast("Deleted");
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
    });
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
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        filter={filter}
        onFilter={setFilter}
        path={session.path}
        rememberUnlock={rememberUnlock}
        onLock={() => void lock()}
        onLockRequirePassword={() => void lockRequirePassword()}
        onForgetUnlock={() => void forgetUnlock()}
        onExport={() => void handleExport()}
        onImport={() => void handleImport()}
        onNew={(type: EntryType) =>
          setEditing({
            id: "",
            type,
            title: "",
            username: "",
            password: "",
            body: "",
            url: "",
            tags: [],
            favorite: false,
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
            placeholder="Search titles, usernames, tags, commands…"
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
            {filtered.length} / {entries.length}
          </div>
        </header>

        <div className="content-split">
          <EntryList
            entries={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <EntryDetail
            entry={selected}
            onEdit={() => selected && setEditing(selected)}
            onDelete={() => selected && void handleDelete(selected.id)}
            onCopy={copy}
            onToggleFavorite={() => selected && void toggleFavorite(selected)}
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

      {importPreview && (
        <ImportReview
          preview={importPreview}
          busy={importBusy}
          onClose={() => setImportPreview(null)}
          onConfirm={confirmImport}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
