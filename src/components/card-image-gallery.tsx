"use client";

import { cardImageSrc } from "@/lib/card-image";
import { useEffect, useState } from "react";

export type Variant = {
  variant: string; // "" for base, "_P1" etc for parallels (Digimon)
  image_url: string;
  /** Optional display label (e.g. UA rarity "C★"). Falls back to variant. */
  label?: string;
  /** Language of the artwork itself, when known ("en" | "zh" | "ja"). */
  lang?: string;
};

const LANG_TAG: Record<string, string> = { en: "EN", zh: "中", ja: "日" };

/**
 * Big card image with a thumbnail strip below for switching between variants.
 * Clicking the main image opens a fullscreen lightbox; in the lightbox, left
 * and right arrow keys cycle through alt-art variants, ESC or click-outside
 * closes it.
 */
export function CardImageGallery({
  name,
  variants,
  defaultVariant,
  cardLang,
}: {
  name: string;
  variants: Variant[];
  /** variant key (the `variant` field, e.g. a UA code) to show first */
  defaultVariant?: string;
  /** Reader's card language — used to flag art that isn't in it. */
  cardLang?: string;
}) {
  const initial = defaultVariant
    ? Math.max(
        0,
        variants.findIndex((v) => v.variant === defaultVariant),
      )
    : 0;
  const [active, setActive] = useState(initial);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!variants.length) {
    return (
      <div className="card-thumb max-w-[300px] mx-auto md:mx-0 border border-[var(--color-border)] flex items-center justify-center text-[var(--color-muted-fg)] text-xs">
        no image
      </div>
    );
  }
  const cur = variants[Math.min(active, variants.length - 1)];

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        aria-label={`查看大图：${name}`}
        /* w-full (not just `block`): a <button> sizes to fit-content by
           default, and on iOS Safari `display:block` doesn't override that.
           Without an explicit width the box collapses to ~0 until the image
           loads, so aspect-ratio renders it tiny and it "grows" on relayout.
           Filling the container (capped at 300px) keeps the box stable. */
        className="card-thumb w-full max-w-[300px] mx-auto md:mx-0 border border-[var(--color-border)] cursor-zoom-in block hover:border-[var(--color-fg)] transition-colors"
      >
        <img src={cardImageSrc(cur.image_url)} alt={name} referrerPolicy="no-referrer" />
      </button>

      {variants.length > 1 ? (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)] mb-1">
            异画 ({variants.length} 个版本)
            {/* The CN/JP cardlists lag behind on alt arts, so we fall back to
                the English scans. Say so rather than silently mixing them. */}
            {cardLang && variants.some((v) => v.lang && v.lang !== cardLang) ? (
              <span className="ml-1 normal-case opacity-80">
                · 部分为{LANG_TAG[
                  variants.find((v) => v.lang && v.lang !== cardLang)!.lang!
                ] ?? "其他语言"}卡面
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5 max-w-[300px] mx-auto md:mx-0">
            {variants.map((v, i) => {
              const isActive = i === active;
              const foreign = !!(cardLang && v.lang && v.lang !== cardLang);
              // `lang-zh`/`lang-ja` is the localized BASE scan, not a parallel
              // — show it as 原, same as an empty variant key.
              const isBase = !v.variant || v.variant.startsWith("lang-");
              const chip =
                v.label ??
                (isBase ? "原" : v.variant.replace("_", "")) +
                  (foreign ? ` ${LANG_TAG[v.lang!] ?? v.lang}` : "");
              return (
                <button
                  key={`${v.image_url}-${i}`}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`w-12 aspect-[5/7] rounded overflow-hidden border-2 transition-all cursor-pointer relative ${
                    isActive
                      ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/40"
                      : "border-[var(--color-border)] hover:border-[var(--color-fg)] opacity-70 hover:opacity-100"
                  }`}
                  title={v.label ?? (v.variant ? `Parallel ${v.variant}` : "原版")}
                >
                  <img
                    src={cardImageSrc(v.image_url)}
                    alt={chip}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0 left-0 right-0 text-[8px] font-bold text-white bg-black/65 text-center leading-tight py-0.5">
                    {chip}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {lightboxOpen ? (
        <Lightbox
          name={name}
          variants={variants}
          activeIndex={active}
          onChange={setActive}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Lightbox — fullscreen overlay shown when the user clicks the main image.
// ────────────────────────────────────────────────────────────────────────

function Lightbox({
  name,
  variants,
  activeIndex,
  onChange,
  onClose,
}: {
  name: string;
  variants: Variant[];
  activeIndex: number;
  /** Switch the active variant from inside the lightbox (←/→ keys + arrows). */
  onChange: (next: number) => void;
  onClose: () => void;
}) {
  const cur = variants[activeIndex];
  const multi = variants.length > 1;

  // Keyboard: ESC closes, ←/→ cycles variants. Also lock body scroll so
  // wheel/touch doesn't move the page underneath the overlay.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (!multi) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onChange((activeIndex - 1 + variants.length) % variants.length);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onChange((activeIndex + 1) % variants.length);
      }
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [activeIndex, multi, variants.length, onChange, onClose]);

  const chip =
    cur.label ?? (cur.variant ? cur.variant.replace("_", "") : "原版");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`大图：${name}`}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
    >
      {/* Close button — top-right corner, always visible. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="关闭"
        className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl leading-none flex items-center justify-center cursor-pointer transition-colors"
      >
        ×
      </button>

      {/* Variant nav — arrows on either side, hidden if single variant. */}
      {multi ? (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange((activeIndex - 1 + variants.length) % variants.length);
            }}
            aria-label="上一个异画版本"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl leading-none flex items-center justify-center cursor-pointer transition-colors"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange((activeIndex + 1) % variants.length);
            }}
            aria-label="下一个异画版本"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl leading-none flex items-center justify-center cursor-pointer transition-colors"
          >
            ›
          </button>
        </>
      ) : null}

      {/* Image — stopPropagation so clicking the image itself doesn't close. */}
      <img
        src={cardImageSrc(cur.image_url)}
        alt={name}
        referrerPolicy="no-referrer"
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full object-contain shadow-2xl"
      />

      {/* Caption / variant indicator at the bottom. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-black/70 text-white text-xs tabular-nums flex items-center gap-2"
      >
        <span className="font-medium">{name}</span>
        {multi ? (
          <>
            <span className="opacity-50">·</span>
            <span>{chip}</span>
            <span className="opacity-50">·</span>
            <span className="opacity-70">
              {activeIndex + 1} / {variants.length}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
