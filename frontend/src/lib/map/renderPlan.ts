import { DETAIL_THRESHOLDS, detailFor, type Detail } from './detail';
import { fitInSlot, SLOT_W, type FrameLayout } from './frameLayout';

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

/** What to draw at camera scale `k`, and the range of `k` the plan holds for, so the canvas
 * only re-renders when zooming crosses a level somewhere on screen. */
export function planRender(
  rootId: string,
  k: number,
  layoutOf: (personId: string) => FrameLayout | null,
): { root: PlanNode; band: [number, number] } {
  const band: [number, number] = [0, Infinity];

  const plan = (personId: string, layout: FrameLayout, scale: number): PlanNode => {
    // On screen, one unit of this frame is k * scale pixels.
    const slotPx = SLOT_W * k * scale;
    for (const t of DETAIL_THRESHOLDS) {
      const kAt = t / (SLOT_W * scale);
      if (kAt <= k) band[0] = Math.max(band[0], kAt);
      else band[1] = Math.min(band[1], kAt);
    }
    const detail = detailFor(slotPx);
    const open = new Map<string, PlanNode>();
    if (detail === 'frame') {
      for (const slot of layout.slots) {
        // A frame's own centre is the person whose frame it is; opening it would recurse.
        if (slot.id === personId) continue;
        const inner = layoutOf(slot.id);
        if (!inner) continue;
        const fit = fitInSlot(slot, inner.bounds);
        open.set(slot.id, plan(slot.id, inner, scale * fit.scale));
      }
    }
    return { personId, scale, slotPx, detail, open };
  };

  const rootLayout = layoutOf(rootId);
  if (!rootLayout) throw new Error('The root always has a frame');
  return { root: plan(rootId, rootLayout, 1), band };
}
