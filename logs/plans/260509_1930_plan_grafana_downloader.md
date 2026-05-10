# Plan: Grafana Downloader

**Created**: 2026-05-09 19:30
**Updated**: 2026-05-09 19:30
**Status**: in_progress
**Slug**: grafana_downloader

## Objetivo

Descargar datos exportables del dashboard de Grafana de Canair/Tangara por ventanas temporales, preservar JSON crudo y generar CSVs analizables.

## Fases

### Fase 1: Viabilidad y plan

| # | Archivo | Accion | Notas |
|---|---------|--------|-------|
| 1.1 | `guia.md` | Revisar | Evaluada con subagente |
| 1.2 | `plan.md` | Crear/Modificar | Ajustado para dashboard `/d/...` e Inspect |

### Fase 2: Implementacion

| # | Archivo | Accion | Notas |
|---|---------|--------|-------|
| 2.1 | `package.json` | Crear | Scripts con `pnpm` |
| 2.2 | `scripts/explorar-grafana.js` | Crear | Captura requests reales |
| 2.3 | `scripts/descargar-grafana.js` | Crear | Descarga por ventanas |
| 2.4 | `scripts/grafana-json-a-csv.js` | Crear | Convierte frames a CSV |
| 2.5 | `scripts/grafana-common.js` | Crear | Utilidades comunes |

### Fase 3: Validacion

| # | Archivo | Accion | Notas |
|---|---------|--------|-------|
| 3.1 | `data/discovery/requests.json` | Generar | Confirmado `/api/ds/query?ds_type=influxdb` |
| 3.2 | `data/raw/*.json` | Generar | Descargados 7 dias por ventanas |
| 3.3 | `data/csv/*.csv` | Generar | 29 CSVs por `refId` |

### Fase 4: Pendientes

| # | Archivo | Accion | Notas |
|---|---------|--------|-------|
| 4.1 | `data/csv/*.csv` | Validar | Comparar con CSV manual de Grafana Inspect |
| 4.2 | `scripts/grafana-json-a-csv.js` | Mejorar | Manejar deduplicacion por ventanas solapadas |
| 4.3 | `data/raw/` | Limpiar | Mover o eliminar JSON de prueba si causa duplicados |

## Log de Ejecucion

- [x] Fase 1 completada
- [x] Fase 2 completada
- [x] Fase 3 completada
- [ ] Fase 4 pendiente
