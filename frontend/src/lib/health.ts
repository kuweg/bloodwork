/**
 * "Health snapshot" — the share of reference-ranged tests that are in range,
 * per report, tracked over time. Frontend-only, derived from the same data.
 */
import type { Report } from "../types/bloodwork";
import { classify } from "./metrics";

export interface HealthPoint {
  date: string;
  inRange: number;
  total: number; // tests that have a reference range
  pct: number;
}

function reportDate(r: Report): string {
  return r.collected_at ?? r.uploaded_at.slice(0, 10);
}

export function healthSnapshots(reports: Report[]): HealthPoint[] {
  const points = reports
    .map((r) => {
      let inRange = 0;
      let total = 0;
      for (const m of r.measurements) {
        // Only tests with a reference range are meaningful for "in range".
        if (m.ref_low == null && m.ref_high == null) continue;
        total += 1;
        if (classify(m) === "good") inRange += 1;
      }
      return { date: reportDate(r), inRange, total, pct: total ? Math.round((inRange / total) * 100) : 0 };
    })
    .filter((p) => p.total > 0);

  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}
