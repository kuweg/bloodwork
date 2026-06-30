import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowRight, GitCompareArrows, TrendingDown, TrendingUp } from "lucide-react";
import type { Measurement, Report } from "../types/bloodwork";
import { formatIsoLikeDate } from "../lib/date";
import { classify, type Status } from "../lib/metrics";
import { groupByPanel } from "../lib/panels";
import { cn } from "../lib/utils";

interface Props {
  reports: Report[];
}

interface DiffRow {
  canonical: string;
  name: string;
  unit: string;
  valA: number | null;
  valB: number | null;
  delta: number | null;
  pct: number | null;
  status: Status;
}

const STATUS_TONE: Record<Status, string> = {
  good: "text-emerald-700",
  mid: "text-yellow-700",
  bad: "text-red-700",
  unknown: "text-gray-500",
};

function reportDate(r: Report): string {
  return r.collected_at ?? r.uploaded_at.slice(0, 10);
}

function sameUnit(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (u: string | null | undefined) => (u ?? "").trim().toLowerCase().replace(/\s+/g, "");
  return norm(a) === norm(b);
}

function pickName(...ms: (Measurement | undefined)[]): string {
  for (const m of ms) {
    if (!m) continue;
    const n = m.display_name?.trim() || m.raw_name?.trim() || m.canonical_name;
    if (n) return n;
  }
  return "";
}

export function Compare({ reports }: Props) {
  const ordered = useMemo(
    () => [...reports].sort((a, b) => reportDate(a).localeCompare(reportDate(b))),
    [reports],
  );
  const [aId, setAId] = useState<number | null>(null);
  const [bId, setBId] = useState<number | null>(null);
  const [changedOnly, setChangedOnly] = useState(true);

  // Default to comparing the two most recent reports.
  useEffect(() => {
    if (ordered.length < 2) return;
    setAId((curr) => curr ?? ordered[ordered.length - 2].id);
    setBId((curr) => curr ?? ordered[ordered.length - 1].id);
  }, [ordered]);

  const a = reports.find((r) => r.id === aId) ?? null;
  const b = reports.find((r) => r.id === bId) ?? null;

  const rows = useMemo<DiffRow[]>(() => {
    if (!a || !b) return [];
    const mapA = new Map(a.measurements.map((m) => [m.canonical_name, m]));
    const mapB = new Map(b.measurements.map((m) => [m.canonical_name, m]));
    const canonicals = [...new Set([...mapA.keys(), ...mapB.keys()])];

    return canonicals.map((canonical) => {
      const ma = mapA.get(canonical);
      const mb = mapB.get(canonical);
      const valA = ma?.value ?? null;
      const valB = mb?.value ?? null;
      // Only show a change when both readings share a unit — never subtract a
      // percentage from an absolute count.
      const comparable = ma != null && mb != null && sameUnit(ma.unit, mb.unit);
      const delta = comparable && valA != null && valB != null ? valB - valA : null;
      const pct = delta != null && valA !== 0 && valA != null ? (delta / Math.abs(valA)) * 100 : null;
      const status = mb ? classify(mb) : ma ? classify(ma) : "unknown";
      return {
        canonical,
        name: pickName(mb, ma),
        unit: mb?.unit ?? ma?.unit ?? "",
        valA,
        valB,
        delta,
        pct,
        status,
      };
    });
  }, [a, b]);

  const visibleRows = useMemo(
    () => (changedOnly ? rows.filter((r) => r.delta == null || r.delta !== 0) : rows),
    [rows, changedOnly],
  );

  const grouped = useMemo(
    () => groupByPanel(visibleRows, (r) => ({ canonical: r.canonical, name: r.name })),
    [visibleRows],
  );

  if (ordered.length < 2) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center sm:p-16">
          <GitCompareArrows className="mx-auto mb-3 h-8 w-8 text-blue-600" />
          <h2 className="text-xl">Need two reports to compare</h2>
          <p className="mt-1 text-gray-600">
            Upload at least two lab reports to see what changed between them.
          </p>
        </div>
      </div>
    );
  }

  const labelFor = (r: Report, idx: number) =>
    `${formatIsoLikeDate(reportDate(r), { month: "short", day: "numeric", year: "numeric" })} · #${idx + 1}`;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4">
        <h1 className="text-2xl sm:text-3xl">Compare Reports</h1>

        <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-12">
          <label className="flex flex-col gap-1 lg:col-span-5">
            <span className="text-xs uppercase tracking-wide text-gray-500">Baseline (A)</span>
            <select
              value={aId ?? ""}
              onChange={(e) => setAId(Number(e.target.value))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ordered.map((r, idx) => (
                <option key={r.id} value={r.id}>
                  {labelFor(r, idx)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 lg:col-span-5">
            <span className="text-xs uppercase tracking-wide text-gray-500">Compared (B)</span>
            <select
              value={bId ?? ""}
              onChange={(e) => setBId(Number(e.target.value))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ordered.map((r, idx) => (
                <option key={r.id} value={r.id}>
                  {labelFor(r, idx)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 lg:col-span-2">
            <input
              type="checkbox"
              checked={changedOnly}
              onChange={(e) => setChangedOnly(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-gray-700">Changes only</span>
          </label>
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          {rows.length === 0
            ? "These two reports share no tests."
            : "No changes between these two reports."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-max">
            <thead className="bg-gray-50">
              <tr>
                <th className="border-b border-gray-200 px-3 py-3 text-left sm:px-6">Test</th>
                <th className="border-b border-gray-200 px-3 py-3 text-center sm:px-6">
                  {a ? formatIsoLikeDate(reportDate(a), { month: "short", day: "numeric", year: "numeric" }) : "A"}
                </th>
                <th className="border-b border-gray-200 px-3 py-3 text-center sm:px-6">
                  {b ? formatIsoLikeDate(reportDate(b), { month: "short", day: "numeric", year: "numeric" }) : "B"}
                </th>
                <th className="border-b border-gray-200 px-3 py-3 text-right sm:px-6">Change</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => (
                <Fragment key={group.panel}>
                  <tr>
                    <td
                      colSpan={4}
                      className="border-b border-gray-200 bg-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 sm:px-6"
                    >
                      {group.panel}
                      <span className="ml-2 font-normal text-gray-400">{group.items.length}</span>
                    </td>
                  </tr>
                  {group.items.map((row, idx) => {
                    const Arrow =
                      row.delta == null || row.delta === 0
                        ? ArrowRight
                        : row.delta > 0
                          ? TrendingUp
                          : TrendingDown;
                    const tone = STATUS_TONE[row.status];
                    return (
                      <tr key={row.canonical} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="border-b border-gray-200 px-3 py-3 align-top sm:px-6">
                          {row.name}
                        </td>
                        <td className="border-b border-gray-200 px-3 py-3 text-center tabular-nums text-gray-700 sm:px-6">
                          {row.valA == null ? "—" : `${row.valA}${row.unit ? ` ${row.unit}` : ""}`}
                        </td>
                        <td className="border-b border-gray-200 px-3 py-3 text-center sm:px-6">
                          {row.valB == null ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <span className={cn("tabular-nums font-medium", tone)}>
                              {row.valB}
                              {row.unit ? ` ${row.unit}` : ""}
                            </span>
                          )}
                        </td>
                        <td className="border-b border-gray-200 px-3 py-3 text-right sm:px-6">
                          {row.delta == null ? (
                            <span className="text-xs text-gray-400">
                              {row.valB == null ? "removed" : "new"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-end gap-1.5 tabular-nums text-gray-700">
                              <Arrow className={cn("h-4 w-4", row.delta === 0 ? "text-gray-400" : tone)} />
                              {row.delta > 0 ? "+" : ""}
                              {Number(row.delta.toFixed(2))}
                              {row.pct != null && (
                                <span className="text-xs text-gray-500">
                                  ({row.pct > 0 ? "+" : ""}
                                  {row.pct.toFixed(0)}%)
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
