import { fitTransform, MAX_ZOOM, MIN_ZOOM, type Transform, type Viewport } from './camera';
import { DETAIL_THRESHOLDS, detailFor } from './detail';
import { fitInSlot, SLOT_W, type FrameLayout } from './frameLayout';
import type { Ownership } from './ownership';

type LayoutOf = (personId: string) => FrameLayout | null;

/** Maps a point in a frame's units into the root frame's: `root = point * scale + (x, y)`. */
export interface FrameToRoot {
  x: number;
  y: number;
  scale: number;
}

/** How the last frame on a path sits in the root frame: each frame is fitted into its slot
 * in the frame before it, and those fits compose. */
export function frameToRoot(path: string[], layoutOf: LayoutOf): FrameToRoot {
  let m: FrameToRoot = { x: 0, y: 0, scale: 1 };
  for (let i = 1; i < path.length; i++) {
    const slot = layoutOf(path[i - 1])!.slots.find((s) => s.id === path[i])!;
    m = nestIn(m, fitInSlot(slot, layoutOf(path[i])!.bounds));
  }
  return m;
}

/** A frame's placement in the root, given its parent's placement and its fit in its slot. */
function nestIn(parent: FrameToRoot, fit: FrameToRoot): FrameToRoot {
  return {
    scale: parent.scale * fit.scale,
    x: parent.x + fit.x * parent.scale,
    y: parent.y + fit.y * parent.scale,
  };
}

/** The frames from the root out to this person's frame. Someone with no frame of their own
 * ends the path at the frame they're drawn in; someone not on the map gives just the root. */
export function framePath(ownership: Ownership, layoutOf: LayoutOf, personId: string): string[] {
  if (!ownership.has(personId)) {
    const root = [...ownership].find(([, o]) => o.owner === null);
    return root ? [root[0]] : [];
  }
  const path: string[] = [];
  for (let id: string | null = personId; id !== null; id = ownership.get(id)?.owner ?? null) {
    path.unshift(id);
  }
  return layoutOf(personId) ? path : path.slice(0, -1);
}

/** The transform to draw a nested frame with, given the root camera. Composed here in
 * double precision, so the numbers handed to the browser stay near 1 at any depth (the
 * browser composes nested SVG transforms in single precision, which blurs deep frames). */
export function anchoredTransform(rootT: Transform, m: FrameToRoot): Transform {
  return { k: rootT.k * m.scale, x: rootT.x + m.x * rootT.k, y: rootT.y + m.y * rootT.k };
}

/** The root camera that shows the last frame on a path: fitted on screen, and zoomed in a
 * little further if fitting alone would leave its slot too small to open into the frame
 * (a wide frame on a short screen, such as a phone held sideways). */
export function cameraForFocus(path: string[], layoutOf: LayoutOf, viewport: Viewport): Transform {
  const m = frameToRoot(path, layoutOf);
  const fit = fitTransform(viewport, layoutOf(path[path.length - 1])!.bounds);
  let k = fit.k / m.scale;
  let { x, y } = { x: fit.x - m.x * k, y: fit.y - m.y * k };
  if (path.length > 1) {
    const slotPx = SLOT_W * k * frameToRoot(path.slice(0, -1), layoutOf).scale;
    // Aim a little past the threshold: landing exactly on it can round to just under.
    const openPx = DETAIL_THRESHOLDS[DETAIL_THRESHOLDS.length - 1] * 1.01;
    if (slotPx < openPx) {
      // Zoom about the middle of the screen, where the fitted frame is centred.
      const factor = openPx / slotPx;
      const [cx, cy] = [viewport.width / 2, viewport.height / 2];
      k *= factor;
      x = cx - (cx - x) * factor;
      y = cy - (cy - y) * factor;
    }
  }
  return { k, x, y };
}

/** Share of the viewport, along the frame's tighter axis, a frame must cover to be the focus. */
export const FOCUS_COVER = 0.5;

/** The frame you're looking at: the deepest open frame that contains the middle of the
 * screen and covers at least half of it. Returned as its path from the root. */
export function focusedFrame(
  rootT: Transform,
  viewport: Viewport,
  rootId: string,
  layoutOf: LayoutOf,
): string[] {
  const [cx, cy] = [viewport.width / 2, viewport.height / 2];
  const path = [rootId];
  let m: FrameToRoot = { x: 0, y: 0, scale: 1 };
  for (;;) {
    const id = path[path.length - 1];
    const t = anchoredTransform(rootT, m);
    // Every slot in a frame is the same size, so whether they're open is one check.
    if (detailFor(SLOT_W * t.k) !== 'frame') return path;
    let next: { id: string; m: FrameToRoot } | null = null;
    for (const slot of layoutOf(id)!.slots) {
      const inner = slot.id === id ? null : layoutOf(slot.id);
      if (!inner) continue;
      const childM = nestIn(m, fitInSlot(slot, inner.bounds));
      const c = anchoredTransform(rootT, childM);
      const b = inner.bounds;
      const [left, top] = [b.x * c.k + c.x, b.y * c.k + c.y];
      const [w, h] = [b.width * c.k, b.height * c.k];
      const containsMiddle = cx >= left && cx <= left + w && cy >= top && cy <= top + h;
      const covers = Math.max(w / viewport.width, h / viewport.height) >= FOCUS_COVER;
      if (containsMiddle && covers) {
        next = { id: slot.id, m: childM };
        break;
      }
    }
    if (!next) return path;
    path.push(next.id);
    m = next.m;
  }
}

/** The frames to open for a `?focus=` value. A shared link may name anyone, or someone who
 * has since been removed, so this never fails: it falls back to the nearest frame. */
export function focusFromParam(
  param: string | null,
  ownership: Ownership,
  layoutOf: LayoutOf,
): string[] {
  const rootId = [...ownership].find(([, o]) => o.owner === null)![0];
  return framePath(ownership, layoutOf, param ?? rootId);
}

/** The `?focus=` value for a focused frame: none at the root, so plain links stay plain. */
export function focusParam(path: string[]): string | null {
  return path.length > 1 ? path[path.length - 1] : null;
}

/** The camera's zoom limits in root units while this frame is the focus: out to half the
 * root's fit, and in to 16x the focused frame's own fit, so the limit grows as you go deeper. */
export function focusZoomRange(path: string[], layoutOf: LayoutOf, viewport: Viewport): [number, number] {
  const rootId = path[0];
  const min = fitTransform(viewport, layoutOf(rootId)!.bounds).k * MIN_ZOOM;
  const focusFit = fitTransform(viewport, layoutOf(path[path.length - 1])!.bounds).k;
  return [min, (focusFit / frameToRoot(path, layoutOf).scale) * MAX_ZOOM];
}
