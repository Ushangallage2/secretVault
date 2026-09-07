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
