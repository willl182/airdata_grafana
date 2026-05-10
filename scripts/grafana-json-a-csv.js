const fs = require("fs");
const path = require("path");
const { ensureDir, loadConfig, sanitizeName } = require("./grafana-common");

function main() {
  const config = loadConfig();
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

  for (const [key, rows] of rowsByKey.entries()) {
    const outFile = path.join(csvDir, `${key}.csv`);
    writeCsv(outFile, rows);
    console.log(`CSV: ${outFile} filas=${rows.length}`);
  }
}

function flattenDocument(doc, sourceFile) {
  const rows = [];

  for (const captured of doc.responses || []) {
    const payload = captured.response || {};
    const results = payload.results || payload.data?.results || {};

    for (const [refId, result] of Object.entries(results)) {
      const frames = result.frames || [];

      for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
        const frame = frames[frameIndex];
        const fields = frame.schema?.fields || [];
        const values = frame.data?.values || [];
        if (!fields.length || !values.length) continue;

        const maxRows = Math.max(...values.map((value) => value?.length || 0));
        for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
          const row = {
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

function dedupeName(row, name) {
  let candidate = String(name);
  let index = 2;
  while (Object.prototype.hasOwnProperty.call(row, candidate)) {
    candidate = `${name}_${index}`;
    index += 1;
  }
  return candidate;
}

function writeCsv(file, rows) {
  const headers = Array.from(
    rows.reduce((set, row) => {
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

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

main();
