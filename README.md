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

Convertir los JSON descargados a CSV:

```bash
pnpm run csv
```

Los comandos anteriores siguen usando `config.local.json` por defecto. La logica tambien puede invocarse desde codigo:

```js
const { loadConfig, runDownload } = require("./src/grafana");

runDownload(loadConfig());
```

Hay un ejemplo inicial de job en `examples/job.example.json`. La fase actual conserva `daysPerChunk` para compatibilidad; `chunkSize` queda documentado en el ejemplo para el motor por jobs de la siguiente fase.

## Salidas

```txt
data/discovery/requests.json
data/raw/*.json
data/manifest.jsonl
data/csv/*.csv
```

## Notas

- El endpoint real observado para este dashboard fue `POST /api/ds/query?ds_type=influxdb`.
- Quita `refresh=1m` durante las descargas para evitar consultas repetidas.
- Para rangos largos, empieza con `daysPerChunk: 14`; si aparecen `502/503`, baja a 7, 3 o 1.
- En algunos entornos Chromium debe ejecutarse fuera del sandbox del asistente.
