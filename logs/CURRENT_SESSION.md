# Session State: airdata_grafana

**Last Updated**: 2026-05-09 21:17 -0500

## Session Objective

Evolve the Grafana downloader into V2: local webapp/backend first, then Docker deployment to the Hostinger VPS over Tailscale.

## Current State

- [x] Manual validation against Grafana Inspect succeeded: downloaded CSV values matched the script output.
- [x] User decisions captured:
  - access for first deployment: Tailscale
  - app port: `3001`
  - no domain for initial test
  - allowed Grafana domain: `grafana.canair.io`
  - max initial job range: 10 days
  - default chunk size: 1 day
  - primary output: CSV long
  - secondary output: CSV wide optional
  - raw JSON: internal technical artifact
  - ZIP: optional technical/debug artifact
- [x] VPS is viable:
  - Docker 29.4.1
  - Docker Compose v5.1.3
  - 7.8 GiB RAM total, 6.6 GiB available
  - 73 GB free disk
  - OpenClaw running at `127.0.0.1:57086`
- [x] V2 plans updated:
  - `plan_maestro_v2.md`
  - `plan_v2.md`
  - `subplan_agente_v2.md`
  - `subplan_usuario_v2.md`
- [x] Phase A2 job engine exists in the working tree:
  - job loading and normalization
  - `chunkSize` parsing
  - chunk generation from `startDate`/`endDate`
  - resumable execution that skips existing raw JSON files
  - per-job `job.json`, `chunks.jsonl`, and `manifest.jsonl`
- [ ] A2 + plan updates are ready to commit/push after final checks.

## Critical Technical Context

- Working directory: `/home/w182/w421/grafana`.
- Branch: `main`.
- Project is Node.js CommonJS with `pnpm`.
- Existing commands must remain valid:
  - `pnpm run explore`
  - `pnpm run download`
  - `pnpm run csv`
- New A2 command:
  - `pnpm run download:job -- examples/job.example.json`
  - `pnpm run download:job -- examples/job.7d.example.json`
- Playwright real downloads may need to run outside the assistant sandbox. In this environment, sandboxed Chromium failed with `sandbox_host_linux.cc:41 shutdown: Operation not permitted`; running approved `pnpm run download:job` outside the sandbox solved it.
- Do not expose the app publicly for the first VPS deployment. Use Tailscale and port `3001`.
- Keep user-facing normal download simple: one CSV long final, optional CSV wide. JSON and ZIP are technical artifacts.

## Next Steps

1. Run syntax checks for changed JS files.
2. Commit and push current A2 + planning changes.
3. Start Phase A3: generate final job-level CSV long and optional wide output, with dedupe for overlapping chunks.
