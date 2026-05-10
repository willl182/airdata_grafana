# Session State: airdata_grafana

**Last Updated**: 2026-05-09 20:23 -0500

## Session Objective

Evolve the existing Grafana downloader into V2. Current milestone completed: Phase A1 from `subplan_agente_v2.md`, preparing the technical base with reusable modules while preserving the existing CLI scripts.

## Current State

- [x] Created local Git repository and published private GitHub repo: `https://github.com/willl182/airdata_grafana`.
- [x] Initial commit: `6e9714f Initial airdata_grafana project`.
- [x] Completed Phase A1 refactor commit: `08c8fff Refactor Grafana scripts into reusable modules`.
- [x] Added `src/grafana/` reusable CommonJS modules:
  - `common.js`
  - `downloader.js`
  - `explorer.js`
  - `csv.js`
  - `index.js`
- [x] Preserved CLI compatibility through wrappers in `scripts/`.
- [x] Added `examples/job.example.json`.
- [x] Updated `README.md` with V2 module structure and programmatic usage.
- [x] Pushed A1 changes to `origin/main`.
- [ ] `subplan_usuario_v2.md` has user edits not committed by the agent.
- [ ] Phase A2 remains pending: job reader, chunk generation from `startDate`/`endDate`/`chunkSize`, resumable chunk execution, per-chunk manifest.

## Critical Technical Context

- Working directory: `/home/w182/w421/grafana`.
- Git remote: `origin https://github.com/willl182/airdata_grafana.git`.
- Branch: `main`, currently at `08c8fff` on `origin/main`.
- Project is Node.js CommonJS and uses `pnpm`.
- Existing commands must remain valid:
  - `pnpm run explore`
  - `pnpm run download`
  - `pnpm run csv`
- `config.local.json`, `data/`, `.ms-playwright/`, `.pnpm-store/`, and `node_modules/` are ignored by git.
- Playwright CLI scripts rely on `PLAYWRIGHT_BROWSERS_PATH=.ms-playwright` from `package.json` scripts.
- A direct `node -e "require('./scripts/descargar-grafana.js')"` will launch Playwright without that env var and may fail looking under `~/.cache/ms-playwright`; use `pnpm run download` or call `runDownload(config)` with the right environment.
- `pnpm run csv` was verified successfully against local `data/raw` outputs.
- Syntax checks passed for all scripts and `src/grafana/*.js`.
- Do not overwrite or commit `subplan_usuario_v2.md` without user intent; it contains user-filled deployment/data policy decisions.

## Next Steps

1. Commit or intentionally leave user edits in `subplan_usuario_v2.md` based on user preference.
2. Start Phase A2 in `subplan_agente_v2.md`.
3. Implement job loading from `examples/job.example.json`-style files.
4. Generate chunks from `startDate`, `endDate`, and `chunkSize`.
5. Execute/download per chunk with resumability and per-chunk manifest records.
