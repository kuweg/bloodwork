/**
 * Rule-based "notable changes" detector comparing the two most recent reports:
 * flag tests that moved a lot between the previous and latest analysis, got worse,
 * or are currently out of range. Frontend-only.
 */
import type { Measurement, Report } from "../types/bloodwork";
import { classify, type Status } from "./metrics";

export interface Insight {
  canonical: string;
  testName: string;
  unit: string;
  prevValue: number | null; // null when the test wasn't in the previous report
  lastValue: number;
  prevDate: string | null;
  lastDate: string;
  pctChange: number | null; // null when no previous value or previous value is 0
  direction: "up" | "down" | "flat";
  lastStatus: Status;
  worsened: boolean; // ended worse than the previous report
  hasPrevious: boolean;
}

export interface InsightOptions {
  minPct?: number; // minimum |% change| to flag on movement alone
  limit?: number;
}

const SEVERITY: Record<Status, number> = { bad: 2, mid: 1, good: 0, unknown: 0 };

function reportDate(r: Report): string {
  return r.collected_at ?? r.uploaded_at.slice(0, 10);
}

function displayName(m: Measurement): string {
  return m.display_name?.trim() || m.raw_name?.trim() || m.canonical_name;
}

/**
 * Two readings are only comparable as a "trend" if they share a unit. Comparing
 * a percentage against an absolute count (e.g. a mis-normalized "Lymphocytes %"
 * vs "Lymphocytes #") produces a meaningless, alarming swing — never do it.
 */
function sameUnit(a: string | null, b: string | null): boolean {
  const norm = (u: string | null) => (u ?? "").trim().toLowerCase().replace(/\s+/g, "");
  return norm(a) === norm(b);
}

export function computeInsights(
  reports: Report[],
  opts: InsightOptions = {},
): Insight[] {
  const minPct = opts.minPct ?? 15;
  if (reports.length === 0) return [];

  // The two most recent reports by date (latest, and the one before it).
  const ordered = [...reports].sort((a, b) =>
    reportDate(a).localeCompare(reportDate(b)),
  );
  const latest = ordered[ordered.length - 1];
  const prev = ordered.length >= 2 ? ordered[ordered.length - 2] : null;
  const prevMap = new Map(
    (prev?.measurements ?? []).map((m) => [m.canonical_name, m]),
  );

  const insights: Insight[] = [];
  for (const m of latest.measurements) {
    const pmRaw = prevMap.get(m.canonical_name);
    // Only treat the previous reading as a comparable baseline when its unit
    // matches; otherwise we'd report a fake percentage change between two
    // different quantities.
    const pm = pmRaw && sameUnit(pmRaw.unit, m.unit) ? pmRaw : undefined;
    const lastValue = m.value;
    const lastStatus = classify(m);
    const prevValue = pm ? pm.value : null;
    const prevStatus = pm ? classify(pm) : lastStatus;

    const delta = prevValue != null ? lastValue - prevValue : null;
    const pct =
      delta != null && prevValue != null && prevValue !== 0
        ? (delta / Math.abs(prevValue)) * 100
        : null;
    const direction = delta == null || delta === 0 ? "flat" : delta > 0 ? "up" : "down";
    const worsened = SEVERITY[lastStatus] > SEVERITY[prevStatus];

    const bigMove = pct != null && Math.abs(pct) >= minPct;
    // "unknown" (no reference range) is not out of range — don't flag it as one.
    const outOfRange = lastStatus === "bad" || lastStatus === "mid";
    if (!bigMove && !worsened && !outOfRange) continue;

    insights.push({
      canonical: m.canonical_name,
      testName: displayName(m),
      unit: m.unit ?? "",
      prevValue,
      lastValue,
      prevDate: prev ? reportDate(prev) : null,
      lastDate: reportDate(latest),
      pctChange: pct,
      direction,
      lastStatus,
      worsened,
      hasPrevious: pm != null,
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
