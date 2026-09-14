Place only **real** installers here (never fake .deb/.exe). This Mac app cannot cross-build Linux or Windows.

Typical Tauri outputs after `npm run tauri build` on that OS:

- macOS: src-tauri/target/release/bundle/dmg/*.dmg
- Linux: src-tauri/target/release/bundle/deb/*.deb (and appimage/)
- Windows: src-tauri/target/release/bundle/nsis/*-setup.exe (and msi/)

Do not commit these binaries. About looks here first, then GitHub Releases. If a platform is missing, the app tells people to clone the repo and build on that OS.
