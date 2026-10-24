/** The map camera as d3-zoom models it: a point in the frame lands on screen at
 * `world * k + (x, y)`. Everything here is in CSS pixels on screen and SVG units in the frame. */
export interface Transform {
  x: number;
  y: number;
  k: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** A frame's extent in its own units. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Space left around a fitted frame, in screen pixels. */
export const FIT_PADDING = 24;

/** The transform that shows the whole frame, centred, as large as fits inside the padding. */
export function fitTransform(viewport: Viewport, bounds: Bounds): Transform {
  const k = Math.min(
    (viewport.width - 2 * FIT_PADDING) / bounds.width,
    (viewport.height - 2 * FIT_PADDING) / bounds.height,
  );
  return {
    k,
    x: viewport.width / 2 - (bounds.x + bounds.width / 2) * k,
    y: viewport.height / 2 - (bounds.y + bounds.height / 2) * k,
  };
}

/** Screen pixels of the frame that always stay in view, so it can't be lost off screen. */
export const MIN_VISIBLE = 64;

/** Zoom limits, as multiples of the scale that fits the frame (FG-4 extends these). */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 16;

/** The scales the camera may use for this frame in this viewport. */
export function zoomRange(viewport: Viewport, bounds: Bounds): [number, number] {
  const fit = fitTransform(viewport, bounds).k;
  return [fit * MIN_ZOOM, fit * MAX_ZOOM];
}

/** Keeps the camera usable: zoom stays in range (around the middle of the screen) and the
 * frame stays partly on screen. `range` defaults to the frame's own; deep zoom passes a
 * wider one (see focusZoomRange). */
export function clampTransform(
  t: Transform,
  viewport: Viewport,
  bounds: Bounds,
  range: [number, number] = zoomRange(viewport, bounds),
): Transform {
  const [minK, maxK] = range;
  const k = clamp(t.k, minK, maxK);
  if (k !== t.k) {
    const scale = k / t.k;
    const [cx, cy] = [viewport.width / 2, viewport.height / 2];
    t = { k, x: cx - (cx - t.x) * scale, y: cy - (cy - t.y) * scale };
  }
  // The frame's left edge may go no further right than (width - MIN_VISIBLE), and its right
  // edge no further left than MIN_VISIBLE. Likewise vertically.
  const x = clamp(
    t.x,
    MIN_VISIBLE - (bounds.x + bounds.width) * k,
    viewport.width - MIN_VISIBLE - bounds.x * k,
  );
  const y = clamp(
    t.y,
    MIN_VISIBLE - (bounds.y + bounds.height) * k,
    viewport.height - MIN_VISIBLE - bounds.y * k,
  );
  return { x, y, k };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
