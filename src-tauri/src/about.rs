//! App identity and installer files for this version (macOS / Linux / Windows).

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const DEVELOPER: &str = "Ushan Gallage";
pub const GITHUB_REPO: &str = "Ushangallage2/secretVault";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppAbout {
    pub name: String,
    pub version: String,
    pub developer: String,
    pub repo_url: String,
    pub releases_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallerInfo {
    pub id: String,
    pub label: String,
    pub filename: String,
    pub available: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    pub latest: Option<String>,
    pub pending: bool,
    pub download_url: Option<String>,
    pub filename: Option<String>,
    pub notes: Option<String>,
    pub html_url: Option<String>,
    pub status: String,
    pub error: Option<String>,
}

pub fn about() -> AppAbout {
    let version = env!("CARGO_PKG_VERSION").to_string();
    AppAbout {
        name: "Secret Vault".into(),
        version: version.clone(),
        developer: DEVELOPER.into(),
        repo_url: format!("https://github.com/{GITHUB_REPO}"),
        releases_url: format!("https://github.com/{GITHUB_REPO}/releases/tag/v{version}"),
    }
}

/// 2.5.0 → "2.5" for the window title and in-app mark.
pub fn marketing_version(raw: &str) -> String {
    let v = strip_v(raw);
    let parts: Vec<&str> = v.split('.').collect();
    if parts.len() == 3 && parts[2] == "0" {
        format!("{}.{}", parts[0], parts[1])
    } else {
        v.to_string()
    }
}

pub fn window_title() -> String {
    format!(
        "Secret Vault v{}",
        marketing_version(env!("CARGO_PKG_VERSION"))
    )
}

pub fn list_installers(resource_dir: Option<PathBuf>) -> Vec<InstallerInfo> {
    let dirs = search_dirs(resource_dir);
    let version = env!("CARGO_PKG_VERSION");
    let specs = [
        (
            "macos-intel",
            "macOS Intel (.dmg)",
            format!("Secret.Vault_{version}_x64.dmg"),
        ),
        (
            "macos-arm",
            "macOS Apple Silicon (.dmg)",
            format!("Secret.Vault_{version}_aarch64.dmg"),
        ),
        (
            "linux",
            "Linux installer (.deb / AppImage)",
            format!("Secret-Vault_{version}_linux.deb"),
        ),
        (
            "windows",
            "Windows (.exe)",
            format!("Secret-Vault_{version}_windows.exe"),
        ),
    ];

    let github = github_assets();

    specs
        .into_iter()
        .map(|(id, label, filename)| {
            if let Some(local) = find_local_in(&dirs, id) {
                return InstallerInfo {
                    id: id.into(),
                    label: label.into(),
                    filename: local
                        .file_name()
                        .map(|s| s.to_string_lossy().into_owned())
                        .unwrap_or(filename),
                    available: true,
                    source: format!("bundled: {}", local.display()),
                };
            }
            if let Some(asset) = match_github(id, &github) {
                return InstallerInfo {
                    id: id.into(),
                    label: label.into(),
                    filename: asset.name.clone(),
                    available: true,
                    source: "GitHub Releases".into(),
                };
            }
            InstallerInfo {
                id: id.into(),
                label: label.into(),
                filename,
                available: false,
                source: match id {
                    "linux" => "No real .deb on this copy — build on Linux (or wait for GitHub Actions). Fake installers are not shipped.",
                    "windows" => "No real .exe on this copy — build on Windows (or wait for GitHub Actions). Fake installers are not shipped.",
                    "macos-intel" => "Intel Mac .dmg is published on GitHub Releases after Actions finishes (Secret.Vault_*_x64.dmg).",
                    "macos-arm" => "Apple Silicon .dmg is published on GitHub Releases after Actions finishes (Secret.Vault_*_aarch64.dmg).",
                    _ => "No real macOS .dmg on this copy — run npm run tauri build on a Mac.",
                }
                .into(),
            }
        })
        .collect()
}

pub fn save_installer(resource_dir: Option<PathBuf>, kind: &str, dest: &Path) -> Result<String, String> {
    let dirs = search_dirs(resource_dir);
    if let Some(local) = find_local_in(&dirs, kind) {
        fs::copy(&local, dest).map_err(|e| format!("copy installer: {e}"))?;
        return Ok(format!("Saved {}", dest.display()));
    }
    let assets = github_assets();
    let asset = match_github(kind, &assets)
        .ok_or_else(|| {
            format!(
                "No {kind} installer for v{} yet. Publish it on GitHub Releases: https://github.com/{GITHUB_REPO}/releases",
                env!("CARGO_PKG_VERSION")
            )
        })?;
    download(&asset.browser_download_url, dest)?;
    Ok(format!("Downloaded {}", dest.display()))
}

fn search_dirs(resource_dir: Option<PathBuf>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(d) = resource_dir {
        dirs.push(d.join("installers"));
        dirs.push(d);
    }
    dirs.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("installers"));
    dirs.push(PathBuf::from("installers"));
    dirs.push(PathBuf::from("src-tauri/installers"));
    dirs
}

fn find_local_in(dirs: &[PathBuf], kind: &str) -> Option<PathBuf> {
    for dir in dirs {
        if let Some(found) = find_local(dir, kind) {
            return Some(found);
        }
    }
    None
}

fn find_local(dir: &Path, kind: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    let matches: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .filter(|p| {
            p.file_name()
                .map(|n| match_kind(kind, &n.to_string_lossy()))
                .unwrap_or(false)
        })
        .collect();
    let cpu = match kind {
        "macos-intel" => CpuFamily::Intel,
        "macos-arm" => CpuFamily::AppleSilicon,
        _ => host_cpu(),
    };
    pick_local(kind, matches, cpu)
}

fn pick_local(kind: &str, matches: Vec<PathBuf>, cpu: CpuFamily) -> Option<PathBuf> {
    if kind == "macos" || kind == "macos-intel" || kind == "macos-arm" {
        for ext in preferred_exts("macos") {
            let mut ranked: Vec<(u8, PathBuf)> = matches
                .iter()
                .filter_map(|p| {
                    let name = p.file_name()?.to_string_lossy();
                    if !name.to_lowercase().ends_with(ext) {
                        return None;
                    }
                    macos_compat_rank(&name, cpu).map(|rank| (rank, p.clone()))
                })
                .collect();
            ranked.sort_by(|(r1, p1), (r2, p2)| r1.cmp(r2).then(p1.cmp(p2)));
            if let Some((_, path)) = ranked.into_iter().next() {
                return Some(path);
            }
        }
        return None;
    }
    let mut matches = matches;
    matches.sort();
    matches.pop()
}

fn is_noise_name(n: &str) -> bool {
    n.contains("readme")
        || n.contains("source code")
        || n.ends_with(".txt")
        || n.ends_with(".md")
        || n.ends_with(".sig")
        || n.ends_with(".blockmap")
        || n.ends_with(".json")
        || n.ends_with(".ds_store")
}

fn match_kind(kind: &str, name: &str) -> bool {
    let n = name.to_lowercase();
    if is_noise_name(&n) {
        return false;
    }
    match kind {
        "macos" | "macos-intel" | "macos-arm" => {
            n.ends_with(".dmg")
                || n.ends_with(".app.tar.gz")
                || n.ends_with(".app.zip")
                || n.contains("macos")
                || n.contains("darwin")
                || (n.contains("aarch64") && n.ends_with(".dmg"))
                || (n.contains("universal") && n.ends_with(".dmg"))
        }
        "linux" => {
            n.ends_with(".deb")
                || n.ends_with(".rpm")
                || n.ends_with(".appimage")
                || n.contains("linux")
        }
        "windows" => {
            n.ends_with(".exe")
                || n.ends_with(".msi")
                || n.contains("windows")
                || (n.contains("setup") && (n.ends_with(".exe") || n.ends_with(".msi")))
                || n.contains("nsis")
        }
        _ => false,
    }
}

fn current_kind() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "windows"
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CpuFamily {
    Intel,
    AppleSilicon,
    Other,
}

fn host_cpu() -> CpuFamily {
    if cfg!(target_arch = "x86_64") {
        CpuFamily::Intel
    } else if cfg!(target_arch = "aarch64") {
        CpuFamily::AppleSilicon
    } else {
        CpuFamily::Other
    }
}

fn macos_compat_rank(name: &str, cpu: CpuFamily) -> Option<u8> {
    let n = name.to_lowercase();
    let universal = n.contains("universal");
    let apple = n.contains("aarch64") || n.contains("arm64");
    let intel = n.contains("x86_64") || n.contains("x64");
    match cpu {
        CpuFamily::Intel => {
            // Never hand an Apple Silicon–only build to an Intel Mac.
            if apple && !universal {
                return None;
            }
            Some(if intel {
                0
            } else if universal {
                1
            } else {
                2
            })
        }
        CpuFamily::AppleSilicon => {
            // Don't pick an Intel-only x64.dmg on Apple Silicon.
            if intel && !universal {
                return None;
            }
            Some(if apple {
                0
            } else if universal {
                1
            } else {
                2
            })
        }
        CpuFamily::Other => Some(if universal { 1 } else { 2 }),
    }
}

fn strip_v(s: &str) -> &str {
    s.trim().trim_start_matches(|c: char| c == 'v' || c == 'V')
}

fn parse_version(s: &str) -> Option<[u64; 3]> {
    let mut parts = strip_v(s).split(|c: char| c == '.' || c == '-');
    let mut out = [0u64; 3];
    for slot in &mut out {
        let raw = parts.next()?;
        let digits: String = raw.chars().take_while(|c| c.is_ascii_digit()).collect();
        if digits.is_empty() {
            return None;
        }
        *slot = digits.parse().ok()?;
    }
    Some(out)
}

fn version_gt(a: &str, b: &str) -> bool {
    match (parse_version(a), parse_version(b)) {
        (Some(left), Some(right)) => left > right,
        _ => false,
    }
}

pub fn check_for_update() -> UpdateInfo {
    let current = env!("CARGO_PKG_VERSION").to_string();
    match fetch_latest_release() {
        Err(error) => UpdateInfo {
            current,
            latest: None,
            pending: false,
            download_url: None,
            filename: None,
            notes: None,
            html_url: None,
            status: "error".into(),
            error: Some(error),
        },
        Ok(None) => UpdateInfo {
            current,
            latest: None,
            pending: false,
            download_url: None,
            filename: None,
            notes: None,
            html_url: Some(format!("https://github.com/{GITHUB_REPO}/releases")),
            status: "noRelease".into(),
            error: None,
        },
        Ok(Some(rel)) => {
            let latest = strip_v(&rel.tag_name).to_string();
            let pending = version_gt(&latest, &current);
            let asset = if pending {
                match_github(current_kind(), &rel.assets)
            } else {
                None
            };
            UpdateInfo {
                current,
                latest: Some(latest),
                pending,
                download_url: asset.map(|a| a.browser_download_url.clone()),
                filename: asset.map(|a| a.name.clone()),
                notes: rel.body.filter(|s| !s.trim().is_empty()),
                html_url: if rel.html_url.is_empty() {
                    None
                } else {
                    Some(rel.html_url)
                },
                status: if pending {
                    "pending".into()
                } else {
                    "upToDate".into()
                },
                error: None,
            }
        }
    }
}

pub fn download_pending_update(dest: &Path) -> Result<String, String> {
    let info = check_for_update();
    if !info.pending {
        return Err("No pending update. This copy is already the latest published version.".into());
    }
    let url = info
        .download_url
        .ok_or_else(|| {
            format!(
                "Version {} is published, but no installer for this computer is on the GitHub release yet.",
                info.latest.unwrap_or_default()
            )
        })?;
    download(&url, dest)?;
    Ok(format!("Saved {}", dest.display()))
}

#[cfg(test)]
mod tests {
    use super::{
        marketing_version, match_github_for_arch, match_kind, macos_compat_rank, pick_local,
        version_gt, window_title, CpuFamily, GhAsset,
    };
    use std::path::PathBuf;

    fn assets(names: &[&str]) -> Vec<GhAsset> {
        names
            .iter()
            .map(|name| GhAsset {
                name: (*name).into(),
                browser_download_url: format!(
                    "https://github.com/Ushangallage2/secretVault/releases/download/v0.2.1/{name}"
                ),
            })
            .collect()
    }

    /// GitHub’s v0.2.1 listing: aarch64.dmg is first, then x64.dmg.
    fn v021_release_assets() -> Vec<GhAsset> {
        assets(&[
            "Secret.Vault-0.2.1-1.x86_64.rpm",
            "Secret.Vault_0.2.1_aarch64.dmg",
            "Secret.Vault_0.2.1_amd64.AppImage",
            "Secret.Vault_0.2.1_amd64.deb",
            "Secret.Vault_0.2.1_x64-setup.exe",
            "Secret.Vault_0.2.1_x64.dmg",
            "Secret.Vault_0.2.1_x64_en-US.msi",
            "Secret.Vault_aarch64.app.tar.gz",
            "Secret.Vault_x64.app.tar.gz",
        ])
    }

    #[test]
    fn matches_tauri_bundle_names() {
        assert!(match_kind("macos", "Secret Vault_0.2.0_aarch64.dmg"));
        assert!(match_kind("macos", "Secret-Vault_0.2.0_macos.dmg"));
        assert!(match_kind("linux", "secret-vault_0.2.0_amd64.deb"));
        assert!(match_kind("linux", "secret-vault_0.2.0_amd64.AppImage"));
        assert!(match_kind("windows", "Secret Vault_0.2.0_x64-setup.exe"));
        assert!(match_kind("windows", "Secret Vault_0.2.0_x64_en-US.msi"));
        assert!(!match_kind("macos", "README.txt"));
        assert!(!match_kind("linux", "latest.json"));
    }

    #[test]
    fn marketing_version_drops_trailing_zero_patch() {
        assert_eq!(marketing_version("2.5.0"), "2.5");
        assert_eq!(marketing_version("v2.5.0"), "2.5");
        assert_eq!(marketing_version("2.5.1"), "2.5.1");
        assert_eq!(window_title(), "Secret Vault v2.6.5");
    }

    #[test]
    fn compares_release_versions() {
        assert!(version_gt("2.5.0", "0.2.5"));
        assert!(version_gt("0.3.0", "0.2.0"));
        assert!(version_gt("v0.2.1", "0.2.0"));
        assert!(!version_gt("0.2.0", "0.2.0"));
        assert!(!version_gt("0.2.0", "0.3.0"));
        assert!(!version_gt("not-a-version", "0.2.0"));
    }

    #[test]
    fn intel_mac_prefers_x64_dmg_even_when_aarch64_listed_first() {
        let list = v021_release_assets();
        let picked = match_github_for_arch("macos", &list, CpuFamily::Intel).unwrap();
        assert_eq!(picked.name, "Secret.Vault_0.2.1_x64.dmg");
        assert!(!picked.name.to_lowercase().contains("aarch64"));
        assert!(!picked.name.to_lowercase().contains("arm64"));
    }

    #[test]
    fn apple_silicon_prefers_aarch64_dmg() {
        let list = v021_release_assets();
        let picked = match_github_for_arch("macos", &list, CpuFamily::AppleSilicon).unwrap();
        assert_eq!(picked.name, "Secret.Vault_0.2.1_aarch64.dmg");
    }

    #[test]
    fn share_rows_split_intel_and_apple_silicon() {
        let list = v021_release_assets();
        let intel = match_github_for_arch("macos-intel", &list, CpuFamily::Other).unwrap();
        let arm = match_github_for_arch("macos-arm", &list, CpuFamily::Other).unwrap();
        assert_eq!(intel.name, "Secret.Vault_0.2.1_x64.dmg");
        assert_eq!(arm.name, "Secret.Vault_0.2.1_aarch64.dmg");
    }

    #[test]
    fn intel_mac_prefers_x86_64_dmg_over_aarch64() {
        let list = assets(&[
            "Secret.Vault_0.2.2_aarch64.dmg",
            "Secret.Vault_0.2.2_x86_64.dmg",
        ]);
        let picked = match_github_for_arch("macos", &list, CpuFamily::Intel).unwrap();
        assert_eq!(picked.name, "Secret.Vault_0.2.2_x86_64.dmg");
    }

    #[test]
    fn apple_silicon_prefers_arm64_dmg() {
        let list = assets(&[
            "Secret.Vault_0.2.2_x64.dmg",
            "Secret.Vault_0.2.2_arm64.dmg",
        ]);
        let picked = match_github_for_arch("macos", &list, CpuFamily::AppleSilicon).unwrap();
        assert_eq!(picked.name, "Secret.Vault_0.2.2_arm64.dmg");
    }

    #[test]
    fn intel_mac_never_picks_aarch64_only_dmg() {
        let list = assets(&["Secret.Vault_0.2.1_aarch64.dmg", "Secret.Vault_aarch64.app.tar.gz"]);
        assert!(match_github_for_arch("macos", &list, CpuFamily::Intel).is_none());
        assert!(macos_compat_rank("Secret.Vault_0.2.1_aarch64.dmg", CpuFamily::Intel).is_none());
    }

    #[test]
    fn apple_silicon_skips_intel_only_x64_dmg() {
        let list = assets(&["Secret.Vault_0.2.1_x64.dmg", "Secret.Vault_x64.app.tar.gz"]);
        assert!(match_github_for_arch("macos", &list, CpuFamily::AppleSilicon).is_none());
        assert!(macos_compat_rank("Secret.Vault_0.2.1_x64.dmg", CpuFamily::AppleSilicon).is_none());
    }

    #[test]
    fn universal_dmg_ok_for_intel_and_apple_silicon() {
        let list = assets(&["Secret.Vault_0.2.1_universal.dmg"]);
        let intel = match_github_for_arch("macos", &list, CpuFamily::Intel).unwrap();
        let arm = match_github_for_arch("macos", &list, CpuFamily::AppleSilicon).unwrap();
        assert_eq!(intel.name, "Secret.Vault_0.2.1_universal.dmg");
        assert_eq!(arm.name, "Secret.Vault_0.2.1_universal.dmg");
    }

    #[test]
    fn share_macos_local_picks_this_machine_arch() {
        let paths = vec![
            PathBuf::from("Secret.Vault_0.2.1_aarch64.dmg"),
            PathBuf::from("Secret.Vault_0.2.1_x64.dmg"),
        ];
        let intel = pick_local("macos", paths.clone(), CpuFamily::Intel).unwrap();
        assert_eq!(
            intel.file_name().unwrap().to_string_lossy(),
            "Secret.Vault_0.2.1_x64.dmg"
        );
        let arm = pick_local("macos", paths, CpuFamily::AppleSilicon).unwrap();
        assert_eq!(
            arm.file_name().unwrap().to_string_lossy(),
            "Secret.Vault_0.2.1_aarch64.dmg"
        );
    }
}

#[derive(Clone, serde::Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
}

#[derive(serde::Deserialize)]
struct GhRelease {
    #[serde(default)]
    tag_name: String,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    assets: Vec<GhAsset>,
}

fn github_assets() -> Vec<GhAsset> {
    let version = env!("CARGO_PKG_VERSION");
    let urls = [
        format!("https://api.github.com/repos/{GITHUB_REPO}/releases/tags/v{version}"),
        format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest"),
    ];
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("SecretVault/0.2")
        .build()
    {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    for url in urls {
        if let Ok(resp) = client
            .get(&url)
            .header("Accept", "application/vnd.github+json")
            .send()
        {
            if !resp.status().is_success() {
                continue;
            }
            if let Ok(rel) = resp.json::<GhRelease>() {
                if !rel.assets.is_empty() {
                    return rel.assets;
                }
            }
        }
    }
    Vec::new()
}

fn fetch_latest_release() -> Result<Option<GhRelease>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(format!("SecretVault/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest");
    let resp = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|e| format!("Could not reach GitHub Releases: {e}"))?;
    if resp.status().as_u16() == 404 {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(format!("GitHub Releases returned {}", resp.status()));
    }
    let rel: GhRelease = resp.json().map_err(|e| format!("Bad GitHub release JSON: {e}"))?;
    if rel.tag_name.trim().is_empty() {
        return Ok(None);
    }
    Ok(Some(rel))
}

fn preferred_exts(kind: &str) -> &'static [&'static str] {
    match kind {
        "macos" | "macos-intel" | "macos-arm" => &[".dmg", ".app.tar.gz", ".app.zip"],
        "linux" => &[".deb", ".appimage", ".rpm"],
        "windows" => &[".exe", ".msi"],
        _ => &[],
    }
}

fn is_sidecar(name: &str) -> bool {
    is_noise_name(&name.to_lowercase())
}

fn match_github<'a>(kind: &str, assets: &'a [GhAsset]) -> Option<&'a GhAsset> {
    match_github_for_arch(kind, assets, host_cpu())
}

fn match_github_for_arch<'a>(
    kind: &str,
    assets: &'a [GhAsset],
    cpu: CpuFamily,
) -> Option<&'a GhAsset> {
    let candidates: Vec<&'a GhAsset> = assets
        .iter()
        .filter(|a| !is_sidecar(&a.name) && match_kind(kind, &a.name))
        .collect();

    let cpu = match kind {
        "macos-intel" => CpuFamily::Intel,
        "macos-arm" => CpuFamily::AppleSilicon,
        _ => cpu,
    };

    if kind == "macos" || kind == "macos-intel" || kind == "macos-arm" {
        for ext in preferred_exts("macos") {
            let mut ranked: Vec<(u8, &'a GhAsset)> = candidates
                .iter()
                .copied()
                .filter(|a| a.name.to_lowercase().ends_with(ext))
                .filter_map(|a| macos_compat_rank(&a.name, cpu).map(|rank| (rank, a)))
                .collect();
            ranked.sort_by(|(r1, a1), (r2, a2)| r1.cmp(r2).then(a1.name.cmp(&a2.name)));
            if let Some((_, asset)) = ranked.into_iter().next() {
                return Some(asset);
            }
        }
        return None;
    }

    for ext in preferred_exts(kind) {
        if let Some(asset) = candidates.iter().copied().find(|a| a.name.to_lowercase().ends_with(ext)) {
            return Some(asset);
        }
    }
    candidates.into_iter().next()
}

fn download(url: &str, dest: &Path) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(180))
        .user_agent("SecretVault/0.2")
        .build()
        .map_err(|e| e.to_string())?;
    let bytes = client
        .get(url)
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .map_err(|e| e.to_string())?;
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut f = fs::File::create(dest).map_err(|e| e.to_string())?;
    f.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(())
}
