# Trading Card Shop Simulator - Save Editor (Release Instructions)

Use editor without downloading [HERE](https://saveeditors.github.io/trading-card-simulator-save-editor/)

## Deployment Notes + Default Save Locations

- Repo: `trading-card-simulator-save-editor`
- Deployment target: GitHub Pages from `main` (root `/`), entry file `index.html`

Default save roots:

- Steam (common Unity path): `%USERPROFILE%\\AppData\\LocalLow\\OPNeonGames\\Card Shop Simulator\\`
- Game Pass / Microsoft Store (UWP / Xbox): `%LOCALAPPDATA%\\Packages\\OPNEONGAMES.TCGCardShopSimulator_19j6by82ahhzr\\SystemAppData\\wgs\\`

Cloud save possibilities to watch for:

- Active local synced cloud file
- Conflict/duplicate copy (multiple folders / payloads)
- Local backup copy (if present)

## Build Release ZIP

Suggested contents:

- `index.html`
- `styles.css`
- `src/`
- `assets/`
- `README.md`
- `RELEASE_INSTRUCTIONS.md`

Then upload `releases/trading-card-simulator-save-editor-v1.0.0.zip` to the `v1.0.0` GitHub Release.
