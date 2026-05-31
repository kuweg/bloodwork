import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BookOpen, Loader2, X } from "lucide-react";
import { api } from "../api/client";
import type { Annotation, Report, TestInfoResponse } from "../types/bloodwork";
import { formatIsoLikeDate } from "../lib/date";
import { historyByTest } from "../lib/data";
import { ANNOTATION_COLOR, annotationsInRange } from "../lib/annotations";
import type { Status } from "../lib/metrics";
import { cn } from "../lib/utils";

const fmtShort = (iso: string) =>
  formatIsoLikeDate(iso, { month: "short", day: "numeric", year: "2-digit" });

const STATUS_BADGE: Record<Status, string> = {
  good: "bg-green-100 text-green-800",
  mid: "bg-yellow-100 text-yellow-800",
  bad: "bg-red-100 text-red-800",
};
const BAND_COLOR = "#10b981";

export function TestDetailModal({
  canonical,
  title,
  reports,
  annotations,
  onClose,
}: {
  canonical: string;
  title: string;
  reports: Report[];
  annotations: Annotation[];
  onClose: () => void;
}) {
  const [info, setInfo] = useState<TestInfoResponse | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [infoError, setInfoError] = useState<string | null>(null);

  const test = useMemo(
    () => historyByTest(reports).find((t) => t.canonical === canonical) ?? null,
    [reports, canonical],
  );

  // Readings sorted oldest → newest.
  const readings = useMemo(() => {
    if (!test) return [];
    return Object.keys(test.dates)
      .sort()
      .map((date) => ({ date, ...test.dates[date] }));
  }, [test]);

  const events = useMemo(
    () =>
      annotationsInRange(
        annotations,
        readings.length ? readings[0].date : undefined,
        readings.length ? readings[readings.length - 1].date : undefined,
      ),
    [annotations, readings],
  );

  // Inject event dates as categories so their markers always align on the axis.
  const chartData = useMemo(() => {
    const valueByDate = new Map(readings.map((r) => [r.date, r.value]));
    const allIso = [
      ...new Set([...readings.map((r) => r.date), ...events.map((e) => e.date)]),
    ].sort();
    return allIso.map((iso) => ({ date: fmtShort(iso), value: valueByDate.get(iso) ?? null }));
  }, [readings, events]);

  useEffect(() => {
    let cancelled = false;
    setInfoLoading(true);
    setInfoError(null);
    api
      .getTestInfo(canonical)
      .then((res) => !cancelled && setInfo(res))
      .catch((err) => !cancelled && setInfoError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setInfoLoading(false));
    return () => {
      cancelled = true;
    };
  }, [canonical]);

  const latest = readings.length ? readings[readings.length - 1] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-xl sm:text-2xl">
              <BookOpen className="h-5 w-5 text-blue-600" />
              {info?.title || title}
            </h2>
            {latest && (
              <p className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                <span
                  className={cn(
                    "inline-block rounded px-2 py-0.5 font-medium",
                    STATUS_BADGE[latest.status],
                  )}
                >
                  {latest.value} {test?.unit}
                </span>
                <span>Normal: {test?.normalRange} {test?.unit}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {readings.length >= 2 && (
          <div className="mb-4">
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Trend
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} width={36} />
                <Tooltip />
                {test?.refLow != null && test?.refHigh != null && (
                  <ReferenceArea
                    y1={test.refLow}
                    y2={test.refHigh}
                    fill={BAND_COLOR}
                    fillOpacity={0.1}
                    ifOverflow="extendDomain"
                  />
                )}
                {test?.refHigh != null && (
                  <ReferenceLine y={test.refHigh} stroke={BAND_COLOR} strokeDasharray="4 4" ifOverflow="extendDomain" />
                )}
                {test?.refLow != null && (
                  <ReferenceLine y={test.refLow} stroke={BAND_COLOR} strokeDasharray="4 4" ifOverflow="extendDomain" />
                )}
                {events.map((e) => (
                  <ReferenceLine
                    key={e.id}
                    x={fmtShort(e.date)}
                    stroke={ANNOTATION_COLOR}
                    strokeDasharray="2 4"
                    label={{
                      value: e.label.length > 14 ? `${e.label.slice(0, 14)}…` : e.label,
                      position: "insideTopRight",
                      fontSize: 10,
                      fill: ANNOTATION_COLOR,
                    }}
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {readings.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Readings ({readings.length})
            </h3>
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {[...readings].reverse().map((r) => (
                <li key={r.date} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-gray-600">
                    {formatIsoLikeDate(r.date, { year: "numeric", month: "short", day: "numeric" })}
                  </span>
                  <span className={cn("rounded px-2 py-0.5 font-medium tabular-nums", STATUS_BADGE[r.status])}>
                    {r.value} {r.unit}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-gray-100 pt-4">
          {infoLoading && (
            <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading test info…
            </div>
          )}
          {infoError && !infoLoading && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {infoError}
            </p>
          )}
          {info && !infoLoading && (
            <div className="space-y-4">
              {info.mentioned_as.length > 0 && (
                <section>
                  <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Mentioned in your data as
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {info.mentioned_as.map((alias) => (
                      <li
                        key={alias}
                        className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-700"
                      >
                        {alias}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {info.description && (
                <section>
                  <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Description
                  </h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                    {info.description}
                  </p>
                </section>
              )}
              {info.importance && (
                <section>
                  <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Why it is important
                  </h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                    {info.importance}
                  </p>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
