import type { Measurement } from "../types/bloodwork";

export type Status = "good" | "mid" | "bad";

export function formatRange(
  m: Pick<Measurement, "ref_low" | "ref_high">,
): string {
  if (m.ref_low != null && m.ref_high != null) return `${m.ref_low}-${m.ref_high}`;
  if (m.ref_high != null) return `<${m.ref_high}`;
  if (m.ref_low != null) return `>${m.ref_low}`;
  return "—";
}

/**
 * Heuristic status from value vs reference range.
 * In range → good. Within 10% of a bound → mid. Beyond → bad.
 * Note: the Dashboard can override "mid" using the LLM attention analysis.
 */
export function classify(
  m: Pick<Measurement, "value" | "ref_low" | "ref_high">,
): Status {
  const { value, ref_low, ref_high } = m;
  if (ref_low == null && ref_high == null) return "good";

  const margin = (bound: number) => Math.max(Math.abs(bound) * 0.1, 0.01);

  if (ref_high != null && value > ref_high) {
    return value > ref_high + margin(ref_high) ? "bad" : "mid";
  }
  if (ref_low != null && value < ref_low) {
    return value < ref_low - margin(ref_low) ? "bad" : "mid";
  }
  return "good";
}
