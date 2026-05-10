"use client";

import { api } from "~/trpc/react";
import { StatusBadge } from "./status-badge";
import { ChunkProgressBar } from "./chunk-progress";

interface Props {
  jobId: string;
  onBack: () => void;
}

export function JobDetail({ jobId, onBack }: Props) {
  const utils = api.useUtils();
  const jobQuery = api.jobs.get.useQuery(
    { id: jobId },
    { refetchInterval: 3_000 }
  );
  const logsQuery = api.jobs.logs.useQuery(
    { id: jobId },
    { refetchInterval: 5_000 }
  );
  const retryMutation = api.jobs.retry.useMutation({
    onSuccess: () => {
      void utils.jobs.list.invalidate();
      void utils.jobs.get.invalidate({ id: jobId });
      void utils.jobs.logs.invalidate({ id: jobId });
    },
  });
  const cancelMutation = api.jobs.cancel.useMutation({
    onSuccess: () => {
      void utils.jobs.list.invalidate();
      void utils.jobs.get.invalidate({ id: jobId });
      void utils.jobs.logs.invalidate({ id: jobId });
    },
  });
  const removeMutation = api.jobs.remove.useMutation({
    onSuccess: () => {
      void utils.jobs.list.invalidate();
      onBack();
    },
  });

  const job = jobQuery.data;
  const canRetry = job ? ["failed", "interrupted", "canceled"].includes(job.status) : false;
  const canCancel = job ? ["queued", "running"].includes(job.status) : false;
  const canRemove = job ? ["completed", "failed", "interrupted", "canceled"].includes(job.status) : false;

  if (jobQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-transparent border-t-accent" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="py-16 text-center font-mono text-sm text-text-muted">
        Descarga no encontrada.
      </div>
    );
  }

  const pct =
    job.chunks.total > 0
      ? Math.round((job.chunks.completed / job.chunks.total) * 100)
      : 0;

  return (
    <section style={{ animation: "view-in 350ms ease-out both" }}>
      {/* Back */}
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1 bg-transparent font-mono text-xs text-text-muted transition-colors hover:text-accent-text"
      >
        ← Volver a Descargas
      </button>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-lg font-semibold text-accent-text">
          {job.id}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={job.status} />
          {canRetry && (
            <ActionButton
              label={retryMutation.isPending ? "Reintentando..." : "Reintentar"}
              disabled={retryMutation.isPending}
              onClick={() => retryMutation.mutate({ id: jobId })}
            />
          )}
          {canCancel && (
            <ActionButton
              label={cancelMutation.isPending ? "Cancelando..." : "Cancelar"}
              danger
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate({ id: jobId })}
            />
          )}
          {canRemove && (
            <ActionButton
              label={removeMutation.isPending ? "Borrando..." : "Borrar"}
              danger
              disabled={removeMutation.isPending}
              onClick={() => {
                if (window.confirm(`Quitar la descarga "${jobId}" de la interfaz? Los archivos quedan guardados.`)) {
                  removeMutation.mutate({ id: jobId });
                }
              }}
            />
          )}
          {hasArtifact(job, "csv_long") && (
            <DownloadButton
              href={artifactHref(jobId, "long")}
              label="CSV largo"
            />
          )}
          {hasArtifact(job, "csv_wide") && (
            <DownloadButton
              href={artifactHref(jobId, "wide")}
              label="CSV ancho"
            />
          )}
          {hasArtifact(job, "technical_zip") && (
            <DownloadButton
              href={artifactHref(jobId, "zip")}
              label="ZIP"
            />
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard value={String(job.chunks.total)} label="Lotes Totales" />
        <StatCard
          value={String(job.chunks.completed)}
          label="Completados"
        />
        <StatCard
          value={String(job.chunks.failed)}
          label="Fallidos"
          alert={job.chunks.failed > 0}
        />
        <StatCard value={`${pct}%`} label="Progreso" />
      </div>

      {/* Chunk progress */}
      {job.chunks.total > 0 && (
        <div className="mb-8">
          <SectionTitle>Progreso de Lotes</SectionTitle>

          <ChunkProgressBar
            total={job.chunks.total}
            completed={job.chunks.completed}
            failed={job.chunks.failed}
            status={job.status}
          />

          {/* Visual chunk grid */}
          <div className="mt-4 flex flex-wrap gap-[3px]">
            {Array.from({ length: job.chunks.total }, (_, i) => {
              let state: "completed" | "failed" | "running" | "pending" = "pending";
              if (i < job.chunks.completed) state = "completed";
              else if (i < job.chunks.completed + job.chunks.failed)
                state = "failed";
              else if (
                i === job.chunks.completed &&
                (job.status === "running" || job.status === "queued")
              )
                state = "running";

              return (
                <span
                  key={i}
                  title={`Lote ${i + 1}`}
                  className={`inline-block h-5 w-5 cursor-default rounded transition-all hover:scale-125 ${chunkCellClass(state)}`}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-2 flex gap-5 font-mono text-[0.6rem] text-text-muted">
            <LegendItem color="bg-ok" label="Completado" />
            <LegendItem color="bg-fail" label="Fallido" />
            <LegendItem color="bg-running" label="En curso" />
            <LegendItem color="bg-bg-input border border-border" label="Pendiente" />
          </div>
        </div>
      )}

      {/* Meta info */}
      <div className="mb-8">
        <SectionTitle>Información</SectionTitle>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <MetaRow label="Panel" value={job.panel_title ?? "—"} />
          <MetaRow
            label="Rango"
            value={
              job.startDate && job.endDate
                ? `${formatDateTime(job.startDate)} → ${formatDateTime(job.endDate)}`
                : "—"
            }
          />
          <MetaRow
            label="CSV ancho"
            value={job.outputWide ? "Sí" : "No"}
          />
          <MetaRow
            label="Actualizado"
            value={job.updated_at ? formatDateTime(job.updated_at) : "—"}
          />
          {job.active?.error && (
            <div className="rounded-lg border border-fail/20 bg-fail-dim px-4 py-2 font-mono text-xs text-fail sm:col-span-2">
              <span className="font-semibold">Error: </span>
              {job.active.error}
            </div>
          )}
          {(retryMutation.error || cancelMutation.error || removeMutation.error) && (
            <div className="rounded-lg border border-fail/20 bg-fail-dim px-4 py-2 font-mono text-xs text-fail sm:col-span-2">
              {retryMutation.error?.message ?? cancelMutation.error?.message ?? removeMutation.error?.message}
            </div>
          )}
        </div>
      </div>

      {/* Artifacts */}
      {job.artifacts && job.artifacts.length > 0 && (
        <div className="mb-8">
          <SectionTitle>Archivos</SectionTitle>
          <div className="flex flex-col gap-1.5">
            {job.artifacts.map((a, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-border bg-bg-panel px-4 py-2.5 transition-colors hover:bg-bg-card"
              >
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs font-medium text-text-primary">
                    {a.type}
                  </span>
                  <span className="font-mono text-[0.65rem] text-text-muted">
                    {a.format}
                    {a.rows != null ? ` · ${a.rows.toLocaleString()} filas` : ""}
                  </span>
                </div>
                <span className="font-mono text-[0.6rem] text-text-muted">
                  {formatDateTime(a.generated_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs */}
      <div>
        <SectionTitle>Logs</SectionTitle>
        <pre className="max-h-[320px] overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-bg-input p-4 font-mono text-[0.7rem] leading-6 text-text-secondary">
          {logsQuery.data ?? "Cargando..."}
        </pre>
      </div>
    </section>
  );
}

/* ── Helpers ── */

interface JobData {
  artifacts?: Array<{ type: string; format: string; path: string; rows?: number; generated_at: string }>;
}

function hasArtifact(job: JobData, type: string): boolean {
  return job.artifacts?.some((a) => a.type === type) ?? false;
}

function artifactHref(jobId: string, kind: string): string {
  return `/api/jobs/${encodeURIComponent(jobId)}/artifacts/${kind}`;
}

function chunkCellClass(state: string): string {
  switch (state) {
    case "completed": return "bg-ok/70 hover:bg-ok";
    case "failed": return "bg-fail/70 hover:bg-fail";
    case "running": return "bg-running animate-[chunk-run_1.5s_ease-in-out_infinite]";
    default: return "bg-bg-input border border-border";
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function DownloadButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-3 py-1 font-mono text-[0.65rem] font-medium text-text-secondary transition-all hover:border-accent/40 hover:text-accent-text"
    >
      ↓ {label}
    </a>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-md border px-3 py-1 font-mono text-[0.65rem] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "border-fail/25 bg-fail-dim text-fail hover:border-fail/40"
          : "border-border bg-bg-card text-text-secondary hover:border-accent/40 hover:text-accent-text"
      }`}
    >
      {label}
    </button>
  );
}

function StatCard({
  value,
  label,
  alert,
}: {
  value: string;
  label: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-panel p-4 text-center">
      <div
        className={`font-mono text-2xl font-bold leading-tight ${
          alert ? "text-fail" : "text-accent-text"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 font-mono text-[0.6rem] uppercase tracking-wider text-text-muted">
        {label}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
      <span className="inline-block h-4 w-[2px] rounded-sm bg-accent" />
      {children}
    </h3>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 font-mono text-xs">
      <span className="text-text-muted">{label}:</span>
      <span className="text-text-secondary">{value}</span>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-[2px] ${color}`} />
      {label}
    </span>
  );
}
