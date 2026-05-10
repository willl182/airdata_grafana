/// <reference types="node" />

const fs = require("fs");
const path = require("path");
const {
  DEFAULT_CONFIG,
  appendJsonl,
  applyEnvConfig,
  ensureDir,
  makeChunkFile,
  sanitizeName,
  toDate,
} = require("./common");
const { buildJobOutputs } = require("./csv");
const { runDownloadChunks } = require("./downloader");

import type { ChunkSize, ChunkSizeUnit, GrafanaConfig, Job, JobChunk, NormalizedJob } from "./types";

interface RawChunkSize {
  value: unknown;
  unit?: unknown;
}

type ChunkSizeInput = string | ChunkSize | RawChunkSize | null | undefined;

const UNIT_MS = {
  millisecond: 1,
  milliseconds: 1,
  ms: 1,
  second: 1000,
  seconds: 1000,
  s: 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  min: 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  h: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
} as const;

function loadJob(jobPath = process.env.JOB || "examples/job.example.json"): NormalizedJob {
  if (!fs.existsSync(jobPath)) {
    throw new Error(`No existe el job: ${jobPath}`);
  }

  const rawJob = JSON.parse(fs.readFileSync(jobPath, "utf8")) as Job;
  return normalizeJob(rawJob, jobPath);
}

function normalizeJob(rawJob: Job, jobPath: string | null = null): NormalizedJob {
  const merged = applyEnvConfig({ ...DEFAULT_CONFIG, ...rawJob });
  const id = merged.id || buildJobId(merged);
  const outDir = rawJob.outDir || process.env.OUT_DIR || path.join("data", "jobs", id);

  return {
    ...merged,
    id,
    outDir,
    sourceFile: jobPath,
    chunkSize: normalizeChunkSize(merged.chunkSize, merged.daysPerChunk),
    outputWide: rawJob.outputWide === undefined ? true : Boolean(rawJob.outputWide),
  };
}

function buildJobId(job: Pick<GrafanaConfig, "panelTitle" | "panelId" | "startDate" | "endDate">): string {
  const label = sanitizeName(job.panelTitle || job.panelId || "grafana");
  const start = toDate(job.startDate, "startDate").toISOString().slice(0, 10);
  const end = toDate(job.endDate, "endDate").toISOString().slice(0, 10);
  return `${label}-${start}-${end}`;
}

function normalizeChunkSize(chunkSize: ChunkSizeInput, daysPerChunk = 1): ChunkSize {
  if (typeof chunkSize === "string") return parseChunkSizeString(chunkSize);
  if (chunkSize && typeof chunkSize === "object") {
    const rawChunkSize = chunkSize as RawChunkSize;
    const value = Number(rawChunkSize.value);
    const unit = String(rawChunkSize.unit || "").toLowerCase();
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`chunkSize.value invalido: ${rawChunkSize.value}`);
    }
    if (!isChunkSizeUnit(unit)) {
      throw new Error(`chunkSize.unit invalido: ${rawChunkSize.unit}`);
    }
    return { value, unit };
  }

  return { value: Number(daysPerChunk || 1), unit: "day" };
}

function parseChunkSizeString(value: string): ChunkSize {
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);
  if (!match) throw new Error(`chunkSize invalido: ${value}`);
  return normalizeChunkSize({ value: Number(match[1]), unit: match[2] });
}

function isChunkSizeUnit(unit: string): unit is ChunkSizeUnit {
  return Object.prototype.hasOwnProperty.call(UNIT_MS, unit);
}

function chunkSizeToMs(chunkSize: ChunkSizeInput): number {
  const normalized = normalizeChunkSize(chunkSize);
  return normalized.value * UNIT_MS[normalized.unit];
}

function generateChunks(job: NormalizedJob): JobChunk[] {
  const start = toDate(job.startDate, "startDate");
  const end = toDate(job.endDate, "endDate");
  if (start >= end) throw new Error("startDate debe ser anterior a endDate");

  const sizeMs = chunkSizeToMs(job.chunkSize);
  const chunks: JobChunk[] = [];
  let cursor = new Date(start);
  let index = 0;

  while (cursor < end) {
    const next = new Date(Math.min(cursor.getTime() + sizeMs, end.getTime()));
    chunks.push({
      index,
      id: `${String(index + 1).padStart(5, "0")}`,
      from: cursor.toISOString(),
      to: next.toISOString(),
      outputFile: makeChunkFile(job, cursor, next),
      status: fs.existsSync(makeChunkFile(job, cursor, next))
        ? "completed_existing"
        : "pending",
    });
    cursor = next;
    index += 1;
  }

  return chunks;
}

function writeJobFiles(job: NormalizedJob, chunks: JobChunk[]): void {
  ensureDir(job.outDir);
  ensureDir(path.join(job.outDir, "raw"));
  ensureDir(path.join(job.outDir, "logs"));

  fs.writeFileSync(path.join(job.outDir, "job.json"), JSON.stringify(job, null, 2));
  fs.writeFileSync(path.join(job.outDir, "chunks.jsonl"), "");

  for (const chunk of chunks) {
    appendJsonl(path.join(job.outDir, "chunks.jsonl"), {
      job_id: job.id,
      ...chunk,
      generated_at: new Date().toISOString(),
    });
  }
}

async function runJob(
  input: string | Job = process.env.JOB || "examples/job.example.json",
  options: { signal?: AbortSignal } = {}
): Promise<{ job: NormalizedJob; chunks: JobChunk[] }> {
  const job = typeof input === "string" ? loadJob(input) : normalizeJob(input);
  const chunks = generateChunks(job);
  writeJobFiles(job, chunks);

  const pendingChunks = chunks.filter((chunk) => chunk.status !== "completed_existing");
  console.log(`Job ${job.id}: ${chunks.length} chunks, ${pendingChunks.length} pendientes`);

  for (const chunk of chunks) {
    if (chunk.status !== "completed_existing") continue;
    appendJsonl(path.join(job.outDir, "manifest.jsonl"), {
      job_id: job.id,
      panel_id: job.panelId,
      panel_title: job.panelTitle,
      chunk_from: chunk.from,
      chunk_to: chunk.to,
      status: "skipped_existing",
      output_file: chunk.outputFile,
      finished_at: new Date().toISOString(),
    });
  }

  if (!pendingChunks.length) {
    buildJobOutputs(job);
    return { job, chunks };
  }

  await runDownloadChunks(job, pendingChunks, options);
  buildJobOutputs(job);
  return { job, chunks };
}

module.exports = {
  chunkSizeToMs,
  generateChunks,
  loadJob,
  normalizeChunkSize,
  normalizeJob,
  runJob,
  writeJobFiles,
};
