# Plan: Grafana V2 Cloud Webapp

**Created**: 2026-05-09 19:56 -0500
**Updated**: 2026-05-09 19:56 -0500
**Status**: draft
**Slug**: grafana-v2-cloud-webapp

## Objetivo

Convertir el descargador actual de Grafana en una V2 operable en nube: webapp, jobs reanudables, worker Playwright, Docker y despliegue en VPS.

## Fases

### Fase 0: Decisiones y accesos

| # | Archivo | Acción | Notas |
|---|---------|--------|-------|
| 0.1 | `subplan_usuario_v2.md` | Completar | Usuario confirma VPS, Docker, puerto/dominio y privacidad. |
| 0.2 | `plan_maestro_v2.md` | Consultar | Mantener decisiones alineadas con arquitectura objetivo. |

### Fase 1: Motor por jobs

| # | Archivo | Acción | Notas |
|---|---------|--------|-------|
| 1.1 | `scripts/*.js` | Refactorizar | Extraer logica reusable. |
| 1.2 | `src/grafana/` | Crear | Motor de descarga por job y chunk. |
| 1.3 | `examples/*.json` | Crear | Job de ejemplo para PM2.5 Cali. |

### Fase 2: Outputs y reanudacion

| # | Archivo | Acción | Notas |
|---|---------|--------|-------|
| 2.1 | `src/grafana/` | Implementar | Manifest, chunks, retries y resume. |
| 2.2 | `data/jobs/<jobId>/` | Generar | raw, csv, logs y ZIP. |

### Fase 3: Webapp

| # | Archivo | Acción | Notas |
|---|---------|--------|-------|
| 3.1 | `src/server/` | Crear | API de jobs, logs y artifacts. |
| 3.2 | `src/web/` | Crear | Formulario, listado y detalle. |

### Fase 4: Docker y VPS

| # | Archivo | Acción | Notas |
|---|---------|--------|-------|
| 4.1 | `Dockerfile` | Crear | Incluir dependencias Playwright. |
| 4.2 | `docker-compose.yml` | Crear | Web, worker, volumen data. |
| 4.3 | `docs/deploy_vps.md` | Crear | Instrucciones para Hostinger. |

## Log de Ejecución

- [x] Plan tecnico V2 creado en `plan_v2.md`.
- [x] Plan maestro creado en `plan_maestro_v2.md`.
- [x] Subplan agente creado en `subplan_agente_v2.md`.
- [x] Subplan usuario creado en `subplan_usuario_v2.md`.
- [ ] Usuario completa checklist de VPS y decisiones.
- [ ] Agente inicia refactor a motor por jobs.

