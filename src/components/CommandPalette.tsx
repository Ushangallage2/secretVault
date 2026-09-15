import { useEffect, useMemo, useRef, useState } from "react";
import type { Entry } from "../types";

interface Props {
  open: boolean;
  entries: Entry[];
  onClose: () => void;
  onSelect: (entry: Entry) => void;
  onCopy: (entry: Entry) => void;
}

export function CommandPalette({ open, entries, onClose, onSelect, onCopy }: Props) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? entries.filter((e) => {
          const hay = [e.title, e.username, e.body, e.url, e.tags.join(" "), e.type]
            .join(" ")
            .toLowerCase();
          return hay.includes(needle);
        })
      : entries;
    return list.slice(0, 12);
  }, [entries, q]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setIdx(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    setIdx(0);
  }, [q]);

  if (!open) return null;

  const active = hits[idx] ?? null;

  return (
    <div
      className="palette-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setIdx((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setIdx((i) => Math.max(i - 1, 0));
        }
        if (e.key === "Enter" && active) {
          e.preventDefault();
          if (e.metaKey || e.ctrlKey) onSelect(active);
          else onCopy(active);
        }
      }}
    >
      <div className="palette" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Quick search">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Enter" && active) {
              e.preventDefault();
              if (e.metaKey || e.ctrlKey) onSelect(active);
              else onCopy(active);
            }
          }}
          placeholder="Search vault — Enter copies, ⌘Enter opens"
        />
        <ul>
          {hits.length === 0 && <li className="muted tiny">No matches</li>}
          {hits.map((e, i) => (
            <li key={e.id}>
              <button
                type="button"
                className={i === idx ? "palette-hit active" : "palette-hit"}
                onMouseEnter={() => setIdx(i)}
                onClick={() => onCopy(e)}
                onDoubleClick={() => onSelect(e)}
              >
                <span className="pill sm">{e.type}</span>
                <strong>{e.title}</strong>
                {e.username ? <span className="muted tiny">{e.username}</span> : null}
              </button>
            </li>
          ))}
        </ul>
        <p className="muted tiny palette-hint">⌘K close · Enter copy secret/command · ⌘Enter open</p>
      </div>
    </div>
  );
}
