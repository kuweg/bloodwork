function parseIsoLikeDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(trimmed);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function formatIsoLikeDate(
  value: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const parsed = parseIsoLikeDate(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString("en-US", options);
}

export function formatIsoLikeDateTime(
  value: string,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
): string {
  const parsed = parseIsoLikeDate(value);
  if (!parsed) return value;
  return parsed.toLocaleString("en-US", options);
}
