# Plan V2: webapp en la nube para descargar datos de Grafana

> Nota: este archivo queda como referencia tecnica extensa. Para ejecucion por etapa usar:
>
> - `plan_maestro_v2.md`
> - `subplan_agente_v2.md`
> - `subplan_usuario_v2.md`

## Objetivo

Convertir el descargador actual de Grafana en una aplicacion web que pueda correr en la nube, recibir rangos de fechas desde una interfaz, descargar datos por ventanas pequenas y dejar los resultados disponibles principalmente como CSV largo, con CSV ancho opcional y JSON/ZIP como artifacts tecnicos.

La V2 no reemplaza de inmediato los scripts actuales. Primero debe envolverlos y estabilizarlos como motor de descarga reutilizable. Luego se agrega una interfaz web, manejo de trabajos, persistencia y despliegue en Docker.

Actualizacion: el motor local ya fue migrado a TypeScript manteniendo CommonJS, wrappers CLI y comandos publicos. El desarrollo nuevo del nucleo, API y worker debe continuar en TypeScript.

## Decision recomendada de infraestructura

La opcion recomendada para esta V2 es montarla en el VPS de Hostinger con Docker.

Razones:

- Playwright necesita Chromium headless y dependencias de sistema.
- Las descargas pueden durar horas.
- El proceso debe poder reintentar, pausar, reanudar y escribir archivos grandes.
- En un VPS hay control sobre disco, memoria, logs, volumenes y procesos largos.
- Ya existe experiencia previa del usuario con un contenedor Docker en ese VPS.

Vercel, Supabase y Convex pueden servir, pero no como pieza principal del worker de descarga:

- Vercel: util para frontend, pero no ideal para Playwright de larga duracion ni descargas grandes. Puede usarse solo como frontend externo si se desea.
- Supabase: util para guardar metadata de jobs, usuarios, estados y permisos. No es necesario para V2 inicial si se usa SQLite o Postgres local.
- Convex: util para estado reactivo de la UI y jobs visibles en tiempo real, pero agrega complejidad. No deberia ser dependencia inicial.

Para V2 inicial:

```txt
VPS Hostinger
  docker compose
    webapp
    worker
    postgres o sqlite
    redis opcional
    volumen data/
```

## Arquitectura propuesta

```txt
Usuario
  |
  v
Webapp
  - formulario de descarga
  - listado de jobs
  - detalle de progreso
  - descarga de resultados
  |
  v
Backend API
  - crea jobs
  - divide fechas en ventanas
  - consulta estado
  - entrega archivos
  |
  v
Cola / tabla de trabajos
  - pending
  - running
  - completed
  - failed
  - canceled
  |
  v
Worker
  - ejecuta Playwright
  - captura /api/ds/query
  - guarda JSON crudo
  - convierte a CSV
  - reintenta ventanas
  - genera CSV largo final
  - genera CSV ancho opcional
  - puede generar ZIP tecnico opcional
  |
  v
Almacenamiento
  - data/jobs/<jobId>/raw
  - data/jobs/<jobId>/csv
  - data/jobs/<jobId>/manifest.jsonl
  - data/jobs/<jobId>/logs.txt
  - data/jobs/<jobId>/result.zip
```

## Flujo de usuario

1. El usuario abre la webapp.
2. Pega o selecciona la URL del dashboard de Grafana.
3. Indica el panel, por ejemplo `PM2.5 Sensores Cali`.
4. Selecciona modo de descarga:
   - `Agregado / series joined by time`
   - `Sensor individual / data frame por sensor`
   - `Ambos`
5. Indica fecha inicial y fecha final.
6. Define tamano de ventana:
   - 1 hora
   - 6 horas
   - 1 dia
   - 7 dias
   - automatico
7. Crea el job.
8. La webapp muestra avance por ventanas.
9. Al terminar, permite descargar:
   - JSON crudo
   - CSV largo principal
   - CSV ancho opcional
   - ZIP tecnico opcional
   - manifest/logs

## Agregado vs sensor individual

La captura muestra que Grafana permite elegir distintos `data frames` desde Inspect:

- `Series joined by time`
- `Tangara_14D6 (0)`
- `Tangara_2FF6 (1)`
- `CanAirIO_06BE (2)`
- otros sensores individuales

Esto cambia el diseno de salida, no necesariamente el metodo de descarga.

### Modo agregado

`Series joined by time` une varias series en una tabla por tiempo.

Ventajas:

- Mas comodo para analisis tabular.
- Una fila por timestamp y columnas por sensor.
- Se parece a lo que un usuario espera al abrir CSV en Excel.
- Facil comparar sensores en una misma tabla.

Desventajas:

- Puede introducir muchos `undefined` o celdas vacias si los sensores reportan en tiempos distintos.
- Puede ocultar diferencias de frecuencia entre sensores.
- Puede depender mas de transformaciones de Grafana.
- Para rangos grandes, la tabla puede volverse muy ancha.

### Modo sensor individual

Cada sensor sale como su propio dataframe.

Ventajas:

- Preserva mejor la estructura de cada serie.
- Menos ambiguedad por joins temporales.
- Mejor para auditoria y para procesar despues.
- Mas robusto si cada sensor tiene frecuencia distinta.

Desventajas:

- Produce muchos CSVs o un CSV largo con columna `sensor`.
- Requiere una etapa posterior para unir series si se necesita matriz por tiempo.

### Recomendacion

Para V2, soportar ambos modos:

1. Guardar siempre el JSON crudo completo capturado desde Grafana.
2. Generar CSV `long` por defecto:

```txt
time,sensor,value,unit,chunk_from,chunk_to,ref_id,frame_index,source_file
```

3. Generar CSV `wide` opcional:

```txt
time,Tangara_14D6,Tangara_2FF6,CanAirIO_06BE,...
```

El formato `long` es el formato principal porque evita perder informacion, escala mejor cuando hay muchos sensores y es mas facil de procesar en R. El formato `wide` queda como salida opcional para Excel y comparaciones rapidas.

## Modelo de datos minimo

### Job

```txt
id
dashboard_url
panel_title
panel_id
mode
start_date
end_date
timezone
chunk_size
status
created_at
started_at
finished_at
error_message
output_dir
```

### Chunk

```txt
id
job_id
chunk_from
chunk_to
status
attempts
http_status
frames_captured
rows_estimated
raw_file
csv_files
error_message
started_at
finished_at
```

### Artifact

```txt
id
job_id
type
path
size_bytes
created_at
```

## API propuesta

```txt
POST /api/jobs
GET  /api/jobs
GET  /api/jobs/:id
POST /api/jobs/:id/cancel
POST /api/jobs/:id/retry
GET  /api/jobs/:id/logs
GET  /api/jobs/:id/artifacts
GET  /api/jobs/:id/download.zip
```

Payload inicial para crear job:

```json
{
  "dashboardUrl": "https://grafana.canair.io/d/UN_OsIo7k/tangara?orgId=1",
  "panelTitle": "PM2.5 Sensores Cali",
  "startDate": "2026-05-02T00:00:00-05:00",
  "endDate": "2026-05-09T00:00:00-05:00",
  "timezone": "America/Bogota",
  "chunkSize": "1d",
  "mode": "both",
  "maxRangeDays": 10,
  "outputFormats": ["csv_long", "csv_wide"],
  "technicalArtifacts": ["json", "zip"]
}
```

## Cambios sobre los scripts actuales

### 1. Modularizar motor de descarga

Crear una libreria interna:

```txt
src/grafana/
  common.ts
  explorer.ts
  downloader.ts
  jobs.ts
  csv.ts
  types.ts
  index.ts
```

Los scripts actuales quedarian como CLI del mismo motor:

```txt
scripts/explorar-grafana.js
scripts/descargar-grafana.js
scripts/descargar-job.js
scripts/grafana-json-a-csv.js
```

Los scripts CLI se mantienen en JavaScript como wrappers y ejecutan el codigo compilado desde `dist/` despues de `pnpm run build`.

### 2. Parametros por job

La descarga no debe depender solo de `config.local.json`.

Debe aceptar parametros desde:

- CLI
- archivo JSON
- API web
- base de datos de jobs

### 3. Reanudacion real

Cada ventana debe tener estado propio. Si el VPS reinicia, el worker debe poder continuar desde chunks pendientes o fallidos.

### 4. Dedupe

Agregar deduplicacion opcional por:

```txt
time + sensor + ref_id + field_name + value
```

Esto evita duplicados cuando existen ventanas traslapadas o pruebas previas.

### 5. Exportacion long/wide

El conversor debe generar:

- CSV largo canonico y principal.
- CSV ancho opcional.
- CSV por sensor opcional solo si el schema lo exige.

## Estrategia de ventanas

La V2 debe asumir que los rangos grandes se descargan de a pocos.

Politica recomendada:

1. Intentar con el tamano elegido por el usuario.
2. Si hay timeout, 502, 503, 504 o respuesta incompleta, reintentar.
3. Si falla de nuevo, dividir la ventana en dos.
4. Continuar hasta un minimo configurable, por ejemplo 1 hora.
5. Si aun falla, marcar solo esa ventana como fallida y continuar.

Esto permite descargar datasets grandes sin depender de que una sola consulta gigante funcione.

## Docker

Estructura sugerida:

```txt
Dockerfile
docker-compose.yml
.env.example
data/
```

Servicios:

```txt
web
  node app
  expone puerto 3000

worker
  node worker
  usa Playwright Chromium
  comparte volumen data/

db
  postgres o sqlite por volumen

redis
  opcional si se usa BullMQ
```

Para V2 inicial, se puede evitar Redis y usar una tabla `jobs/chunks` en SQLite o Postgres. Redis/BullMQ se justifica si luego hay muchos jobs concurrentes.

## Seguridad minima

Como la app permite ejecutar descargas desde URLs externas, debe tener controles:

- Permitir solo dominios aprobados al inicio, por ejemplo `grafana.canair.io`.
- No aceptar cualquier URL arbitraria sin validacion.
- No guardar cookies en git.
- Proteger la webapp con login simple o reverse proxy con basic auth.
- Limitar jobs concurrentes.
- Limitar rango maximo inicial a 10 dias por job.
- Guardar logs sin credenciales sensibles.

## Fases de implementacion

### Fase 1: base V2 local TypeScript

- Crear `plan_v2.md`.
- Modularizar el codigo actual en funciones reutilizables.
- Mantener los comandos `pnpm run explore`, `pnpm run download` y `pnpm run csv`.
- Agregar soporte para parametros por job.
- Migrar `src/grafana/` a TypeScript.
- Agregar tipos compartidos.
- Validar con `pnpm run typecheck` y `pnpm run build`.

### Fase 2: jobs locales

- Crear almacenamiento de jobs.
- Crear chunks por rango de fechas.
- Registrar progreso por chunk.
- Reanudar jobs incompletos.
- Saltar chunks existentes.

### Fase 3: outputs finales

- Generar CSV largo final por job como salida principal.
- Generar CSV ancho final opcional.
- Agregar dedupe inicial.
- Registrar artifacts finales.
- Generar ZIP tecnico opcional.

### Fase 4: API local

- Crear `POST /api/jobs`.
- Crear `GET /api/jobs`.
- Crear `GET /api/jobs/:id`.
- Crear endpoints de logs y artifacts.
- Crear descarga directa de CSV largo y CSV ancho opcional.

### Fase 5: webapp

- Crear formulario de nuevo job.
- Crear listado de jobs.
- Crear vista de detalle con progreso.
- Crear descarga de artifacts.
- Mostrar logs basicos.

### Fase 6: Docker local

- Crear Dockerfile con Playwright.
- Crear `docker-compose.yml`.
- Montar volumen `data/`.
- Probar descarga desde contenedor.

### Fase 7: despliegue en VPS

- Subir repo al VPS.
- Levantar contenedores.
- Configurar puerto/dominio.
- Configurar volumen persistente.
- Probar job de 1 hora.
- Probar job de 7 dias.
- Probar job largo.

### Fase 8: robustez

- Cancelar jobs.
- Reintentar chunks fallidos desde UI.
- Dedupe configurable.
- Selector de sensores.
- Modo agregado vs individual vs ambos.
- Exportacion a Parquet opcional.
- Subida opcional a S3/R2/Supabase Storage.

## Decision sobre Vercel, Supabase y Convex

Para la primera V2 funcional:

```txt
usar VPS + Docker
no usar Vercel
no usar Convex
usar SQLite o Postgres local
```

Supabase podria entrar despues si se quiere:

- autenticacion de usuarios
- base de datos gestionada
- storage para archivos
- compartir datasets descargados

Vercel podria entrar despues si se quiere separar frontend bonito/publico del worker:

```txt
Vercel frontend -> API en VPS -> worker en VPS -> storage
```

Convex podria entrar despues si se quiere UI reactiva en tiempo real, pero no es necesario para resolver el problema principal.

## Primer incremento recomendado

El siguiente paso de implementacion debe ser pequeno:

1. Crear modelo de `job` y `chunk` en archivos locales.
2. Adaptar el descargador actual para ejecutar un job definido por JSON.
3. Generar `csv_long` principal y `csv_wide` opcional.
4. Probar con un rango de hasta 10 dias.
5. Solo despues crear la UI.

Esto reduce riesgo: primero se estabiliza el motor por trabajos, luego se pone la webapp encima.

## Plan operativo por fases

Esta seccion separa el trabajo entre tareas en serie, tareas paralelas, tareas automatizables y tareas que debe hacer el usuario.

### Resumen ejecutivo

```txt
Fase 0: decisiones y accesos
  |
  v
Fase 1: motor V2 local TypeScript
  |
  v
Fase 2: jobs reanudables
  |
  +---- paralelo: diseno UI
  +---- paralelo: preparacion VPS
  |
  v
Fase 3: outputs finales de job
  |
  v
Fase 4: API local
  |
  v
Fase 5: webapp local
  |
  v
Fase 6: Docker local
  |
  v
Fase 7: despliegue VPS
  |
  v
Fase 8: endurecimiento y mejoras
```

El camino critico es:

```txt
motor TypeScript reusable -> jobs reanudables -> outputs finales -> API -> webapp -> Docker -> VPS
```

Sin motor reusable no conviene construir la webapp. Sin jobs reanudables y outputs finales no conviene correr descargas grandes en la nube.

## Fase 0: decisiones y accesos

Objetivo: definir las condiciones de despliegue antes de escribir la webapp.

### En serie

- Confirmar que la V2 se montara en el VPS de Hostinger.
- Confirmar si la app sera privada.
- Confirmar dominio o subdominio, si aplica.
- Confirmar si el dashboard de Grafana requiere login o no.

### Puede ir en paralelo

- Revisar recursos del VPS: RAM, CPU, disco disponible.
- Revisar si Docker Compose ya esta instalado.
- Definir nombre del proyecto/contenedor.
- Definir si se usara SQLite o Postgres.

### Lo hace el usuario

- Dar acceso al VPS o ejecutar comandos que yo indique.
- Confirmar el dominio/subdominio, si se quiere exponer publicamente.
- Confirmar si la webapp debe tener login.
- Confirmar si el dominio permitido inicial sera solo `grafana.canair.io`.

### Automatizable

- Checklist de prerequisitos del VPS.
- Script de diagnostico del VPS.
- Archivo `.env.example`.
- Configuracion base de Docker Compose.

### Entregable

```txt
docs/v2_decisiones.md
.env.example
```

## Fase 1: motor V2 local TypeScript

Objetivo: convertir los scripts actuales en un motor reutilizable por CLI, API y worker.

### En serie

- Extraer funciones comunes del script actual.
- Crear estructura `src/grafana/`.
- Migrar el nucleo a TypeScript.
- Crear `src/grafana/types.ts`.
- Hacer que una descarga acepte un objeto `job`.
- Mantener compatibilidad con los comandos actuales.
- Compilar a `dist/`.
- Probar una descarga de 1 hora.
- Probar una descarga de 7 dias.

### Puede ir en paralelo

- Disenar formato `csv_long`.
- Disenar formato `csv_wide`.
- Definir esquema de manifest por chunk.
- Documentar ejemplos de jobs.

### Lo hace el usuario

- Validar si las columnas del CSV largo resultante sirven para su analisis en R.
- Comparar una muestra contra el CSV manual de Grafana Inspect.
- Confirmar `csv_long` como formato principal y `csv_wide` como opcional.

### Automatizable

- Refactor de codigo.
- Migracion TypeScript.
- Typecheck.
- Build.
- Pruebas de sintaxis.
- Ejecucion de descarga corta.
- Ejecucion de descarga de 7 dias.
- Generacion de CSVs.
- Generacion opcional de ZIP tecnico.

### Entregable

```txt
src/grafana/*.ts
examples/job.pm25-cali.7d.json
data/jobs/<jobId>/
```

Estado: base TypeScript completada. Los wrappers CLI permanecen en `scripts/*.js`.

## Fase 2: jobs reanudables

Objetivo: que una descarga larga pueda pausarse, fallar, reintentarse y continuar sin empezar desde cero.

### En serie

- Crear modelo de `job`.
- Crear modelo de `chunk`.
- Dividir rango en ventanas.
- Guardar estado de cada chunk.
- Saltar chunks ya completados.
- Reintentar chunks fallidos.
- Marcar job como completado solo cuando todos los chunks terminen.

### Puede ir en paralelo

- Disenar mensajes de log.
- Disenar estados visibles para la UI.
- Disenar estrategia de deduplicacion.
- Preparar pruebas con rangos de maximo 10 dias en la primera version.

### Lo hace el usuario

- Definir si mas adelante se amplia el limite de 10 dias.
- Definir tamano inicial de ventana para produccion, por ejemplo 1 dia o 6 horas.
- Definir si una ventana fallida debe detener todo el job o solo quedar marcada como fallida.

### Automatizable

- Creacion de chunks.
- Reanudacion.
- Reintentos.
- Reduccion automatica de ventana.
- Manifest y logs.
- Reporte final del job.

### Entregable

```txt
data/jobs/<jobId>/job.json
data/jobs/<jobId>/chunks.jsonl
data/jobs/<jobId>/manifest.jsonl
data/jobs/<jobId>/logs.txt
```

Estado: base local implementada. Falta cerrar el job con outputs finales A3.

## Fase 3: outputs finales de job

Objetivo: producir un resultado final util por job a partir de los JSON crudos por chunk.

### En serie

- Leer todos los JSON crudos del job.
- Normalizar DataFrames de Grafana a filas largas.
- Aplicar dedupe inicial para traslapes.
- Escribir un CSV largo final.
- Escribir un CSV ancho final opcional.
- Registrar artifacts finales.
- Mantener JSON crudo como artifact interno.
- Generar ZIP tecnico opcional.

### Puede ir en paralelo

- Validar nombres de columnas con el usuario.
- Definir si la salida wide se genera siempre o por opcion.
- Definir clave exacta de dedupe.

### Lo hace el usuario

- Validar el CSV largo final en R.
- Validar si el CSV ancho opcional sirve para revision rapida.
- Confirmar si dedupe conserva las mediciones esperadas.

### Automatizable

- Conversor TypeScript.
- Dedupe.
- Escritura de artifacts.
- Pruebas con jobs de ejemplo.

### Entregable

```txt
data/jobs/<jobId>/csv/<jobId>.long.csv
data/jobs/<jobId>/csv/<jobId>.wide.csv opcional
data/jobs/<jobId>/artifacts.json
```

## Fase 4: API local

Objetivo: exponer el motor por HTTP para que la webapp sea una capa delgada.

### En serie

- Crear servidor local.
- Crear endpoint para crear jobs.
- Crear endpoints para listar y consultar jobs.
- Crear endpoints para logs y artifacts.
- Crear endpoint de descarga de CSV largo.
- Crear endpoint de descarga de CSV ancho opcional.

### Entregable

```txt
POST /api/jobs
GET /api/jobs
GET /api/jobs/:id
GET /api/jobs/:id/logs
GET /api/jobs/:id/artifacts
GET /api/jobs/:id/download/csv-long
GET /api/jobs/:id/download/csv-wide
```

## Fase 5: webapp local

Objetivo: crear una interfaz para lanzar y monitorear descargas.

### En serie

- Crear backend API.
- Crear formulario de nuevo job.
- Crear listado de jobs.
- Crear pagina de detalle de job.
- Conectar la UI con el motor local.
- Agregar descarga de archivos.

### Puede ir en paralelo

- Disenar la UI.
- Definir textos y etiquetas.
- Preparar validaciones de formulario.
- Preparar endpoints de logs y artifacts.

### Lo hace el usuario

- Probar el flujo desde navegador.
- Decidir si la interfaz necesita login desde el inicio.
- Confirmar que los campos del formulario son suficientes.
- Confirmar nombres de botones, estados y formatos de descarga.

### Automatizable

- Scaffold de la webapp.
- API local.
- Paginas basicas.
- Validacion de campos.
- Polling de estado.
- Descarga de CSV largo y CSV ancho opcional.
- Descarga de ZIP tecnico opcional.

### Entregable

```txt
src/server/
src/web/
pnpm run dev
```

## Fase 6: Docker local

Objetivo: empaquetar la aplicacion para que corra igual en local y en el VPS.

### En serie

- Crear Dockerfile con dependencias de Playwright.
- Crear `docker-compose.yml`.
- Montar volumen persistente `data/`.
- Probar que Chromium abre dentro del contenedor.
- Probar job corto dentro del contenedor.
- Probar descarga de artifacts desde la webapp.

### Puede ir en paralelo

- Preparar `.env.example`.
- Preparar documentacion de despliegue.
- Preparar scripts de backup de `data/`.

### Lo hace el usuario

- Confirmar si el contenedor debe convivir con OpenClaw en la misma red Docker.
- Confirmar puerto interno y externo.
- Confirmar ruta de volumen en el VPS.

### Automatizable

- Dockerfile.
- Compose.
- Healthcheck.
- Script de arranque.
- Prueba local del contenedor.

### Entregable

```txt
Dockerfile
docker-compose.yml
.env.example
docs/deploy_vps.md
```

## Fase 7: despliegue en VPS

Objetivo: dejar la aplicacion funcionando en Hostinger.

### En serie

- Copiar repo al VPS.
- Configurar `.env`.
- Crear volumen persistente.
- Levantar contenedores.
- Verificar logs.
- Ejecutar job de prueba de 1 hora.
- Ejecutar job de prueba de 7 dias.
- Configurar acceso web.

### Puede ir en paralelo

- Configurar DNS.
- Configurar proxy reverso.
- Preparar backup.
- Preparar usuario/clave si hay basic auth.

### Lo hace el usuario

- Dar acceso SSH o ejecutar los comandos.
- Crear/apuntar dominio o subdominio si aplica.
- Confirmar reglas de firewall/puertos.
- Confirmar si puede convivir con el contenedor actual de OpenClaw.

### Automatizable

- Build Docker.
- Levantar servicios.
- Revisar logs.
- Ejecutar job de prueba.
- Crear backup comprimido de resultados.

### Entregable

```txt
webapp accesible en VPS
job de prueba completado
data/jobs/<jobId>/result.zip
```

## Fase 8: endurecimiento y mejoras

Objetivo: convertir la V2 funcional en una herramienta confiable para datasets grandes.

### En serie

- Agregar cancelacion de jobs.
- Agregar retry manual desde UI.
- Agregar dedupe configurable.
- Agregar selector de sensores.
- Agregar modo agregado/individual/ambos.

### Puede ir en paralelo

- Evaluar Supabase Storage o S3/R2 para artifacts.
- Evaluar Postgres gestionado.
- Evaluar Vercel solo para frontend.
- Evaluar autenticacion mas formal.

### Lo hace el usuario

- Priorizar mejoras segun uso real.
- Definir si los resultados deben compartirse con terceros.
- Definir politicas de retencion de archivos.
- Definir limites: rango maximo, jobs simultaneos, dominios permitidos.

### Automatizable

- Limpieza de archivos antiguos.
- Backups programados.
- Exportacion Parquet.
- Subida a storage externo.
- Reporte de calidad/cobertura.

### Entregable

```txt
version estable desplegada
politica de backups
politica de retencion
selector de modo de exportacion
```

## Mapa de paralelizacion

### Trabajo que debe ir en serie

- Refactor del motor antes de webapp.
- Jobs reanudables antes de descargas grandes en VPS.
- Docker antes de despliegue real.
- Despliegue antes de automatizar backups del VPS.

### Trabajo que puede ir en paralelo

- Preparacion del VPS mientras se refactoriza el motor.
- Diseno de UI mientras se implementan jobs.
- Definicion de CSV long/wide mientras se implementa el backend.
- Documentacion de despliegue mientras se arma Docker.
- DNS/proxy mientras se prueba el contenedor local.

### Trabajo que debe hacer el usuario

- Confirmar acceso al VPS.
- Confirmar dominio/subdominio.
- Confirmar puerto o proxy.
- Confirmar si la app sera privada.
- Validar una muestra contra Grafana Inspect.
- Decidir rangos historicos reales.
- Decidir politica de almacenamiento y borrado de datos.

### Trabajo automatizable por el asistente

- Refactor del codigo.
- Implementacion del motor por jobs.
- Implementacion de webapp.
- Dockerfile y Compose.
- Scripts de despliegue.
- Scripts de backup.
- Generacion de CSV/ZIP.
- Pruebas locales.
- Documentacion tecnica.

## Primer bloque de trabajo recomendado

El siguiente bloque debe ser:

1. Implementar A3: CSV largo final, CSV ancho opcional y dedupe.
2. Registrar artifacts finales por job.
3. Crear API local.
4. Crear webapp local.
5. Empaquetar en Docker.
6. Desplegar en VPS por Tailscale/puerto privado.

Cuando A3 este validado, la webapp sera una capa encima de un motor que ya produce el resultado final esperado.
