import { describe, expect, it } from 'vitest';
import { fitTransform, MAX_ZOOM, type Transform, type Viewport } from './camera';
import { frameLayouts } from './frames';
import { SLOT_W } from './frameLayout';
import { planKey, planRender, zoomCeiling, type PlanNode } from './renderPlan';
import { tree } from './testTree';

// Root A with parents P1 and P2 (P1 has parents G1, G2 and a sibling U), and a sibling B with
// no partner or children, so B's slot has nothing to open into.
const family = tree(
  ['A', 'P1', 'P2', 'B', 'G1', 'G2', 'U'],
  [
    ['P1', 'SPOUSE', 'P2'],
    ['P1', 'PARENT', 'A'],
    ['P2', 'PARENT', 'A'],
    ['P1', 'PARENT', 'B'],
    ['P2', 'PARENT', 'B'],
    ['G1', 'PARENT', 'P1'],
    ['G2', 'PARENT', 'P1'],
    ['G1', 'PARENT', 'U'],
    ['G2', 'PARENT', 'U'],
  ],
);
const layoutOf = frameLayouts(family, 'A');
const rootBounds = layoutOf('A')!.bounds;

/** A camera at which the root's slots are this wide on screen, on a screen big enough to show
 * the whole root frame, so nothing is culled. */
function wholeFrameAt(slotPx: number): { t: Transform; viewport: Viewport } {
  const k = slotPx / SLOT_W;
  const viewport = { width: rootBounds.width * k, height: rootBounds.height * k };
  return { t: { k, x: -rootBounds.x * k, y: -rootBounds.y * k }, viewport };
}

const plan = ({ t, viewport }: { t: Transform; viewport: Viewport }) =>
  planRender('A', t, viewport, layoutOf);

describe('planRender', () => {
  it('opens no frames below 360px', () => {
    const root = plan(wholeFrameAt(359));
    expect(root.detail).toBe('card');
    expect([...root.open.keys()]).toEqual([]);
  });

  it("opens only the slots whose person owns someone, never the frame's own centre", () => {
    const root = plan(wholeFrameAt(400));
    expect(root.detail).toBe('frame');
    expect([...root.open.keys()]).toEqual(['P1']);
  });

  it('draws everyone reachable through family exactly once when fully zoomed in', () => {
    const root = plan(wholeFrameAt(1e6));
    // An opened slot's person is drawn as the centre of their own frame, so count each
    // frame's slots except its centre, plus the root.
    const drawn: string[] = ['A'];
    const walk = (node: PlanNode) => {
      for (const slot of layoutOf(node.personId)!.slots) if (slot.id !== node.personId) drawn.push(slot.id);
      node.open.forEach(walk);
    };
    walk(root);
    expect([...drawn].sort()).toEqual(['A', 'B', 'G1', 'G2', 'P1', 'P2', 'U']);
  });

  it("doesn't open a slot that is entirely off screen", () => {
    const { t } = wholeFrameAt(400);
    const p1 = layoutOf('A')!.slots.find((s) => s.id === 'P1')!;
    // A small screen showing only the bottom-left of the frame, away from P1's slot.
    const viewport = { width: 100, height: 100 };
    const corner = { ...t, x: t.x - (rootBounds.x + 10) * t.k, y: t.y - (rootBounds.y + rootBounds.height - 110) * t.k };
    const p1Left = (p1.x - SLOT_W / 2) * corner.k + corner.x;
    expect(p1Left).toBeGreaterThan(viewport.width); // P1 really is off screen
    expect([...planRender('A', corner, viewport, layoutOf).open.keys()]).toEqual([]);
  });
});

describe('planKey', () => {
  it('stays the same while zooming within a level and changes when a level is crossed', () => {
    expect(planKey(plan(wholeFrameAt(400)))).toBe(planKey(plan(wholeFrameAt(420))));
    expect(planKey(plan(wholeFrameAt(359)))).not.toBe(planKey(plan(wholeFrameAt(361))));
    // Name to card: no frame opens, only the level changes.
    expect(planKey(plan(wholeFrameAt(119)))).not.toBe(planKey(plan(wholeFrameAt(121))));
  });

  it('changes when panning brings a slot that opens on screen or takes it off', () => {
    const { t, viewport } = wholeFrameAt(400);
    const offScreen = { ...t, x: t.x + viewport.width * 2 };
    expect(planKey(planRender('A', offScreen, viewport, layoutOf))).not.toBe(planKey(plan({ t, viewport })));
  });
});

describe('zoomCeiling', () => {
  it("lets you zoom to 16x the fit of the deepest frame open on screen, wherever it is", () => {
    const view = wholeFrameAt(1e3);
    const root = plan(view);
    // P1's frame is open (anywhere on screen, not only under the middle).
    const p1 = root.open.get('P1')!;
    const p1Fit = fitTransform(view.viewport, layoutOf('P1')!.bounds).k / p1.scale;
    expect(zoomCeiling(root, layoutOf, view.viewport)).toBeCloseTo(p1Fit * MAX_ZOOM, 6);
  });

  it("is the root's own limit when nothing is open", () => {
    const view = wholeFrameAt(100);
    expect(zoomCeiling(plan(view), layoutOf, view.viewport)).toBeCloseTo(
      fitTransform(view.viewport, rootBounds).k * MAX_ZOOM,
      9,
    );
  });
});
