"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { JobList } from "./job-list";
import { JobDetail } from "./job-detail";
import { NewJobForm } from "./new-job-form";

type View = "jobs" | "new" | { detail: string };

export function Dashboard() {
  const [view, setView] = useState<View>("jobs");
  const healthQuery = api.jobs.health.useQuery(undefined, {
    refetchInterval: 10_000,
  });

  const online = healthQuery.data?.online ?? false;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block h-2 w-2 rounded-full bg-accent"
            style={{ animation: "pulse-glow 3s ease-in-out infinite" }}
          />
          <h1 className="font-mono text-base font-semibold tracking-tight text-text-primary">
            air<span className="text-accent-text">data</span>
          </h1>
        </div>
        <span
          className={`rounded-full px-3 py-1 font-mono text-[0.6rem] font-medium uppercase tracking-widest ${
            online
              ? "border border-ok/20 bg-ok-dim text-ok"
              : "border border-fail/20 bg-fail-dim text-fail"
          }`}
        >
          {online ? "conectado" : "desconectado"}
        </span>
      </header>

      {/* Navigation Tabs */}
      <nav className="mb-8 flex gap-1 rounded-lg border border-border bg-bg-panel p-1">
        <TabButton
          active={view === "jobs" || (typeof view === "object" && "detail" in view)}
          onClick={() => setView("jobs")}
          label="Descargas"
        />
        <TabButton
          active={view === "new"}
          onClick={() => setView("new")}
          label="Nueva Descarga"
        />
      </nav>

      {/* Views */}
      <div style={{ animation: "view-in 350ms ease-out both" }}>
        {view === "jobs" && (
          <JobList onSelect={(id) => setView({ detail: id })} />
        )}
        {view === "new" && (
          <NewJobForm
            onCreated={(id) => setView({ detail: id })}
          />
        )}
        {typeof view === "object" && "detail" in view && (
          <JobDetail
            jobId={view.detail}
            onBack={() => setView("jobs")}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md px-4 py-2 text-center font-mono text-xs font-medium uppercase tracking-wider transition-all ${
        active
          ? "bg-accent/10 text-accent-text shadow-sm"
          : "text-text-muted hover:bg-bg-card hover:text-text-secondary"
      }`}
    >
      {label}
    </button>
  );
}
