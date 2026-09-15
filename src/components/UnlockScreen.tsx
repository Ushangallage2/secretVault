import { useEffect, useRef, useState } from "react";
import { api, type UpdateInfo } from "../api";
import type { SessionInfo } from "../types";
import { UpdateOffer } from "./UpdateOffer";
import { versionMark } from "../version";

const REMEMBER_KEY = "secret-vault-remember-unlock";
/** Set when user locks in-app; cleared on cold start so auto-unlock only runs on launch. */
const SKIP_AUTO_KEY = "secret-vault-skip-auto-unlock";

interface Props {
  lastPath: string | null;
  error: string | null;
  onError: (e: string | null) => void;
  onUnlocked: (info: SessionInfo, path: string, remember: boolean) => void;
  pickFile: () => Promise<string | null>;
  pickSave: () => Promise<string | null>;
}

type AutoPhase = "idle" | "checking" | "unlocking" | "done" | "skipped";

export function UnlockScreen({
  lastPath,
  error,
  onError,
  onUnlocked,
  pickFile,
  pickSave,
}: Props) {
  const [mode, setMode] = useState<"unlock" | "create">("unlock");
  const [path, setPath] = useState(lastPath ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(
    () => localStorage.getItem(REMEMBER_KEY) === "1",
  );
  const [hasKeychain, setHasKeychain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updateToast, setUpdateToast] = useState<string | null>(null);
  const [autoPhase, setAutoPhase] = useState<AutoPhase>(() => {
    const p = (lastPath ?? "").trim();
    const skip = sessionStorage.getItem(SKIP_AUTO_KEY) === "1";
    return p && !skip && localStorage.getItem(REMEMBER_KEY) === "1"
      ? "checking"
      : "skipped";
  });
  const autoTried = useRef(false);

  useEffect(() => {
    void api
      .checkForUpdate()
      .then(setUpdate)
      .catch(() => setUpdate(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!path.trim()) {
      setHasKeychain(false);
      return;
    }
    void api.keychainHasUnlock(path.trim()).then((ok) => {
      if (!cancelled) setHasKeychain(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  // Auto-unlock only on cold launch (not after an in-app Lock).
  useEffect(() => {
    if (mode !== "unlock" || autoTried.current) return;
    const p = (lastPath ?? path).trim();
    const skip = sessionStorage.getItem(SKIP_AUTO_KEY) === "1";
    if (!p || skip || localStorage.getItem(REMEMBER_KEY) !== "1") {
      setAutoPhase("skipped");
      autoTried.current = true;
      return;
    }
    autoTried.current = true;
    setAutoPhase("checking");
    void (async () => {
      try {
        const ok = await api.keychainHasUnlock(p);
        if (!ok) {
          setAutoPhase("skipped");
          setHasKeychain(false);
          return;
        }
        setHasKeychain(true);
        setAutoPhase("unlocking");
        setBusy(true);
        onError(null);
        const info = await api.unlockVaultWithKeychain(p);
        localStorage.setItem(REMEMBER_KEY, "1");
        sessionStorage.removeItem(SKIP_AUTO_KEY);
        setAutoPhase("done");
        onUnlocked(info, info.path || p, true);
      } catch (err) {
        setHasKeychain(false);
        setAutoPhase("skipped");
        onError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    })();
  }, [mode, lastPath, path, onError, onUnlocked]);

  const unlockWithKeychain = async () => {
    onError(null);
    if (!path.trim()) {
      onError("Choose a vault file path");
      return;
    }
    setBusy(true);
    try {
      const info = await api.unlockVaultWithKeychain(path.trim());
      localStorage.setItem(REMEMBER_KEY, "1");
      sessionStorage.removeItem(SKIP_AUTO_KEY);
      onUnlocked(info, info.path || path.trim(), true);
    } catch (err) {
      setHasKeychain(false);
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const forgetSaved = async () => {
    onError(null);
    try {
      if (path.trim()) await api.keychainClearUnlock(path.trim());
      localStorage.removeItem(REMEMBER_KEY);
      setRemember(false);
      setHasKeychain(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const browse = async () => {
    const p = mode === "create" ? await pickSave() : await pickFile();
    if (p) setPath(p);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError(null);
    if (!path) {
      onError("Choose a vault file path");
      return;
    }
    if (password.length < 8) {
      onError("Master password must be at least 8 characters");
      return;
    }
    if (mode === "create" && password !== confirm) {
      onError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const info =
        mode === "create"
          ? await api.createVault(path, password)
          : await api.unlockVault(path, password);

      // Prefer the backend path so Keychain account matches future auto-unlock lookups.
      const storePath = info.path || path;

      if (remember) {
        await api.keychainStoreUnlock(storePath, password);
        localStorage.setItem(REMEMBER_KEY, "1");
      } else {
        await api.keychainClearUnlock(storePath);
        localStorage.removeItem(REMEMBER_KEY);
      }

      setPassword("");
      setConfirm("");
      sessionStorage.removeItem(SKIP_AUTO_KEY);
      onUnlocked(info, storePath, remember);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const showAutoSplash =
    mode === "unlock" && (autoPhase === "checking" || autoPhase === "unlocking");

  if (showAutoSplash) {
    return (
      <div className="unlock">
        <div className="unlock-card auto-unlock-splash">
          <div className="brand">
            <div className="brand-mark" aria-hidden />
            <div>
              <h1>Secret Vault {versionMark()}</h1>
              <p>Encrypted secrets & commands · local only</p>
            </div>
          </div>
          <div className="auto-unlock-status" role="status" aria-live="polite">
            <div className="auto-unlock-spinner" aria-hidden />
            <strong>
              {autoPhase === "unlocking" ? "Opening vault…" : "Checking saved unlock…"}
            </strong>
            <span>No password needed</span>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <button
            type="button"
            className="subtle"
            onClick={() => {
              autoTried.current = true;
              setAutoPhase("skipped");
              setBusy(false);
            }}
          >
            Use password instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="unlock">
      <div className="unlock-stack">
        <UpdateOffer
          update={update}
          variant="unlock"
          onToast={(msg) => {
            setUpdateToast(msg);
            window.setTimeout(() => setUpdateToast(null), 4000);
          }}
        />
        {updateToast && <div className="toast">{updateToast}</div>}
        <div className="unlock-card">
          <div className="brand">
            <div className="brand-mark" aria-hidden />
            <div>
              <h1>Secret Vault {versionMark()}</h1>
              <p>Encrypted secrets & commands · local only</p>
            </div>
          </div>

        <div className="mode-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "unlock"}
            className={mode === "unlock" ? "active" : ""}
            onClick={() => {
              setMode("unlock");
              onError(null);
            }}
          >
            Unlock
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "create"}
            className={mode === "create" ? "active" : ""}
            onClick={() => {
              setMode("create");
              onError(null);
            }}
          >
            Create vault
          </button>
        </div>

        <form onSubmit={submit} className="unlock-form">
          <label>
            Vault file
            <div className="path-row">
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/path/to/secret-vault.vault"
              />
              <button type="button" className="ghost" onClick={() => void browse()}>
                {mode === "create" ? "Save as…" : "Browse"}
              </button>
            </div>
          </label>

          {mode === "unlock" && hasKeychain && (
            <div className="keychain-panel">
              <p className="keychain-hint">Saved unlock found for this vault</p>
              <button
                type="button"
                className="primary block"
                disabled={busy}
                onClick={() => void unlockWithKeychain()}
              >
                {busy ? "Unlocking…" : "Unlock without password"}
              </button>
              <button
                type="button"
                className="subtle"
                disabled={busy}
                onClick={() => void forgetSaved()}
              >
                Turn off stay signed in
              </button>
            </div>
          )}

          {mode === "unlock" && hasKeychain && (
            <div className="or-divider">or use master password</div>
          )}

          <label>
            Master password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "create" ? "new-password" : "current-password"}
            />
          </label>

          {mode === "create" && (
            <label>
              Confirm password
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </label>
          )}

          <label className="check-row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Stay signed in on this Mac</span>
          </label>

          {error && <div className="error-banner">{error}</div>}

          <button type="submit" className="primary unlock-submit" disabled={busy}>
            {busy
              ? "Working…"
              : mode === "create"
                ? "Create vault"
                : "Unlock with password"}
          </button>
        </form>

        <p className="hint">
          AES-256-GCM · Argon2id · one encrypted <code>.vault</code> file you can
          copy to another Mac and open with the same password.
        </p>
        </div>
      </div>
    </div>
  );
}
