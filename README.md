# Grafana downloader

Herramientas Node.js para explorar y descargar datos exportables de paneles de Grafana por ventanas temporales.

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
