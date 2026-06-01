"use client";

import { useEffect, useState } from "react";

export type Variant = {
  variant: string; // "" for base, "_P1" etc for parallels (Digimon)
  image_url: string;
  /** Optional display label (e.g. UA rarity "C★"). Falls back to variant. */
  label?: string;
};

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
}: {
  name: string;
  variants: Variant[];
  /** variant key (the `variant` field, e.g. a UA code) to show first */
  defaultVariant?: string;
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
        className="card-thumb max-w-[300px] mx-auto md:mx-0 border border-[var(--color-border)] cursor-zoom-in block hover:border-[var(--color-fg)] transition-colors"
      >
        <img src={cur.image_url} alt={name} referrerPolicy="no-referrer" />
      </button>

      {variants.length > 1 ? (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)] mb-1">
            异画 ({variants.length} 个版本)
          </div>
          <div className="flex flex-wrap gap-1.5 max-w-[300px] mx-auto md:mx-0">
            {variants.map((v, i) => {
              const isActive = i === active;
              const chip =
                v.label ?? (v.variant ? v.variant.replace("_", "") : "原");
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
                    src={v.image_url}
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
        src={cur.image_url}
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
