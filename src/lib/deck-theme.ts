/**
 * Repaint the site in a deck's own colour while you're inside it.
 *
 * The deck already carries an accent (the tile's dot, the banner) — this hands
 * that colour to `--color-accent` for the whole page, so the tabs, buttons and
 * focus rings of the deck you're reading match the deck instead of the app.
 *
 * A deck's colour is picked with a colour input and can be anything, including
 * black or a pastel that vanishes on this background. The site's accent has a
 * job (things you can act on), so the deck's hue is kept but its lightness and
 * saturation are pulled into a band that stays legible on the dark canvas:
 * a #111827 deck becomes a readable navy rather than an invisible button.
 *
 * Returns CSS text, or null for anything that isn't a plain 6-digit hex —
 * these values reach a <style> tag, and they come out of the database.
 */
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Accent lightness band, in HSL. Below this it disappears on the canvas;
 *  above it, white text on the accent stops working. */
const L_MIN = 0.55;
const L_MAX = 0.78;
/** Anything with less colour than this reads as grey rather than as an accent,
 *  except for decks that ARE grey — those keep their neutrality. */
const S_MIN = 0.35;
const S_GREY = 0.08;

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

/** The colour as the site will actually paint it — clamped, as `hsl(…)`. */
export function accentFrom(hex: string): string | null {
  if (!HEX.test(hex)) return null;
  const { h, s, l } = hexToHsl(hex);
  const grey = s < S_GREY;
  const sOut = grey ? s : Math.max(s, S_MIN);
  const lOut = Math.min(Math.max(l, L_MIN), L_MAX);
  const r = (n: number) => Math.round(n * 1000) / 10;
  return `hsl(${Math.round(h)} ${r(sOut)}% ${r(lOut)}%)`;
}

/**
 * The `<style>` body for a deck, or null if there's nothing safe to say.
 *
 * `--color-accent-fg` is fixed rather than computed: the clamp above keeps the
 * accent inside a band where the app's existing near-black reads on it.
 */
export function deckThemeCss(
  accent: string,
  accent2: string | null,
): string | null {
  const a = accentFrom(accent);
  if (!a) return null;
  const b = accent2 ? accentFrom(accent2) : null;
  return `:root{--color-accent:${a};--color-accent-fg:oklch(0.16 0.05 250);${
    b ? `--color-accent2:${b};--color-accent2-fg:oklch(0.16 0.04 50);` : ""
  }}`;
}
