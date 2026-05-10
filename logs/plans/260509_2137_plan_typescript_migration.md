# Plan: Migracion TypeScript Grafana V2

**Created**: 2026-05-09 21:37
**Updated**: 2026-05-09 21:37
**Status**: completed
**Slug**: typescript-migration

## Objetivo

Migrar el nucleo local del descargador de Grafana de JavaScript a TypeScript sin romper los comandos publicos ni cambiar el comportamiento funcional.

## Fases

### Fase 1: Infraestructura TypeScript

| # | Archivo | Accion | Notas |
|---|---------|--------|-------|
| 1.1 | `package.json` | Modificar | Agregar `typescript`, `@types/node`, `build` y `typecheck`. |
| 1.2 | `tsconfig.json` | Crear | Configuracion CommonJS conservadora con salida a `dist/`. |
| 1.3 | `.gitignore` | Modificar | Ignorar `dist/`. |

### Fase 2: Tipos compartidos

| # | Archivo | Accion | Notas |
|---|---------|--------|-------|
| 2.1 | `src/grafana/types.ts` | Crear | Tipos para config, jobs, chunks, payloads Grafana y filas CSV. |

### Fase 3: Migracion del nucleo

| # | Archivo | Accion | Notas |
|---|---------|--------|-------|
| 3.1 | `src/grafana/*.js` | Reemplazar | Migrados a `.ts`. |
| 3.2 | `scripts/*.js` | Preservar | Wrappers CLI mantenidos. |
| 3.3 | `package.json` | Modificar | Comandos publicos compilan antes de ejecutar desde `dist/`. |

### Fase 4: Planes

| # | Archivo | Accion | Notas |
|---|---------|--------|-------|
| 4.1 | `plan_migracion.md` | Crear/actualizar | Estado real de la migracion. |
| 4.2 | `plan_maestro_v2.md` | Modificar | TypeScript como base tecnica completada. |
| 4.3 | `plan_v2.md` | Modificar | Fases reordenadas: A3 outputs antes de API/webapp. |
| 4.4 | `subplan_agente_v2.md` | Modificar | A1 completa, A3 siguiente. |
| 4.5 | `subplan_usuario_v2.md` | Modificar | Validaciones pendientes de CSV final y dedupe. |

## Log de Ejecucion

- [x] Fase 1 completada.
- [x] Fase 2 completada.
- [x] Fase 3 completada.
- [x] Fase 4 completada.
- [x] `pnpm run typecheck` pasa.
- [x] `pnpm run build` pasa.
- [ ] Pendiente commit/push.
