# Secret Vault — Guide

## Purpose

Secret Vault is a **local-first** desktop app for people who keep:

- login credentials and tokens
- reusable terminal / API commands
- short operational notes

…and want them **searchable**, **organized**, and **encrypted**, without signing up for a cloud password manager.

Typical workflow:

1. Dump old scratchpads / cheat sheets into **Import**
2. Review classifications (Secret / Command / Note)
3. Day-to-day: search → copy → paste into Terminal or a login form
4. Backup by copying the single `.vault` file

---

## Concepts

### Vault file

Everything lives in one file, e.g. `secret-vault.vault`.

- Encrypted on disk
- Portable: copy to USB / another Mac
- Opened only after the master password (or saved Keychain unlock) succeeds

Older vault files from early builds still open; new saves use the current format.

### Entry types

- **Secret** — username + password (+ optional URL / notes). Password hidden until revealed.
- **Command** — full command or multi-line snippet; one-click copy.
- **Note** — free text (how-tos, sheets, labels).
- **Jasper** — special vault for `.jrxml` / `.jasper` reports (preview JRXML, export for Jaspersoft Studio).
- **File** — any other file stored inside the encrypted vault (max ~2 MB).

Attachments live **inside** the `.vault` file (not as loose paths), so export/copy of the vault carries them too.

### Tags & favorites

Tag entries when editing. Filter from the toolbar tag dropdown. Star important items as favorites.

---

## Stay signed in

macOS **Keychain** is the system password locker (Safari, Wi‑Fi, etc.). Secret Vault can store unlock material there so the next launch opens automatically.

- Enable: check **Stay signed in on this Mac** when unlocking
- Disable: **Turn off stay signed in** or **Lock & require password**
- Trade-off: convenient, but anyone using your Mac login can open the vault

---

## Importing text files

1. Unlock the vault  
2. Sidebar → **Import files…**  
3. Pick one or more `.txt` / scratch files  
4. Review the draft list — change type, uncheck junk  
5. Confirm import  

The parser looks for patterns such as:

- `user` / `password` / `pw=` / VPN blocks → **Secret**
- `curl`, `mvn`, `git`, `psql`, SQL → **Command**
- longer prose / how-tos → **Note**

Always review before confirming; heuristics are helpful, not perfect.

---

## Backup & About

Sidebar → **About & backup** shows the app **version** and **developed by Ushan Gallage**.

### Folder copy and Google Drive

The backup is always the encrypted `.vault` file (safe to store in the cloud). OAuth refresh tokens are **not** written into that file; they live in the OS Keychain.

Use one or both:

- **Backup folder** — any directory, including a **Google Drive for Desktop** sync folder. **Push vault now** (or auto-push after save) copies the vault file there.
- **Google Drive on the internet** — OAuth Desktop client from Google Cloud Console:
  1. Create an OAuth client type **Desktop app** and enable the Drive API
  2. Redirect URI: `http://127.0.0.1:17843`
  3. Paste client ID (+ client secret if issued) → **Connect Google Drive**
  4. Paste a Drive folder URL or id

Auto-push runs after you save, delete, or import entries when that checkbox is on.

### Share this version’s installers

From About, save this version’s macOS `.dmg`, Linux installer, and Windows `.exe` for someone else. Files are taken from `src-tauri/installers/` if you placed them there when building, otherwise from GitHub Releases for the same version tag. They appear only after you build or publish those artifacts.

### Move to another computer

1. Quit Secret Vault (vault should be locked / closed)  
2. Copy `your-file.vault` (or restore it from the backup folder / Drive) to the other machine  
3. Install this version (or save an installer from About)  
4. Unlock with the **same** master password  

“Stay signed in” does **not** travel with the file — re-enable on the new machine if you want it.

---

## Develop

```bash
npm install
npm run tauri dev      # hot reload
npm run tauri build    # release .app + dmg
```

### Stack

- Frontend: React + Vite + TypeScript  
- Shell: Tauri 2  
- Crypto: Argon2id (key derivation) + AES-256-GCM (file encryption)  
- Optional unlock: macOS Keychain via `keyring` (`apple-native`)

### Useful paths

| What | Where |
|------|--------|
| UI | `src/` |
| Rust commands / vault | `src-tauri/src/` |
| Import classifier | `src-tauri/src/importer.rs` |
| App config | `src-tauri/tauri.conf.json` |

---

## Troubleshooting

| Issue | Try |
|-------|-----|
| Wrong password | Caps lock / correct vault file path |
| Stay signed in forgotten after rebuild | Bundle id / Keychain service changed — unlock once and check the box again |
| Buttons missing / UI clipped | Use latest build; sidebar actions should stay pinned at the bottom |
| Import missed something | Add manually, or tweak type in the import review screen |

---

## What this is not

- Not a browser autofill extension  
- Not multi-user / team sync  
- Not a substitute for hardware 2FA or enterprise SSO  

It is a focused personal vault for secrets + commands in one encrypted place.
