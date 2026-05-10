const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG = {
  dashboardUrl:
    "https://grafana.canair.io/d/UN_OsIo7k/tangara?orgId=1&from=now-1h&to=now&timezone=browser",
  panelTitle: "PM2.5 Sensores Cali",
  panelId: null,
  startDate: "2026-01-01T00:00:00-05:00",
  endDate: new Date().toISOString(),
  timezone: "America/Bogota",
  daysPerChunk: 14,
  minDaysPerChunk: 1,
  outDir: "data",
  requestPauseMs: 3000,
  maxRetries: 2,
  headless: true,
  authStateFile: null,
  navigationTimeoutMs: 90000,
  quietPeriodMs: 8000,
  postLoadWaitMs: 3000,
  maxDataPoints: 2000,
};

function loadConfig() {
  const configPath = process.env.CONFIG || "config.local.json";
  let fileConfig = {};

  if (fs.existsSync(configPath)) {
    fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  const config = { ...DEFAULT_CONFIG, ...fileConfig };

  config.dashboardUrl = envOr(config.dashboardUrl, "DASHBOARD_URL");
  config.panelTitle = envOr(config.panelTitle, "PANEL_TITLE");
  config.panelId = envOr(config.panelId, "PANEL_ID");
  config.startDate = envOr(config.startDate, "START_DATE");
  config.endDate = envOr(config.endDate, "END_DATE");
  config.timezone = envOr(config.timezone, "TIMEZONE");
  config.outDir = envOr(config.outDir, "OUT_DIR");
  config.authStateFile = envOr(config.authStateFile, "AUTH_STATE_FILE");

  config.daysPerChunk = numEnvOr(config.daysPerChunk, "DAYS_PER_CHUNK");
  config.minDaysPerChunk = numEnvOr(config.minDaysPerChunk, "MIN_DAYS_PER_CHUNK");
  config.requestPauseMs = numEnvOr(config.requestPauseMs, "REQUEST_PAUSE_MS");
  config.maxRetries = numEnvOr(config.maxRetries, "MAX_RETRIES");
  config.navigationTimeoutMs = numEnvOr(
    config.navigationTimeoutMs,
    "NAVIGATION_TIMEOUT_MS"
  );
  config.quietPeriodMs = numEnvOr(config.quietPeriodMs, "QUIET_PERIOD_MS");
  config.postLoadWaitMs = numEnvOr(config.postLoadWaitMs, "POST_LOAD_WAIT_MS");
  config.maxDataPoints = numEnvOr(config.maxDataPoints, "MAX_DATA_POINTS");

  if (process.env.HEADLESS) {
    config.headless = !["0", "false", "no"].includes(
      process.env.HEADLESS.toLowerCase()
    );
  }

  return config;
}

function envOr(value, name) {
  return process.env[name] === undefined ? value : process.env[name];
}

function numEnvOr(value, name) {
  return process.env[name] === undefined ? value : Number(process.env[name]);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDate(value, fieldName) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Fecha invalida en ${fieldName}: ${value}`);
  }
  return date;
}

function formatStamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sanitizeName(value) {
  return String(value || "grafana")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function buildDashboardUrl(baseUrl, from, to, timezone) {
  const url = new URL(baseUrl);
  url.searchParams.set("from", String(from.getTime()));
  url.searchParams.set("to", String(to.getTime()));
  url.searchParams.set("timezone", timezone || "browser");
  url.searchParams.delete("refresh");
  return url.toString();
}

function isLikelyDataRequest(request, responseUrl = "") {
  const url = responseUrl || request.url();
  if (request.method() !== "POST") return false;
  return (
    url.includes("/api/ds/query") ||
    url.includes("/api/public/dashboards/") ||
    url.includes("/panels/") ||
    url.includes("/query")
  );
}

function hasGrafanaFrames(payload) {
  if (!payload || typeof payload !== "object") return false;
  const results = payload.results || payload.data?.results;
  if (!results || typeof results !== "object") return false;
  return Object.values(results).some((result) => Array.isArray(result.frames));
}

function countFrames(payload) {
  const results = payload?.results || payload?.data?.results || {};
  let frames = 0;
  let rows = 0;

  for (const result of Object.values(results)) {
    for (const frame of result.frames || []) {
      frames += 1;
      const values = frame.data?.values || [];
      rows += values.length ? Math.max(...values.map((v) => v?.length || 0)) : 0;
    }
  }

  return { frames, rows };
}

function makeChunkFile(config, from, to, suffix = "json") {
  const panel = sanitizeName(config.panelTitle || config.panelId || "panel");
  return path.join(
    config.outDir,
    "raw",
    `${panel}__${formatStamp(from)}__${formatStamp(to)}.${suffix}`
  );
}

function appendJsonl(file, record) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
}

module.exports = {
  appendJsonl,
  buildDashboardUrl,
  countFrames,
  ensureDir,
  formatStamp,
  hasGrafanaFrames,
  isLikelyDataRequest,
  loadConfig,
  makeChunkFile,
  sanitizeName,
  sleep,
  addDays,
  toDate,
};
