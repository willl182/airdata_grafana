# Subplan agente V2

## Objetivo

Ejecutar las tareas automatizables para llevar el descargador actual a una V2 operable: motor por jobs, chunks reanudables, webapp, Docker y documentacion tecnica.

Estado tecnico actual: el nucleo se migro a TypeScript en `src/grafana/*.ts`, con tipos compartidos en `src/grafana/types.ts`, compilacion a `dist/` y comandos CLI preservados desde `scripts/*.js`.

## Reglas de trabajo

- Mantener compatibilidad con los scripts actuales mientras se refactoriza.
- No depender de servicios externos al inicio.
- Usar `pnpm`.
- Usar TypeScript para el codigo nuevo del nucleo, API y worker.
- Ejecutar `pnpm run typecheck` y `pnpm run build` antes de cerrar cambios de codigo.
- Guardar datos generados en `data/`.
- Mantener secretos fuera de git.
- Probar cada fase con un rango pequeno antes de avanzar.
- Limitar la primera version a jobs de maximo 10 dias.
- Usar chunks de 1 dia por defecto.

## Fase A1: preparar base tecnica

Tareas:

- Revisar scripts actuales.
- Definir estructura `src/grafana/`.
- Extraer helpers comunes.
- Crear ejemplo de `job.json`.
- Mantener `pnpm run explore`, `pnpm run download` y `pnpm run csv`.
- Agregar TypeScript y tipos compartidos.
- Migrar el nucleo `src/grafana/` de `.js` a `.ts`.
- Mantener wrappers CLI estables en `scripts/*.js`.

Criterios de cierre:

- Los scripts actuales siguen corriendo.
- Existe un job de ejemplo.
- La descarga puede invocarse desde una funcion, no solo desde config global.
- `pnpm run typecheck` pasa.
- `pnpm run build` pasa.

Estado:

- Completada.

## Fase A2: motor por jobs

Tareas:

- Implementar lectura de job.
- Generar chunks desde `startDate`, `endDate` y `chunkSize`.
- Ejecutar descarga por chunk.
- Guardar JSON crudo por chunk.
- Registrar manifest por chunk.
- Saltar chunks ya completados.

Criterios de cierre:

- Un job de 1 hora funciona.
- Un job de 7 dias funciona.
- Si se ejecuta dos veces, no repite chunks completados.

Estado:

- Implementada la base local.
- Pendiente conectar los outputs finales A3 como parte del cierre del job.

## Fase A3: outputs

Tareas:

- Implementar CSV largo canonico.
- Implementar CSV ancho opcional.
- Dejar JSON crudo como artifact interno del job, no como descarga principal para el usuario.
- Dejar ZIP como artifact tecnico opcional para respaldo/debug.
- Implementar CSV por sensor solo si el schema capturado lo hace necesario.
- Agregar dedupe inicial si hay traslapes.
- Generar un CSV largo final por job como salida principal.
- Generar un CSV ancho final por job como salida opcional.
- Registrar artifacts finales para que la API/webapp pueda encontrarlos.

Criterios de cierre:

- El job produce `raw/`, `csv/`, `manifest.jsonl` y `logs.txt`.
- El CSV largo final tiene todas las estaciones/sensores disponibles en filas y columnas de contexto.
- El CSV ancho final se genera como salida opcional.
- El ZIP tecnico puede generarse o descargarse sin ser el flujo principal del usuario.
- `pnpm run typecheck` y `pnpm run build` pasan.

Estado:

- Implementada la base local.
- `runJob` genera `csv/final_long.csv`, `csv/final_wide.csv` opcional, `artifacts.json`, `logs.txt` y `result.zip`.
- Validado con jobs de 1 hora y 7 dias usando chunks existentes.
- ZIP tecnico queda como artifact opcional; el flujo principal es CSV largo.

## Fase A4: API local

Tareas:

- Crear backend API.
- Crear endpoint `POST /api/jobs`.
- Crear endpoint `GET /api/jobs`.
- Crear endpoint `GET /api/jobs/:id`.
- Crear endpoint de logs.
- Crear endpoint de artifacts/ZIP.
- Crear endpoint de descarga directa del CSV largo final.
- Crear endpoint de descarga opcional del CSV ancho final.

Criterios de cierre:

- Se puede crear un job via HTTP local.
- Se puede consultar progreso.
- Se puede descargar el CSV largo final.
- Se puede descargar el CSV ancho si fue generado.
- Se puede descargar el ZIP tecnico si existe.

## Fase A5: webapp local

Tareas:

- Crear formulario de nuevo job.
- Crear lista de jobs.
- Crear detalle de job.
- Mostrar chunks completados/fallidos.
- Mostrar logs basicos.
- Agregar boton de descarga.

Criterios de cierre:

- El usuario puede lanzar un job desde navegador.
- El usuario puede ver progreso.
- El usuario puede descargar resultados.

## Fase A6: Docker

Tareas:

- Crear Dockerfile con Playwright/Chromium.
- Crear `docker-compose.yml`.
- Configurar volumen `data/`.
- Configurar variables `.env`.
- Agregar healthcheck basico.
- Probar Chromium dentro del contenedor.

Criterios de cierre:

- `docker compose up` levanta la app.
- Un job de 1 hora corre dentro del contenedor.
- Los archivos persisten en el volumen.

## Fase A7: despliegue asistido

Tareas:

- Crear `docs/deploy_vps.md`.
- Preparar comandos para VPS.
- Preparar comandos de actualizacion.
- Preparar comandos de backup.
- Ayudar a revisar logs del VPS.

Criterios de cierre:

- La app corre en el VPS.
- Se completa un job de prueba.
- Hay instrucciones para reiniciar, actualizar y respaldar.

## Fase A8: robustez

Tareas:

- Implementar retry manual.
- Implementar cancelacion.
- Implementar limites de rango y dominio permitido.
- Implementar selector de modo: agregado, individual, ambos.
- Implementar limpieza o retencion configurable.

Criterios de cierre:

- La app puede manejar fallos sin perder todo el job.
- El usuario puede operar descargas largas con supervision minima.

## Entregables del agente

- Codigo fuente.
- Scripts CLI preservados.
- Tipos TypeScript preservados y actualizados.
- Webapp.
- Dockerfile.
- Compose.
- Documentacion.
- Logs de pruebas.
- Actualizacion de planes si hay cambios de alcance.
