const fs = require("fs");
const path = require("path");
const { appendJsonl, ensureDir, loadConfig, sanitizeName } = require("./common");
import type {
  CapturedDocument,
  CsvRow,
  GrafanaField,
  GrafanaPayload,
  GrafanaResult,
  JobArtifact,
  NormalizedJob,
} from "./types";

function runCsv(inputConfig = loadConfig()) {
  const config = { ...inputConfig };
  const rawDir = path.join(config.outDir, "raw");
  const csvDir = path.join(config.outDir, "csv");
  ensureDir(csvDir);

  if (!fs.existsSync(rawDir)) {
    throw new Error(`No existe ${rawDir}. Ejecuta primero la descarga.`);
  }

  const rowsByKey = new Map();
  for (const file of fs.readdirSync(rawDir)) {
    if (!file.endsWith(".json")) continue;

    const fullPath = path.join(rawDir, file);
    const doc = JSON.parse(fs.readFileSync(fullPath, "utf8"));

    for (const row of flattenDocument(doc, file)) {
      const key = sanitizeName(
        `${row.panel_id || "panel"}__${row.panel_title || "grafana"}__${row.ref_id}`
      );
      if (!rowsByKey.has(key)) rowsByKey.set(key, []);
      rowsByKey.get(key).push(row);
    }
  }

  const outputs = [];
  for (const [key, rows] of rowsByKey.entries()) {
    const outFile = path.join(csvDir, `${key}.csv`);
    writeCsv(outFile, rows);
    outputs.push({ file: outFile, rows: rows.length });
    console.log(`CSV: ${outFile} filas=${rows.length}`);
  }

  return outputs;
}

function flattenDocument(doc: CapturedDocument, sourceFile: string): CsvRow[] {
  const rows: CsvRow[] = [];

  for (const captured of doc.responses || []) {
    const payload = (captured.response || {}) as GrafanaPayload;
    const results: Record<string, GrafanaResult> =
      payload.results || payload.data?.results || {};

    for (const [refId, result] of Object.entries(results)) {
      const frames = result.frames || [];

      for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
        const frame = frames[frameIndex];
        const fields = frame.schema?.fields || [];
        const values = frame.data?.values || [];
        if (!fields.length || !values.length) continue;

        const maxRows = Math.max(...values.map((value) => value?.length || 0));
        for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
          const row: CsvRow = {
            chunk_from: doc.from,
            chunk_to: doc.to,
            panel_id: doc.panelId || "",
            panel_title: doc.panelTitle || "",
            ref_id: refId,
            frame_index: frameIndex,
            row_index: rowIndex,
            source_file: sourceFile,
          };

          for (let col = 0; col < fields.length; col += 1) {
            const field = fields[col] || {};
            const name = field.name || field.config?.displayName || `field_${col}`;
            row[dedupeName(row, name)] = values[col]?.[rowIndex] ?? "";
          }

          rows.push(row);
        }
      }
    }
  }

  return rows;
}

function buildJobOutputs(job: NormalizedJob): JobArtifact[] {
  const rawDir = path.join(job.outDir, "raw");
  const csvDir = path.join(job.outDir, "csv");
  const logsFile = path.join(job.outDir, "logs.txt");
  const artifactsFile = path.join(job.outDir, "artifacts.json");
  const manifestFile = path.join(job.outDir, "manifest.jsonl");
  ensureDir(csvDir);

  if (!fs.existsSync(rawDir)) {
    throw new Error(`No existe ${rawDir}. Ejecuta primero la descarga del job.`);
  }

  const rawFiles = fs
    .readdirSync(rawDir)
    .filter((file: string) => file.endsWith(".json"))
    .sort();
  const longRows = dedupeRows(
    rawFiles.flatMap((file: string) => {
      const fullPath = path.join(rawDir, file);
      const doc = JSON.parse(fs.readFileSync(fullPath, "utf8")) as CapturedDocument;
      return flattenDocumentLong(doc, file, job.id);
    })
  );

  const generatedAt = new Date().toISOString();
  const artifacts: JobArtifact[] = [];
  const longFile = path.join(csvDir, "final_long.csv");
  writeCsvWithHeaders(longFile, longRows, canonicalLongHeaders(longRows));
  artifacts.push({
    type: "csv_long",
    format: "csv",
    path: longFile,
    rows: longRows.length,
    generated_at: generatedAt,
  });

  if (job.outputWide) {
    const wideRows = buildWideRows(longRows);
    const wideFile = path.join(csvDir, "final_wide.csv");
    writeCsvWithHeaders(wideFile, wideRows, canonicalWideHeaders(wideRows));
    artifacts.push({
      type: "csv_wide",
      format: "csv",
      path: wideFile,
      rows: wideRows.length,
      generated_at: generatedAt,
    });
  }

  fs.writeFileSync(artifactsFile, `${JSON.stringify({ job_id: job.id, artifacts }, null, 2)}\n`);
  fs.writeFileSync(
    logsFile,
    [
      `job_id=${job.id}`,
      `generated_at=${generatedAt}`,
      `raw_files=${rawFiles.length}`,
      `long_rows=${longRows.length}`,
      `output_wide=${job.outputWide ? "true" : "false"}`,
      ...artifacts.map((artifact) => `${artifact.type}=${artifact.path}`),
      "",
    ].join("\n")
  );

  const zipFile = path.join(job.outDir, "result.zip");
  writeZip(
    zipFile,
    artifacts
      .filter((artifact) => artifact.format === "csv")
      .map((artifact) => artifact.path)
      .concat([artifactsFile, logsFile])
  );
  artifacts.push({
    type: "technical_zip",
    format: "zip",
    path: zipFile,
    generated_at: generatedAt,
  });
  fs.writeFileSync(artifactsFile, `${JSON.stringify({ job_id: job.id, artifacts }, null, 2)}\n`);

  for (const artifact of artifacts) {
    appendJsonl(manifestFile, {
      job_id: job.id,
      status: "artifact_generated",
      artifact_type: artifact.type,
      artifact_file: artifact.path,
      rows: artifact.rows,
      finished_at: artifact.generated_at,
    });
  }

  console.log(`CSV largo final: ${longFile} filas=${longRows.length}`);
  return artifacts;
}

function flattenDocumentLong(
  doc: CapturedDocument,
  sourceFile: string,
  jobId = ""
): CsvRow[] {
  const rows: CsvRow[] = [];

  for (const captured of doc.responses || []) {
    const payload = (captured.response || {}) as GrafanaPayload;
    const results: Record<string, GrafanaResult> =
      payload.results || payload.data?.results || {};

    for (const [refId, result] of Object.entries(results)) {
      const frames = result.frames || [];

      for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
        const frame = frames[frameIndex];
        const fields = frame.schema?.fields || [];
        const values = frame.data?.values || [];
        if (!fields.length || !values.length) continue;

        const timeIndex = findTimeFieldIndex(fields);
        const maxRows = Math.max(...values.map((value) => value?.length || 0));
        for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
          const timeValue = timeIndex >= 0 ? values[timeIndex]?.[rowIndex] : "";
          const context = buildLongContext(
            doc,
            sourceFile,
            jobId,
            refId,
            frame.schema?.name || "",
            frameIndex,
            rowIndex,
            timeValue
          );

          for (let col = 0; col < fields.length; col += 1) {
            if (col === timeIndex) continue;
            const value = values[col]?.[rowIndex];
            if (value === undefined || value === null || value === "") continue;
            const fieldName = fieldLabel(fields[col], col);
            rows.push({
              ...context,
              field_name: fieldName,
              field_key: sanitizeName(fieldName),
              value,
            });
          }
        }
      }
    }
  }

  return rows;
}

function buildLongContext(
  doc: CapturedDocument,
  sourceFile: string,
  jobId: string,
  refId: string,
  frameName: string,
  frameIndex: number,
  rowIndex: number,
  timeValue: unknown
): CsvRow {
  return {
    job_id: jobId,
    chunk_from: doc.from || "",
    chunk_to: doc.to || "",
    panel_id: doc.panelId || "",
    panel_title: doc.panelTitle || "",
    ref_id: refId,
    frame_name: frameName,
    frame_index: frameIndex,
    row_index: rowIndex,
    time: normalizeTimeValue(timeValue),
    source_file: sourceFile,
  };
}

function findTimeFieldIndex(fields: GrafanaField[]): number {
  return fields.findIndex((field) => {
    const name = fieldLabel(field, 0).toLowerCase();
    return ["time", "_time", "timestamp", "fecha", "date"].includes(name);
  });
}

function fieldLabel(field: GrafanaField | undefined, index: number): string {
  return String(
    field?.config?.displayName ||
      field?.config?.displayNameFromDS ||
      field?.name ||
      `field_${index}`
  );
}

function normalizeTimeValue(value: unknown): unknown {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return value ?? "";
}

function dedupeRows(rows: CsvRow[]): CsvRow[] {
  const seen = new Set<string>();
  const output: CsvRow[] = [];
  for (const row of rows) {
    const key = [
      row.job_id,
      row.panel_id,
      row.ref_id,
      row.frame_name,
      row.frame_index,
      row.time || row.row_index,
      row.field_key || row.field_name,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
}

function buildWideRows(longRows: CsvRow[]): CsvRow[] {
  const rowsByKey = new Map<string, CsvRow>();
  for (const row of longRows) {
    const key = [row.job_id, row.panel_id, row.ref_id, row.time].join("|");
    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, {
        job_id: row.job_id,
        chunk_from: row.chunk_from,
        chunk_to: row.chunk_to,
        panel_id: row.panel_id,
        panel_title: row.panel_title,
        ref_id: row.ref_id,
        time: row.time,
      });
    }
    const column = sanitizeName(`${row.ref_id || "series"}_${row.field_key || row.field_name || "value"}`);
    rowsByKey.get(key)[column] = row.value;
  }
  return Array.from(rowsByKey.values());
}

function canonicalLongHeaders(rows: CsvRow[]): string[] {
  return mergeHeaders(
    [
      "job_id",
      "chunk_from",
      "chunk_to",
      "panel_id",
      "panel_title",
      "ref_id",
      "frame_name",
      "frame_index",
      "row_index",
      "time",
      "field_name",
      "field_key",
      "value",
      "source_file",
    ],
    rows
  );
}

function canonicalWideHeaders(rows: CsvRow[]): string[] {
  return mergeHeaders(
    ["job_id", "chunk_from", "chunk_to", "panel_id", "panel_title", "ref_id", "time"],
    rows
  );
}

function mergeHeaders(preferred: string[], rows: CsvRow[]): string[] {
  const headers = new Set(preferred);
  for (const row of rows) Object.keys(row).forEach((key) => headers.add(key));
  return Array.from(headers);
}

function dedupeName(row: CsvRow, name: string): string {
  let candidate = String(name);
  let index = 2;
  while (Object.prototype.hasOwnProperty.call(row, candidate)) {
    candidate = `${name}_${index}`;
    index += 1;
  }
  return candidate;
}

function writeCsv(file: string, rows: CsvRow[]): void {
  const headers = Array.from(
    rows.reduce<Set<string>>((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );

  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];

  fs.writeFileSync(file, lines.join("\n"));
}

function writeCsvWithHeaders(file: string, rows: CsvRow[], headers: string[]): void {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];

  fs.writeFileSync(file, lines.join("\n"));
}

function writeZip(file: string, sourceFiles: string[]): void {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const sourceFile of sourceFiles) {
    const name = path.basename(sourceFile);
    const nameBuffer = Buffer.from(name);
    const data = fs.readFileSync(sourceFile);
    const crc = crc32(data);
    const localHeader = zipLocalHeader(nameBuffer, data.length, crc);
    const centralHeader = zipCentralHeader(nameBuffer, data.length, crc, offset);

    localParts.push(localHeader, nameBuffer, data);
    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = zipEndRecord(sourceFiles.length, centralSize, offset);
  fs.writeFileSync(file, Buffer.concat([...localParts, ...centralParts, end]));
}

function zipLocalHeader(name: Buffer, size: number, crc: number): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function zipCentralHeader(name: Buffer, size: number, crc: number, offset: number): Buffer {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(0, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(size, 20);
  header.writeUInt32LE(size, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return header;
}

function zipEndRecord(count: number, centralSize: number, centralOffset: number): Buffer {
  const header = Buffer.alloc(22);
  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(count, 8);
  header.writeUInt16LE(count, 10);
  header.writeUInt32LE(centralSize, 12);
  header.writeUInt32LE(centralOffset, 16);
  header.writeUInt16LE(0, 20);
  return header;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

module.exports = {
  buildJobOutputs,
  buildWideRows,
  csvEscape,
  dedupeName,
  dedupeRows,
  flattenDocument,
  flattenDocumentLong,
  runCsv,
  writeCsv,
  writeCsvWithHeaders,
  writeZip,
};
