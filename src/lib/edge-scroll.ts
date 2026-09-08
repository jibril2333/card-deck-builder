/**
 * 拖动到画面边缘时的自动滚动。
 *
 * A deck list is longer than a window: the tile you want to move and the place
 * you want to move it to are rarely on screen together, and a drag that has to
 * be dropped, scrolled, and picked up again is three gestures for one
 * intention. Holding near an edge scrolls instead.
 *
 * Pure so the shape of the ramp can be argued with directly. The alternative —
 * one fixed speed — is either too slow to cross a long list or too fast to
 * stop on the row you want; speed rising with how far into the band you are
 * lets the same gesture do both.
 */

/** How far from an edge the band starts, on a window with room for it. */
export const EDGE_BAND = 96;
/** Pixels per frame at the very edge, and just inside the band. */
export const MAX_SPEED = 22;
export const MIN_SPEED = 3;

/**
 * Pixels to scroll this frame: negative up, positive down, 0 in the middle.
 *
 * `y` is the pointer's viewport coordinate and may sit outside the window —
 * a drag dragged past the edge keeps going at full speed rather than stopping.
 */
export function edgeScrollSpeed(y: number, viewportHeight: number): number {
  // On a short window a 96px band top and bottom would leave no neutral middle,
  // and every drag would scroll. A third of the height each keeps one.
  const band = Math.min(EDGE_BAND, viewportHeight / 3);
  if (band <= 0) return 0;

  if (y < band) {
    return -speedAt((band - y) / band);
  }
  if (y > viewportHeight - band) {
    return speedAt((y - (viewportHeight - band)) / band);
  }
  return 0;
}

/** `depth` 0 at the inner edge of the band, 1 at the window edge or beyond. */
function speedAt(depth: number): number {
  const d = Math.min(1, Math.max(0, depth));
  return Math.round(MIN_SPEED + (MAX_SPEED - MIN_SPEED) * d);
}
