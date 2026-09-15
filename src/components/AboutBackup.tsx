import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { api, type AppAbout, type BackupStatus, type InstallerInfo, type UpdateInfo } from "../api";
import { versionMark } from "../version";
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
  "macos-intel": {
    os: "an Intel Mac",
    artifact: "Intel .dmg",
    output: "src-tauri/target/release/bundle/dmg/ (x86_64)",
  },
  "macos-arm": {
    os: "an Apple Silicon Mac",
    artifact: "Apple Silicon .dmg",
    output: "src-tauri/target/release/bundle/dmg/ (aarch64)",
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

function formatBackupTime(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

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
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

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
            {about?.name ?? "Secret Vault"}{" "}
            <strong>{versionMark(about?.version ?? update?.current) || "…"}</strong>
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
            Save a real installer when one exists (bundled file or GitHub Release). macOS is split into{" "}
            <strong>Intel</strong> and <strong>Apple Silicon</strong> — use the chip that matches the other Mac.
            Linux <code>.deb</code> and Windows <code>.exe</code> are built on those OSes (or GitHub Actions).
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
                        {hint && item.id !== "macos-intel" && item.id !== "macos-arm"
                          ? ` because it was not built on ${hint.os}`
                          : hint
                            ? ` — build on ${hint.os} or wait for GitHub Actions`
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
          <div className="backup-health">
            <p>
              <strong>Last successful push:</strong> {formatBackupTime(status?.lastOk ?? null)}
              {status?.lastDetail ? <span className="muted tiny"> — {status.lastDetail}</span> : null}
            </p>
            <p>
              <strong>Google Drive:</strong>{" "}
              {status?.driveConnected
                ? "connected"
                : status?.driveWanted
                  ? "disconnected (folder URL is set — connect OAuth)"
                  : "not connected"}
            </p>
            {status?.lastError ? (
              <p className="backup-health-error">Last failure: {status.lastError}</p>
            ) : null}
          </div>
          <p className="muted tiny">
            Only the encrypted <code>.vault</code> file is copied. Auto-backup runs after you save entries. If a push
            fails you will see a toast. For other people to use Drive OAuth, add their Gmail as a{" "}
            <strong>test user</strong> on the Google Cloud OAuth consent Audience page (or publish the app).
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
            <code>http://127.0.0.1:17843</code>. Enable Drive API. While the app is in Testing, only listed test users
            can sign in.
          </p>

          <h3 className="about-h">Change master password</h3>
          <p className="muted tiny">
            Re-encrypts this vault with a new password (8+ characters). Stay-signed-in Keychain is updated if it is on.
          </p>
          <label>
            Current password
            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
          </label>
          <label>
            New password
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </label>
          <label>
            Confirm new password
            <input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
          </label>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() =>
              void (async () => {
                if (newPw.length < 8) {
                  onToast("New password must be at least 8 characters");
                  return;
                }
                if (newPw !== newPw2) {
                  onToast("New passwords do not match");
                  return;
                }
                setBusy(true);
                try {
                  await api.changeMasterPassword(currentPw, newPw);
                  setCurrentPw("");
                  setNewPw("");
                  setNewPw2("");
                  onToast("Master password updated");
                } catch (err) {
                  onToast(err instanceof Error ? err.message : String(err));
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Update password
          </button>
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
