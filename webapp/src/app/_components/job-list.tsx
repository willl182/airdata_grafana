"use client";

import { api } from "~/trpc/react";
import { StatusBadge } from "./status-badge";
import { ChunkProgressBar } from "./chunk-progress";

interface Props {
  onSelect: (id: string) => void;
}

export function JobList({ onSelect }: Props) {
  const utils = api.useUtils();
  const jobsQuery = api.jobs.list.useQuery(undefined, {
    refetchInterval: 5_000,
  });
  const removeMutation = api.jobs.remove.useMutation({
    onSuccess: () => {
      void utils.jobs.list.invalidate();
    },
  });

  const jobs = jobsQuery.data ?? [];

  return (
    <section>
      <h2 className="mb-5 text-lg font-semibold text-text-primary">
        Descargas
      </h2>

      {jobsQuery.isLoading && (
        <div className="flex justify-center py-16">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-transparent border-t-accent" />
        </div>
      )}

      {!jobsQuery.isLoading && jobs.length === 0 && (
        <div className="py-16 text-center">
          <div className="mb-3 text-3xl opacity-30">◇</div>
          <p className="font-mono text-sm text-text-muted">
            Sin descargas todavía. Crea una nueva para empezar.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {jobs.map((job) => (
          <div key={job.id} className="relative">
            <button
              type="button"
              onClick={() => onSelect(job.id)}
              className="group relative w-full rounded-lg border border-border bg-bg-card p-4 text-left transition-all hover:border-accent/30 hover:bg-bg-card-hover"
            >
              {/* Left accent bar */}
              <span
                className={`absolute left-0 top-0 bottom-0 w-[2px] rounded-l-lg ${statusBarColor(job.status)}`}
              />

              {/* Header row */}
              <div className="mb-1.5 flex items-center justify-between gap-3 pr-20">
                <span className="font-mono text-sm font-semibold text-text-primary transition-colors group-hover:text-accent-text">
                  {job.id}
                </span>
                <StatusBadge status={job.status} />
              </div>

              {/* Meta row */}
              <div className="flex flex-wrap gap-x-8 gap-y-1 pr-20 font-mono text-[0.7rem] text-text-secondary">
                {job.panel_title && (
                  <span>
                    <span className="text-text-muted">panel</span> {job.panel_title}
                  </span>
                )}
                {job.startDate && job.endDate && (
                  <span>
                    <span className="text-text-muted">rango</span>{" "}
                    {formatDate(job.startDate)} → {formatDate(job.endDate)}
                  </span>
                )}
                {job.chunks && (
                  <span>
                    <span className="text-text-muted">lotes</span>{" "}
                    {job.chunks.completed}/{job.chunks.total}
                  </span>
                )}
              </div>

              {/* Chunk bar */}
              {job.chunks && job.chunks.total > 0 && (
                <ChunkProgressBar
                  total={job.chunks.total}
                  completed={job.chunks.completed}
                  failed={job.chunks.failed}
                  status={job.status}
                />
              )}
            </button>

            {canRemove(job.status) && (
              <button
                type="button"
                disabled={removeMutation.isPending}
                onClick={(event) => {
                  event.stopPropagation();
                  if (window.confirm(`Quitar la descarga "${job.id}" de la interfaz? Los archivos quedan guardados.`)) {
                    removeMutation.mutate({ id: job.id });
                  }
                }}
                className="absolute right-4 top-4 rounded-md border border-fail/25 bg-fail-dim px-2.5 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-widest text-fail transition-all hover:border-fail/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Borrar
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function canRemove(status: string): boolean {
  return ["completed", "failed", "interrupted", "canceled"].includes(status);
}

function statusBarColor(status: string): string {
  switch (status) {
    case "completed": return "bg-ok";
    case "running": return "bg-running";
    case "queued": return "bg-queued";
    case "failed": return "bg-fail";
    case "interrupted": return "bg-fail";
    case "canceled": return "bg-fail";
    default: return "bg-text-muted";
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-CO", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}
