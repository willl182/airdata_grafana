# Plan de Migracion a TypeScript

## Contexto

Proyecto Node.js CommonJS con `pnpm`. El nucleo esta en `src/grafana/` y los comandos publicos se exponen desde `scripts/`.

Comandos que deben conservarse:

- `pnpm run explore`
- `pnpm run download`
- `pnpm run download:job -- examples/job.example.json`
- `pnpm run csv`

La prioridad funcional pendiente sigue siendo A3: generar CSV largo final por job, CSV ancho opcional y deduplicacion para traslapes. La migracion debe ayudar a fijar contratos de datos sin bloquear esa fase.

## Fase 1: Infraestructura TypeScript

- Agregar `typescript` y `@types/node` como dependencias de desarrollo.
- Crear `tsconfig.json` conservador:
  - CommonJS como formato de modulo.
  - `allowJs: true` para migracion gradual.
  - `checkJs: false` al inicio.
  - salida en `dist/`.
- Agregar scripts:
  - `typecheck`: valida tipos sin emitir archivos.
  - `build`: compila a `dist/`.
- Mantener `"type": "commonjs"` por compatibilidad.

## Fase 2: Tipos iniciales antes del cambio masivo

- Definir tipos compartidos en `src/grafana/types.ts`.
- Cubrir las formas centrales:
  - `GrafanaConfig`
  - `ChunkSize`
  - `Job`
  - `NormalizedJob`
  - `JobChunk`
  - estructuras basicas de Grafana DataFrame
  - filas CSV
- Usar estos tipos al migrar modulos, sin forzar `strict` completo desde el primer commit si eso retrasa A3.

## Fase 3: Migrar nucleo compartido

Orden recomendado:

1. `src/grafana/common.js` -> `src/grafana/common.ts`
2. `src/grafana/jobs.js` -> `src/grafana/jobs.ts`
3. `src/grafana/csv.js` -> `src/grafana/csv.ts`
4. `src/grafana/downloader.js` -> `src/grafana/downloader.ts`
5. `src/grafana/explorer.js` -> `src/grafana/explorer.ts`
6. `src/grafana/index.js` -> `src/grafana/index.ts`

Reglas:

- Conservar exports publicos.
- Mantener compatibilidad CommonJS.
- Migrar `common` y `jobs` primero porque definen contratos usados por A3.
- No cambiar comportamiento funcional salvo ajustes necesarios para tipos.

## Fase 4: CLI estable

- Dejar `scripts/*.js` como wrappers o migrarlos al final.
- Asegurar que sigan llamando el paquete sin que el usuario cambie comandos.
- Si se decide ejecutar desde `dist`, actualizar scripts de forma explicita y documentada.

## Fase 5: A3 tipada

- Implementar la salida final de job en TypeScript:
  - CSV largo como salida principal.
  - CSV ancho opcional.
  - dedupe por clave estable para ventanas solapadas.
- Tipar la fila larga, clave de dedupe, manifest y metadata de chunk.

## Fase 6: Endurecimiento

- Cuando `src/` este migrado:
  - desactivar `allowJs` si ya no se necesita.
  - activar reglas mas estrictas gradualmente.
  - limpiar `any` residuales donde aporten valor.
- Validar:
  - `pnpm run typecheck`
  - `pnpm run build`
  - `pnpm run csv`
  - `pnpm run download:job -- examples/job.example.json`

## Estado

- [x] Fase 1 completada.
- [x] Fase 2 completada.
- [x] Fase 3 completada.
- [x] Fase 4 completada mediante wrappers CLI que compilan y ejecutan desde `dist/`.
- [ ] Fase 5 pendiente: implementar A3 tipada.
- [ ] Fase 6 pendiente: endurecimiento gradual.

## Ajuste al plan global

La migracion a TypeScript ya no es un bloque independiente del camino critico. Queda como base tecnica completada para continuar V2:

1. A3 outputs finales de job en TypeScript.
2. API local sobre el motor tipado.
3. Webapp local.
4. Docker local.
5. Despliegue VPS por Tailscale en puerto `3001`.
6. Robustez operativa.
