/** Canonical semver. Keep in sync with package.json, Cargo.toml, and tauri.conf.json. */
export const APP_VERSION = "2.5.0";

/** 2.5.0 → "2.5"; 2.5.1 stays "2.5.1". */
export function marketingVersion(raw: string | null | undefined): string {
  if (!raw) return "";
  const v = raw.replace(/^v/i, "").trim();
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (m && m[3] === "0") return `${m[1]}.${m[2]}`;
  return v;
}

/** UI mark: "v2.5" */
export function versionMark(raw: string | null | undefined = APP_VERSION): string {
  const m = marketingVersion(raw);
  return m ? `v${m}` : "";
}
