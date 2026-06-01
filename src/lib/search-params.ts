/**
 * URL search params utilities for the card search filters.
 *
 * Conventions:
 * - Multi-select fields: comma-separated, e.g. `?color=Red,Blue`
 * - Numeric range fields: `?level_min=3&level_max=5`
 * - Single text: `?q=...`
 * - Sort: `?sort=name` (asc) or `?sort=-name` (desc)
 */

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export function pickStr(
  sp: SearchParamsRecord,
  key: string,
): string | undefined {
  const v = sp[key];
  if (Array.isArray(v)) return v[0] || undefined;
  return v && v.length ? v : undefined;
}

export function pickList(sp: SearchParamsRecord, key: string): string[] {
  const v = sp[key];
  if (!v) return [];
  const raw = Array.isArray(v) ? v.join(",") : v;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function pickNum(
  sp: SearchParamsRecord,
  key: string,
): number | undefined {
  const s = pickStr(sp, key);
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function pickSort(sp: SearchParamsRecord): {
  field: string | undefined;
  dir: "asc" | "desc";
} {
  const s = pickStr(sp, "sort");
  if (!s) return { field: undefined, dir: "asc" };
  if (s.startsWith("-")) return { field: s.slice(1), dir: "desc" };
  return { field: s, dir: "asc" };
}

/** Build URL params skipping empty values. */
export function buildQuery(
  current: SearchParamsRecord,
  patch: Record<string, string | string[] | undefined | null>,
): string {
  const out = new URLSearchParams();
  // Carry over existing keys not present in patch
  for (const [k, v] of Object.entries(current)) {
    if (k in patch) continue;
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length) out.set(k, v.join(","));
    } else if (v.length) {
      out.set(k, v);
    }
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length) out.set(k, v.join(","));
    } else {
      out.set(k, String(v));
    }
  }
  return out.toString();
}

/** Toggle a value in a comma-list field. */
export function toggleListValue(
  current: SearchParamsRecord,
  key: string,
  value: string,
): string {
  const existing = pickList(current, key);
  const next = existing.includes(value)
    ? existing.filter((v) => v !== value)
    : [...existing, value];
  return buildQuery(current, {
    [key]: next.length ? next : undefined,
    page: undefined,
  });
}
