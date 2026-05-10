# Grafana downloader

Herramientas Node.js para explorar y descargar datos exportables de paneles de Grafana por ventanas temporales.

## Estado actual

La app ya puede correr localmente o en una VPS mediante Docker. El flujo principal es:

1. Crear una descarga desde la web.
2. Partir el rango en chunks.
3. Descargar JSON crudos.
4. Generar CSV largo final.
5. Persistir jobs y resultados en `data/jobs/<jobId>/`.

Se probo localmente con un rango de un mes usando chunks de 2 dias. El limite inicial de 10 dias esta desactivado temporalmente para pruebas; la app conserva el aviso en logs cuando el rango supera 10 dias.

## Uso rapido con Docker

Este es el camino recomendado para usar la app en otro equipo: no requiere instalar Node.js, pnpm ni Chromium en la maquina host.

```bash
git clone <repo>
cd grafana
docker compose up --build
```

Abre la web en:

```txt
http://127.0.0.1:3000
```

Si el puerto `3000` ya esta ocupado:

```bash
WEBAPP_PORT=3002 docker compose up --build
```

La API corre dentro del mismo contenedor en `127.0.0.1:3001`; la web la consume automaticamente. Los datos quedan persistidos en el volumen local:

```txt
./data:/app/data
```

Eso significa que los jobs, JSON crudos, CSV finales, ZIP tecnico, logs y estado sobreviven a reinicios del contenedor mientras no borres `./data`.

## Seguridad y alcance

La app esta pensada para uso local, laboratorio o VPS privada. Al clonar el repo y correrlo con Docker, el contenedor escribe sus resultados en `./data` dentro del proyecto mediante el volumen `./data:/app/data`.

Precauciones recomendadas:

- No publiques el puerto web directamente en internet sin firewall, VPN o Tailscale.
- Vigila el tamano de `data/` si descargas rangos largos.
- Empieza con chunks de 1 o 2 dias para rangos grandes.
- No uses credenciales personales en el repo. El portal usado actualmente es abierto.
- El boton `Borrar` solo oculta jobs de la interfaz; no libera espacio en disco.
- Para liberar espacio real, borra manualmente carpetas en `data/jobs/<jobId>/` despues de respaldarlas.

## Estructura

```txt
src/grafana/              modulos reutilizables de la V2
scripts/                  wrappers CLI compatibles
examples/job.example.json ejemplo inicial de job
data/                     salidas locales ignoradas por git
```

## Instalacion local sin Docker

```bash
pnpm install --store-dir .pnpm-store
pnpm run install:browsers
```

El proyecto usa un store local de `pnpm` y descarga Chromium en `.ms-playwright/`.

## Configuracion

Copia `config.example.json` a `config.local.json` y ajusta:

- `startDate`
- `endDate`
- `daysPerChunk`
- `panelTitle`
- `dashboardUrl`

`config.local.json` esta ignorado por git.

## Uso

### Webapp

Con Docker:

```bash
docker compose up --build
```

Luego entra a `http://127.0.0.1:3000`, crea un job desde el formulario y descarga los artefactos desde el detalle del job.

Con ejecucion local, levanta la API y la web por separado:

```bash
pnpm run api
cd webapp
npm run dev
```

### CLI

Explorar los requests reales del dashboard:

```bash
pnpm run explore
```

Descargar JSON crudo por ventanas:

```bash
pnpm run download
```

Ejecutar un job con chunks reanudables:

```bash
pnpm run download:job -- examples/job.example.json
pnpm run download:job -- examples/job.7d.example.json
```

Al terminar, el job genera el CSV largo final y, si `outputWide` esta activo, un CSV ancho:

```txt
data/jobs/<jobId>/csv/final_long.csv
data/jobs/<jobId>/csv/final_wide.csv
data/jobs/<jobId>/artifacts.json
data/jobs/<jobId>/logs.txt
data/jobs/<jobId>/result.zip
```

Convertir los JSON descargados a CSV:

```bash
pnpm run csv
```

Levantar la API local:

```bash
pnpm run api
```

La API escucha por defecto en `http://127.0.0.1:3001` y expone:

```txt
GET  /api/health
POST /api/jobs
GET  /api/jobs
GET  /api/jobs/<jobId>
POST /api/jobs/<jobId>/retry
POST /api/jobs/<jobId>/cancel
DELETE /api/jobs/<jobId>
GET  /api/jobs/<jobId>/logs
GET  /api/jobs/<jobId>/artifacts
GET  /api/jobs/<jobId>/artifacts/long
GET  /api/jobs/<jobId>/artifacts/wide
GET  /api/jobs/<jobId>/artifacts/zip
```

Crear un job via HTTP local:

```bash
curl -X POST http://127.0.0.1:3001/api/jobs \
  -H 'content-type: application/json' \
  --data-binary @examples/job.example.json
```

La API acepta dashboards de `grafana.canair.io`. El chunk por defecto para jobs HTTP es 1 dia. Temporalmente no bloquea rangos mayores a 10 dias para permitir pruebas largas; cuando el rango supera 10 dias, deja un aviso en logs.

Los comandos anteriores siguen usando `config.local.json` por defecto. La logica tambien puede invocarse desde codigo:

```js
const { loadConfig, runDownload } = require("./src/grafana");

runDownload(loadConfig());
```

Hay un ejemplo inicial de job en `examples/job.example.json`. El motor de jobs usa `startDate`, `endDate` y `chunkSize` para generar `data/jobs/<jobId>/chunks.jsonl`. Si el JSON crudo de un chunk ya existe, la siguiente ejecucion lo salta y registra el skip en `manifest.jsonl`.

## Salidas

```txt
data/discovery/requests.json
data/raw/*.json
data/manifest.jsonl
data/jobs/<jobId>/job.json
data/jobs/<jobId>/chunks.jsonl
data/jobs/<jobId>/raw/*.json
data/jobs/<jobId>/csv/final_long.csv
data/jobs/<jobId>/csv/final_wide.csv
data/jobs/<jobId>/artifacts.json
data/jobs/<jobId>/logs.txt
data/jobs/<jobId>/state.json
data/jobs/<jobId>/result.zip
data/jobs/<jobId>/manifest.jsonl
data/csv/*.csv
```

## Persistencia

Cada job vive en `data/jobs/<jobId>/`. La API reconstruye la lista de jobs leyendo esa carpeta, por eso los resultados siguen visibles despues de reiniciar Docker o la API.

Archivos principales por job:

```txt
job.json        configuracion normalizada del job
chunks.jsonl    chunks esperados para el rango solicitado
manifest.jsonl  historial de chunks completados, saltados o fallidos
state.json      estado de la API para el job
logs.txt        resumen final y rutas de artefactos
artifacts.json  CSV/ZIP disponibles para descarga
raw/            respuestas JSON crudas
csv/            CSV finales
```

Si el contenedor se apaga mientras un job esta en `queued` o `running`, al siguiente arranque la API marca ese job como `interrupted`. Los chunks crudos que ya existan no se pierden; al lanzar de nuevo el mismo job, el motor salta los chunks existentes y continua con los pendientes.

Desde el detalle del job en la web puedes:

- Reintentar jobs `failed`, `interrupted` o `canceled`; reutiliza los chunks ya guardados.
- Cancelar jobs `queued` o `running`; el proceso cierra Chromium y marca el job como `canceled`.
- Borrar jobs `completed`, `failed`, `interrupted` o `canceled` de la interfaz; los archivos quedan guardados en `data/jobs/<jobId>/`.

Las mismas acciones estan disponibles por API:

```bash
curl -X POST http://127.0.0.1:3001/api/jobs/<jobId>/retry
curl -X POST http://127.0.0.1:3001/api/jobs/<jobId>/cancel
curl -X DELETE http://127.0.0.1:3001/api/jobs/<jobId>
```

El borrado de la interfaz crea `data/jobs/<jobId>/.hidden.json` y agrega una linea en `data/jobs/deleted_jobs.jsonl`. Esto deja un log de los jobs ocultados y conserva los resultados para auditoria o recuperacion manual.

Para empezar desde cero, detiene la app y borra `data/`. Para liberar espacio real en disco, borra manualmente carpetas especificas dentro de `data/jobs/` despues de respaldarlas.

## Notas

- El endpoint real observado para este dashboard fue `POST /api/ds/query?ds_type=influxdb`.
- Quita `refresh=1m` durante las descargas para evitar consultas repetidas.
- Para rangos largos, empieza con chunks de 1 o 2 dias; si aparecen `502/503`, baja el tamano del chunk.
- Un rango de un mes con chunks de 2 dias funciono en prueba local. Aun asi, trata rangos largos como pruebas controladas por consumo de disco, CPU y red.
- En algunos entornos Chromium debe ejecutarse fuera del sandbox del asistente.
