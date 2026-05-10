const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const {
  addDays,
  appendJsonl,
  buildDashboardUrl,
  countFrames,
  ensureDir,
  hasGrafanaFrames,
  isLikelyDataRequest,
  loadConfig,
  makeChunkFile,
  sleep,
  toDate,
} = require("./grafana-common");

async function main() {
  const config = loadConfig();
  ensureDir(path.join(config.outDir, "raw"));
  ensureDir(path.join(config.outDir, "logs"));

  const start = toDate(config.startDate, "startDate");
  const end = toDate(config.endDate, "endDate");
  if (start >= end) throw new Error("startDate debe ser anterior a endDate");

  const browser = await chromium.launch({ headless: config.headless });
  const contextOptions = {};
  if (config.authStateFile) contextOptions.storageState = config.authStateFile;
  const context = await browser.newContext(contextOptions);

  try {
    await downloadRange(context, config, start, end, config.daysPerChunk);
  } finally {
    await browser.close();
  }
}

async function downloadRange(context, config, start, end, daysPerChunk) {
  let chunkStart = new Date(start);
  while (chunkStart < end) {
    const nominalEnd = addDays(chunkStart, daysPerChunk);
    const chunkEnd = nominalEnd > end ? end : nominalEnd;
    await downloadChunkWithFallback(context, config, chunkStart, chunkEnd, daysPerChunk);
    chunkStart = chunkEnd;
    if (config.requestPauseMs > 0) await sleep(config.requestPauseMs);
  }
}

async function downloadChunkWithFallback(context, config, from, to, daysPerChunk) {
  const outputFile = makeChunkFile(config, from, to);
  const manifestFile = path.join(config.outDir, "manifest.jsonl");

  if (fs.existsSync(outputFile)) {
    appendJsonl(manifestFile, {
      chunk_from: from.toISOString(),
      chunk_to: to.toISOString(),
      status: "skipped_existing",
      output_file: outputFile,
      finished_at: new Date().toISOString(),
    });
    console.log(`Saltando existente: ${outputFile}`);
    return;
  }

  let lastError = null;
  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt += 1) {
    try {
      const result = await captureChunk(context, config, from, to, attempt);
      fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
      appendManifest(manifestFile, config, from, to, "ok", attempt, outputFile, result);
      console.log(`Guardado: ${outputFile}`);
      return;
    } catch (error) {
      lastError = error;
      console.error(
        `Fallo ${from.toISOString()} - ${to.toISOString()} intento ${attempt}: ${error.message}`
      );
      if (attempt <= config.maxRetries) {
        await sleep(config.requestPauseMs * attempt);
      }
    }
  }

  if (daysPerChunk > config.minDaysPerChunk) {
    const mid = new Date((from.getTime() + to.getTime()) / 2);
    console.log(`Dividiendo ventana: ${from.toISOString()} - ${to.toISOString()}`);
    await downloadChunkWithFallback(context, config, from, mid, daysPerChunk / 2);
    await downloadChunkWithFallback(context, config, mid, to, daysPerChunk / 2);
    return;
  }

  appendJsonl(manifestFile, {
    panel_id: config.panelId,
    panel_title: config.panelTitle,
    chunk_from: from.toISOString(),
    chunk_to: to.toISOString(),
    status: "failed",
    attempts: config.maxRetries + 1,
    output_file: outputFile,
    error_message: lastError ? lastError.message : "Error desconocido",
    finished_at: new Date().toISOString(),
  });
}

async function captureChunk(context, config, from, to, attempt) {
  const url = buildDashboardUrl(config.dashboardUrl, from, to, config.timezone);
  const page = await context.newPage();
  const responses = [];
  const errors = [];
  let lastDataAt = Date.now();

  page.on("response", async (response) => {
    const request = response.request();
    if (!isLikelyDataRequest(request, response.url())) return;

    const entry = {
      url: response.url(),
      method: request.method(),
      status: response.status(),
      requestPostData: safePostData(request),
      response: null,
      capturedAt: new Date().toISOString(),
    };

    try {
      entry.response = await response.json();
      const counts = countFrames(entry.response);
      entry.frameCount = counts.frames;
      entry.rowCount = counts.rows;
      if (hasGrafanaFrames(entry.response)) lastDataAt = Date.now();
    } catch (error) {
      entry.error = error.message;
    }

    responses.push(entry);
  });

  page.on("pageerror", (error) => errors.push({ type: "pageerror", message: error.message }));
  page.on("requestfailed", (request) => {
    if (isLikelyDataRequest(request)) {
      errors.push({
        type: "requestfailed",
        url: request.url(),
        failure: request.failure()?.errorText,
      });
    }
  });

  try {
    console.log(`Descargando: ${from.toISOString()} - ${to.toISOString()}`);
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: config.navigationTimeoutMs,
    });
    await page.waitForTimeout(config.postLoadWaitMs);

    while (Date.now() - lastDataAt < config.quietPeriodMs) {
      await page.waitForTimeout(500);
    }
  } finally {
    await page.close();
  }

  const frameResponses = responses.filter((entry) => hasGrafanaFrames(entry.response));
  if (!frameResponses.length) {
    throw new Error("No se capturaron respuestas con DataFrames de Grafana");
  }

  const badStatuses = responses.filter((entry) =>
    [502, 503, 504].includes(Number(entry.status))
  );
  if (badStatuses.length) {
    throw new Error(`Respuestas HTTP fallidas: ${badStatuses.map((r) => r.status).join(", ")}`);
  }

  return {
    dashboardUrl: url,
    panelId: config.panelId,
    panelTitle: config.panelTitle,
    from: from.toISOString(),
    to: to.toISOString(),
    timezone: config.timezone,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    attempt,
    responses,
    errors,
  };
}

function appendManifest(file, config, from, to, status, attempts, outputFile, result) {
  const totals = result.responses.reduce(
    (acc, entry) => {
      acc.frames += entry.frameCount || 0;
      acc.rows += entry.rowCount || 0;
      return acc;
    },
    { frames: 0, rows: 0 }
  );

  appendJsonl(file, {
    panel_id: config.panelId,
    panel_title: config.panelTitle,
    chunk_from: from.toISOString(),
    chunk_to: to.toISOString(),
    status,
    attempts,
    http_status: Array.from(new Set(result.responses.map((r) => r.status))).join(";"),
    frames_captured: totals.frames,
    rows_estimated: totals.rows,
    output_file: outputFile,
    error_message: "",
    finished_at: new Date().toISOString(),
  });
}

function safePostData(request) {
  try {
    return request.postDataJSON();
  } catch {
    return request.postData();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
