Sí: como >15 días te da 502/503, lo correcto es **partir 2026 en ventanas de 14 o 15 días**, pedir cada ventana y guardar los JSON/CSV automáticamente.

Para dashboards públicos de Grafana normalmente no necesitas login. El navegador carga el dashboard y luego hace requests tipo:

```txt
POST /api/public/dashboards/<token>/panels/<panelId>/query
```

Ese patrón aparece en reportes de Grafana/public dashboards y tráfico de navegador; Grafana también documenta los “shared/public dashboards” como dashboards accesibles vía UID/token público. ([Grafana Labs Community Forums][1])

## Opción recomendada: script automático con Playwright

Esto abre el dashboard como si fuera el navegador, captura los JSON de cada panel, y repite por ventanas de 14 días.

### 1. Instala dependencias

```bash
mkdir descarga-canair
cd descarga-canair

npm init -y
npm i playwright
npx playwright install chromium
```

### 2. Crea `descargar-canair.js`

```js
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const DASHBOARD =
  "https://grafana.canair.io/public-dashboards/5aeb98df389e424c84d20316a4c9436b";

const OUT_DIR = "canair_2026_json";
const DAYS_PER_CHUNK = 14;

// Desde 2026-01-01 hasta hoy
const start = new Date("2026-01-01T00:00:00-05:00");
const end = new Date();

fs.mkdirSync(OUT_DIR, { recursive: true });

function fmt(d) {
  return d.toISOString().replace(/[:.]/g, "-");
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function buildUrl(from, to) {
  return `${DASHBOARD}?from=${from.getTime()}&to=${to.getTime()}&timezone=browser&refresh=5m`;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
  });

  let chunkStart = new Date(start);
  let chunkNumber = 1;

  while (chunkStart < end) {
    const chunkEnd = addDays(chunkStart, DAYS_PER_CHUNK);
    const realEnd = chunkEnd > end ? end : chunkEnd;

    const label = `${fmt(chunkStart)}__${fmt(realEnd)}`;
    const url = buildUrl(chunkStart, realEnd);

    console.log(`\n[${chunkNumber}] Descargando ${label}`);
    console.log(url);

    const page = await browser.newPage();

    const responses = [];

    page.on("response", async (response) => {
      const req = response.request();
      const reqUrl = response.url();

      const isPanelQuery =
        req.method() === "POST" &&
        reqUrl.includes("/api/public/dashboards/") &&
        reqUrl.includes("/panels/") &&
        reqUrl.includes("/query");

      if (!isPanelQuery) return;

      try {
        const status = response.status();
        const body = await response.json();

        const match = reqUrl.match(/\/panels\/([^/]+)\/query/);
        const panelId = match ? match[1] : "unknown";

        responses.push({
          panelId,
          status,
          url: reqUrl,
          requestPostData: req.postDataJSON?.() ?? null,
          response: body,
        });

        console.log(`  panel ${panelId}: HTTP ${status}`);
      } catch (err) {
        console.log(`  No pude leer respuesta: ${reqUrl}`);
      }
    });

    try {
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 90_000,
      });

      // Dale tiempo extra a paneles lentos
      await page.waitForTimeout(15_000);

      const file = path.join(OUT_DIR, `${label}.json`);
      fs.writeFileSync(
        file,
        JSON.stringify(
          {
            from: chunkStart.toISOString(),
            to: realEnd.toISOString(),
            dashboard: url,
            responses,
          },
          null,
          2
        )
      );

      console.log(`  Guardado: ${file}`);
    } catch (err) {
      console.error(`  ERROR en ventana ${label}: ${err.message}`);
    } finally {
      await page.close();
    }

    chunkStart = realEnd;
    chunkNumber += 1;

    // Pausa suave para no castigar el servidor
    await new Promise((r) => setTimeout(r, 3000));
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

### 3. Ejecútalo

```bash
node descargar-canair.js
```

Eso te va a crear una carpeta:

```txt
canair_2026_json/
```

con archivos JSON por cada ventana de 14 días.

---

## Convertir los JSON a CSV

Crea `json-a-csv.js`:

```js
const fs = require("fs");
const path = require("path");

const IN_DIR = "canair_2026_json";
const OUT_FILE = "canair_2026.csv";

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function flattenGrafanaFrames(doc) {
  const rows = [];

  for (const panelResp of doc.responses || []) {
    const panelId = panelResp.panelId;
    const results = panelResp.response?.results || {};

    for (const [refId, result] of Object.entries(results)) {
      const frames = result.frames || [];

      for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
        const frame = frames[frameIndex];

        const fields = frame.schema?.fields || [];
        const values = frame.data?.values || [];

        if (!fields.length || !values.length) continue;

        const maxLen = Math.max(...values.map((v) => v?.length || 0));

        for (let i = 0; i < maxLen; i++) {
          const row = {
            chunk_from: doc.from,
            chunk_to: doc.to,
            panel_id: panelId,
            ref_id: refId,
            frame_index: frameIndex,
          };

          for (let col = 0; col < fields.length; col++) {
            const name = fields[col]?.name || `field_${col}`;
            row[name] = values[col]?.[i] ?? "";
          }

          rows.push(row);
        }
      }
    }
  }

  return rows;
}

const allRows = [];

for (const file of fs.readdirSync(IN_DIR)) {
  if (!file.endsWith(".json")) continue;

  const fullPath = path.join(IN_DIR, file);
  const doc = JSON.parse(fs.readFileSync(fullPath, "utf8"));

  const rows = flattenGrafanaFrames(doc);
  allRows.push(...rows);
}

const headers = Array.from(
  allRows.reduce((set, row) => {
    Object.keys(row).forEach((k) => set.add(k));
    return set;
  }, new Set())
);

const csv = [
  headers.join(","),
  ...allRows.map((row) => headers.map((h) => csvEscape(row[h])).join(",")),
].join("\n");

fs.writeFileSync(OUT_FILE, csv);
console.log(`Listo: ${OUT_FILE}`);
console.log(`Filas: ${allRows.length}`);
```

Ejecuta:

```bash
node json-a-csv.js
```

Te genera:

```txt
canair_2026.csv
```

---

## Si vuelve a fallar con 502/503

Baja el tamaño de ventana:

```js
const DAYS_PER_CHUNK = 7;
```

o incluso:

```js
const DAYS_PER_CHUNK = 3;
```

La lógica es la misma: menos rango = menos carga para Grafana.

## Lo importante

No tienes que descargar manualmente panel por panel. Este script usa el mismo endpoint que usa el dashboard público:

```txt
/api/public/dashboards/<token>/panels/<panelId>/query
```

y lo repite automáticamente desde `2026-01-01` hasta la fecha actual.

[1]: https://community.grafana.com/t/linked-public-dashboards-show-errors-on-1st-load/147726?utm_source=chatgpt.com "Linked public dashboards show errors on 1st load"

