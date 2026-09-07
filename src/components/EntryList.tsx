import type { Entry } from "../types";

interface Props {
  entries: Entry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function EntryList({ entries, selectedId, onSelect }: Props) {
  if (entries.length === 0) {
    return (
      <div className="entry-list empty">
        <p>No matches. Try another filter or add an entry.</p>
      </div>
    );
  }

  return (
    <div className="entry-list">
      {entries.map((e) => (
        <button
          key={e.id}
          type="button"
          className={selectedId === e.id ? "entry-row active" : "entry-row"}
          onClick={() => onSelect(e.id)}
        >
          <span className={`type-pill ${e.type}`}>{e.type}</span>
          <span className="entry-title">
            {e.favorite ? "★ " : ""}
            {e.title}
          </span>
          <span className="entry-sub">
            {e.type === "secret"
              ? e.username || "—"
              : e.type === "jasper" || e.type === "file"
                ? e.fileName || e.tags.slice(0, 3).map((t) => `#${t}`).join(" ") || "—"
                : e.tags.slice(0, 3).map((t) => `#${t}`).join(" ") || "—"}
          </span>
        </button>
      ))}
    </div>
  );
}
