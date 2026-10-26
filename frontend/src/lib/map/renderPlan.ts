import { fitTransform, MAX_ZOOM, type Transform, type Viewport } from './camera';
import { detailFor, type Detail } from './detail';
import { fitInSlot, SLOT_H, SLOT_W, type FrameLayout } from './frameLayout';

/** One frame to draw: whose it is, how wide its slots are on screen, the level of detail
 * that gives them, and which of its slots open into nested frames. */
export interface PlanNode {
  personId: string;
  /** This frame's units per root-frame unit: the product of the nested scales above it. */
  scale: number;
  slotPx: number;
  detail: Detail;
  open: Map<string, PlanNode>;
}

/** What to draw with the root camera at `t`. A slot opens into its person's frame once it's
 * big enough (design doc Q5) and at least partly on screen, so deep zoom only lays out the
 * frames you can see. */
export function planRender(
  rootId: string,
  t: Transform,
  viewport: Viewport,
  layoutOf: (personId: string) => FrameLayout | null,
): PlanNode {
  // `scale`, `x` and `y` place this frame's units in the root frame's.
  const plan = (personId: string, layout: FrameLayout, scale: number, x: number, y: number): PlanNode => {
    const k = t.k * scale;
    const slotPx = SLOT_W * k;
    const detail = detailFor(slotPx);
    const open = new Map<string, PlanNode>();
    if (detail === 'frame') {
      for (const slot of layout.slots) {
        // A frame's own centre is the person whose frame it is; opening it would recurse.
        if (slot.id === personId) continue;
        const inner = layoutOf(slot.id);
        if (!inner) continue;
        const left = (slot.x - SLOT_W / 2) * k + x * t.k + t.x;
        const top = (slot.y - 4) * k + y * t.k + t.y;
        const onScreen =
          left < viewport.width && left + slotPx > 0 && top < viewport.height && top + SLOT_H * k > 0;
        if (!onScreen) continue;
        const fit = fitInSlot(slot, inner.bounds);
        open.set(slot.id, plan(slot.id, inner, scale * fit.scale, x + fit.x * scale, y + fit.y * scale));
      }
    }
    return { personId, scale, slotPx, detail, open };
  };

  const rootLayout = layoutOf(rootId);
  if (!rootLayout) throw new Error('The root always has a frame');
  return plan(rootId, rootLayout, 1, 0, 0);
}

/** What a plan draws, as a string: the canvas re-renders only when this changes, which is
 * when zooming crosses a level or panning brings a frame on or off screen. */
export function planKey(node: PlanNode): string {
  const open = [...node.open.values()].map(planKey).join(',');
  return `${node.personId}:${node.detail}[${open}]`;
}

/** How far in the camera may zoom (in root units): 16x the fit of the deepest frame open on
 * screen. Taking it from any open frame, not only the one under the middle of the screen,
 * means zooming toward a frame near the edge never hits a wall before it opens. */
export function zoomCeiling(
  root: PlanNode,
  layoutOf: (personId: string) => FrameLayout | null,
  viewport: Viewport,
): number {
  let ceiling = 0;
  const visit = (node: PlanNode) => {
    const fit = fitTransform(viewport, layoutOf(node.personId)!.bounds).k / node.scale;
    ceiling = Math.max(ceiling, fit * MAX_ZOOM);
    node.open.forEach(visit);
  };
  visit(root);
  return ceiling;
}
