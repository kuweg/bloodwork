import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api/client";
import { formatIsoLikeDate, formatIsoLikeDateTime } from "../lib/date";
import type { Measurement, Report } from "../types/bloodwork";

interface Props {
  reports: Report[];
  onChanged: () => void | Promise<void>;
}

export function SourceData({ reports, onChanged }: Props) {
  const [preview, setPreview] = useState<Report | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedReports = useMemo(
    () =>
      [...reports].sort((a, b) => {
        const performedLeft = a.collected_at ? Date.parse(a.collected_at) : Number.NaN;
        const performedRight = b.collected_at ? Date.parse(b.collected_at) : Number.NaN;
        const hasPerformedLeft = Number.isFinite(performedLeft);
        const hasPerformedRight = Number.isFinite(performedRight);
        if (hasPerformedLeft && hasPerformedRight && performedLeft !== performedRight) {
          return performedRight - performedLeft;
        }
        if (hasPerformedLeft !== hasPerformedRight) {
          return hasPerformedLeft ? -1 : 1;
        }

        const uploadedLeft = Date.parse(a.uploaded_at);
        const uploadedRight = Date.parse(b.uploaded_at);
        if (Number.isFinite(uploadedLeft) && Number.isFinite(uploadedRight)) {
          if (uploadedLeft !== uploadedRight) return uploadedRight - uploadedLeft;
        } else {
          const fallback = b.uploaded_at.localeCompare(a.uploaded_at);
          if (fallback !== 0) return fallback;
        }

        return a.source_filename.localeCompare(b.source_filename);
      }),
    [reports],
  );

  async function handleDelete(report: Report) {
    const ok = window.confirm(
      `Delete "${report.source_filename}" and its ${report.measurements.length} measurements? This cannot be undone.`,
    );
    if (!ok) return;
    setDeletingId(report.id);
    setError(null);
    try {
      await api.deleteReport(report.id);
      if (expandedId === report.id) setExpandedId(null);
      if (preview?.id === report.id) setPreview(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  }

  if (sortedReports.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center sm:p-16">
          <h2 className="text-xl">No source files yet</h2>
          <p className="mt-1 text-gray-600">
            Upload reports in the Import tab and they will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl sm:text-3xl">Source data</h1>
          <p className="text-gray-600">
            {sortedReports.length} file{sortedReports.length === 1 ? "" : "s"} sorted
            from newest to oldest
          </p>
        </div>
      </header>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <ul className="divide-y divide-gray-100">
          {sortedReports.map((report) => {
            const expanded = expandedId === report.id;
            return (
              <li key={report.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 md:grid-cols-[minmax(180px,2fr)_minmax(160px,1fr)_minmax(180px,1fr)] md:gap-3">
                    <button
                      onClick={() => setPreview(report)}
                      className="inline-flex min-w-0 items-center gap-2 text-left text-blue-700 hover:text-blue-800 hover:underline"
                      title="Open PDF viewer"
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">{report.source_filename}</span>
                    </button>
                    <p className="text-sm text-gray-700">
                      <span className="mr-2 text-xs uppercase tracking-wide text-gray-500 md:hidden">
                        Uploaded:
                      </span>
                      {formatIsoLikeDateTime(report.uploaded_at, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="mr-2 text-xs uppercase tracking-wide text-gray-500 md:hidden">
                        Performed:
                      </span>
                      {report.collected_at
                        ? formatIsoLikeDate(report.collected_at, {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })
                        : "Unknown"}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setExpandedId(expanded ? null : report.id)}
                      className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      title="Edit measurements"
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      {report.measurements.length}
                    </button>
                    <button
                      onClick={() => void handleDelete(report)}
                      disabled={deletingId === report.id}
                      className="rounded border border-red-200 p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      title="Delete report"
                      aria-label="Delete report"
                    >
                      {deletingId === report.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {expanded && <MeasurementsEditor report={report} onChanged={onChanged} />}
              </li>
            );
          })}
        </ul>
      </section>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-6">
          <div className="flex h-[95vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 p-3 sm:p-4">
              <h2 className="truncate pr-4 text-base sm:text-lg">{preview.source_filename}</h2>
              <div className="flex items-center gap-2">
                <a
                  href={api.reportPdfUrl(preview.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                >
                  <span className="inline-flex items-center gap-1">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in new tab
                  </span>
                </a>
                <button
                  onClick={() => setPreview(null)}
                  className="rounded border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-100"
                  aria-label="Close viewer"
                  title="Close viewer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <iframe
              title={`PDF preview for ${preview.source_filename}`}
              src={api.reportPdfUrl(preview.id)}
              className="h-full w-full rounded-b-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MeasurementsEditor({
  report,
  onChanged,
}: {
  report: Report;
  onChanged: () => void | Promise<void>;
}) {
  const measurements = useMemo(
    () =>
      [...report.measurements].sort((a, b) =>
        (a.display_name || a.canonical_name).localeCompare(b.display_name || b.canonical_name),
      ),
    [report.measurements],
  );

  if (measurements.length === 0) {
    return <p className="mt-3 text-sm text-gray-500">No measurements in this report.</p>;
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50/60">
      <ul className="divide-y divide-gray-100">
        {measurements.map((m) => (
          <MeasurementRow key={m.id} m={m} onChanged={onChanged} />
        ))}
      </ul>
    </div>
  );
}

const FIELD = "rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function MeasurementRow({
  m,
  onChanged,
}: {
  m: Measurement;
  onChanged: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(m.value));
  const [unit, setUnit] = useState(m.unit ?? "");
  const [refLow, setRefLow] = useState(m.ref_low == null ? "" : String(m.ref_low));
  const [refHigh, setRefHigh] = useState(m.ref_high == null ? "" : String(m.ref_high));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setValue(String(m.value));
    setUnit(m.unit ?? "");
    setRefLow(m.ref_low == null ? "" : String(m.ref_low));
    setRefHigh(m.ref_high == null ? "" : String(m.ref_high));
    setErr(null);
  }

  async function save() {
    const v = Number(value);
    if (!Number.isFinite(v)) {
      setErr("Value must be a number");
      return;
    }
    const low = refLow.trim() === "" ? null : Number(refLow);
    const high = refHigh.trim() === "" ? null : Number(refHigh);
    if ((low != null && !Number.isFinite(low)) || (high != null && !Number.isFinite(high))) {
      setErr("Reference bounds must be numbers");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.updateMeasurement(m.id, {
        value: v,
        unit: unit.trim() || null,
        ref_low: low,
        ref_high: high,
      });
      setEditing(false);
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-gray-800">{m.display_name || m.canonical_name}</span>
        {!editing ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="tabular-nums text-gray-700">
              {m.value}
              {m.unit ? ` ${m.unit}` : ""}
            </span>
            <span className="text-xs text-gray-500">
              ref {m.ref_low ?? "—"}–{m.ref_high ?? "—"}
            </span>
            <button
              onClick={() => {
                reset();
                setEditing(true);
              }}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
              title="Edit measurement"
              aria-label="Edit measurement"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              placeholder="value"
              className={`${FIELD} w-20`}
            />
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="unit"
              className={`${FIELD} w-20`}
            />
            <input
              value={refLow}
              onChange={(e) => setRefLow(e.target.value)}
              inputMode="decimal"
              placeholder="low"
              className={`${FIELD} w-16`}
            />
            <span className="text-gray-400">–</span>
            <input
              value={refHigh}
              onChange={(e) => setRefHigh(e.target.value)}
              inputMode="decimal"
              placeholder="high"
              className={`${FIELD} w-16`}
            />
            <button
              onClick={() => void save()}
              disabled={busy}
              className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-60"
              title="Save"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                reset();
              }}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </li>
  );
}
