# Secret Vault

A personal **macOS desktop vault** for passwords, API tokens, terminal commands, and notes — kept in one encrypted file you control.

Built with **Tauri 2 + React**. No cloud account required. Your data never leaves the machine unless you copy the `.vault` file yourself.

---

## Why this exists

Dev and ops work often ends up as messy text dumps: curl recipes, DB users, VPN logins, Maven/Tomcat shortcuts, recovery codes — plus Jasper report files. Secret Vault turns that into a searchable, filterable app:

| Type | For |
|------|-----|
| **Secret** | Usernames, passwords, tokens, VPN, recovery codes |
| **Command** | Shell, curl, SQL, build/deploy recipes you reuse |
| **Note** | How-tos, config sheets, labels, snippets |
| **Jasper** | `.jrxml` / `.jasper` reports (special preview + export) |
| **File** | Any other file kept inside the encrypted vault |

One master password unlocks everything. Export is just a copy of the encrypted file — move it to another Mac and unlock with the same password.

---

## Features

- Encrypted vault file (AES-256-GCM + Argon2id)
- Entry types: Secret · Command · Note · **Jasper** · **File**
- Search, favorites, type filters, tag dropdown
- Copy to clipboard (clears after ~30s)
- Auto-lock after idle
- Optional **Stay signed in** via macOS Keychain (no password on every launch)
- Sidebar **Log out** locks the session and returns to the unlock screen (stay signed in still applies on the next launch unless you turn it off)
- **Cloud backup** of the encrypted `.vault` (folder / Google Drive, auto or manual)
- **About** with version, “developed by Ushan Gallage”, sharing installers, and **current vs pending update** from GitHub Releases
- Import plain text / scratchpad files with review before save
- Export Jasper / other attached files back to disk
- Glassy dark UI

---

## Quick start

### Prerequisites (once)

```bash
# Node.js 20+ recommended
brew install node
# or use any Node install on your PATH

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Xcode Command Line Tools (if missing)
xcode-select --install
```

### Develop

```bash
git clone https://github.com/Ushangallage2/secretVault.git
cd secretVault
npm install
npm run tauri dev
```

### Build a macOS app

```bash
npm run tauri build
```

The app bundle appears under:

`src-tauri/target/release/bundle/macos/Secret Vault.app`

---

## First-time use

1. **Create vault** → choose a path such as `~/Documents/secret-vault.vault`
2. Set a **strong master password** (8+ characters). There is **no recovery** if you forget it.
3. Optionally check **Stay signed in on this Mac**
4. Add secrets / commands / notes, or use **Import files…**

On another computer: install/build the app → **Unlock** → open the same `.vault` file → enter the same master password.

---

## Backup & About

Sidebar → **About & backup**. The screen shows this app **version** and **developed by Ushan Gallage**.

### Encrypted internet / folder backup

Only the encrypted `.vault` file is copied — never the master password. Google OAuth **refresh tokens stay in the OS Keychain**, not inside the vault.

You can use either destination, or both:

1. **Local / Drive Desktop folder** — Choose a folder on disk. A **Google Drive for Desktop** path (for example `~/Library/CloudStorage/GoogleDrive-…/My Drive/SecretVault`) works: the file is copied there and Drive syncs it to the internet.
2. **Google Drive upload** — Connect an OAuth **Desktop** client so the app can upload even when Drive Desktop is not installed:
   - [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → create an OAuth client of type **Desktop app**
   - Enable the **Google Drive API**
   - Authorized redirect URI: `http://127.0.0.1:17843`
   - Paste the client ID (and client secret if Google issued one) in About & backup, then **Connect Google Drive**
   - Paste a Drive **folder URL** (or folder id)

**Push vault now** copies immediately. Turn on **Automatically push after each save** to copy after you save, delete, or import entries.

### Sharing this version’s installers

About can save installers that match this version for another person:

- macOS `.dmg`
- Linux installer (`.deb` / AppImage)
- Windows `.exe`

Place built files in `src-tauri/installers/` before bundling (Tauri names such as `Secret Vault_0.2.0_aarch64.dmg` are recognized), or attach them to the GitHub Release for this version (`v0.2.0`, etc.). Pushing `main` runs `.github/workflows/tauri-release.yml` (Linux, Windows, macOS via `tauri-action`). A Mac build will **not** contain fake `.deb` / `.exe` files — if Share shows none, build on that OS (below) or wait for Actions.

### App updates after you push

Installed copies do **not** hot-patch from a source push. Publish a new version like this:

1. Bump the same version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` (for example `0.2.0` → `0.2.1`).
2. Push `main`. GitHub Actions builds installers and publishes **GitHub Release** `v0.2.1`.
3. An already-installed app checks `https://api.github.com/repos/Ushangallage2/secretVault/releases/latest` (no `gh` token). If that release is newer, About and a banner show **Current version** vs **Pending version to download**, with **Download update**.

Do not bump the version on every docs-only commit — only when you want users to be offered a new installer.

Signed in-place auto-install (Tauri updater + minisign) is optional later: generate a keypair with `npm run tauri signer generate`, put **only the public key** in the repo, and store the private key as GitHub secret `TAURI_SIGNING_PRIVATE_KEY`. Never commit the private key. Until that is wired, Download update saves the GitHub Release installer.

---

## Build installers yourself

Authentic Windows `.exe` / `.msi` and Linux `.deb` / AppImage files have to be produced **on that OS** (or by GitHub Actions). This Mac app does not ship stand-ins.

Node 20+ and Rust are required. The version you get is the version in the clone (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`).

```bash
git clone https://github.com/Ushangallage2/secretVault.git
cd secretVault
npm install
npm run tauri build
```

| OS | Typical output under `src-tauri/target/release/bundle/` |
|----|---------------------------------------------------------|
| macOS | `dmg/*.dmg` and `macos/Secret Vault.app` |
| Linux | `deb/*.deb` and `appimage/*.AppImage` |
| Windows | `nsis/*-setup.exe` and `msi/*.msi` |

Linux also needs WebKitGTK (for example `libwebkit2gtk-4.1-dev` on Ubuntu). Pushing `main` runs the same builds in `.github/workflows/tauri-release.yml` when Actions runners are available.

---

## Security (honest summary)

| Safe against | Not magic against |
|--------------|-------------------|
| Someone stealing the `.vault` file without your password | Weak master passwords (offline guessing) |
| Accidental plaintext notes on disk (when locked) | Anyone already logged into your Mac if “Stay signed in” is on |

- Do **not** commit `*.vault` files to git
- Prefer a unique, long master password
- This is a personal local tool, not an audited enterprise password manager

More detail: [docs/GUIDE.md](docs/GUIDE.md)

---

## Project layout

```
src/                 React UI
src-tauri/src/       Rust: crypto, vault I/O, import, Keychain
docs/                User & developer guides
*.vault              Your encrypted data (gitignored)
```

---

## License

Personal / open use — see repository settings. Contributions welcome via pull request.
