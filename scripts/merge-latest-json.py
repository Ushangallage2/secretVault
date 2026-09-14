#!/usr/bin/env python3
"""Rebuild a complete Tauri updater latest.json from GitHub Release assets.

Each matrix build previously uploaded its own latest.json and overwrote the
others, so Intel Macs could see a file that only listed linux/windows/aarch64.
This script runs after all installer jobs and writes every platform that has
a signed updater artifact on the release.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[1]
TAURI_CONF = REPO_ROOT / "src-tauri" / "tauri.conf.json"

# Prefer updater tarballs/zips over the raw installers when both exist.
ARTIFACT_KIND_SCORE = {
    "app": 100,
    "appimage": 100,
    "msi": 90,
    "nsis": 80,
    "deb": 70,
    "rpm": 60,
}

# Unsuffixed `{os}-{arch}` keys follow tauri-action: AppImage on Linux, MSI on Windows.
PRIMARY_KIND_SCORE = {
    ("darwin", "app"): 100,
    ("linux", "appimage"): 100,
    ("linux", "deb"): 50,
    ("linux", "rpm"): 40,
    ("windows", "msi"): 100,
    ("windows", "nsis"): 90,
}


def die(message: str, code: int = 1) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(code)


def read_app_version() -> str:
    conf = json.loads(TAURI_CONF.read_text(encoding="utf-8"))
    version = str(conf.get("version", "")).strip()
    if not version:
        die(f"no version in {TAURI_CONF}")
    return version.lstrip("v")


def resolve_tag(app_version: str) -> str:
    explicit = os.environ.get("RELEASE_TAG", "").strip()
    if explicit:
        return explicit if explicit.startswith("v") else f"v{explicit}"
    ref = os.environ.get("GITHUB_REF", "")
    ref_name = os.environ.get("GITHUB_REF_NAME", "")
    if ref.startswith("refs/tags/"):
        tag = ref_name or ref.rsplit("/", 1)[-1]
        return tag if tag.startswith("v") else f"v{tag}"
    return f"v{app_version}"


def repo_slug() -> str:
    return os.environ.get("GITHUB_REPOSITORY") or os.environ.get("GH_REPO") or ""


def ensure_gh_token() -> None:
    if os.environ.get("GH_TOKEN"):
        return
    github_token = os.environ.get("GITHUB_TOKEN")
    if github_token:
        os.environ["GH_TOKEN"] = github_token
        return
    die("GH_TOKEN (or GITHUB_TOKEN) is required")


def run_gh(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["gh", *args],
        check=False,
        capture_output=True,
        text=True,
        env=os.environ.copy(),
    )


def classify_artifact(name: str) -> tuple[str, str] | None:
    """Return (os, bundle_kind) for a signed updater artifact name."""
    n = name.lower()
    if n.endswith(".sig") or n == "latest.json":
        return None
    if n.endswith(".app.tar.gz"):
        return "darwin", "app"
    if n.endswith(".appimage.tar.gz") or n.endswith(".appimage"):
        return "linux", "appimage"
    if n.endswith(".deb"):
        return "linux", "deb"
    if n.endswith(".rpm"):
        return "linux", "rpm"
    if n.endswith(".nsis.zip") or n.endswith("-setup.exe"):
        return "windows", "nsis"
    if n.endswith(".msi.zip") or n.endswith(".msi"):
        return "windows", "msi"
    return None


def arch_from_name(name: str) -> str | None:
    n = name.lower()
    if "universal" in n:
        return "universal"
    if "aarch64" in n or "arm64" in n:
        return "aarch64"
    if "x86_64" in n or "amd64" in n:
        return "x86_64"
    if "_x64." in n or "_x64-" in n or n.endswith("_x64") or ".x64." in n or "_x64_" in n:
        return "x86_64"
    if "i686" in n or "_x86." in n:
        return "i686"
    if "x64" in n:
        return "x86_64"
    return None


def artifact_quality(name: str, kind: str) -> int:
    n = name.lower()
    score = ARTIFACT_KIND_SCORE.get(kind, 0)
    # Prefer the updater wrappers Tauri signs (tar.gz / zip) over raw installers.
    if n.endswith(".app.tar.gz"):
        score += 20
    elif n.endswith(".appimage.tar.gz"):
        score += 20
    elif n.endswith(".nsis.zip") or n.endswith(".msi.zip"):
        score += 20
    elif n.endswith(".appimage") or n.endswith(".exe") or n.endswith(".msi"):
        score -= 20
    return score


def platform_keys(os_name: str, arch: str, kind: str) -> list[str]:
    arches = ["x86_64", "aarch64"] if arch == "universal" else [arch]
    keys: list[str] = []
    for item in arches:
        keys.append(f"{os_name}-{item}-{kind}")
    return keys


def primary_key(os_name: str, arch: str) -> str:
    return f"{os_name}-{arch}"


def fetch_release(tag: str, repo: str) -> dict:
    last_error = ""
    for attempt in range(1, 6):
        result = run_gh(
            ["release", "view", tag, "--repo", repo, "--json", "assets,tagName,body,publishedAt,name"],
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
        last_error = (result.stderr or result.stdout).strip()
        print(f"waiting for release {tag} (attempt {attempt}/5): {last_error}", file=sys.stderr)
        if attempt < 5:
            time.sleep(8)
    die(f"could not load GitHub Release {tag} from {repo}: {last_error}")
    raise AssertionError("unreachable")


def download_signatures(tag: str, repo: str, dest: Path) -> None:
    result = run_gh(
        ["release", "download", tag, "--repo", repo, "--pattern", "*.sig", "--dir", str(dest), "--clobber"],
    )
    if result.returncode != 0:
        die(f"failed to download .sig files from {tag}: {(result.stderr or result.stdout).strip()}")


def build_platforms(assets: Iterable[dict], sig_dir: Path) -> dict[str, dict[str, str]]:
    sig_files = {path.name: path for path in sig_dir.glob("*.sig")}
    candidates: list[tuple[int, str, str, str, str, str]] = []
    # quality, os, arch, kind, url, signature

    for asset in assets:
        name = asset.get("name") or ""
        url = asset.get("url") or ""
        classified = classify_artifact(name)
        if not classified or not url:
            continue
        os_name, kind = classified
        arch = arch_from_name(name)
        if not arch:
            print(f"skip {name}: could not detect architecture", file=sys.stderr)
            continue
        sig_path = sig_files.get(f"{name}.sig")
        if sig_path is None:
            print(f"skip {name}: no matching .sig on the release", file=sys.stderr)
            continue
        signature = sig_path.read_text(encoding="utf-8").strip()
        if not signature:
            print(f"skip {name}: empty signature file", file=sys.stderr)
            continue
        quality = artifact_quality(name, kind)
        candidates.append((quality, os_name, arch, kind, url, signature))
        print(f"found {name} -> {os_name}-{arch}-{kind} (score {quality})")

    candidates.sort(key=lambda item: item[0], reverse=True)
    platforms: dict[str, dict[str, str]] = {}
    primary: dict[str, tuple[int, dict[str, str]]] = {}

    for _quality, os_name, arch, kind, url, signature in candidates:
        payload = {"signature": signature, "url": url}
        for key in platform_keys(os_name, arch, kind):
            if key not in platforms:
                platforms[key] = payload
        arches = ["x86_64", "aarch64"] if arch == "universal" else [arch]
        kind_score = PRIMARY_KIND_SCORE.get((os_name, kind), 0)
        # Universal fills unsuffixed keys only when a native build did not.
        if arch == "universal":
            kind_score -= 10
        for item in arches:
            key = primary_key(os_name, item)
            previous = primary.get(key)
            if previous is None or kind_score > previous[0]:
                primary[key] = (kind_score, payload)

    for key, (_score, payload) in primary.items():
        platforms[key] = payload

    return platforms


def write_latest_json(
    version: str,
    notes: str,
    pub_date: str,
    platforms: dict[str, dict[str, str]],
    dest: Path,
) -> Path:
    if not platforms:
        die("no signed updater artifacts found on the release")
    document = {
        "version": version,
        "notes": notes,
        "pub_date": pub_date,
        "platforms": dict(sorted(platforms.items())),
    }
    dest.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    print("platforms:")
    for key, value in document["platforms"].items():
        print(f"  {key}: {value['url']}")
    expected = (
        "darwin-x86_64",
        "darwin-x86_64-app",
        "darwin-aarch64",
        "darwin-aarch64-app",
        "linux-x86_64",
        "windows-x86_64",
    )
    missing = [key for key in expected if key not in platforms]
    if missing:
        print(f"warning: missing platform keys {missing} (a matrix job may have failed)", file=sys.stderr)
    return dest


def upload_latest_json(tag: str, repo: str, path: Path) -> None:
    result = run_gh(
        ["release", "upload", tag, str(path), "--repo", repo, "--clobber"],
    )
    if result.returncode != 0:
        die(f"gh release upload failed: {(result.stderr or result.stdout).strip()}")
    print(f"uploaded {path.name} to {tag}")


def self_test() -> None:
    cases = [
        ("Secret.Vault_x64.app.tar.gz", ("darwin", "app"), "x86_64"),
        ("Secret.Vault_aarch64.app.tar.gz", ("darwin", "app"), "aarch64"),
        ("Secret.Vault_0.2.4_amd64.AppImage.tar.gz", ("linux", "appimage"), "x86_64"),
        ("Secret.Vault_0.2.4_amd64.deb", ("linux", "deb"), "x86_64"),
        ("Secret.Vault-0.2.4-1.x86_64.rpm", ("linux", "rpm"), "x86_64"),
        ("Secret.Vault_0.2.4_x64-setup.nsis.zip", ("windows", "nsis"), "x86_64"),
        ("Secret.Vault_0.2.4_x64_en-US.msi.zip", ("windows", "msi"), "x86_64"),
    ]
    for name, expected_class, expected_arch in cases:
        got_class = classify_artifact(name)
        got_arch = arch_from_name(name)
        assert got_class == expected_class, f"{name}: {got_class} != {expected_class}"
        assert got_arch == expected_arch, f"{name}: {got_arch} != {expected_arch}"
        os_name, kind = expected_class
        keys = set(platform_keys(os_name, expected_arch, kind))
        if os_name == "darwin":
            assert f"darwin-{expected_arch}" not in keys
            assert f"darwin-{expected_arch}-app" in keys

    with tempfile.TemporaryDirectory(prefix="sv-latest-self-test-") as tmp:
        sig_dir = Path(tmp)
        names = [
            "Secret.Vault_x64.app.tar.gz",
            "Secret.Vault_aarch64.app.tar.gz",
            "Secret.Vault_0.2.4_amd64.AppImage.tar.gz",
            "Secret.Vault_0.2.4_amd64.deb",
            "Secret.Vault-0.2.4-1.x86_64.rpm",
            "Secret.Vault_0.2.4_x64-setup.nsis.zip",
            "Secret.Vault_0.2.4_x64_en-US.msi.zip",
            "Secret.Vault_0.2.4_x64.dmg",
        ]
        assets = []
        for name in names:
            (sig_dir / f"{name}.sig").write_text(f"sig-for-{name}\n", encoding="utf-8")
            assets.append({"name": name, "url": f"https://example.test/{name}"})
        platforms = build_platforms(assets, sig_dir)
        for key in (
            "darwin-x86_64",
            "darwin-x86_64-app",
            "darwin-aarch64",
            "darwin-aarch64-app",
            "linux-x86_64",
            "linux-x86_64-appimage",
            "linux-x86_64-deb",
            "linux-x86_64-rpm",
            "windows-x86_64",
            "windows-x86_64-nsis",
            "windows-x86_64-msi",
        ):
            assert key in platforms, f"missing {key}: {sorted(platforms)}"
        assert platforms["linux-x86_64"]["url"].endswith(".AppImage.tar.gz")
        assert platforms["windows-x86_64"]["url"].endswith(".msi.zip")
        assert "Secret.Vault_0.2.4_x64.dmg" not in {
            item["url"].rsplit("/", 1)[-1] for item in platforms.values()
        }
    print("self-test ok")


def main(argv: list[str]) -> None:
    if "--self-test" in argv:
        self_test()
        return

    ensure_gh_token()
    app_version = read_app_version()
    tag = resolve_tag(app_version)
    repo = repo_slug()
    if not repo:
        die("GITHUB_REPOSITORY or GH_REPO is required")

    print(f"rebuilding latest.json for {repo} {tag} (app version {app_version})")
    release = fetch_release(tag, repo)
    notes = (release.get("body") or "").strip() or f"Secret Vault {app_version}"
    pub_date = release.get("publishedAt") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    assets = release.get("assets") or []

    with tempfile.TemporaryDirectory(prefix="sv-latest-") as tmp:
        work = Path(tmp)
        download_signatures(tag, repo, work)
        platforms = build_platforms(assets, work)
        path = write_latest_json(app_version, notes, pub_date, platforms, work / "latest.json")
        upload_latest_json(tag, repo, path)


if __name__ == "__main__":
    main(sys.argv[1:])
