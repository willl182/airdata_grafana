# Plan: Grafana V2 Outputs

**Created**: 2026-05-09 21:17 -0500
**Updated**: 2026-05-09 21:17 -0500
**Status**: approved
**Slug**: grafana-v2-outputs

## Objetivo

Alinear la V2 para que el resultado principal sea un CSV largo apto para R, manteniendo CSV ancho como salida opcional y JSON/ZIP como artifacts tecnicos.

## Fases

### Fase 1: Planificacion

| # | Archivo | Accion | Notas |
|---|---------|--------|-------|
| 1.1 | `plan_maestro_v2.md` | Modificar | Definir CSV largo como salida principal y rango maximo de 10 dias. |
| 1.2 | `subplan_agente_v2.md` | Modificar | Ajustar A3 para CSV largo final, CSV ancho opcional y artifacts tecnicos. |
| 1.3 | `subplan_usuario_v2.md` | Modificar | Registrar decisiones del usuario y checklist. |
| 1.4 | `plan_v2.md` | Modificar | Actualizar referencia tecnica extensa. |

### Fase 2: Implementacion siguiente

| # | Archivo | Accion | Notas |
|---|---------|--------|-------|
| 2.1 | `src/grafana/` | Modificar | Generar CSV largo por job. |
| 2.2 | `src/grafana/` | Modificar | Generar CSV ancho opcional. |
| 2.3 | `src/grafana/` | Modificar | Aplicar dedupe inicial para traslapes. |

## Log de Ejecucion

- [x] Decisiones registradas.
- [x] Planes actualizados.
- [ ] Implementacion A3 iniciada.
