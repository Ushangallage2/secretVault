Place this version’s installers here so Secret Vault can hand them to another user from About:

- Secret-Vault_*_macos.dmg
- Secret-Vault_*_linux.deb (or .AppImage)
- Secret-Vault_*_windows.exe

Tauri’s own bundle names are also accepted, for example:

- Secret Vault_0.2.0_x64.dmg
- Secret Vault_0.2.0_amd64.deb
- Secret Vault_0.2.0_x64-setup.exe

Do not commit these binaries. Publish them on the GitHub Release for this version tag (v0.2.0, etc.). About looks in this folder first, then falls back to that release.
