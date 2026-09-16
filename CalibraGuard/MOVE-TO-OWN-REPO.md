# Move CalibraGuard into its own GitHub repository

This Cloud Agent is attached to [Ushangallage2/secretVault](https://github.com/Ushangallage2/secretVault). GitHub blocked `createRepository` for the agent token (`Resource not accessible by integration`), so these FYP files live in `CalibraGuard/` on branch `cursor/calibraguard-fyp-docs-ccfe`.

**Do not merge this folder into Secret Vault `main`.** Secret Vault is a desktop password app. CalibraGuard is a separate FYP.

## One-time split (about five minutes)

1. In the browser, create an **empty** GitHub repository: `https://github.com/Ushangallage2/CalibraGuard`  
   - No README, no `.gitignore`, no licence (this folder already has them).
2. On any machine with this branch checked out:

```bash
# from the secretVault clone
cd CalibraGuard
git init
git add .
git commit -m "Docs-first FYP starter for CalibraGuard"
git branch -M main
git remote add origin https://github.com/Ushangallage2/CalibraGuard.git
git push -u origin main
```

3. Start a **new** Cloud Agent on `Ushangallage2/CalibraGuard`, not on Secret Vault.
4. Re-attach the official FYP handouts in that new chat so [docs/08-handout-alignment.md](docs/08-handout-alignment.md) can be filled with real word counts and deadlines.
5. After the dedicated repo exists, close the Secret Vault pull request without merging.
