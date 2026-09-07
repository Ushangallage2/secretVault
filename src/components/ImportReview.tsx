import { useMemo, useState } from "react";
import type { EntryType, ImportDraft, ImportPreview } from "../types";

interface Props {
  preview: ImportPreview;
  busy: boolean;
  onClose: () => void;
  onConfirm: (drafts: ImportDraft[]) => Promise<void>;
}

export function ImportReview({ preview, busy, onClose, onConfirm }: Props) {
  const [drafts, setDrafts] = useState(() =>
    preview.drafts.map((d, i) => ({ ...d, _i: i, included: true })),
  );
  const [typeFilter, setTypeFilter] = useState<EntryType | "all">("all");

  const counts = useMemo(() => {
    const included = drafts.filter((d) => d.included);
    return {
      total: included.length,
      secret: included.filter((d) => d.type === "secret").length,
      command: included.filter((d) => d.type === "command").length,
      note: included.filter((d) => d.type === "note").length,
    };
  }, [drafts]);

  const visible = drafts.filter(
    (d) => typeFilter === "all" || d.type === typeFilter,
  );

  const setType = (index: number, type: EntryType) => {
    setDrafts((prev) =>
      prev.map((d) => (d._i === index ? { ...d, type } : d)),
    );
  };

  const toggle = (index: number) => {
    setDrafts((prev) =>
      prev.map((d) => (d._i === index ? { ...d, included: !d.included } : d)),
    );
  };

  const submit = async () => {
    const selected = drafts
      .filter((d) => d.included)
      .map(({ included: _i1, _i: _i2, ...rest }) => rest);
    await onConfirm(selected);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-body">
          <h3>Import review</h3>
          <p className="hint" style={{ marginTop: 0, marginBottom: "0.85rem" }}>
            Parsed {preview.drafts.length} entries
            {preview.skipped ? ` · skipped ${preview.skipped} noise blocks` : ""}.
            Uncheck anything you don’t want. Change the type if classification is wrong.
          </p>

          <div className="import-summary">
            <span className="type-pill secret">{counts.secret} secrets</span>
            <span className="type-pill command">{counts.command} commands</span>
            <span className="type-pill note">{counts.note} notes</span>
            <span className="muted">{counts.total} selected</span>
          </div>

          <div className="import-tabs">
            {(["all", "secret", "command", "note"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={typeFilter === t ? "active" : ""}
                onClick={() => setTypeFilter(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="import-list">
            {visible.map((d) => (
              <div key={d._i} className={d.included ? "import-row" : "import-row dim"}>
                <label className="checkbox tight">
                  <input
                    type="checkbox"
                    checked={d.included}
                    onChange={() => toggle(d._i)}
                  />
                </label>
                <div className="import-main">
                  <div className="import-title-row">
                    <strong>{d.title}</strong>
                    <select
                      value={d.type}
                      onChange={(e) => setType(d._i, e.target.value as EntryType)}
                    >
                      <option value="secret">Secret</option>
                      <option value="command">Command</option>
                      <option value="note">Note</option>
                      <option value="jasper">Jasper</option>
                      <option value="file">File</option>
                    </select>
                  </div>
                  <div className="entry-sub">
                    {d.type === "secret"
                      ? [d.username, d.password ? "••••" : ""].filter(Boolean).join(" · ") ||
                        d.tags.slice(0, 4).map((t) => `#${t}`).join(" ")
                      : d.body.slice(0, 120).replace(/\s+/g, " ")}
                  </div>
                  <div className="tag-row compact">
                    {d.tags.slice(0, 6).map((t) => (
                      <span key={t} className="tag">
                        #{t}
                      </span>
                    ))}
                    <span className="muted tiny">from {d.source}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || counts.total === 0}
            onClick={() => void submit()}
          >
            {busy ? "Importing…" : `Import ${counts.total} entries`}
          </button>
        </div>
      </div>
    </div>
  );
}
