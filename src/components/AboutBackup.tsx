import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { api, type AppAbout, type BackupStatus, type InstallerInfo, type UpdateInfo } from "../api";
import { UpdateOffer } from "./UpdateOffer";
import type { VaultSettings } from "../types";

interface Props {
  settings: VaultSettings;
  onClose: () => void;
  onToast: (msg: string) => void;
  onSettings: (s: VaultSettings) => Promise<void>;
}

const CLONE_URL = "https://github.com/Ushangallage2/secretVault";
const BUILD_GUIDE_URL = `${CLONE_URL}#build-installers-yourself`;

const BUILD_HINTS: Record<string, { os: string; artifact: string; output: string }> = {
  macos: {
    os: "macOS",
    artifact: ".dmg",
    output: "src-tauri/target/release/bundle/dmg/",
  },
  linux: {
    os: "Linux",
    artifact: ".deb / AppImage",
    output: "src-tauri/target/release/bundle/deb/ (and appimage/)",
  },
  windows: {
    os: "Windows",
    artifact: ".exe / .msi",
    output: "src-tauri/target/release/bundle/nsis/ (and msi/)",
  },
};

export function AboutBackup({ settings, onClose, onToast, onSettings }: Props) {
  const [about, setAbout] = useState<AppAbout | null>(null);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [installers, setInstallers] = useState<InstallerInfo[]>([]);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [autoBackup, setAutoBackup] = useState(!!settings.autoBackup);
  const [backupFolder, setBackupFolder] = useState(settings.backupFolder ?? "");
  const [driveFolderUrl, setDriveFolderUrl] = useState(settings.driveFolderUrl ?? "");
  const [clientId, setClientId] = useState(settings.driveClientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshMeta = async () => {
    setStatus(await api.getBackupStatus());
    setInstallers(await api.listInstallers());
    setUpdate(await api.checkForUpdate());
  };

  useEffect(() => {
    void (async () => {
      setAbout(await api.getAppAbout());
      await refreshMeta();
    })();
  }, []);

  const persistSettings = async (next: VaultSettings) => {
    await onSettings(next);
  };

  const handleSaveBackup = async () => {
    setBusy(true);
    try {
      if (clientSecret.trim()) {
        await api.storeDriveClientSecret(clientSecret.trim());
        setClientSecret("");
      }
      await persistSettings({
        autoLockMinutes: settings.autoLockMinutes,
        autoBackup,
        backupFolder: backupFolder.trim(),
        driveFolderUrl: driveFolderUrl.trim(),
        driveClientId: clientId.trim(),
      });
      onToast("Backup settings saved");
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const pickFolder = async () => {
    const dir = await open({ directory: true, multiple: false, title: "Backup folder (Google Drive / disk)" });
    if (typeof dir === "string") setBackupFolder(dir);
  };

  const pushNow = async () => {
    setBusy(true);
    try {
      await persistSettings({
        autoLockMinutes: settings.autoLockMinutes,
        autoBackup,
        backupFolder: backupFolder.trim(),
        driveFolderUrl: driveFolderUrl.trim(),
        driveClientId: clientId.trim(),
      });
      const msg = await api.pushVaultBackup();
      onToast(msg);
      await refreshMeta();
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const connectDrive = async () => {
    setBusy(true);
    try {
      const msg = await api.connectGoogleDrive(clientId.trim(), clientSecret.trim());
      if (clientSecret.trim()) setClientSecret("");
      await persistSettings({
        autoLockMinutes: settings.autoLockMinutes,
        autoBackup,
        backupFolder: backupFolder.trim(),
        driveFolderUrl: driveFolderUrl.trim(),
        driveClientId: clientId.trim(),
      });
      onToast(msg);
      await refreshMeta();
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveOneInstaller = async (item: InstallerInfo) => {
    const dest = await save({
      title: `Save ${item.label}`,
      defaultPath: item.filename,
    });
    if (!dest) return;
    setBusy(true);
    try {
      const msg = await api.saveInstaller(item.id, dest);
      onToast(msg);
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-body">
          <h3>About this app</h3>
          <p className="about-version">
            {about?.name ?? "Secret Vault"} <strong>v{about?.version ?? update?.current ?? "…"}</strong>
          </p>
          <p className="about-credit">developed by {about?.developer ?? "Ushan Gallage"}</p>

          <h3 className="about-h">Updates</h3>
          <UpdateOffer
            update={update}
            variant="about"
            busy={busy}
            onToast={onToast}
            onRefresh={refreshMeta}
          />

          <h3 className="about-h">Share this version</h3>
          <p className="muted tiny">
            Save a real installer when one exists (bundled file or GitHub Release). This Mac build cannot invent
            authentic Linux <code>.deb</code> or Windows <code>.exe</code> files — those have to be built on that OS
            (or published later by GitHub Actions).
          </p>
          <div className="installer-list">
            {installers.length === 0 && <p className="muted tiny">Looking up installers…</p>}
            {installers.map((item) => {
              const hint = BUILD_HINTS[item.id];
              return (
                <div key={item.id} className={item.available ? "installer-row" : "installer-row missing"}>
                  <div>
                    <strong>{item.label}</strong>
                    {item.available ? (
                      <>
                        <div className="muted tiny">{item.filename}</div>
                        <div className="muted tiny">{item.source}</div>
                      </>
                    ) : (
                      <p className="installer-hint">
                        No real {hint?.artifact ?? "installer"} is in this copy
                        {hint && item.id !== "macos"
                          ? ` because it was not built on ${hint.os}`
                          : ""}
                        . Build it on {hint?.os ?? "that OS"}: clone{" "}
                        <code>{CLONE_URL}</code>, then <code>npm install</code> and{" "}
                        <code>npm run tauri build</code>. Typical output:{" "}
                        <code>{hint?.output ?? "src-tauri/target/release/bundle/"}</code>
                      </p>
                    )}
                  </div>
                  <div className="installer-row-actions">
                    {item.available ? (
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => void saveOneInstaller(item)}
                      >
                        Save file…
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            void writeText(CLONE_URL).then(
                              () => onToast("Clone URL copied"),
                              (err) => onToast(err instanceof Error ? err.message : String(err)),
                            )
                          }
                        >
                          Copy clone URL
                        </button>
                        <button
                          type="button"
                          className="subtle"
                          onClick={() => void openUrl(BUILD_GUIDE_URL)}
                        >
                          Open build guide
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="update-actions">
            {about && (
              <button type="button" className="subtle" onClick={() => void openUrl(about.releasesUrl)}>
                Open GitHub releases
              </button>
            )}
            <button type="button" className="subtle" onClick={() => void openUrl(BUILD_GUIDE_URL)}>
              Open build guide
            </button>
          </div>

          <h3 className="about-h">Cloud backup</h3>
          <p className="muted tiny">
            Only the encrypted <code>.vault</code> file is copied. Use a Google Drive folder (Drive for Desktop) and/or
            upload to Drive on the internet. Auto-backup runs after you save entries.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={autoBackup}
              onChange={(e) => setAutoBackup(e.target.checked)}
            />
            Automatically push after each save
          </label>
          <label>
            Backup folder (Drive Desktop / disk)
            <div className="row-split">
              <input
                value={backupFolder}
                onChange={(e) => setBackupFolder(e.target.value)}
                placeholder="~/Library/CloudStorage/GoogleDrive-…/My Drive/SecretVault"
              />
              <button type="button" className="ghost" onClick={() => void pickFolder()}>
                Choose…
              </button>
            </div>
          </label>
          <label>
            Google Drive folder URL or id
            <input
              value={driveFolderUrl}
              onChange={(e) => setDriveFolderUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/…"
            />
          </label>
          <label>
            OAuth Desktop client ID
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="….apps.googleusercontent.com"
            />
          </label>
          <label>
            OAuth client secret (kept in Keychain, optional for some clients)
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="paste once, then Connect"
            />
          </label>
          <p className="muted tiny">
            Google Cloud Console → OAuth client type <strong>Desktop</strong>. Redirect URI:{" "}
            <code>http://127.0.0.1:17843</code>
          </p>
          <p className="muted tiny">
            Drive: {status?.driveConnected ? "connected" : "not connected"}
            {status?.lastOk ? ` · ${status.lastOk}` : ""}
            {status?.lastError ? ` · last error: ${status.lastError}` : ""}
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
          <button type="button" className="ghost" disabled={busy} onClick={() => void connectDrive()}>
            {busy ? "Working…" : "Connect Google Drive"}
          </button>
          {status?.driveConnected && (
            <button
              type="button"
              className="subtle"
              disabled={busy}
              onClick={() =>
                void (async () => {
                  await api.disconnectGoogleDrive();
                  await refreshMeta();
                  onToast("Google Drive disconnected");
                })()
              }
            >
              Disconnect
            </button>
          )}
          <button type="button" className="ghost" disabled={busy} onClick={() => void handleSaveBackup()}>
            Save settings
          </button>
          <button type="button" className="primary" disabled={busy} onClick={() => void pushNow()}>
            Push vault now
          </button>
        </div>
      </div>
    </div>
  );
}
