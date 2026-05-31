/**
 * Rule-based "notable changes" detector: flag tests that moved a lot between the
 * earliest and latest reading, or that ended up out of range. Frontend-only —
 * works off the same historyByTest pivot the charts/table use.
 */
import type { Report } from "../types/bloodwork";
import { historyByTest } from "./data";
import type { Status } from "./metrics";

export interface Insight {
  canonical: string;
  testName: string;
  unit: string;
  firstValue: number;
  lastValue: number;
  firstDate: string;
  lastDate: string;
  pctChange: number | null; // null when the first value is 0
  direction: "up" | "down" | "flat";
  lastStatus: Status;
  worsened: boolean; // ended worse than it started
}

export interface InsightOptions {
  minPct?: number; // minimum |% change| to flag on movement alone
  limit?: number;
}

const SEVERITY: Record<Status, number> = { bad: 2, mid: 1, good: 0 };

export function computeInsights(
  reports: Report[],
  opts: InsightOptions = {},
): Insight[] {
  const minPct = opts.minPct ?? 15;
  const history = historyByTest(reports);
  const insights: Insight[] = [];

  for (const t of history) {
    const dates = Object.keys(t.dates).sort();
    if (dates.length < 2) continue;

    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const first = t.dates[firstDate];
    const last = t.dates[lastDate];

    const delta = last.value - first.value;
    const pct = first.value !== 0 ? (delta / Math.abs(first.value)) * 100 : null;
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    const worsened = SEVERITY[last.status] > SEVERITY[first.status];

    const bigMove = pct != null && Math.abs(pct) >= minPct;
    const outOfRange = last.status !== "good";
    // Surface a test if it moved a lot, got worse, or is currently out of range.
    if (!bigMove && !worsened && !outOfRange) continue;

    insights.push({
      canonical: t.canonical,
      testName: t.testName,
      unit: t.unit,
      firstValue: first.value,
      lastValue: last.value,
      firstDate,
      lastDate,
      pctChange: pct,
      direction,
      lastStatus: last.status,
      worsened,
    });
  }

  // Out-of-range first, then worsened, then by magnitude of change.
  insights.sort((a, b) => {
    const sev = SEVERITY[b.lastStatus] - SEVERITY[a.lastStatus];
    if (sev !== 0) return sev;
    if (a.worsened !== b.worsened) return a.worsened ? -1 : 1;
    return Math.abs(b.pctChange ?? 0) - Math.abs(a.pctChange ?? 0);
  });

  return opts.limit ? insights.slice(0, opts.limit) : insights;
}
