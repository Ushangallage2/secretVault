import { useState } from "react";
import type { Entry } from "../types";

interface Props {
  entry: Entry | null;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: (text: string, label: string, entryId?: string) => void;
  onToggleFavorite: () => void;
}

export function EntryDetail({
  entry,
  onEdit,
  onDelete,
  onCopy,
  onToggleFavorite,
}: Props) {
  const [reveal, setReveal] = useState(false);

  if (!entry) {
    return (
      <div className="detail empty">
        <p>Select an entry to view details.</p>
      </div>
    );
  }

  return (
    <div className="detail" key={entry.id}>
      <div className="detail-head">
        <div>
          <span className={`type-pill ${entry.type}`}>{entry.type}</span>
          <h2>
            {entry.favorite ? "★ " : ""}
            {entry.title}
          </h2>
        </div>
        <div className="detail-actions">
          <button type="button" className="ghost" onClick={onToggleFavorite}>
            {entry.favorite ? "Unfavorite" : "Favorite"}
          </button>
          <button type="button" className="ghost" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      {entry.tags.length > 0 && (
        <div className="tag-row">
          {entry.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
        </div>
      )}

      {entry.type === "secret" && (
        <div className="fields">
          <Field
            label="Username"
            value={entry.username}
            onCopy={() => onCopy(entry.username, "username", entry.id)}
          />
          <div className="field">
            <div className="field-label">
              Password
              <div>
                <button type="button" className="link" onClick={() => setReveal((r) => !r)}>
                  {reveal ? "Hide" : "Show"}
                </button>
                <button
                  type="button"
                  className="link"
                  onClick={() => onCopy(entry.password, "password", entry.id)}
                >
                  Copy
                </button>
              </div>
            </div>
            <code className="mono">{reveal ? entry.password || "—" : "••••••••••••"}</code>
          </div>
          {entry.url && (
            <Field
              label="URL"
              value={entry.url}
              onCopy={() => onCopy(entry.url, "url", entry.id)}
            />
          )}
        </div>
      )}

      {(entry.type === "command" || entry.type === "note" || entry.body) && (
        <div className="field">
          <div className="field-label">
            {entry.type === "command" ? "Command" : "Body"}
            {entry.body && (
              <button
                type="button"
                className="link"
                onClick={() => onCopy(entry.body, entry.type === "command" ? "command" : "text", entry.id)}
              >
                Copy
              </button>
            )}
          </div>
          <pre className="body-block">{entry.body || "—"}</pre>
        </div>
      )}

      {entry.username && entry.type !== "secret" && (
        <Field label="Username / context" value={entry.username} onCopy={() => onCopy(entry.username, "text", entry.id)} />
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="field">
      <div className="field-label">
        {label}
        {value && (
          <button type="button" className="link" onClick={onCopy}>
            Copy
          </button>
        )}
      </div>
      <code className="mono">{value || "—"}</code>
    </div>
  );
}
