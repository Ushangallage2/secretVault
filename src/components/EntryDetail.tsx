import { useState } from "react";
import type { Entry } from "../types";

interface Props {
  entry: Entry | null;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: (text: string, label: string, entryId?: string) => void;
  onToggleFavorite: () => void;
  onExportFile?: (entry: Entry) => void;
}

function formatBytes(n: number): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function EntryDetail({
  entry,
  onEdit,
  onDelete,
  onCopy,
  onToggleFavorite,
  onExportFile,
}: Props) {
  const [reveal, setReveal] = useState(false);

  if (!entry) {
    return (
      <div className="detail empty">
        <p>Select an entry to view details.</p>
      </div>
    );
  }

  const isFileType = entry.type === "jasper" || entry.type === "file";
  const pillLabel =
    entry.type === "jasper" ? "jasper" : entry.type === "file" ? "file" : entry.type;

  return (
    <div className="detail" key={entry.id}>
      <div className="detail-head">
        <div>
          <span className={`type-pill ${entry.type}`}>{pillLabel}</span>
          <h2>
            {entry.favorite ? "★ " : ""}
            {entry.title}
          </h2>
        </div>
        <div className="detail-actions">
          <button type="button" className="ghost" onClick={onToggleFavorite}>
            {entry.favorite ? "Unfavorite" : "Favorite"}
          </button>
          {isFileType && onExportFile && (
            <button type="button" className="primary" onClick={() => onExportFile(entry)}>
              {entry.type === "jasper" ? "Export Jasper…" : "Save file…"}
            </button>
          )}
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

      {isFileType && (
        <div className="fields">
          <Field label="File name" value={entry.fileName || "—"} onCopy={entry.fileName ? () => onCopy(entry.fileName, "filename", entry.id) : undefined} />
          <Field label="Type" value={entry.mimeType || "—"} />
          <Field label="Size" value={formatBytes(entry.byteSize)} />
          {entry.type === "jasper" && (
            <p className="hint" style={{ marginTop: 0 }}>
              Stored inside your encrypted vault — export anytime to use in JasperReports / Jaspersoft Studio.
            </p>
          )}
        </div>
      )}

      {entry.type === "jasper" && entry.body && (
        <div className="field">
          <div className="field-label">
            JRXML
            <button
              type="button"
              className="link"
              onClick={() => onCopy(entry.body, "jrxml", entry.id)}
            >
              Copy
            </button>
          </div>
          <pre className="body-block jasper-preview">{entry.body}</pre>
        </div>
      )}

      {entry.type === "file" && entry.body && (
        <div className="field">
          <div className="field-label">Notes</div>
          <pre className="body-block">{entry.body}</pre>
        </div>
      )}

      {(entry.type === "command" || entry.type === "note") && (
        <div className="field">
          <div className="field-label">
            {entry.type === "command" ? "Command" : "Body"}
            {entry.body && (
              <button
                type="button"
                className="link"
                onClick={() =>
                  onCopy(entry.body, entry.type === "command" ? "command" : "text", entry.id)
                }
              >
                Copy
              </button>
            )}
          </div>
          <pre className="body-block">{entry.body || "—"}</pre>
        </div>
      )}

      {entry.username && entry.type !== "secret" && !isFileType && (
        <Field
          label="Username / context"
          value={entry.username}
          onCopy={() => onCopy(entry.username, "text", entry.id)}
        />
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
  onCopy?: () => void;
}) {
  return (
    <div className="field">
      <div className="field-label">
        {label}
        {onCopy && value && value !== "—" && (
          <button type="button" className="link" onClick={onCopy}>
            Copy
          </button>
        )}
      </div>
      <code className="mono">{value || "—"}</code>
    </div>
  );
}
