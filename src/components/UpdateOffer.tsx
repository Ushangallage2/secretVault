import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, type UpdateInfo } from "../api";
import { installUpdateAndRestart } from "../updates";

interface Props {
  update: UpdateInfo | null;
  variant: "banner" | "unlock" | "about";
  busy?: boolean;
  onToast?: (msg: string) => void;
  onDetails?: () => void;
  onRefresh?: () => void | Promise<void>;
}

export function UpdateOffer({
  update,
  variant,
  busy = false,
  onToast,
  onDetails,
  onRefresh,
}: Props) {
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const pending = !!update?.pending;
  if (variant !== "about" && !pending && !installing) return null;

  const install = async () => {
    setInstalling(true);
    setStatus("Updating… restarting");
    try {
      await installUpdateAndRestart((msg) => setStatus(msg));
    } catch (err) {
      setInstalling(false);
      setStatus(null);
      onToast?.(err instanceof Error ? err.message : String(err));
    }
  };

  const download = async () => {
    const dest = await save({
      title: "Save pending update",
      defaultPath: update?.filename ?? "Secret-Vault-update.dmg",
    });
    if (!dest) return;
    try {
      const msg = await api.downloadUpdate(dest);
      onToast?.(msg);
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : String(err));
    }
  };

  const overlay = installing ? (
    <div className="update-install-overlay" role="status" aria-live="polite">
      <div className="update-install-card">
        <strong>{status ?? "Updating… restarting"}</strong>
        <span>Installing the signed update, then relaunching.</span>
      </div>
    </div>
  ) : null;

  const actions = (
    <div className={variant === "banner" || variant === "unlock" ? "update-banner-actions" : "update-actions"}>
      {variant === "about" && onRefresh && (
        <button type="button" className="ghost" disabled={busy || installing} onClick={() => void onRefresh()}>
          Check for updates
        </button>
      )}
      {pending && (
        <button
          type="button"
          className="primary"
          disabled={busy || installing}
          onClick={() => void install()}
        >
          Install update and restart
        </button>
      )}
      {pending && (
        <button
          type="button"
          className="ghost"
          disabled={busy || installing || !update?.downloadUrl}
          onClick={() => void download()}
        >
          Download update
        </button>
      )}
      {variant === "banner" && onDetails && (
        <button type="button" className="ghost" onClick={onDetails}>
          Details
        </button>
      )}
      {variant === "about" && update?.htmlUrl && (
        <button type="button" className="subtle" onClick={() => void openUrl(update.htmlUrl!)}>
          Open release
        </button>
      )}
    </div>
  );

  if (variant === "about") {
    let statusText = "Could not check for updates.";
    if (!update) statusText = "Checking GitHub Releases…";
    else if (update.pending && update.latest) statusText = `Pending version: v${update.latest}`;
    else if (update.status === "upToDate") statusText = "You’re up to date — no pending update.";
    else if (update.status === "noRelease") {
      statusText =
        "No GitHub Release published yet. This copy is current until a newer version is released.";
    } else if (update.error) statusText = update.error;

    return (
      <>
        {overlay}
        <p className="muted tiny">
          Current version: <strong>v{update?.current ?? "…"}</strong>
        </p>
        <p className={pending ? "update-pending-text" : "muted tiny"}>{statusText}</p>
        {update?.notes && <p className="muted tiny update-notes">{update.notes}</p>}
        {actions}
      </>
    );
  }

  return (
    <>
      {overlay}
      <div className={variant === "unlock" ? "update-banner update-banner-unlock" : "update-banner"}>
        <span>
          Current version <strong>v{update?.current}</strong>
          {" · "}
          Pending update <strong>v{update?.latest}</strong>
        </span>
        {actions}
      </div>
    </>
  );
}
