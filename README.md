# Grafana downloader

Herramientas Node.js para explorar y descargar datos exportables de paneles de Grafana por ventanas temporales.

## Estructura

```txt
src/grafana/              modulos reutilizables de la V2
scripts/                  wrappers CLI compatibles
examples/job.example.json ejemplo inicial de job
data/                     salidas locales ignoradas por git
```

## Instalacion

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
data/jobs/<jobId>/result.zip
data/jobs/<jobId>/manifest.jsonl
data/csv/*.csv
```

## Notas

- El endpoint real observado para este dashboard fue `POST /api/ds/query?ds_type=influxdb`.
- Quita `refresh=1m` durante las descargas para evitar consultas repetidas.
- Para rangos largos, empieza con `daysPerChunk: 14`; si aparecen `502/503`, baja a 7, 3 o 1.
- En algunos entornos Chromium debe ejecutarse fuera del sandbox del asistente.
