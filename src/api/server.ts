/// <reference types="node" />

const fs = require("fs");
const http = require("http");
const path = require("path");
const { pipeline } = require("stream");
const { promisify } = require("util");
const { DEFAULT_CONFIG, toDate } = require("../grafana/common");
const { normalizeJob, runJob } = require("../grafana/jobs");

import type { IncomingMessage, Server, ServerResponse } from "http";
import type { Job, JobArtifact, NormalizedJob } from "../grafana/types";

const streamPipeline = promisify(pipeline);

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3001;
const JOBS_DIR = path.join("data", "jobs");
const DELETED_JOBS_LOG = path.join(JOBS_DIR, "deleted_jobs.jsonl");
const ALLOWED_HOST = "grafana.canair.io";
const MAX_RANGE_MS = 10 * 24 * 60 * 60 * 1000;
const WARN_RANGE_MS = MAX_RANGE_MS;
const MAX_BODY_BYTES = 1024 * 1024;

type JsonRecord = Record<string, unknown>;

interface ActiveJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "interrupted" | "canceled";
  started_at: string;
  finished_at?: string;
  error?: string;
  pid?: number;
  updated_at?: string;
}

const activeJobs = new Map<string, ActiveJob>();
const jobControllers = new Map<string, AbortController>();

function startServer(options: { host?: string; port?: number } = {}): Server {
  const host = options.host || process.env.API_HOST || process.env.HOST || DEFAULT_HOST;
  const port = Number(options.port || process.env.API_PORT || process.env.PORT || DEFAULT_PORT);
  const server = http.createServer(handleRequest);

  recoverPersistedJobStates();

  server.on("error", (error: NodeJS.ErrnoException) => {
    console.error(`No se pudo levantar la API local en ${host}:${port}: ${error.message}`);
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    console.log(`API local: http://${host}:${port}`);
  });

  return server;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // CORS headers for webapp dev server
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    await routeRequest(req, res);
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    sendError(res, statusCode, error instanceof Error ? error.message : String(error));
  }
}

async function routeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (parts[0] !== "api" || parts[1] !== "jobs") {
    sendError(res, 404, "Endpoint no encontrado");
    return;
  }

  if (method === "POST" && parts.length === 2) {
    await createJob(req, res);
    return;
  }

  if (method === "GET" && parts.length === 2) {
    sendJson(res, 200, { jobs: listJobs() });
    return;
  }

  const jobId = parts[2];
  if (!jobId || !isSafeJobId(jobId)) {
    sendError(res, 400, "job id invalido");
    return;
  }

  if (method === "GET" && parts.length === 3) {
    sendJson(res, 200, summarizeJob(jobId));
    return;
  }

  if (method === "DELETE" && parts.length === 3) {
    deleteJob(jobId, res);
    return;
  }

  if (method === "POST" && parts.length === 4 && parts[3] === "retry") {
    await retryJob(jobId, res);
    return;
  }

  if (method === "POST" && parts.length === 4 && parts[3] === "cancel") {
    cancelJob(jobId, res);
    return;
  }

  if (method === "GET" && parts.length === 4 && parts[3] === "logs") {
    sendText(res, 200, readLogs(jobId), "text/plain; charset=utf-8");
    return;
  }

  if (method === "GET" && parts.length === 4 && parts[3] === "artifacts") {
    sendJson(res, 200, readArtifacts(jobId));
    return;
  }

  if (method === "GET" && parts.length === 5 && parts[3] === "artifacts") {
    await sendArtifact(res, jobId, parts[4]);
    return;
  }

  sendError(res, 404, "Endpoint no encontrado");
}

async function createJob(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  const job = normalizeAndValidateJob(body as Job);

  const active = activeJobs.get(job.id);
  if (active && ["queued", "running"].includes(active.status)) {
    sendJson(res, 409, { error: "job ya esta en ejecucion", job: summarizeJob(job.id) });
    return;
  }

  const state = launchJob(job);

  sendJobAccepted(res, job.id, state.status);
}

async function retryJob(jobId: string, res: ServerResponse): Promise<void> {
  const active = activeJobs.get(jobId);
  if (active && ["queued", "running"].includes(active.status)) {
    sendJson(res, 409, { error: "job ya esta en ejecucion", job: summarizeJob(jobId) });
    return;
  }

  const current = summarizeJob(jobId);
  if (!["failed", "interrupted", "canceled"].includes(String(current.status))) {
    sendJson(res, 409, { error: "solo se pueden reintentar jobs fallidos, interrumpidos o cancelados", job: current });
    return;
  }

  const savedJob = readJson(path.join(jobDir(jobId), "job.json")) as Job | null;
  if (!savedJob) {
    sendError(res, 404, "No existe job.json para reintentar este job");
    return;
  }

  const job = normalizeAndValidateJob({ ...savedJob, id: jobId });
  const state = launchJob(job);
  sendJobAccepted(res, job.id, state.status);
}

function cancelJob(jobId: string, res: ServerResponse): void {
  const active = activeJobs.get(jobId);
  if (!active || !["queued", "running"].includes(active.status)) {
    sendJson(res, 409, { error: "solo se pueden cancelar jobs en cola o en curso", job: summarizeJob(jobId) });
    return;
  }

  const now = new Date().toISOString();
  const canceledState: ActiveJob = {
    ...active,
    status: "canceled",
    finished_at: now,
    updated_at: now,
    error: "Job cancelado por el usuario.",
  };
  activeJobs.set(jobId, canceledState);
  writeJobState(jobId, canceledState);
  jobControllers.get(jobId)?.abort();
  jobControllers.delete(jobId);
  sendJson(res, 202, { job_id: jobId, status: canceledState.status, job: summarizeJob(jobId) });
}

function deleteJob(jobId: string, res: ServerResponse): void {
  const dir = jobDir(jobId);
  if (!fs.existsSync(dir)) {
    sendError(res, 404, "job no encontrado");
    return;
  }

  const active = activeJobs.get(jobId) || readJobState(jobId);
  if (active && ["queued", "running"].includes(active.status)) {
    sendJson(res, 409, { error: "no se puede borrar un job en cola o en curso", job: summarizeJob(jobId) });
    return;
  }

  const base = path.resolve(JOBS_DIR);
  const target = path.resolve(dir);
  if (target === base || !target.startsWith(`${base}${path.sep}`)) {
    sendError(res, 400, "job id invalido");
    return;
  }

  const hiddenAt = new Date().toISOString();
  writeHiddenMarker(jobId, hiddenAt);
  appendDeletedJobLog(jobId, hiddenAt, active?.status || String(summarizeJob(jobId).status || "unknown"));
  sendJson(res, 200, { job_id: jobId, hidden: true, deleted: false });
}

function launchJob(job: NormalizedJob): ActiveJob {
  unhideJob(job.id);

  const state: ActiveJob = {
    id: job.id,
    status: "queued",
    started_at: new Date().toISOString(),
    pid: process.pid,
  };
  activeJobs.set(job.id, state);
  writeJobState(job.id, state);

  state.status = "running";
  state.updated_at = new Date().toISOString();
  writeJobState(job.id, state);

  const controller = new AbortController();
  jobControllers.set(job.id, controller);

  runJob(job, { signal: controller.signal })
    .then(() => {
      jobControllers.delete(job.id);
      if (activeJobs.get(job.id)?.status === "canceled") return;
      const completedState: ActiveJob = {
        ...state,
        status: "completed",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      activeJobs.set(job.id, completedState);
      writeJobState(job.id, completedState);
    })
    .catch((error: Error) => {
      jobControllers.delete(job.id);
      if (activeJobs.get(job.id)?.status === "canceled" || error.name === "AbortError") {
        const now = new Date().toISOString();
        const canceledState: ActiveJob = {
          ...state,
          status: "canceled",
          finished_at: now,
          updated_at: now,
          error: "Job cancelado por el usuario.",
        };
        activeJobs.set(job.id, canceledState);
        writeJobState(job.id, canceledState);
        return;
      }
      const failedState: ActiveJob = {
        ...state,
        status: "failed",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error: error.message,
      };
      activeJobs.set(job.id, failedState);
      writeJobState(job.id, failedState);
    });

  return state;
}

function sendJobAccepted(res: ServerResponse, jobId: string, status: string): void {
  sendJson(res, 202, {
    job_id: jobId,
    status,
    links: {
      self: `/api/jobs/${encodeURIComponent(jobId)}`,
      logs: `/api/jobs/${encodeURIComponent(jobId)}/logs`,
      artifacts: `/api/jobs/${encodeURIComponent(jobId)}/artifacts`,
    },
  });
}

function normalizeAndValidateJob(rawJob: Job): NormalizedJob {
  if (!rawJob || typeof rawJob !== "object" || Array.isArray(rawJob)) {
    throw new HttpError(400, "Body JSON invalido");
  }

  const withDefaults = {
    ...rawJob,
    chunkSize: rawJob.chunkSize || { value: 1, unit: "day" },
  };
  const job = normalizeJob(withDefaults);
  validateDashboardUrl(job.dashboardUrl);
  validateDateRange(job.startDate, job.endDate);
  return job;
}

function validateDashboardUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value || DEFAULT_CONFIG.dashboardUrl);
  } catch {
    throw new HttpError(400, "dashboardUrl invalido");
  }
  if (url.hostname !== ALLOWED_HOST) {
    throw new HttpError(400, `dashboardUrl debe usar ${ALLOWED_HOST}`);
  }
}

function validateDateRange(startValue: string, endValue: string): void {
  const start = toDate(startValue, "startDate");
  const end = toDate(endValue, "endDate");
  if (start >= end) throw new HttpError(400, "startDate debe ser anterior a endDate");
  if (end.getTime() - start.getTime() > WARN_RANGE_MS) {
    const days = Math.round(((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) * 10) / 10;
    console.warn(
      `Aviso temporal: job de ${days} dias supera el rango recomendado de 10 dias. No se bloquea para prueba.`
    );
  }
}

function listJobs(): JsonRecord[] {
  if (!fs.existsSync(JOBS_DIR)) return [];
  return fs
    .readdirSync(JOBS_DIR, { withFileTypes: true })
    .filter((entry: { isDirectory: () => boolean; name: string }) => {
      return entry.isDirectory() && isSafeJobId(entry.name) && !isJobHidden(entry.name);
    })
    .map((entry: { name: string }) => summarizeJob(entry.name))
    .sort((a: JsonRecord, b: JsonRecord) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
}

function summarizeJob(jobId: string): JsonRecord {
  const dir = jobDir(jobId);
  const job = readJson(path.join(dir, "job.json")) as NormalizedJob | null;
  const chunks = readJsonl(path.join(dir, "chunks.jsonl"));
  const manifest = readJsonl(path.join(dir, "manifest.jsonl"));
  const artifacts = readArtifacts(jobId).artifacts || [];
  const active = activeJobs.get(jobId) || readJobState(jobId);
  const completedKeys = new Set<string>();
  const failedKeys = new Set<string>();

  for (const row of manifest) {
    const key = `${row.chunk_from || ""}|${row.chunk_to || ""}`;
    if (row.status === "ok" || row.status === "skipped_existing") completedKeys.add(key);
    if (row.status === "failed") failedKeys.add(key);
  }

  const hasLongCsv = artifacts.some((artifact: JobArtifact) => artifact.type === "csv_long");
  const status =
    active?.status ||
    (failedKeys.size ? "failed" : chunks.length && completedKeys.size >= chunks.length && hasLongCsv ? "completed" : "unknown");

  return {
    id: jobId,
    status,
    panel_title: job?.panelTitle || null,
    startDate: job?.startDate || null,
    endDate: job?.endDate || null,
    outputWide: job?.outputWide ?? null,
    chunks: {
      total: chunks.length,
      completed: completedKeys.size,
      failed: failedKeys.size,
    },
    artifacts,
    active,
    updated_at: lastModified(dir),
    links: {
      self: `/api/jobs/${encodeURIComponent(jobId)}`,
      logs: `/api/jobs/${encodeURIComponent(jobId)}/logs`,
      artifacts: `/api/jobs/${encodeURIComponent(jobId)}/artifacts`,
      long_csv: `/api/jobs/${encodeURIComponent(jobId)}/artifacts/long`,
      wide_csv: `/api/jobs/${encodeURIComponent(jobId)}/artifacts/wide`,
      zip: `/api/jobs/${encodeURIComponent(jobId)}/artifacts/zip`,
    },
  };
}

function recoverPersistedJobStates(): void {
  if (!fs.existsSync(JOBS_DIR)) return;

  for (const entry of fs.readdirSync(JOBS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isSafeJobId(entry.name)) continue;
    const state = readJobState(entry.name);
    if (!state) continue;

    if (state.status === "queued" || state.status === "running") {
      const nextState: ActiveJob = {
        ...state,
        status: inferTerminalStatus(entry.name) || "interrupted",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error: state.error || "El proceso se reinicio antes de cerrar este job.",
      };
      activeJobs.set(entry.name, nextState);
      writeJobState(entry.name, nextState);
      continue;
    }

    activeJobs.set(entry.name, state);
  }
}

function inferTerminalStatus(jobId: string): ActiveJob["status"] | null {
  const chunks = readJsonl(path.join(jobDir(jobId), "chunks.jsonl"));
  const manifest = readJsonl(path.join(jobDir(jobId), "manifest.jsonl"));
  const artifacts = readArtifacts(jobId).artifacts || [];
  const completedKeys = new Set<string>();
  const failedKeys = new Set<string>();

  for (const row of manifest) {
    const key = `${row.chunk_from || ""}|${row.chunk_to || ""}`;
    if (row.status === "ok" || row.status === "skipped_existing") completedKeys.add(key);
    if (row.status === "failed") failedKeys.add(key);
  }

  if (failedKeys.size) return "failed";
  if (
    chunks.length > 0 &&
    completedKeys.size >= chunks.length &&
    artifacts.some((artifact: JobArtifact) => artifact.type === "csv_long")
  ) {
    return "completed";
  }
  return null;
}

function readJobState(jobId: string): ActiveJob | null {
  const state = readJson(jobStateFile(jobId));
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  return state as ActiveJob;
}

function writeJobState(jobId: string, state: ActiveJob): void {
  const dir = jobDir(jobId);
  fs.mkdirSync(dir, { recursive: true });
  const payload: ActiveJob = {
    ...state,
    updated_at: state.updated_at || new Date().toISOString(),
  };
  const file = jobStateFile(jobId);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function readLogs(jobId: string): string {
  const logsFile = path.join(jobDir(jobId), "logs.txt");
  if (fs.existsSync(logsFile)) return fs.readFileSync(logsFile, "utf8");
  const summary = summarizeJob(jobId);
  return `${JSON.stringify(summary, null, 2)}\n`;
}

function readArtifacts(jobId: string): { job_id: string; artifacts: JobArtifact[] } {
  const file = path.join(jobDir(jobId), "artifacts.json");
  if (!fs.existsSync(file)) return { job_id: jobId, artifacts: [] };
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function sendArtifact(res: ServerResponse, jobId: string, kind: string): Promise<void> {
  const artifact = findArtifact(jobId, kind);
  if (!artifact) {
    sendError(res, 404, `Artifact no disponible: ${kind}`);
    return;
  }

  const filePath = safeArtifactPath(jobId, artifact.path);
  if (!fs.existsSync(filePath)) {
    sendError(res, 404, `Archivo no encontrado: ${kind}`);
    return;
  }

  const filename = path.basename(filePath);
  res.statusCode = 200;
  res.setHeader("Content-Type", artifact.format === "zip" ? "application/zip" : "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", fs.statSync(filePath).size);
  await streamPipeline(fs.createReadStream(filePath), res);
}

function findArtifact(jobId: string, kind: string): JobArtifact | null {
  const aliases: Record<string, string> = {
    long: "csv_long",
    long_csv: "csv_long",
    wide: "csv_wide",
    wide_csv: "csv_wide",
    zip: "technical_zip",
    result_zip: "technical_zip",
  };
  const type = aliases[kind] || kind;
  return readArtifacts(jobId).artifacts.find((artifact) => artifact.type === type) || null;
}

function safeArtifactPath(jobId: string, artifactPath: string): string {
  const base = path.resolve(jobDir(jobId));
  const fullPath = path.resolve(artifactPath);
  if (!fullPath.startsWith(`${base}${path.sep}`)) {
    throw new HttpError(400, "Ruta de artifact invalida");
  }
  return fullPath;
}

function jobDir(jobId: string): string {
  return path.join(JOBS_DIR, jobId);
}

function jobStateFile(jobId: string): string {
  return path.join(jobDir(jobId), "state.json");
}

function hiddenMarkerFile(jobId: string): string {
  return path.join(jobDir(jobId), ".hidden.json");
}

function isJobHidden(jobId: string): boolean {
  return fs.existsSync(hiddenMarkerFile(jobId));
}

function writeHiddenMarker(jobId: string, hiddenAt: string): void {
  const file = hiddenMarkerFile(jobId);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ job_id: jobId, hidden_at: hiddenAt }, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function unhideJob(jobId: string): void {
  const file = hiddenMarkerFile(jobId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function appendDeletedJobLog(jobId: string, hiddenAt: string, status: string): void {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  const row = {
    job_id: jobId,
    status,
    hidden_at: hiddenAt,
    job_dir: jobDir(jobId),
    action: "hidden_from_interface",
  };
  fs.appendFileSync(DELETED_JOBS_LOG, `${JSON.stringify(row)}\n`);
}

function isSafeJobId(jobId: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(jobId);
}

function lastModified(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  return fs.statSync(dir).mtime.toISOString();
}

function readJson(file: string): unknown {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readJsonl(file: string): JsonRecord[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line: string) => JSON.parse(line));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Body demasiado grande");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "Body debe ser JSON valido");
  }
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  sendText(res, statusCode, `${JSON.stringify(payload, null, 2)}\n`, "application/json; charset=utf-8");
}

function sendText(res: ServerResponse, statusCode: number, body: string, contentType: string): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", contentType);
  res.end(body);
}

function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message });
}

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = {
  startServer,
};
