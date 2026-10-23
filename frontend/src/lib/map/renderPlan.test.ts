import { describe, expect, it } from 'vitest';
import { frameLayouts } from './frames';
import { SLOT_W } from './frameLayout';
import { planRender, type PlanNode } from './renderPlan';
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

/** k at which the root frame's slots are this many pixels wide on screen. */
const kFor = (slotPx: number) => slotPx / SLOT_W;

describe('planRender', () => {
  it('opens no frames below 360px', () => {
    const { root } = planRender('A', kFor(359), layoutOf);
    expect(root.detail).toBe('card');
    expect([...root.open.keys()]).toEqual([]);
  });

  it('opens only the slots whose person owns someone, never the frame\'s own centre', () => {
    const { root } = planRender('A', kFor(400), layoutOf);
    expect(root.detail).toBe('frame');
    expect([...root.open.keys()]).toEqual(['P1']);
  });

  it('draws everyone reachable through family exactly once when fully zoomed in', () => {
    const { root } = planRender('A', 1e6, layoutOf);
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

  it('keeps the same plan across its band and changes it at the edges', () => {
    const k = kFor(500);
    const { root, band } = planRender('A', k, layoutOf);
    const [lo, hi] = band;
    expect(lo).toBeLessThanOrEqual(k);
    expect(hi).toBeGreaterThan(k);
    for (const inside of [lo, (lo + hi) / 2, hi * 0.9999]) {
      expect(shape(planRender('A', inside, layoutOf).root)).toEqual(shape(root));
    }
    expect(shape(planRender('A', hi, layoutOf).root)).not.toEqual(shape(root));
    expect(shape(planRender('A', lo * 0.9999, layoutOf).root)).not.toEqual(shape(root));
  });
});

/** What a plan draws, without the exact sizes. */
function shape(node: PlanNode): unknown {
  return { id: node.personId, detail: node.detail, open: [...node.open.values()].map(shape) };
}
