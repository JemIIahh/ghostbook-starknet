/**
 * Intrinsic dimensions of the brand artwork.
 *
 * Both marks are portrait, not square — `ghost.png` is 431×512 and `logo.png` is 539×641. Passing
 * equal width and height to `next/image`, as every call site used to, declares a 1:1 ratio that the
 * file doesn't have. Tailwind's preflight then applies `img { max-width: 100%; height: auto }`, which
 * recomputes the height and leaves the width alone, and Next reports the image as having "either
 * width or height modified, but not the other".
 *
 * Treat the number at each call site as the rendered *width* and derive the height from it. That is
 * what the browser was already doing, so nothing moves — the ratio is simply declared honestly.
 */

const GHOST_PNG = { width: 431, height: 512 } as const;
const LOGO_PNG = { width: 539, height: 641 } as const;

/** Height for `/ghost.png` at a given rendered width. */
export function ghostHeight(width: number): number {
  return Math.round((width * GHOST_PNG.height) / GHOST_PNG.width);
}

/** Height for `/logo.png` at a given rendered width. */
export function logoHeight(width: number): number {
  return Math.round((width * LOGO_PNG.height) / LOGO_PNG.width);
}
