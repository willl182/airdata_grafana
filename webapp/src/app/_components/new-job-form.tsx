"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

interface Props {
  onCreated: (jobId: string) => void;
}

const DEFAULT_DASHBOARD_URL =
  "https://grafana.canair.io/d/UN_OsIo7k/tangara?orgId=1&from=now-1h&to=now&timezone=browser";

export function NewJobForm({ onCreated }: Props) {
  const utils = api.useUtils();

  const [form, setForm] = useState({
    id: "",
    dashboardUrl: DEFAULT_DASHBOARD_URL,
    panelTitle: "PM2.5 Sensores Cali",
    startDate: "",
    endDate: "",
    timezone: "America/Bogota",
    chunkValue: 1,
    chunkUnit: "day" as "hour" | "day",
    outputWide: false,
  });

  const [error, setError] = useState<string | null>(null);

  const createMutation = api.jobs.create.useMutation({
    onSuccess: (data) => {
      void utils.jobs.list.invalidate();
      onCreated(data.job_id);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.id || !form.startDate || !form.endDate) {
      setError("Completa los campos obligatorios: ID, fecha inicio y fecha fin.");
      return;
    }

    createMutation.mutate({
      id: form.id,
      dashboardUrl: form.dashboardUrl,
      panelTitle: form.panelTitle,
      startDate: form.startDate,
      endDate: form.endDate,
      timezone: form.timezone,
      chunkSize: { value: form.chunkValue, unit: form.chunkUnit },
      outputWide: form.outputWide,
    });
  }

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <section>
      <h2 className="mb-5 text-lg font-semibold text-text-primary">
        Nueva Descarga
      </h2>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-border bg-bg-panel p-6"
      >
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          {/* Job ID */}
          <FormField label="ID Descarga *" hint="Identificador único (a-z, 0-9, -, .)">
            <input
              type="text"
              value={form.id}
              onChange={set("id")}
              placeholder="pm25-cali-7d"
              className="form-input"
            />
          </FormField>

          {/* Panel Title */}
          <FormField label="Panel Title *">
            <input
              type="text"
              value={form.panelTitle}
              onChange={set("panelTitle")}
              className="form-input"
            />
          </FormField>

          {/* Dashboard URL */}
          <FormField label="Dashboard URL" className="sm:col-span-2">
            <input
              type="url"
              value={form.dashboardUrl}
              onChange={set("dashboardUrl")}
              className="form-input"
            />
          </FormField>

          {/* Start Date */}
          <FormField label="Fecha Inicio *">
            <input
              type="datetime-local"
              value={form.startDate}
              onChange={set("startDate")}
              className="form-input"
            />
          </FormField>

          {/* End Date */}
          <FormField label="Fecha Fin *" hint="Temporalmente no se bloquean rangos mayores a 10 días; úsalos solo para prueba.">
            <input
              type="datetime-local"
              value={form.endDate}
              onChange={set("endDate")}
              className="form-input"
            />
          </FormField>

          {/* Timezone */}
          <FormField label="Zona Horaria">
            <input
              type="text"
              value={form.timezone}
              onChange={set("timezone")}
              className="form-input"
            />
          </FormField>

          {/* Chunk Size */}
          <FormField label="Tamaño de Lote">
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={form.chunkValue}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    chunkValue: parseInt(e.target.value) || 1,
                  }))
                }
                className="form-input w-20"
              />
              <select
                value={form.chunkUnit}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    chunkUnit: e.target.value as "hour" | "day",
                  }))
                }
                className="form-input"
              >
                <option value="hour">hora(s)</option>
                <option value="day">día(s)</option>
              </select>
            </div>
          </FormField>

          {/* Output Wide checkbox */}
          <div className="flex items-center gap-2.5 pt-2 sm:col-span-2">
            <input
              type="checkbox"
              id="outputWide"
              checked={form.outputWide}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, outputWide: e.target.checked }))
              }
              className="h-4 w-4 cursor-pointer appearance-none rounded border border-border bg-bg-input transition-all checked:border-accent checked:bg-accent"
            />
            <label
              htmlFor="outputWide"
              className="cursor-pointer font-mono text-xs text-text-secondary"
            >
              Generar CSV ancho (wide) además del largo
            </label>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg border border-fail/20 bg-fail-dim px-4 py-2 font-mono text-xs text-fail">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-mono text-xs font-semibold tracking-wide text-white transition-all hover:bg-accent/85 hover:shadow-[0_4px_16px_rgba(168,85,247,0.3)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {createMutation.isPending && (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-transparent border-t-current" />
            )}
            {createMutation.isPending ? "Creando..." : "Iniciar Descarga"}
          </button>
        </div>
      </form>
    </section>
  );
}

function FormField({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="font-mono text-[0.6rem] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[0.65rem] text-text-muted">{hint}</span>
      )}
    </div>
  );
}
