const LABELS: Record<string, string> = {
  completed: "completado",
  running: "en curso",
  queued: "en cola",
  failed: "fallido",
  interrupted: "interrumpido",
  canceled: "cancelado",
};

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "border-ok/20 bg-ok-dim text-ok",
    running: "border-running/20 bg-running-dim text-running animate-[badge-pulse_2s_ease-in-out_infinite]",
    queued: "border-queued/20 bg-queued-dim text-queued",
    failed: "border-fail/20 bg-fail-dim text-fail",
    interrupted: "border-fail/20 bg-fail-dim text-fail",
    canceled: "border-fail/20 bg-fail-dim text-fail",
    unknown: "border-border bg-bg-card text-text-muted",
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-widest ${
        styles[status] ?? styles.unknown
      }`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
