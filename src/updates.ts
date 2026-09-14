import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export async function installUpdateAndRestart(
  onStatus?: (message: string) => void,
): Promise<void> {
  onStatus?.("Checking for a signed update…");
  let update;
  try {
    update = await check();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `In-place update is not available yet (${detail}). Download the installer instead, or wait until GitHub Actions has signed this release.`,
    );
  }
  if (!update) {
    throw new Error(
      "No signed in-place update is available. This copy is already current, or the GitHub release is not signed yet — use Download update.",
    );
  }
  onStatus?.("Updating… restarting");
  await update.downloadAndInstall();
  await relaunch();
}
