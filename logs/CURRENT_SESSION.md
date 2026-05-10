# Session State: Grafana Downloader V2

**Last Updated**: 2026-05-09 19:56 -0500

## Session Objective

Plan and evolve the current Grafana downloader into a V2 cloud/webapp version that can run on a VPS with Docker, download large date ranges in small resumable windows, and expose a browser UI for configuring jobs and downloading outputs.

## Current State

- [x] Reviewed original `guia.md` approach with a subagent.
- [x] Confirmed real dashboard URL uses normal Grafana `/d/...` route, not public dashboard token route.
- [x] Observed real data endpoint pattern: `POST /api/ds/query?ds_type=influxdb`.
- [x] Implemented first CLI downloader using Playwright capture.
- [x] Switched project workflow to `pnpm`.
- [x] Installed Playwright Chromium locally under `.ms-playwright/`.
- [x] Downloaded last 7 days from `2026-05-02T19:26:00-05:00` to `2026-05-09T19:26:00-05:00`.
- [x] Generated raw JSON and CSV outputs for the 7-day run.
- [x] Created `plan_v2.md` as technical reference for cloud/webapp V2.
- [x] Reorganized execution planning into:
  - `plan_maestro_v2.md`
  - `subplan_agente_v2.md`
  - `subplan_usuario_v2.md`
- [ ] Validate generated CSV against a manual Grafana Inspect CSV.
- [ ] Decide whether to remove or isolate the earlier 1-hour test raw JSON to avoid duplicate CSV rows.
- [ ] Begin V2 implementation with job-based engine refactor.

## Critical Technical Context

- Working directory: `/home/w182/w421/grafana`.
- Current project is Node.js CommonJS with `pnpm`.
- Existing scripts:
  - `scripts/explorar-grafana.js`
  - `scripts/descargar-grafana.js`
  - `scripts/grafana-json-a-csv.js`
  - `scripts/grafana-common.js`
- Current config file: `config.local.json` is ignored by git.
- Outputs are under `data/`, also ignored by git.
- The endpoint captured from Grafana is browser-driven and not a documented public export API.
- Grafana Inspect offers multiple data frame views:
  - `Series joined by time`
  - individual sensor frames such as `Tangara_14D6`, `Tangara_2FF6`, etc.
- V2 recommendation: keep JSON raw, produce canonical CSV long, and optionally CSV wide.
- Cloud recommendation: Hostinger VPS + Docker Compose. Vercel/Supabase/Convex are optional later, not core for the initial worker.
- Playwright/Chromium may require running outside assistant sandbox or inside a proper Docker image with browser dependencies.

## Plan Documents

- `plan_v2.md`: extended technical reference.
- `plan_maestro_v2.md`: master plan for the current V2 stage.
- `subplan_agente_v2.md`: agent-executable implementation plan.
- `subplan_usuario_v2.md`: user responsibilities, decisions, access prep, and validation checklist.

## Next Steps

1. User completes the checklist in `subplan_usuario_v2.md`: VPS access, Docker Compose status, domain/port, privacy, and sample CSV validation.
2. Agent starts `subplan_agente_v2.md` Phase A1: refactor current scripts into a reusable job-based engine.
3. Implement resumable chunks and job artifacts before building the web UI.
4. After local job flow works, implement webapp and Docker packaging.

