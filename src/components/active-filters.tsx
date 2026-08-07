"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { colorHex } from "@/lib/games";
import { splitTerms } from "@/lib/search-terms";

export type ChipSpec =
  | { kind: "single"; key: string; label: string }
  /** A free-text query that the search splits on whitespace — one chip per
   *  term, each removable on its own. Shown as one chip, "Imperialdramon
   *  Dragon" reads as a phrase, which is not how it is matched. */
  | { kind: "terms"; key: string; label: string }
  | { kind: "list"; key: string; label: string; colorChips?: boolean }
  | { kind: "range"; minKey: string; maxKey: string; label: string }
  | { kind: "bool"; key: string; label: string }
  | { kind: "sort"; key: string; labelMap: Record<string, string> };

export function ActiveFilters({
  basePath,
  specs,
}: {
  basePath: string;
  specs: ChipSpec[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const chips: { key: string; node: React.ReactNode; onRemove: () => void }[] =
    [];

  function removeKeys(...keys: string[]) {
    const out = new URLSearchParams();
    for (const [k, v] of searchParams.entries()) {
      if (keys.includes(k)) continue;
      if (k === "page") continue;
      out.set(k, v);
    }
    const qs = out.toString();
    startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath));
  }

  function removeListValue(key: string, value: string) {
    const cur = (searchParams.get(key) ?? "")
      .split(",")
      .filter(Boolean)
      .filter((v) => v !== value);
    const out = new URLSearchParams();
    for (const [k, v] of searchParams.entries()) {
      if (k === key) continue;
      if (k === "page") continue;
      out.set(k, v);
    }
    if (cur.length) out.set(key, cur.join(","));
    const qs = out.toString();
    startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath));
  }

  for (const spec of specs) {
    if (spec.kind === "single") {
      const v = searchParams.get(spec.key);
      if (v) {
        chips.push({
          key: `${spec.key}=${v}`,
          node: (
            <>
              <span className="opacity-70">{spec.label}:</span> {v}
            </>
          ),
          onRemove: () => removeKeys(spec.key),
        });
      }
    } else if (spec.kind === "terms") {
      const terms = splitTerms(searchParams.get(spec.key));
      terms.forEach((term, i) => {
        chips.push({
          key: `${spec.key}#${i}=${term}`,
          node: (
            <>
              <span className="opacity-70">{spec.label}:</span> {term}
            </>
          ),
          // Drop just this term and put the rest back, so refining a search
          // doesn't mean retyping it.
          onRemove: () => {
            const rest = terms.filter((_, j) => j !== i);
            const out = new URLSearchParams();
            for (const [k, v] of searchParams.entries()) {
              if (k === spec.key || k === "page") continue;
              out.append(k, v);
            }
            if (rest.length) out.set(spec.key, rest.join(" "));
            const qs = out.toString();
            startTransition(() =>
              router.push(qs ? `${basePath}?${qs}` : basePath),
            );
          },
        });
      });
    } else if (spec.kind === "list") {
      const values = (searchParams.get(spec.key) ?? "")
        .split(",")
        .filter(Boolean);
      for (const value of values) {
        chips.push({
          key: `${spec.key}=${value}`,
          node: (
            <>
              {spec.colorChips ? (
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: colorHex(value) }}
                />
              ) : null}
              <span className="opacity-70">{spec.label}:</span> {value}
            </>
          ),
          onRemove: () => removeListValue(spec.key, value),
        });
      }
    } else if (spec.kind === "range") {
      const min = searchParams.get(spec.minKey);
      const max = searchParams.get(spec.maxKey);
      if (min || max) {
        chips.push({
          key: `${spec.minKey}-${spec.maxKey}`,
          node: (
            <>
              <span className="opacity-70">{spec.label}:</span>{" "}
              {min ?? "*"} – {max ?? "*"}
            </>
          ),
          onRemove: () => removeKeys(spec.minKey, spec.maxKey),
        });
      }
    } else if (spec.kind === "bool") {
      if (searchParams.get(spec.key) === "1") {
        chips.push({
          key: spec.key,
          node: <>{spec.label}</>,
          onRemove: () => removeKeys(spec.key),
        });
      }
    } else if (spec.kind === "sort") {
      const raw = searchParams.get(spec.key);
      if (raw) {
        const dir = raw.startsWith("-") ? "↓" : "↑";
        const base = raw.replace(/^-/, "");
        const label = spec.labelMap[base] ?? base;
        chips.push({
          key: `sort=${raw}`,
          node: (
            <>
              <span className="opacity-70">排序:</span> {label} {dir}
            </>
          ),
          onRemove: () => removeKeys(spec.key),
        });
      }
    }
  }

  if (chips.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 mb-3 ${pending ? "opacity-60" : ""}`}
    >
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onRemove}
          className="group inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md bg-[var(--color-accent)]/12 border border-[var(--color-accent)]/30 text-[var(--color-fg)] hover:bg-[var(--color-accent)]/20 cursor-pointer"
        >
          {c.node}
          <span className="ml-1 text-[var(--color-muted-fg)] group-hover:text-red-500">
            ×
          </span>
        </button>
      ))}
    </div>
  );
}
