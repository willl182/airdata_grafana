export type ChunkSizeUnit =
  | "millisecond"
  | "milliseconds"
  | "ms"
  | "second"
  | "seconds"
  | "s"
  | "minute"
  | "minutes"
  | "min"
  | "hour"
  | "hours"
  | "h"
  | "day"
  | "days"
  | "d";

export interface ChunkSize {
  value: number;
  unit: ChunkSizeUnit;
}

export interface GrafanaConfig {
  dashboardUrl: string;
  panelTitle: string;
  panelId: string | number | null;
  startDate: string;
  endDate: string;
  timezone: string;
  daysPerChunk: number;
  minDaysPerChunk: number;
  outDir: string;
  requestPauseMs: number;
  maxRetries: number;
  headless: boolean;
  authStateFile: string | null;
  navigationTimeoutMs: number;
  quietPeriodMs: number;
  postLoadWaitMs: number;
  maxDataPoints: number;
}

export interface Job extends Partial<GrafanaConfig> {
  id?: string;
  chunkSize?: string | Partial<ChunkSize>;
  outputWide?: boolean;
}

export interface NormalizedJob extends GrafanaConfig {
  id: string;
  outDir: string;
  sourceFile: string | null;
  chunkSize: ChunkSize;
  outputWide: boolean;
}

export interface JobChunk {
  index: number;
  id: string;
  from: string;
  to: string;
  outputFile: string;
  status: "completed_existing" | "pending";
  daysPerChunk?: number;
  startDate?: string;
  endDate?: string;
}

export interface GrafanaField {
  name?: string;
  config?: {
    displayName?: string;
    displayNameFromDS?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface GrafanaFrame {
  schema?: {
    name?: string;
    fields?: GrafanaField[];
    [key: string]: unknown;
  };
  data?: {
    values?: unknown[][];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface GrafanaResult {
  frames?: GrafanaFrame[];
  [key: string]: unknown;
}

export interface GrafanaPayload {
  results?: Record<string, GrafanaResult>;
  data?: {
    results?: Record<string, GrafanaResult>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface CapturedResponse {
  url: string;
  method: string;
  status: number;
  requestPostData: unknown;
  response: GrafanaPayload | null;
  capturedAt: string;
  frameCount?: number;
  rowCount?: number;
  error?: string;
}

export interface CapturedDocument {
  dashboardUrl?: string;
  panelId?: string | number | null;
  panelTitle?: string;
  from?: string;
  to?: string;
  timezone?: string;
  startedAt?: string;
  finishedAt?: string;
  attempt?: number;
  responses?: CapturedResponse[];
  errors?: Array<Record<string, unknown>>;
}

export interface CsvRow {
  [key: string]: unknown;
}

export interface JobArtifact {
  type: string;
  format: string;
  path: string;
  rows?: number;
  generated_at: string;
}
