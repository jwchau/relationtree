import { describe, expect, it } from 'vitest';
import { AVATAR_Y, frameLayout, SLOT_H, SLOT_W, type FrameLayout, type Slot } from './frameLayout';
import type { Frame } from './frames';

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** A frame with a small family (two parents, a spouse, a child) and these many in each band. */
function frameWith(friends: number, coworkers: number, acquaintances: number): Frame {
  return {
    parents: { ids: ['P1', 'P2'], couple: true , ended: false },
    self: 'A',
    spouses: ['S'],
    former: [],
    half: [],
    kinds: {},
    siblings: [],
    children: [{ parents: ['A', 'S'], children: ['K'] }],
    social: {
      friends: ids('F', friends),
      coworkers: ids('W', coworkers),
      acquaintances: ids('Q', acquaintances),
      managers: [],
      reports: [],
    },
    chips: new Set(),
  };
}

/** A slot's box: centre x, top at y - 4 (see fitInSlot). */
const box = (s: Slot) => ({ left: s.x - SLOT_W / 2, top: s.y - 4, right: s.x + SLOT_W / 2, bottom: s.y - 4 + SLOT_H });
const inside = (b: ReturnType<typeof box>, r: { x: number; y: number; width: number; height: number }) =>
  b.left >= r.x && b.top >= r.y && b.right <= r.x + r.width && b.bottom <= r.y + r.height;
const slotsOf = (layout: FrameLayout, prefix: string) => layout.slots.filter((s) => s.id.startsWith(prefix));

describe('frameLayout with social bands', () => {
  it('nests the bands: friends around the family, coworkers around friends, acquaintances outermost', () => {
    const layout = frameLayout(frameWith(5, 5, 5));
    const band = (kind: string) => layout.bands.find((b) => b.kind === kind)!;
    const [friends, coworkers, acquaintances] = [band('friends'), band('coworkers'), band('acquaintances')];

    const family = layout.slots.filter((s) => ['A', 'S', 'K', 'P1', 'P2'].includes(s.id));
    for (const s of family) expect(inside(box(s), friends.inner)).toBe(true);
    for (const s of slotsOf(layout, 'F')) {
      expect(inside(box(s), friends.outer)).toBe(true);
      expect(inside(box(s), friends.inner)).toBe(false);
    }
    expect(inside({ left: friends.outer.x, top: friends.outer.y, right: friends.outer.x + friends.outer.width, bottom: friends.outer.y + friends.outer.height }, coworkers.inner)).toBe(true);
    for (const s of slotsOf(layout, 'W')) expect(inside(box(s), coworkers.outer)).toBe(true);
    expect(inside({ left: coworkers.outer.x, top: coworkers.outer.y, right: coworkers.outer.x + coworkers.outer.width, bottom: coworkers.outer.y + coworkers.outer.height }, acquaintances.inner)).toBe(true);
    for (const s of slotsOf(layout, 'Q')) expect(inside(box(s), acquaintances.outer)).toBe(true);
  });

  it.each([
    [1, 0, 0],
    [3, 7, 2],
    [12, 0, 30],
    [30, 30, 30],
  ])('never overlaps two slots (%i friends, %i coworkers, %i acquaintances)', (f, w, q) => {
    const boxes = frameLayout(frameWith(f, w, q)).slots.map(box);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap, `${i} and ${j}`).toBe(false);
      }
    }
  });

  it.each([
    [30, 30, 30],
    [40, 2, 0],
    [0, 0, 25],
  ])('keeps every slot inside its band and the frame (%i/%i/%i)', (f, w, q) => {
    const layout = frameLayout(frameWith(f, w, q));
    const b = layout.bounds;
    for (const s of layout.slots) expect(inside(box(s), b), s.id).toBe(true);
    for (const band of layout.bands) {
      const prefix = { friends: 'F', coworkers: 'W', acquaintances: 'Q' }[band.kind];
      for (const s of slotsOf(layout, prefix)) expect(inside(box(s), band.outer), s.id).toBe(true);
    }
  });

  it('keeps the frame roughly square for 0 to 30 people in each band', () => {
    const ratios: string[] = [];
    for (let n = 0; n <= 30; n++) {
      for (const counts of [[n, n, n], [n, 0, 0], [0, n, 0], [0, 0, n]] as [number, number, number][]) {
        const { width, height } = frameLayout(frameWith(...counts)).bounds;
        const ratio = width / height;
        if (n > 0 && (ratio < 0.6 || ratio > 1.67)) ratios.push(`${counts.join('/')}: ${ratio.toFixed(2)}`);
      }
    }
    expect(ratios).toEqual([]);
  });

  it('lists the areas a screen can fit, from the whole frame in to the family alone', () => {
    const layout = frameLayout(frameWith(3, 4, 5));
    const asRect = (b: { x: number; y: number; width: number; height: number }) => ({
      left: b.x,
      top: b.y,
      right: b.x + b.width,
      bottom: b.y + b.height,
    });
    const [whole, toCoworkers, toFriends, family] = layout.fitAreas;
    expect(layout.fitAreas).toHaveLength(4);
    expect(whole).toEqual(layout.bounds);
    // Each area holds the next one in, and the people it's named for.
    for (let i = 1; i < layout.fitAreas.length; i++) {
      expect(inside(asRect(layout.fitAreas[i]), layout.fitAreas[i - 1])).toBe(true);
    }
    const family_ = layout.slots.filter((s) => ['A', 'S', 'K', 'P1', 'P2'].includes(s.id));
    for (const s of family_) expect(inside(box(s), family), s.id).toBe(true);
    for (const s of slotsOf(layout, 'F')) {
      expect(inside(box(s), toFriends), s.id).toBe(true);
      expect(inside(box(s), family), s.id).toBe(false);
    }
    for (const s of slotsOf(layout, 'W')) {
      expect(inside(box(s), toCoworkers), s.id).toBe(true);
      expect(inside(box(s), toFriends), s.id).toBe(false);
    }
  });

  it('has only the whole frame to fit when there are no bands', () => {
    const layout = frameLayout(frameWith(0, 0, 0));
    expect(layout.fitAreas).toEqual([layout.bounds]);
  });

  it('gives an empty band no space', () => {
    const familyOnly = frameLayout(frameWith(0, 0, 0));
    expect(familyOnly.bands).toEqual([]);
    const friendsOnly = frameLayout(frameWith(4, 0, 0));
    expect(friendsOnly.bands.map((b) => b.kind)).toEqual(['friends']);
    // Coworkers alone sit right around the family, where friends would have been.
    const coworkersOnly = frameLayout(frameWith(0, 4, 0));
    expect(coworkersOnly.bounds).toEqual(friendsOnly.bounds);
  });
});

describe('frameLayout chips', () => {
  it('marks the slots of people drawn in another frame as chips, in their usual places', () => {
    const layout = frameLayout({ ...frameWith(2, 1, 0), chips: new Set(['P2', 'K', 'F1', 'W0']) });
    const chips = layout.slots.filter((s) => s.chip).map((s) => `${s.id}:${s.role}`);
    expect(chips.sort()).toEqual(['F1:friend', 'K:child', 'P2:parent', 'W0:coworker']);
    expect(layout.slots.find((s) => s.id === 'P1')?.chip).toBeFalsy();
  });
});

describe('frameLayout partners (Q8a)', () => {
  const core = (spouses: string[], former: string[], siblings: string[] = ['Sib']) =>
    frameLayout({
      parents: { ids: [], couple: false , ended: false },
      self: 'A',
      spouses,
      former,
      siblings,
      children: [],
      half: [],
      kinds: {},
    });
  /** The middle row, left to right. */
  const middle = (layout: FrameLayout) => {
    const selfY = layout.slots.find((s) => s.id === 'A')!.y;
    return layout.slots
      .filter((s) => s.y === selfY)
      .sort((a, b) => a.x - b.x)
      .map((s) => s.id);
  };

  it('puts siblings left and a current partner right, as before', () => {
    expect(middle(core([], []))).toEqual(['Sib', 'A']);
    expect(middle(core(['C'], []))).toEqual(['Sib', 'A', 'C']);
  });

  it('puts a lone former partner on the left, with siblings beyond', () => {
    expect(middle(core(['F'], ['F']))).toEqual(['Sib', 'F', 'A']);
  });

  it('keeps current partners next to the person and former ones further out', () => {
    // F1 is the earlier former partner, so the further out.
    expect(middle(core(['C', 'F1', 'F2'], ['F1', 'F2']))).toEqual(['Sib', 'F2', 'A', 'C', 'F1']);
  });

  it('alternates former partners left and right, the earliest furthest away', () => {
    expect(middle(core(['F1', 'F2', 'F3'], ['F1', 'F2', 'F3']))).toEqual(['Sib', 'F1', 'F3', 'A', 'F2']);
  });

  it('spaces the middle row evenly', () => {
    const layout = core(['C', 'F1', 'F2'], ['F1', 'F2']);
    const xs = layout.slots.filter((s) => s.y === layout.slots.find((t) => t.id === 'A')!.y).map((s) => s.x);
    const sorted = [...xs].sort((a, b) => a - b);
    const gaps = sorted.slice(1).map((x, i) => x - sorted[i]);
    expect(new Set(gaps).size).toBe(1);
  });

  it('draws a former partner as a former partner, with an ended couple bar', () => {
    const layout = core(['C', 'F'], ['F']);
    expect(layout.slots.find((s) => s.id === 'F')?.role).toBe('former');
    expect(layout.slots.find((s) => s.id === 'C')?.role).toBe('spouse');
    // A couple bar runs along the middle row from the person to 40 short of the partner.
    const barTo = (id: string) => {
      const partner = layout.slots.find((s) => s.id === id)!;
      return layout.lines.find((l) => l.y1 === l.y2 && Math.abs(l.x2 - partner.x) === 40);
    };
    expect(barTo('F')?.ended).toBe(true);
    expect(barTo('C')).toBeDefined();
    expect(barTo('C')?.ended).toBeFalsy();
  });

  it("hangs each couple's children under that couple, on the partner's side", () => {
    const layout = frameLayout({
      parents: { ids: [], couple: false , ended: false },
      self: 'A',
      spouses: ['C', 'F'],
      former: ['F'],
      siblings: [],
      children: [
        // The current couple's child is the eldest, so their group comes first in the data,
        // yet the former couple's child still belongs on the left, under F.
        { parents: ['A', 'C'], children: ['KC'] },
        { parents: ['A', 'F'], children: ['KF'] },
      ],
      half: [],
      kinds: {},
    });
    const x = (id: string) => layout.slots.find((s) => s.id === id)!.x;
    expect(x('F')).toBeLessThan(0);
    expect(x('KF')).toBeLessThan(x('KC'));
    expect(x('KC')).toBeGreaterThan(0);
  });
});

describe('frameLayout parent kinds', () => {
  it('marks step and adoptive parents and children on their slots', () => {
    const layout = frameLayout({
      parents: { ids: ['Mum', 'Step'], couple: true , ended: false },
      self: 'A',
      spouses: [],
      former: [],
      siblings: [],
      children: [{ parents: ['A'], children: ['Kid', 'Adopted'] }],
      half: [],
      kinds: { Step: 'STEP', Adopted: 'ADOPTIVE' },
    });
    const kind = (id: string) => layout.slots.find((s) => s.id === id)?.kind;
    expect([kind('Mum'), kind('Step'), kind('Kid'), kind('Adopted')]).toEqual([undefined, 'STEP', undefined, 'ADOPTIVE']);
  });
});

describe('frameLayout half-siblings (FG-9, Q8b)', () => {
  // A's parents P1 and P2; full sibling F; P1 also has H0 with P0, and P2 has H with P3.
  const layout = frameLayout({
    parents: { ids: ['P1', 'P2'], couple: true , ended: false },
    self: 'A',
    spouses: ['C'],
    former: [],
    siblings: ['F'],
    half: [
      { parent: 'P1', partner: 'P0', ended: false, children: ['H0'] },
      { parent: 'P2', partner: 'P3', ended: false, children: ['H'] },
    ],
    children: [],
    kinds: {},
  });
  const slot = (id: string) => layout.slots.find((s) => s.id === id)!;
  const rowOf = (id: string) =>
    layout.slots
      .filter((s) => s.y === slot(id).y)
      .sort((a, b) => a.x - b.x)
      .map((s) => s.id);

  it("puts each parent's other partner at that end of the top row", () => {
    expect(rowOf('P1')).toEqual(['P0', 'P1', 'P2', 'P3']);
    expect(slot('P0').role).toBe('parentPartner');
  });

  it('keeps the parents centred over the person', () => {
    expect(slot('P1').x + slot('P2').x).toBe(0);
  });

  it('puts half-siblings at the far ends of the middle row, on their parent\'s side', () => {
    expect(rowOf('A')).toEqual(['H0', 'F', 'A', 'C', 'H']);
  });

  it('spaces the middle row evenly', () => {
    const xs = rowOf('A').map((id) => slot(id).x);
    expect(new Set(xs.slice(1).map((x, i) => x - xs[i])).size).toBe(1);
  });

  it("joins each other partner to the parent with a bar, and hangs their child from it", () => {
    const barY = slot('P2').y + AVATAR_Y;
    const between = (a: string, b: string) =>
      layout.lines.find(
        (l) => l.y1 === barY && l.y2 === barY && Math.min(l.x1, l.x2) > slot(a).x && Math.max(l.x1, l.x2) < slot(b).x,
      );
    expect(between('P2', 'P3')).toBeDefined();
    expect(between('P0', 'P1')).toBeDefined();
    // A line comes straight down onto H.
    const h = slot('H');
    expect(layout.lines.some((l) => l.x1 === h.x && l.x2 === h.x && l.y2 === h.y)).toBe(true);
  });

  it('marks half-siblings for their card label', () => {
    expect(slot('H').kind).toBe('HALF');
    expect(slot('H0').kind).toBe('HALF');
    expect(slot('F').kind).toBeUndefined();
  });
});

describe('frameLayout ended couples', () => {
  const barBetween = (layout: FrameLayout, a: string, b: string) => {
    const [sa, sb] = [layout.slots.find((s) => s.id === a)!, layout.slots.find((s) => s.id === b)!];
    return layout.lines.find(
      (l) =>
        l.y1 === sa.y + AVATAR_Y &&
        l.y2 === l.y1 &&
        Math.min(l.x1, l.x2) > Math.min(sa.x, sb.x) &&
        Math.max(l.x1, l.x2) < Math.max(sa.x, sb.x),
    );
  };
  const core = (parentsEnded: boolean, halfEnded: boolean) =>
    frameLayout({
      parents: { ids: ['P1', 'P2'], couple: true, ended: parentsEnded },
      self: 'A',
      spouses: [],
      former: [],
      siblings: [],
      half: [{ parent: 'P2', partner: 'P3', ended: halfEnded, children: ['H'] }],
      children: [],
      kinds: {},
    });

  it("marks the parents' bar when their relationship has ended", () => {
    expect(barBetween(core(true, false), 'P1', 'P2')?.ended).toBe(true);
    expect(barBetween(core(false, false), 'P1', 'P2')?.ended).toBeFalsy();
  });

  it("marks a parent's bar with their other partner when that relationship has ended", () => {
    expect(barBetween(core(false, true), 'P2', 'P3')?.ended).toBe(true);
    expect(barBetween(core(false, false), 'P2', 'P3')?.ended).toBeFalsy();
  });
});
