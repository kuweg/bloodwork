import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Plus, Trash2, X } from "lucide-react";
import type { Report } from "../types/bloodwork";
import { formatIsoLikeDate } from "../lib/date";
import { historyByTest } from "../lib/data";
import { cn } from "../lib/utils";

interface Props {
  reports: Report[];
}

interface ChartConfig {
  id: string;
  type: "line" | "bar";
  tests: string[]; // canonical names
  dateRange: string[]; // empty = all
}

const COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

// Emerald band marking the reference (normal) range.
const BAND_COLOR = "#10b981";
// Out-of-range dot colors keyed by metrics.ts status; "good" falls back to the line color.
const STATUS_DOT: Record<string, string> = { bad: "#ef4444", mid: "#f59e0b" };

/**
 * Render a point as a colored dot — red when out of range, amber when borderline,
 * otherwise the series color. Reads the per-point status injected into chartData.
 */
function statusDot(name: string, color: string) {
  return (props: {
    cx?: number;
    cy?: number;
    index?: number;
    payload?: Record<string, number | string>;
  }) => {
    const { cx, cy, index, payload } = props;
    if (cx == null || cy == null || payload?.[name] == null) {
      return <g key={`empty-${index}`} />;
    }
    const status = payload[`${name}__status`] as string | undefined;
    const fill = (status && STATUS_DOT[status]) || color;
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={4}
        fill={fill}
        stroke="#fff"
        strokeWidth={1}
      />
    );
  };
}

export function Graphics({ reports }: Props) {
  const history = useMemo(() => historyByTest(reports), [reports]);
  const allDates = useMemo(
    () => [...new Set(history.flatMap((t) => Object.keys(t.dates)))].sort(),
    [history],
  );

  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<Partial<ChartConfig>>({
    type: "line",
    tests: [],
    dateRange: [],
  });

  const addChart = () => {
    if (!draft.tests?.length) return;
    setCharts([
      ...charts,
      {
        id: Date.now().toString(),
        type: draft.type ?? "line",
        tests: draft.tests,
        dateRange: draft.dateRange ?? [],
      },
    ]);
    setDraft({ type: "line", tests: [], dateRange: [] });
    setShowAdd(false);
  };

  const removeChart = (id: string) => setCharts(charts.filter((c) => c.id !== id));

  const chartData = (cfg: ChartConfig) => {
    const dates = cfg.dateRange.length ? cfg.dateRange : allDates;
    return dates.map((date) => {
      const point: Record<string, string | number> = {
        date: formatIsoLikeDate(date, {
          month: "short",
          day: "numeric",
          year: "2-digit",
        }),
      };
      for (const canonical of cfg.tests) {
        const test = history.find((t) => t.canonical === canonical);
        const cell = test?.dates[date];
        if (cell) {
          point[test!.testName] = cell.value;
          point[`${test!.testName}__status`] = cell.status;
        }
      }
      return point;
    });
  };

  const toggle = (key: "tests" | "dateRange", value: string) => {
    const current = draft[key] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value].sort();
    setDraft({ ...draft, [key]: next });
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl sm:text-3xl">Blood Work Graphics</h1>
        <button
          onClick={() => setShowAdd(true)}
          disabled={history.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 sm:w-auto"
        >
          <Plus className="h-5 w-5" />
          Add Chart
        </button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 sm:p-6">
            <div className="mb-6 flex items-center justify-between gap-2">
              <h2 className="text-xl sm:text-2xl">Configure New Chart</h2>
              <button
                onClick={() => setShowAdd(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="mb-6">
              <label className="mb-2 block text-gray-700">Chart Type</label>
              <div className="flex flex-wrap gap-3">
                {(["line", "bar"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setDraft({ ...draft, type })}
                    className={cn(
                      "rounded-lg border-2 px-4 py-2",
                      draft.type === type
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-gray-300",
                    )}
                  >
                    {type === "line" ? "Line Chart" : "Bar Chart"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="mb-2 block text-gray-700">
                Select Tests to Plot ({(draft.tests ?? []).length} selected)
              </label>
              <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-gray-200 p-3 sm:grid-cols-2">
                {history.map((t) => (
                  <label
                    key={t.canonical}
                    className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={(draft.tests ?? []).includes(t.canonical)}
                      onChange={() => toggle("tests", t.canonical)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">{t.testName}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="mb-2 block text-gray-700">
                Select Dates ({(draft.dateRange ?? []).length} selected, leave empty for all)
              </label>
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 p-3 sm:grid-cols-2">
                {allDates.map((date) => (
                  <label
                    key={date}
                    className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={(draft.dateRange ?? []).includes(date)}
                      onChange={() => toggle("dateRange", date)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">
                      {formatIsoLikeDate(date, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button
                onClick={addChart}
                disabled={!draft.tests?.length}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Create Chart
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {charts.length === 0 ? (
        <div className="py-12 text-center text-gray-500 sm:py-20">
          <p className="mb-2 text-lg">
            {history.length === 0 ? "No measurements available" : "No charts added yet"}
          </p>
          <p className="text-sm">
            {history.length === 0
              ? "Upload a report first to enable chart creation."
              : 'Click "Add Chart" to create your first visualization'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {charts.map((chart) => {
            const data = chartData(chart);
            const testNames = chart.tests.map(
              (c) => history.find((t) => t.canonical === c)?.testName ?? c,
            );
            // Reference-range band only makes sense for a single test on a line
            // chart (different tests have different ranges/units).
            const band =
              chart.type === "line" && chart.tests.length === 1
                ? (history.find((t) => t.canonical === chart.tests[0]) ?? null)
                : null;
            const hasBand = !!band && (band.refLow != null || band.refHigh != null);
            return (
              <div
                key={chart.id}
                className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="mb-1 text-lg">{testNames.join(" vs ")}</h3>
                    <p className="text-sm text-gray-600">
                      {chart.type === "line" ? "Line Chart" : "Bar Chart"}
                    </p>
                    {hasBand && (
                      <p className="mt-0.5 text-xs text-emerald-700">
                        Shaded band = normal range ({band!.normalRange}
                        {band!.unit ? ` ${band!.unit}` : ""})
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeChart(chart.id)}
                    className="rounded p-2 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
                    aria-label="Remove chart"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>

                <ResponsiveContainer width="100%" height={300}>
                  {chart.type === "line" ? (
                    <LineChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      {band?.refLow != null && band?.refHigh != null && (
                        <ReferenceArea
                          y1={band.refLow}
                          y2={band.refHigh}
                          fill={BAND_COLOR}
                          fillOpacity={0.1}
                          ifOverflow="extendDomain"
                        />
                      )}
                      {band?.refHigh != null && (
                        <ReferenceLine
                          y={band.refHigh}
                          stroke={BAND_COLOR}
                          strokeDasharray="4 4"
                          ifOverflow="extendDomain"
                          label={{
                            value: String(band.refHigh),
                            position: "right",
                            fill: BAND_COLOR,
                            fontSize: 11,
                          }}
                        />
                      )}
                      {band?.refLow != null && (
                        <ReferenceLine
                          y={band.refLow}
                          stroke={BAND_COLOR}
                          strokeDasharray="4 4"
                          ifOverflow="extendDomain"
                          label={{
                            value: String(band.refLow),
                            position: "right",
                            fill: BAND_COLOR,
                            fontSize: 11,
                          }}
                        />
                      )}
                      {testNames.map((name, idx) => (
                        <Line
                          key={`${chart.id}-l-${name}`}
                          type="monotone"
                          dataKey={name}
                          stroke={COLORS[idx % COLORS.length]}
                          strokeWidth={2}
                          dot={statusDot(name, COLORS[idx % COLORS.length])}
                          activeDot={{ r: 5 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  ) : (
                    <BarChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      {testNames.map((name, idx) => (
                        <Bar
                          key={`${chart.id}-b-${name}`}
                          dataKey={name}
                          fill={COLORS[idx % COLORS.length]}
                        />
                      ))}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
