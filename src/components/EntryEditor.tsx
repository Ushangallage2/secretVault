import { useState } from "react";
import type { Entry, EntryType, UpsertPayload } from "../types";

interface Props {
  initial: Entry | null;
  onClose: () => void;
  onSave: (payload: UpsertPayload) => Promise<void>;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required");
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
            <select value={type} onChange={(e) => setType(e.target.value as EntryType)}>
              <option value="secret">Secret</option>
              <option value="command">Command</option>
              <option value="note">Note</option>
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

          <label>
            {type === "command" ? "Command / snippet" : "Notes / body"}
            <textarea
              rows={type === "command" ? 8 : 5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck={type !== "command"}
            />
          </label>

          {type !== "secret" && (
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
              placeholder="postgres, tomcat, curl"
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
