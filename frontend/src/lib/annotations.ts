import type { Annotation } from "../types/bloodwork";

export const ANNOTATION_COLOR = "#8b5cf6";

/** Annotations whose ISO date falls within [minIso, maxIso], oldest first. */
export function annotationsInRange(
  annotations: Annotation[],
  minIso?: string,
  maxIso?: string,
): Annotation[] {
  if (!minIso || !maxIso) return [];
  return annotations
    .filter((a) => a.date >= minIso && a.date <= maxIso)
    .sort((a, b) => a.date.localeCompare(b.date));
}
