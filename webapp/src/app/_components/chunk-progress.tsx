export function ChunkProgressBar({
  total,
  completed,
  failed,
  status,
}: {
  total: number;
  completed: number;
  failed: number;
  status: string;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const failPct = total > 0 ? Math.round((failed / total) * 100) : 0;

  const barClass =
    status === "running" || status === "queued"
      ? "bg-running"
      : failed > 0
        ? "bg-fail"
        : "bg-ok";

  return (
    <div className="mt-3">
      <div className="relative h-1.5 overflow-hidden rounded-full bg-bg-input">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-[width] duration-600 ease-out ${barClass}`}
          style={{ width: `${pct}%` }}
        />
        {failPct > 0 && (
          <div
            className="absolute top-0 h-full rounded-full bg-fail"
            style={{
              left: `${pct}%`,
              width: `${failPct}%`,
            }}
          />
        )}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[0.6rem] text-text-muted">
        <span>
          {completed}/{total} lotes
        </span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}
