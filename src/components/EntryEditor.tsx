import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import type { Entry, EntryType, UpsertPayload } from "../types";

interface Props {
  initial: Entry | null;
  onClose: () => void;
  onSave: (payload: UpsertPayload) => Promise<void>;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function EntryEditor({ initial, onClose, onSave }: Props) {
  const isNew = !initial?.id;
  const [type, setType] = useState<EntryType>(initial?.type ?? "secret");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [favorite, setFavorite] = useState(initial?.favorite ?? false);
  const [fileName, setFileName] = useState(initial?.fileName ?? "");
  const [mimeType, setMimeType] = useState(initial?.mimeType ?? "");
  const [fileContent, setFileContent] = useState(initial?.fileContent ?? "");
  const [byteSize, setByteSize] = useState(initial?.byteSize ?? 0);
  const [dueAt, setDueAt] = useState(() => toLocalInput(initial?.dueAt));
  const [todoDone, setTodoDone] = useState(initial?.todoDone ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFileType = type === "jasper" || type === "file";

  const pickAttachment = async () => {
    setError(null);
    const filters =
      type === "jasper"
        ? [{ name: "Jasper files", extensions: ["jrxml", "jasper"] }]
        : undefined;
    const path = await open({
      multiple: false,
      filters,
    });
    if (!path || typeof path !== "string") return;
    setBusy(true);
    try {
      const att = await api.readFileAttachment(path);
      if (type === "jasper") {
        const lower = att.fileName.toLowerCase();
        if (!lower.endsWith(".jrxml") && !lower.endsWith(".jasper")) {
          setError("Pick a .jrxml or .jasper file for Jasper entries");
          return;
        }
      }
      setFileName(att.fileName);
      setMimeType(att.mimeType);
      setFileContent(att.fileContent);
      setByteSize(att.byteSize);
      setBody(att.body);
      if (!title.trim()) setTitle(att.suggestedTitle);
      if (type === "jasper" && !tags.toLowerCase().includes("jasper")) {
        setTags((t) => (t.trim() ? `${t}, jasper` : "jasper"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (isFileType && !fileContent && !body && isNew) {
      setError("Attach a file first");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        id: initial?.id || undefined,
        type,
        title: title.trim(),
        username,
        password,
        body,
        url,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        favorite,
        fileName,
        mimeType,
        fileContent,
        byteSize,
        dueAt: type === "todo" ? fromLocalInput(dueAt) : null,
        todoDone: type === "todo" ? todoDone : false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="modal-body">
          <h3>{isNew ? "New entry" : "Edit entry"}</h3>

          <label>
            Type
            <select
              value={type}
              onChange={(e) => {
                const next = e.target.value as EntryType;
                setType(next);
                if (next === "jasper" || next === "file") {
                  setUsername("");
                  setPassword("");
                  setUrl("");
                }
              }}
            >
              <option value="secret">Secret</option>
              <option value="command">Command</option>
              <option value="note">Note</option>
              <option value="todo">Todo</option>
              <option value="jasper">Jasper file</option>
              <option value="file">Other file</option>
            </select>
          </label>

          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>

          {type === "secret" && (
            <>
              <label>
                Username
                <input value={username} onChange={(e) => setUsername(e.target.value)} />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label>
                URL
                <input value={url} onChange={(e) => setUrl(e.target.value)} />
              </label>
            </>
          )}

          {type === "todo" && (
            <>
              <label>
                Due time (optional)
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </label>
              <p className="hint" style={{ marginTop: "-0.45rem" }}>
                If you set a time, a small reminder window pops up when it’s due.
              </p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={todoDone}
                  onChange={(e) => setTodoDone(e.target.checked)}
                />
                Mark done
              </label>
            </>
          )}

          {isFileType && (
            <div className="file-attach-panel">
              <div className="file-attach-row">
                <button type="button" className="primary" disabled={busy} onClick={() => void pickAttachment()}>
                  {fileName ? "Replace file…" : type === "jasper" ? "Choose .jrxml / .jasper…" : "Choose file…"}
                </button>
                {fileName && (
                  <span className="file-meta">
                    {fileName} · {formatBytes(byteSize)}
                    {mimeType ? ` · ${mimeType}` : ""}
                  </span>
                )}
              </div>
              {type === "jasper" && (
                <p className="hint" style={{ margin: "0.4rem 0 0" }}>
                  Jasper vault entries keep report source/binary inside the encrypted vault.
                  Prefer .jrxml for preview &amp; search.
                </p>
              )}
            </div>
          )}

          {type === "jasper" && (
            <label>
              JRXML preview / notes
              <textarea
                rows={10}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                spellCheck={false}
                placeholder="JRXML text appears here for .jrxml files"
              />
            </label>
          )}

          {type === "file" && (
            <label>
              Notes (optional)
              <textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Optional description"
              />
            </label>
          )}

          {!isFileType && (
            <label>
              {type === "command" ? "Command / snippet" : type === "todo" ? "Notes" : "Notes / body"}
              <textarea
                rows={type === "command" ? 8 : 5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                spellCheck={type !== "command"}
              />
            </label>
          )}

          {type !== "secret" && type !== "todo" && !isFileType && (
            <label>
              Username / context (optional)
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
          )}

          <label>
            Tags (comma-separated)
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={type === "jasper" ? "jasper, invoice, retail" : "postgres, tomcat, curl"}
            />
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
            />
            Favorite
          </label>

          {error && <div className="error-banner">{error}</div>}
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
