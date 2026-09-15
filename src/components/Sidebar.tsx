import type { EntryType, FilterKind } from "../types";
import { versionMark } from "../version";

interface Props {
  filter: FilterKind;
  onFilter: (f: FilterKind) => void;
  path: string;
  rememberUnlock: boolean;
  trashCount: number;
  onLogout: () => void;
  onLockRequirePassword: () => void;
  onForgetUnlock: () => void;
  onExport: () => void;
  onImport: () => void;
  onAbout: () => void;
  onScratch: () => void;
  onNew: (type: EntryType) => void;
}

const FILTERS: { id: FilterKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "favorite", label: "Favorites" },
  { id: "secret", label: "Secrets" },
  { id: "command", label: "Commands" },
  { id: "note", label: "Notes" },
  { id: "jasper", label: "Jaspers" },
  { id: "file", label: "Files" },
  { id: "todo", label: "Todos" },
  { id: "trash", label: "Trash" },
];

export function Sidebar({
  filter,
  onFilter,
  path,
  rememberUnlock,
  trashCount,
  onLogout,
  onLockRequirePassword,
  onForgetUnlock,
  onExport,
  onImport,
  onAbout,
  onScratch,
  onNew,
}: Props) {
  const short = path.split("/").pop() ?? path;

  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="brand-mark sm" />
            <strong>
              Secret Vault <span className="brand-ver">{versionMark()}</span>
            </strong>
          </div>

          <nav className="nav-block" aria-label="Filters">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={filter === f.id ? "nav-item active" : "nav-item"}
                onClick={() => onFilter(f.id)}
              >
                {f.label}
                {f.id === "trash" && trashCount > 0 ? ` (${trashCount})` : ""}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-actions">
            <button type="button" className="primary block" onClick={onImport}>
              Import files…
            </button>
            <div className="action-grid">
              <button type="button" className="ghost" onClick={() => onNew("secret")}>
                + Secret
              </button>
              <button type="button" className="ghost" onClick={() => onNew("command")}>
                + Command
              </button>
              <button type="button" className="ghost" onClick={() => onNew("note")}>
                + Note
              </button>
              <button type="button" className="ghost" onClick={() => onNew("todo")}>
                + Todo
              </button>
              <button type="button" className="ghost jasper-add" onClick={() => onNew("jasper")}>
                + Jasper
              </button>
              <button
                type="button"
                className="ghost"
                style={{ gridColumn: "1 / -1" }}
                onClick={() => onNew("file")}
              >
                + Other file
              </button>
            </div>
          </div>

          <div className="sidebar-foot">
            <div className="path-chip" title={path}>
              {short}
            </div>
            {rememberUnlock && (
              <div className="remember-badge" title="You’ll stay signed in on next launch">
                Stay signed in
              </div>
            )}
            <button type="button" className="ghost" onClick={onAbout}>
              About & backup
            </button>
            <button type="button" className="ghost" onClick={() => void onScratch()}>
              Scratch pad
            </button>
            <button type="button" className="ghost" onClick={onExport}>
              Export file
            </button>
            <button
              type="button"
              className="danger"
              onClick={onLogout}
              title={
                rememberUnlock
                  ? "Lock this session now. Stay signed in still applies on the next launch."
                  : "Lock this session and return to the unlock screen"
              }
            >
              Log out
            </button>
            {rememberUnlock && (
              <>
                <button
                  type="button"
                  className="ghost"
                  onClick={onLockRequirePassword}
                  title="Lock and require the master password next time"
                >
                  Lock & require password
                </button>
                <button type="button" className="subtle" onClick={onForgetUnlock}>
                  Turn off stay signed in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
