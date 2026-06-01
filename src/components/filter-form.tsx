"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Input, Select } from "@/components/ui/input";
import { colorHex } from "@/lib/games";

export type FilterField =
  | {
      type: "search";
      key: string;
      label: string;
      placeholder?: string;
    }
  | {
      type: "multi";
      key: string;
      label: string;
      options: string[];
      colorChips?: boolean;
      /** Max number of values selectable at once (e.g. 2 for intersection color filter). */
      maxSelect?: number;
    }
  | {
      type: "multi-scroll";
      key: string;
      label: string;
      options: string[];
    }
  | {
      type: "select";
      key: string;
      label: string;
      options: string[];
      placeholder?: string;
    }
  | {
      type: "range";
      key: string;
      label: string;
      min?: number;
      max?: number;
      /**
       * If provided, render as two dropdowns instead of number inputs.
       * Pass `number[]` for raw values, or `{value,label}[]` for custom display.
       */
      options?: number[] | { value: number; label: string }[];
    }
  | {
      type: "boolean";
      key: string;
      label: string;
    }
  | {
      type: "group";
      key: string; // group identifier (for collapsed state key)
      label: string;
      fields: FilterField[]; // nested fields (no further groups inside)
      defaultOpen?: boolean;
    };

type Props = {
  basePath: string;
  fields: FilterField[];
  sortOptions: { value: string; label: string }[];
};

export function FilterForm({ basePath, fields, sortOptions }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function nav(patch: Record<string, string | string[] | undefined | null>) {
    const out = new URLSearchParams();
    for (const [k, v] of searchParams.entries()) {
      if (k === "page") continue;
      if (k in patch) continue;
      out.set(k, v);
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v)) {
        if (v.length) out.set(k, v.join(","));
      } else {
        out.set(k, String(v));
      }
    }
    const qs = out.toString();
    startTransition(() => {
      router.push(qs ? `${basePath}?${qs}` : basePath);
    });
  }

  function clearAll() {
    startTransition(() => router.push(basePath));
  }

  const hasAny = [...searchParams.entries()].some(([k]) => k !== "page");

  function renderField(f: FilterField): React.ReactNode {
    if (f.type === "search") {
      return (
        <SearchField
          key={f.key}
          field={f}
          value={searchParams.get(f.key) ?? ""}
          onCommit={(v) => nav({ [f.key]: v || undefined })}
        />
      );
    }
    if (f.type === "multi") {
      const selected = parseList(searchParams.get(f.key));
      return (
        <MultiField
          key={f.key}
          field={f}
          selected={selected}
          onToggle={(v) => {
            const has = selected.includes(v);
            let next: string[];
            if (has) {
              next = selected.filter((x) => x !== v);
            } else if (f.maxSelect != null) {
              // Append, then keep only the most-recent maxSelect (evict oldest).
              next = [...selected, v].slice(-f.maxSelect);
            } else {
              next = [...selected, v];
            }
            nav({ [f.key]: next.length ? next : undefined });
          }}
        />
      );
    }
    if (f.type === "multi-scroll") {
      const selected = parseList(searchParams.get(f.key));
      return (
        <MultiScrollField
          key={f.key}
          field={f}
          selected={selected}
          onToggle={(v) => {
            const next = selected.includes(v)
              ? selected.filter((x) => x !== v)
              : [...selected, v];
            nav({ [f.key]: next.length ? next : undefined });
          }}
        />
      );
    }
    if (f.type === "select") {
      return (
        <div key={f.key}>
          <FieldLabel>{f.label}</FieldLabel>
          <Select
            value={searchParams.get(f.key) ?? ""}
            onChange={(e) => nav({ [f.key]: e.target.value || undefined })}
            className="h-8 text-xs w-full"
            aria-label={f.label}
          >
            <option value="">{f.placeholder ?? "全部"}</option>
            {f.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        </div>
      );
    }
    if (f.type === "range") {
      return (
        <RangeField
          key={f.key}
          field={f}
          minValue={searchParams.get(`${f.key}_min`) ?? ""}
          maxValue={searchParams.get(`${f.key}_max`) ?? ""}
          onCommit={(min, max) =>
            nav({
              [`${f.key}_min`]: min || undefined,
              [`${f.key}_max`]: max || undefined,
            })
          }
        />
      );
    }
    if (f.type === "boolean") {
      const checked = searchParams.get(f.key) === "1";
      return (
        <label
          key={f.key}
          className="flex items-center gap-1.5 text-xs cursor-pointer select-none py-0.5"
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) =>
              nav({ [f.key]: e.target.checked ? "1" : undefined })
            }
            className="cursor-pointer"
          />
          {f.label}
        </label>
      );
    }
    // group
    const activeCount = countActiveInGroup(f, searchParams);
    return (
      <GroupField
        key={f.key}
        field={f}
        activeCount={activeCount}
        renderField={renderField}
      />
    );
  }

  return (
    <div className={`text-sm ${isPending ? "opacity-70" : ""}`}>
      {/* Top bar: sort + clear */}
      <div className="flex items-center gap-1.5 mb-3">
        {sortOptions.length ? (
          <Select
            value={searchParams.get("sort") ?? ""}
            onChange={(e) => nav({ sort: e.target.value || undefined })}
            className="h-8 text-xs flex-1"
            aria-label="排序"
          >
            <option value="">默认排序</option>
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : null}
        {hasAny ? (
          <button
            type="button"
            onClick={clearAll}
            className="px-2 h-8 text-xs rounded-md border border-[var(--color-border)] hover:bg-[var(--color-muted)] cursor-pointer text-[var(--color-muted-fg)]"
            title="清空全部筛选"
          >
            清空
          </button>
        ) : null}
      </div>

      <div className="space-y-2.5">{fields.map((f) => renderField(f))}</div>
    </div>
  );
}

function countActiveInGroup(
  f: Extract<FilterField, { type: "group" }>,
  sp: URLSearchParams,
): number {
  let n = 0;
  for (const inner of f.fields) {
    if (inner.type === "range") {
      if (sp.get(`${inner.key}_min`) || sp.get(`${inner.key}_max`)) n++;
    } else if (inner.type === "boolean") {
      if (sp.get(inner.key) === "1") n++;
    } else if ("key" in inner) {
      const v = sp.get(inner.key);
      if (v) {
        if (inner.type === "multi" || inner.type === "multi-scroll") {
          n += v.split(",").filter(Boolean).length;
        } else {
          n++;
        }
      }
    }
  }
  return n;
}

function GroupField({
  field,
  activeCount,
  renderField,
}: {
  field: Extract<FilterField, { type: "group" }>;
  activeCount: number;
  renderField: (f: FilterField) => React.ReactNode;
}) {
  const [open, setOpen] = useState(
    () => field.defaultOpen ?? activeCount > 0,
  );
  // Auto-open when filters become active. Compare-during-render pattern
  // (React 19) instead of useEffect, to avoid the cascading-render lint.
  const [lastActiveCount, setLastActiveCount] = useState(activeCount);
  if (lastActiveCount !== activeCount) {
    setLastActiveCount(activeCount);
    if (activeCount > 0) setOpen(true);
  }

  return (
    <div className="border-t border-[var(--color-border)] pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full text-[11px] uppercase tracking-wide text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] cursor-pointer"
      >
        <span className="font-medium">
          {field.label}
          {activeCount > 0 ? (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full bg-[var(--color-accent)] text-[var(--color-accent-fg)] text-[10px] font-bold">
              {activeCount}
            </span>
          ) : null}
        </span>
        <span className="text-xs">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="space-y-2.5 mt-2">
          {field.fields.map((inner) => renderField(inner))}
        </div>
      ) : null}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-wide text-[var(--color-muted-fg)] font-medium mb-1">
      {children}
    </div>
  );
}

function parseList(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function SearchField({
  field,
  value,
  onCommit,
}: {
  field: Extract<FilterField, { type: "search" }>;
  value: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset local when the committed value changes externally (URL navigation).
  const [lastValueProp, setLastValueProp] = useState(value);
  if (lastValueProp !== value) {
    setLastValueProp(value);
    setLocal(value);
  }

  function schedule(v: string) {
    setLocal(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onCommit(v.trim()), 300);
  }

  return (
    <div>
      <FieldLabel>{field.label}</FieldLabel>
      <div className="relative">
        <Input
          id={field.key}
          name={field.key}
          placeholder={field.placeholder}
          value={local}
          onChange={(e) => schedule(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (debounceRef.current) clearTimeout(debounceRef.current);
              onCommit(local.trim());
            }
          }}
          className="h-8 text-xs pr-7"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
        />
        {local ? (
          <button
            type="button"
            onClick={() => {
              setLocal("");
              if (debounceRef.current) clearTimeout(debounceRef.current);
              onCommit("");
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded hover:bg-[var(--color-muted)] text-[var(--color-muted-fg)] text-xs cursor-pointer flex items-center justify-center"
            aria-label="清空"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MultiField({
  field,
  selected,
  onToggle,
}: {
  field: Extract<FilterField, { type: "multi" }>;
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel>
        {field.label}
        {field.maxSelect != null ? (
          <span className="ml-1 normal-case text-[var(--color-muted-fg)]">
            (最多 {field.maxSelect}·交集)
          </span>
        ) : null}
      </FieldLabel>
      <div className="flex flex-wrap gap-1">
        {field.options.map((o) => {
          const active = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              className={`px-1.5 py-0.5 text-[11px] rounded border flex items-center gap-1 transition-colors leading-tight cursor-pointer ${
                active
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] border-[var(--color-accent)]"
                  : "bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:border-[var(--color-fg)]"
              }`}
            >
              {field.colorChips ? (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: colorHex(o) }}
                />
              ) : null}
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MultiScrollField({
  field,
  selected,
  onToggle,
}: {
  field: Extract<FilterField, { type: "multi-scroll" }>;
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = query
    ? field.options.filter((o) =>
        o.toLowerCase().includes(query.toLowerCase()),
      )
    : field.options;

  return (
    <div>
      <FieldLabel>
        {field.label}
        {selected.length > 0 ? (
          <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full bg-[var(--color-accent)] text-[var(--color-accent-fg)] text-[10px] font-bold normal-case">
            {selected.length}
          </span>
        ) : null}
      </FieldLabel>
      <Input
        placeholder={`在 ${field.options.length} 项中搜…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-7 text-xs mb-1"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
      />
      <div className="border border-[var(--color-border)] rounded-md bg-[var(--color-card)] max-h-36 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-2 text-[11px] text-[var(--color-muted-fg)] text-center">
            无匹配
          </div>
        ) : (
          filtered.map((o) => (
            <label
              key={o}
              className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] cursor-pointer hover:bg-[var(--color-muted)] select-none"
            >
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={() => onToggle(o)}
                className="cursor-pointer w-3 h-3"
              />
              <span className="truncate">{o}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

function RangeField({
  field,
  minValue,
  maxValue,
  onCommit,
}: {
  field: Extract<FilterField, { type: "range" }>;
  minValue: string;
  maxValue: string;
  onCommit: (min: string, max: string) => void;
}) {
  if (field.options && field.options.length > 0) {
    return (
      <RangeSelect
        field={field}
        minValue={minValue}
        maxValue={maxValue}
        onCommit={onCommit}
      />
    );
  }
  return (
    <RangeInputs
      field={field}
      minValue={minValue}
      maxValue={maxValue}
      onCommit={onCommit}
    />
  );
}

function RangeSelect({
  field,
  minValue,
  maxValue,
  onCommit,
}: {
  field: Extract<FilterField, { type: "range" }>;
  minValue: string;
  maxValue: string;
  onCommit: (min: string, max: string) => void;
}) {
  // Normalize options into {value, label}[]
  const opts: { value: number; label: string }[] = (field.options ?? []).map(
    (o) =>
      typeof o === "number"
        ? { value: o, label: String(o) }
        : { value: o.value, label: o.label },
  );
  const maxNum = maxValue ? Number(maxValue) : undefined;
  const minNum = minValue ? Number(minValue) : undefined;
  const minOpts = opts.filter((o) => maxNum === undefined || o.value <= maxNum);
  const maxOpts = opts.filter((o) => minNum === undefined || o.value >= minNum);

  return (
    <div className="flex items-center gap-1.5">
      <FieldLabel>{field.label}</FieldLabel>
      <div className="flex items-center gap-1 flex-1">
        <Select
          value={minValue}
          onChange={(e) => onCommit(e.target.value, maxValue)}
          className="h-7 text-xs px-1.5 flex-1 min-w-0"
          aria-label={`${field.label} 最小值`}
        >
          <option value="">—</option>
          {minOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <span className="text-[var(--color-muted-fg)] text-[10px]">–</span>
        <Select
          value={maxValue}
          onChange={(e) => onCommit(minValue, e.target.value)}
          className="h-7 text-xs px-1.5 flex-1 min-w-0"
          aria-label={`${field.label} 最大值`}
        >
          <option value="">—</option>
          {maxOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

function RangeInputs({
  field,
  minValue,
  maxValue,
  onCommit,
}: {
  field: Extract<FilterField, { type: "range" }>;
  minValue: string;
  maxValue: string;
  onCommit: (min: string, max: string) => void;
}) {
  const [localMin, setLocalMin] = useState(minValue);
  const [localMax, setLocalMax] = useState(maxValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset locals when the committed values change externally.
  const [lastMinProp, setLastMinProp] = useState(minValue);
  const [lastMaxProp, setLastMaxProp] = useState(maxValue);
  if (lastMinProp !== minValue) {
    setLastMinProp(minValue);
    setLocalMin(minValue);
  }
  if (lastMaxProp !== maxValue) {
    setLastMaxProp(maxValue);
    setLocalMax(maxValue);
  }

  function schedule(next: { min?: string; max?: string }) {
    const nMin = next.min ?? localMin;
    const nMax = next.max ?? localMax;
    if (next.min !== undefined) setLocalMin(next.min);
    if (next.max !== undefined) setLocalMax(next.max);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onCommit(nMin, nMax), 350);
  }

  return (
    <div className="flex items-center gap-1.5">
      <FieldLabel>{field.label}</FieldLabel>
      <div className="flex items-center gap-1 flex-1">
        <Input
          type="number"
          inputMode="numeric"
          placeholder="—"
          min={field.min}
          max={field.max}
          value={localMin}
          onChange={(e) => schedule({ min: e.target.value })}
          className="h-7 text-xs px-1.5 flex-1 min-w-0 text-center"
        />
        <span className="text-[var(--color-muted-fg)] text-[10px]">–</span>
        <Input
          type="number"
          inputMode="numeric"
          placeholder="—"
          min={field.min}
          max={field.max}
          value={localMax}
          onChange={(e) => schedule({ max: e.target.value })}
          className="h-7 text-xs px-1.5 flex-1 min-w-0 text-center"
        />
      </div>
    </div>
  );
}
