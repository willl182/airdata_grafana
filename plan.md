# Plan para descargar datos desde el dashboard de Grafana

## Contexto actualizado

La URL relevante es un dashboard normal de Grafana:

```txt
https://grafana.canair.io/d/UN_OsIo7k/tangara?orgId=1&from=now-1h&to=now&timezone=browser&refresh=1m
```

Ademas, la interfaz muestra que el panel permite:

- `Inspect > Data > Download CSV`
- `Inspect > JSON > DataFrame JSON (from Query)`

Esto mejora la viabilidad: Grafana ya esta exponiendo, desde la propia interfaz, los datos que usa el panel. El objetivo del script debe ser automatizar esa misma ruta, no hacer descargas manuales por panel y rango.

## Veredicto de viabilidad

Es viable descargar los datos del dashboard con automatizacion. La forma recomendada es capturar el request real que Grafana usa para obtener los datos del panel y repetirlo por ventanas temporales.

El plan original basado en `/api/public/dashboards/<token>/panels/<panelId>/query` aplica sobre todo a dashboards compartidos mediante `/public-dashboards/<token>`. Para esta URL `/d/UN_OsIo7k/tangara`, lo esperable es que Grafana use endpoints normales de consulta, probablemente del tipo:

```txt
POST /api/ds/query
```

u otro endpoint de datasource. El primer paso tecnico debe ser descubrir el endpoint exacto y el cuerpo de consulta que produce el panel.

## Que significa "no garantia de dato crudo"

El `DataFrame JSON (from Query)` es una fuente buena para el script porque representa los datos que la consulta entrega al panel antes de ciertas transformaciones visuales de Grafana.

Pero sigue sin ser necesariamente el dato original completo de la base. Puede estar filtrado, agregado o reducido por la consulta del panel. Por ejemplo, si la consulta agrupa por `30s`, promedia valores o limita puntos con `maxDataPoints`, el JSON contendra ese resultado, no cada registro original de la fuente.

Para este trabajo, eso no bloquea el enfoque. Si el objetivo es descargar lo que el dashboard muestra o exporta desde `Inspect`, esta es la forma adecuada.

## Objetivo del script

Automatizar la descarga de los datos exportables de uno o mas paneles de Grafana para rangos historicos, dividiendo el periodo en ventanas pequenas para evitar `502/503`, timeouts o consultas demasiado pesadas.

El resultado debe incluir:

- JSON crudo capturado desde la consulta del panel.
- CSV comparable con el `Download CSV` de Grafana.
- Manifest de ejecucion para saber que ventanas se descargaron, fallaron o quedaron incompletas.

## Supuestos

- El dashboard abre desde navegador con los permisos disponibles.
- Si hay login, Playwright puede usar una sesion autenticada o el usuario puede iniciar sesion una vez.
- El panel de interes permite inspeccion y exportacion de datos.
- Las consultas aceptan parametros `from` y `to` por rango temporal.
- El rango completo debe partirse en ventanas de 14 dias o menos.
- El parametro `refresh=1m` no debe usarse durante la descarga automatizada.

## Riesgos principales

- El endpoint exacto puede no ser `/api/public/dashboards/...`; hay que descubrirlo con captura de red.
- El CSV de `Inspect` puede aplicar formato distinto al `DataFrame JSON`.
- La consulta del panel puede estar agregando o reduciendo datos.
- Ventanas de 14 dias pueden seguir fallando; el script debe poder bajar a 7, 3 o 1 dia.
- Grafana puede requerir cookies de sesion, token CSRF u otros headers.
- Diferentes paneles pueden tener esquemas distintos.
- La zona horaria `browser` puede producir cortes ambiguos; conviene fijar una zona horaria consistente.

## Diseno propuesto

### 1. Script exploratorio de red

Crear primero un script corto, por ejemplo `explorar-grafana.js`, que:

- Abra el dashboard con Playwright.
- Quite `refresh=1m` de la URL.
- Use un rango pequeno, por ejemplo 1 hora o 1 dia.
- Capture todos los requests y responses relevantes.
- Liste endpoints, metodo HTTP, status, content-type y tamano de respuesta.
- Guarde los request bodies de consultas de datos.

Filtros iniciales:

- Requests `POST`.
- URLs que contengan `/api/ds/query`.
- URLs que contengan `/query`.
- Respuestas JSON.
- Respuestas con estructuras tipo `results`, `frames`, `schema`, `data.values`.

Salida esperada:

```txt
data/discovery/
  requests.json
  sample-response-panel-<panelId>.json
```

Con esta fase se confirma el endpoint real y la forma exacta del payload.

### 2. Metodo de descarga preferido

Despues de descubrir el request real, usar uno de estos dos metodos:

1. `APIRequestContext` o `fetch` con los mismos headers/cookies/payload.
2. Playwright renderizando el dashboard y capturando responses.

La primera opcion es preferible si funciona, porque es mas rapida, consume menos recursos y evita depender de tiempos de renderizado. La segunda queda como fallback si Grafana requiere contexto del navegador dificil de replicar.

### 3. Script principal de descarga

Crear `descargar-grafana.js`.

Responsabilidades:

- Leer configuracion.
- Generar ventanas temporales.
- Para cada ventana, construir `from` y `to`.
- Ejecutar la consulta del panel.
- Guardar el JSON crudo.
- Registrar estado en un manifest.
- Reintentar fallos.
- Reducir la ventana si hay errores persistentes.
- Permitir reanudar sin repetir ventanas exitosas.

Configuracion minima:

- `DASHBOARD_URL`
- `PANEL_TITLE` o `PANEL_ID`
- `START_DATE`
- `END_DATE`
- `TIMEZONE`
- `DAYS_PER_CHUNK`
- `OUT_DIR`
- `REQUEST_PAUSE_MS`
- `MAX_RETRIES`
- `HEADLESS`
- `AUTH_STATE_FILE`, si se necesita sesion autenticada.

### 4. Autenticacion y sesion

Si el dashboard abre sin login, no se requiere nada adicional.

Si pide login:

- Crear un flujo `login-grafana.js`.
- Abrir Chromium en modo visible.
- Permitir que el usuario inicie sesion manualmente.
- Guardar `storageState` en un archivo local, por ejemplo:

```txt
.auth/grafana-storage-state.json
```

Luego `descargar-grafana.js` usara ese estado de sesion para consultar el dashboard.

Ese archivo no debe subirse a git porque contiene cookies o credenciales de sesion.

### 5. Estructura de salida

Guardar JSON crudo por ventana:

```txt
data/raw/
  panel_pm25_cali__2026-01-01T00-00-00__2026-01-15T00-00-00.json
  panel_pm25_cali__2026-01-15T00-00-00__2026-01-29T00-00-00.json
```

Cada archivo debe incluir:

- `dashboardUrl`
- `panelId`
- `panelTitle`
- `from`
- `to`
- `timezone`
- `request`
- `response`
- `startedAt`
- `finishedAt`
- `attempt`
- `errors`

### 6. Manifest de ejecucion

Mantener `data/manifest.jsonl` con una fila por ventana.

Campos recomendados:

- `panel_id`
- `panel_title`
- `chunk_from`
- `chunk_to`
- `status`
- `attempts`
- `http_status`
- `frames_captured`
- `rows_estimated`
- `output_file`
- `error_message`
- `finished_at`

Esto permite auditar cobertura y reintentar solo lo fallido.

### 7. Reintentos y ventanas dinamicas

Para cada ventana:

1. Intentar con `DAYS_PER_CHUNK`, por ejemplo 14 dias.
2. Reintentar con backoff si hay `502`, `503`, `504`, timeout o respuesta incompleta.
3. Si falla varias veces, dividir la ventana en dos.
4. Continuar hasta un minimo configurable, por ejemplo 1 dia.
5. Si sigue fallando, marcar la ventana como `failed` y continuar.

### 8. Conversor JSON a CSV

Crear `grafana-json-a-csv.js`.

Responsabilidades:

- Leer `data/raw/*.json`.
- Detectar estructuras `results[refId].frames`.
- Convertir `schema.fields` y `data.values` en filas.
- Conservar columnas de contexto:
  - `chunk_from`
  - `chunk_to`
  - `panel_id`
  - `panel_title`
  - `ref_id`
  - `frame_index`
  - `source_file`

Salida recomendada:

```txt
data/csv/
  pm25_sensores_cali.csv
```

Si hay varios paneles o consultas con esquemas distintos, generar CSV separados por `panelId/refId`.

### 9. Validacion contra Grafana

Antes de descargar todo el historico:

1. Elegir una ventana corta.
2. Descargar manualmente el CSV desde `Inspect > Data > Download CSV`.
3. Ejecutar el script para la misma ventana.
4. Comparar:
   - cantidad de filas;
   - timestamps;
   - nombres de sensores;
   - valores;
   - unidades;
   - presencia de `undefined` o vacios.
5. Revisar tambien el `DataFrame JSON (from Query)` contra el JSON capturado.

Si coinciden, se puede ejecutar el rango completo con mayor confianza.

## Orden de implementacion

1. Crear `explorar-grafana.js` para descubrir requests reales del dashboard.
2. Ejecutar exploracion con una ventana de 1 hora o 1 dia.
3. Identificar endpoint, payload, headers necesarios y estructura de respuesta.
4. Confirmar si hay autenticacion o cookies necesarias.
5. Implementar `descargar-grafana.js` usando request directo si es posible.
6. Guardar JSON crudo por ventana.
7. Implementar manifest y reanudacion.
8. Agregar reintentos con backoff.
9. Agregar reduccion dinamica de ventanas.
10. Implementar `grafana-json-a-csv.js`.
11. Validar contra un CSV descargado manualmente desde `Inspect`.
12. Ejecutar prueba de 14 dias.
13. Ajustar ventana si aparecen `502/503`.
14. Ejecutar rango completo.

## Decision

Proceder con este enfoque es viable y razonable. La nueva informacion de `Inspect`, `Download CSV` y `DataFrame JSON (from Query)` confirma que Grafana ya entrega los datos del panel en una forma exportable. El script debe automatizar esa consulta real por ventanas temporales, guardar JSON crudo y generar CSV validado contra la exportacion manual de Grafana.
