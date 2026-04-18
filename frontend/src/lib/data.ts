import type { Measurement, Report } from "../types/bloodwork";
import { classify, formatRange, type Status } from "./metrics";

export interface BloodTest {
  id: string;
  canonical: string;
  name: string;
  value: number;
  unit: string;
  status: Status;
  normalRange: string;
  description: string;
}

export interface TestHistory {
  canonical: string;
  testName: string;
  unit: string;
  normalRange: string;
  dates: Record<string, { value: number; unit: string; status: Status }>;
}

function displayName(m: Measurement): string {
  return m.display_name?.trim() || m.raw_name?.trim() || m.canonical_name;
}

/** Measurements from the single most-recent report. */
export function latestTests(reports: Report[]): BloodTest[] {
  let latestReport: Report | null = null;
  let latestTs = -Infinity;
  for (const r of reports) {
    const ts = Date.parse(r.collected_at ?? r.uploaded_at);
    if (Number.isFinite(ts) && ts > latestTs) {
      latestTs = ts;
      latestReport = r;
    }
  }
  if (!latestReport) return [];

  return latestReport.measurements.map((m) => ({
    id: String(m.id),
    canonical: m.canonical_name,
    name: displayName(m),
    value: m.value,
    unit: m.unit ?? "",
    status: classify(m),
    normalRange: formatRange(m),
    description: "",
  }));
}

export function latestDate(reports: Report[]): string | null {
  let best: string | null = null;
  let bestTs = -Infinity;
  for (const r of reports) {
    const iso = r.collected_at ?? r.uploaded_at.slice(0, 10);
    const ts = Date.parse(iso);
    if (Number.isFinite(ts) && ts > bestTs) {
      bestTs = ts;
      best = iso;
    }
  }
  return best;
}

/** Pivot all measurements into one row per canonical test, keyed by date. */
export function historyByTest(reports: Report[]): TestHistory[] {
  const buckets = new Map<string, TestHistory>();

  for (const report of reports) {
    const fallbackDate = report.collected_at ?? report.uploaded_at.slice(0, 10);
    for (const m of report.measurements) {
      const date = m.taken_at ?? fallbackDate;
      if (!date) continue;

      const entry = buckets.get(m.canonical_name) ?? {
        canonical: m.canonical_name,
        testName: displayName(m),
        unit: m.unit ?? "",
        normalRange: formatRange(m),
        dates: {},
      };
      entry.dates[date] = {
        value: m.value,
        unit: m.unit ?? entry.unit,
        status: classify(m),
      };
      // Keep the prettiest display name and a non-empty unit / range
      if (!entry.unit && m.unit) entry.unit = m.unit;
      if (entry.normalRange === "—") {
        const r = formatRange(m);
        if (r !== "—") entry.normalRange = r;
      }
      buckets.set(m.canonical_name, entry);
    }
  }

  return [...buckets.values()];
}
