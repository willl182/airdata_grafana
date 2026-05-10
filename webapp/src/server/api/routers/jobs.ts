import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const API = process.env.API_BASE_URL ?? "http://127.0.0.1:3001";

// ---------- Zod schemas for input validation ----------

const createJobSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9._-]+$/, "Solo letras, números, puntos, guiones"),
  dashboardUrl: z.string().url(),
  panelTitle: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  timezone: z.string().default("America/Bogota"),
  chunkSize: z.object({
    value: z.number().int().min(1),
    unit: z.enum(["hour", "hours", "h", "day", "days", "d", "minute", "minutes", "min"]),
  }).default({ value: 1, unit: "day" }),
  outputWide: z.boolean().default(false),
  headless: z.boolean().default(true),
});

// ---------- Types matching the existing API ----------

interface JobArtifact {
  type: string;
  format: string;
  path: string;
  rows?: number;
  generated_at: string;
}

interface JobSummary {
  id: string;
  status: string;
  panel_title: string | null;
  startDate: string | null;
  endDate: string | null;
  outputWide: boolean | null;
  chunks: {
    total: number;
    completed: number;
    failed: number;
  };
  artifacts: JobArtifact[];
  active: {
    id: string;
    status: string;
    started_at: string;
    finished_at?: string;
    error?: string;
  } | null;
  updated_at: string | null;
  links: Record<string, string>;
}

// ---------- Helper to call the existing HTTP API ----------

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    let message = `API ${res.status}`;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // use default message
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ---------- tRPC Router ----------

export const jobsRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    const data = await apiFetch<{ jobs: JobSummary[] }>("/api/jobs");
    return data.jobs;
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return apiFetch<JobSummary>(`/api/jobs/${encodeURIComponent(input.id)}`);
    }),

  create: publicProcedure
    .input(createJobSchema)
    .mutation(async ({ input }) => {
      return apiFetch<{ job_id: string; status: string; links: Record<string, string> }>(
        "/api/jobs",
        {
          method: "POST",
          body: JSON.stringify(input),
        }
      );
    }),

  retry: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return apiFetch<{ job_id: string; status: string; links: Record<string, string> }>(
        `/api/jobs/${encodeURIComponent(input.id)}/retry`,
        { method: "POST" }
      );
    }),

  cancel: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return apiFetch<{ job_id: string; status: string; job: JobSummary }>(
        `/api/jobs/${encodeURIComponent(input.id)}/cancel`,
        { method: "POST" }
      );
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return apiFetch<{ job_id: string; hidden: boolean; deleted: boolean }>(
        `/api/jobs/${encodeURIComponent(input.id)}`,
        { method: "DELETE" }
      );
    }),

  logs: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const res = await fetch(
        `${API}/api/jobs/${encodeURIComponent(input.id)}/logs`
      );
      return res.text();
    }),

  health: publicProcedure.query(async () => {
    try {
      await apiFetch<{ ok: boolean }>("/api/health");
      return { online: true };
    } catch {
      return { online: false };
    }
  }),
});
