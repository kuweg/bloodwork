import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Minus,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { api } from "../api/client";
import type { Report, TestInfoResponse } from "../types/bloodwork";
import { formatIsoLikeDate } from "../lib/date";
import { historyByTest, type TestHistory } from "../lib/data";
import type { Status } from "../lib/metrics";
import { cn } from "../lib/utils";

interface Props {
  reports: Report[];
}

const STATUS_COLORS: Record<Status, string> = {
  good: "bg-green-100 text-green-800",
  mid: "bg-yellow-100 text-yellow-800",
  bad: "bg-red-100 text-red-800",
};

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim();
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j += 1) {
    if (haystack[j] === needle[i]) i += 1;
  }
  return i === needle.length;
}

function smartNameScore(test: TestHistory, query: string): number {
  const q = normalizeSearchText(query);
  if (!q) return 1;

  const name = normalizeSearchText(test.testName);
  const canonical = normalizeSearchText(test.canonical);
  const words = `${name} ${canonical}`.split(/\s+/).filter(Boolean);
  const qTokens = q.split(/\s+/).filter(Boolean);

  if (name === q || canonical === q) return 1500;
  if (name.startsWith(q) || canonical.startsWith(q)) return 1200;
  if (name.includes(q)) return 900;
  if (canonical.includes(q)) return 850;

  const tokenPrefixHits = qTokens.filter((t) => words.some((w) => w.startsWith(t))).length;
  if (tokenPrefixHits === qTokens.length && qTokens.length > 0) {
    return 700 + tokenPrefixHits * 20;
  }

  if (isSubsequence(q.replace(/\s+/g, ""), name.replace(/\s+/g, ""))) return 500;
  if (isSubsequence(q.replace(/\s+/g, ""), canonical.replace(/\s+/g, ""))) return 450;

  return 0;
}

export function TableViewer({ reports }: Props) {
  const [sortBy, setSortBy] = useState<"name" | "latest">("name");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [infoFor, setInfoFor] = useState<{ canonical: string; title: string } | null>(
    null,
  );
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ active: boolean; x: number; left: number }>({
    active: false,
    x: 0,
    left: 0,
  });
  const [canScroll, setCanScroll] = useState({ left: false, right: false });
  const history = useMemo(() => historyByTest(reports), [reports]);

  const allDates = useMemo(() => {
    const set = new Set<string>();
    history.forEach((t) => Object.keys(t.dates).forEach((d) => set.add(d)));
    return [...set].sort();
  }, [history]);

  useEffect(() => {
    if (allDates.length === 0) {
      setFromDate("");
      setToDate("");
      return;
    }
    const first = allDates[0];
    const last = allDates[allDates.length - 1];
    setFromDate((curr) => curr || first);
    setToDate((curr) => curr || last);
  }, [allDates]);

  const visibleDates = useMemo(() => {
    const start = fromDate || allDates[0] || "";
    const end = toDate || allDates[allDates.length - 1] || "";
    return allDates.filter((d) => (!start || d >= start) && (!end || d <= end));
  }, [allDates, fromDate, toDate]);

  const searchable = useMemo(() => {
    const rows = history
      .map((test) => ({
        test,
        score: smartNameScore(test, search),
      }))
      .filter((entry) => entry.score > 0);

    const withVisibleDates = rows
      .map((entry) => ({
        ...entry,
        hasVisibleData: visibleDates.some((d) => Boolean(entry.test.dates[d])),
      }))
      .filter((entry) => entry.hasVisibleData);

    const data = withVisibleDates.map((entry) => entry.test);
    if (sortBy === "name") {
      data.sort((a, b) => a.testName.localeCompare(b.testName));
    } else {
      const latestOf = (t: TestHistory) =>
        [...visibleDates].reverse().find((d) => Boolean(t.dates[d])) ?? "";
      data.sort((a, b) => latestOf(b).localeCompare(latestOf(a)));
    }
    if (search.trim()) {
      const scoreByCanonical = new Map(
        withVisibleDates.map((entry) => [entry.test.canonical, entry.score]),
      );
      data.sort((a, b) => {
        const delta =
          (scoreByCanonical.get(b.canonical) ?? 0) -
          (scoreByCanonical.get(a.canonical) ?? 0);
        if (delta !== 0) return delta;
        return a.testName.localeCompare(b.testName);
      });
    }
    return data;
  }, [history, search, sortBy, visibleDates]);

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;

    const update = () => {
      const maxLeft = el.scrollWidth - el.clientWidth;
      setCanScroll({
        left: el.scrollLeft > 4,
        right: el.scrollLeft < maxLeft - 4,
      });
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [visibleDates.length, searchable.length]);

  if (history.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-16 text-center">
          <h2 className="text-xl">Nothing to show</h2>
          <p className="mt-1 text-gray-600">Upload reports to populate the table.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl">Historical Blood Work Data</h1>
          <div className="text-sm text-gray-600">
            {searchable.length} test{searchable.length === 1 ? "" : "s"} shown
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-3 lg:grid-cols-12">
          <label className="relative lg:col-span-5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Smart search test name (e.g. hemo, chol, trig)"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="flex items-center gap-2 lg:col-span-2">
            <span className="shrink-0 text-xs uppercase tracking-wide text-gray-500">From</span>
            <input
              type="date"
              value={fromDate}
              min={allDates[0]}
              max={toDate || allDates[allDates.length - 1]}
              onChange={(e) => {
                const next = e.target.value;
                setFromDate(next);
                if (toDate && next && next > toDate) setToDate(next);
              }}
              className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="flex items-center gap-2 lg:col-span-2">
            <span className="shrink-0 text-xs uppercase tracking-wide text-gray-500">To</span>
            <input
              type="date"
              value={toDate}
              min={fromDate || allDates[0]}
              max={allDates[allDates.length - 1]}
              onChange={(e) => {
                const next = e.target.value;
                setToDate(next);
                if (fromDate && next && next < fromDate) setFromDate(next);
              }}
              className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="flex items-center gap-2 lg:col-span-2">
            <span className="shrink-0 text-gray-700">Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "name" | "latest")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="name">Name</option>
              <option value="latest">Latest</option>
            </select>
          </label>

          <button
            onClick={() => {
              setSearch("");
              if (allDates.length > 0) {
                setFromDate(allDates[0]);
                setToDate(allDates[allDates.length - 1]);
              } else {
                setFromDate("");
                setToDate("");
              }
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 lg:col-span-1"
          >
            Reset
          </button>
        </div>
      </div>

      {searchable.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          No tests match your search/date filters.
        </div>
      )}

      {searchable.length > 0 && (
        <div className="relative rounded-lg border border-gray-200 bg-white">
          <button
            onClick={() => tableScrollRef.current?.scrollBy({ left: -480, behavior: "smooth" })}
            disabled={!canScroll.left}
            className="absolute left-2 top-2 z-20 rounded-full border border-gray-300 bg-white/90 p-1 text-gray-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
            title="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => tableScrollRef.current?.scrollBy({ left: 480, behavior: "smooth" })}
            disabled={!canScroll.right}
            className="absolute right-2 top-2 z-20 rounded-full border border-gray-300 bg-white/90 p-1 text-gray-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
            title="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div
            ref={tableScrollRef}
            className={cn(
              "overflow-x-auto rounded-lg",
              "cursor-grab active:cursor-grabbing",
            )}
            onMouseDown={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest("button,input,select,textarea,a,label")) return;
              const el = tableScrollRef.current;
              if (!el) return;
              dragState.current = { active: true, x: e.clientX, left: el.scrollLeft };
            }}
            onMouseMove={(e) => {
              const el = tableScrollRef.current;
              if (!el || !dragState.current.active) return;
              e.preventDefault();
              const dx = e.clientX - dragState.current.x;
              el.scrollLeft = dragState.current.left - dx;
            }}
            onMouseUp={() => {
              dragState.current.active = false;
            }}
            onMouseLeave={() => {
              dragState.current.active = false;
            }}
          >
            <table className="w-full min-w-max">
              <thead className="bg-gray-50">
                <tr>
                  <th className="sticky left-0 z-10 border-b border-gray-200 bg-gray-50 px-6 py-4 text-left">
                    Test Name
                  </th>
                  <th className="border-b border-gray-200 px-6 py-4 text-center">Trend</th>
                  {visibleDates.map((date) => (
                    <th
                      key={date}
                      className="min-w-[140px] border-b border-gray-200 px-6 py-4 text-center"
                    >
                      {formatIsoLikeDate(date, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {searchable.map((test, idx) => (
                  <tr key={test.canonical} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="sticky left-0 z-10 border-b border-gray-200 bg-inherit px-6 py-4">
                      <div className="flex items-center gap-1.5 text-gray-900">
                        <span>{test.testName}</span>
                        <button
                          onClick={() =>
                            setInfoFor({ canonical: test.canonical, title: test.testName })
                          }
                          className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                          aria-label="About this test"
                          title="About this test"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </div>
                      {test.normalRange && test.normalRange !== "—" && (
                        <div className="mt-0.5 text-xs font-normal text-gray-500">
                          Normal: {test.normalRange}
                          {test.unit ? ` ${test.unit}` : ""}
                        </div>
                      )}
                    </td>
                    <td className="border-b border-gray-200 px-6 py-4 text-center">
                      <Trend test={test} dates={visibleDates} />
                    </td>
                    {visibleDates.map((date) => {
                      const cell = test.dates[date];
                      return (
                        <td
                          key={date}
                          className="border-b border-gray-200 px-6 py-4 text-center"
                        >
                          {cell ? (
                            <span
                              className={cn(
                                "inline-block rounded px-3 py-1",
                                STATUS_COLORS[cell.status],
                              )}
                            >
                              {cell.value} {cell.unit}
                            </span>
                          ) : (
                            <span className="inline-block rounded bg-gray-100 px-3 py-1 text-gray-500">
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {infoFor && (
        <TestInfoModal
          canonicalName={infoFor.canonical}
          fallbackTitle={infoFor.title}
          onClose={() => setInfoFor(null)}
        />
      )}
    </div>
  );
}

function Trend({ test, dates }: { test: TestHistory; dates: string[] }) {
  const existing = dates.filter((d) => Boolean(test.dates[d]));
  if (existing.length < 2) return <Minus className="mx-auto h-4 w-4 text-gray-500" />;
  const latest = test.dates[existing[existing.length - 1]].value;
  const prev = test.dates[existing[existing.length - 2]].value;
  if (latest > prev) return <TrendingUp className="mx-auto h-4 w-4 text-blue-600" />;
  if (latest < prev) return <TrendingDown className="mx-auto h-4 w-4 text-orange-600" />;
  return <Minus className="mx-auto h-4 w-4 text-gray-500" />;
}

function TestInfoModal({
  canonicalName,
  fallbackTitle,
  onClose,
}: {
  canonicalName: string;
  fallbackTitle: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<TestInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getTestInfo(canonicalName)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canonicalName]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 className="flex items-center gap-2 text-2xl">
            <BookOpen className="h-5 w-5 text-blue-600" />
            {data?.title || fallbackTitle}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-10 text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {error && !loading && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {data && !loading && (
          <div className="space-y-4">
            <section>
              <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Title
              </h3>
              <p className="text-sm text-gray-800">{data.title}</p>
            </section>

            {data.mentioned_as.length > 0 && (
              <section>
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Mentioned in your data as
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {data.mentioned_as.map((alias) => (
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

            {data.description && (
              <section>
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Description
                </h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                  {data.description}
                </p>
              </section>
            )}

            {data.importance && (
              <section>
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Why it is important
                </h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                  {data.importance}
                </p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
