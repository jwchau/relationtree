import type { Bounds } from './camera';
import type { FamilyCore } from './familyCore';
import { parseOverflowId } from './overflow';
import type { SocialCircles } from './social';

// Every person gets the same fixed slot (design doc D5). Units are the frame's own; the
// camera (MapCanvas) scales them onto the screen.
export const SLOT_W = 128;
export const SLOT_H = 120;
const GAP = 24;
const ROW_GAP = 72;
const GROUP_GAP = 56;
export const AVATAR_Y = 36; // vertical centre of the avatar inside a slot, where couple bars attach
const PAD = 24;
// Social bands (design doc D6): the gap between a band's slots and what it surrounds, room
// for its label above its top row, and padding inside its outline.
const BAND_GAP = 40;
const BAND_LABEL_H = 28;
const BAND_PAD = 16;

export type Role =
  | 'self'
  | 'parent'
  | 'parentPartner'
  | 'spouse'
  | 'former'
  | 'sibling'
  | 'child'
  | 'friend'
  | 'coworker'
  | 'manager'
  | 'report'
  | 'acquaintance'
  /** A band's "+N more" tile, opening into its overflow frame (FG-10). */
  | 'more';

export type BandKind = 'friends' | 'coworkers' | 'acquaintances';

/** One social band: `inner` is what it surrounds, `outer` its outline. */
export interface Band {
  kind: BandKind;
  inner: Bounds;
  outer: Bounds;
}

export interface Slot {
  id: string;
  role: Role;
  /** Drawn in another frame: this slot is a chip that takes you there, and never opens (D8). */
  chip?: true;
  /** A step or adoptive parent or child (FG-8), or a half-sibling (FG-9), labelled at card
   * size. */
  kind?: 'STEP' | 'ADOPTIVE' | 'HALF';
  /** Centre x and top y. */
  x: number;
  y: number;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The bar of a couple whose relationship has ended, drawn dotted wherever it appears:
   * the person's former partner, their parents, or a parent and their other partner. */
  ended?: true;
}

/** A row of slots side by side, its centre at `centreX`. */
function row(ids: string[], role: Role, centreX: number, y: number): Slot[] {
  const width = ids.length * SLOT_W + (ids.length - 1) * GAP;
  const left = centreX - width / 2 + SLOT_W / 2;
  return ids.map((id, i) => ({ id, role, x: left + i * (SLOT_W + GAP), y }));
}

export interface FrameLayout {
  slots: Slot[];
  lines: Line[];
  /** Innermost first. Empty circles have no band. */
  bands: Band[];
  bounds: Bounds;
  /** The areas a screen can be fitted to, largest first: the whole frame, then the family
   * with each band from the outside in, then the family alone. A small screen opens on the
   * largest one whose names it can show (see fitFrame). Just the whole frame with no bands. */
  fitAreas: Bounds[];
}

/** A frame laid out at its natural size inside a slot's box: scale it to fit (design doc
 * D5), then centre it. Returns the transform from the frame's units to the slot's. */
export function fitInSlot(slot: Slot, bounds: Bounds): { x: number; y: number; scale: number } {
  const scale = Math.min(SLOT_W / bounds.width, SLOT_H / bounds.height);
  const boxTop = slot.y - 4;
  return {
    scale,
    x: slot.x - (bounds.x + bounds.width / 2) * scale,
    y: boxTop + SLOT_H / 2 - (bounds.y + bounds.height / 2) * scale,
  };
}

/** Where everything in one frame goes, and the frame's extent: the family core in the
 * middle, and each social circle as a band around it, friends innermost (design doc D6). */
export function frameLayout(
  core: FamilyCore & { social?: SocialCircles; chips?: Set<string> },
): FrameLayout {
  const step = SLOT_W + GAP;
  const topY = 0;
  const midY = SLOT_H + ROW_GAP;
  const bottomY = midY + SLOT_H + ROW_GAP;
  const lines: Line[] = [];

  // Middle row (Q8a): current partners right next to the person, on the right; former
  // partners further out, the most recent nearest, alternating left then right, so the
  // earliest is furthest away; siblings beyond them on the left.
  const self: Slot = { id: core.self, role: 'self', x: 0, y: midY };
  const former = core.former;
  const current = core.spouses.filter((id) => !former.includes(id));
  const [leftFormer, rightFormer]: [string[], string[]] = [[], []];
  [...former].reverse().forEach((id, i) => (i % 2 === 0 ? leftFormer : rightFormer).push(id));
  const spouses: Slot[] = [
    ...current.map((id, i): Slot => ({ id, role: 'spouse', x: (i + 1) * step, y: midY })),
    ...rightFormer.map((id, i): Slot => ({ id, role: 'former', x: (current.length + i + 1) * step, y: midY })),
    ...leftFormer.map((id, i): Slot => ({ id, role: 'former', x: -(i + 1) * step, y: midY })),
  ];
  const siblings = core.siblings.map((id, i, all): Slot => ({
    id,
    role: 'sibling',
    x: -(leftFormer.length + all.length - i) * step,
    y: midY,
  }));
  // Half-siblings at the far ends (Q8b): through the first parent on the left, through the
  // second on the right, beyond everyone else, each group under its own couple.
  const [firstParent, secondParent] = core.parents.couple ? core.parents.ids : [];
  const leftHalf = core.half.filter((g) => g.parent === firstParent);
  const rightHalf = core.half.filter((g) => g.parent === secondParent);
  const halfSlots: Slot[] = [
    ...leftHalf
      .flatMap((g) => g.children)
      .map((id, i): Slot => ({ id, role: 'sibling', x: -(leftFormer.length + siblings.length + i + 1) * step, y: midY })),
    ...rightHalf
      .flatMap((g) => g.children)
      .map((id, i): Slot => ({ id, role: 'sibling', x: (current.length + rightFormer.length + i + 1) * step, y: midY })),
  ];
  for (const s of spouses) {
    const side = Math.sign(s.x);
    const bar: Line = { x1: side * (SLOT_W / 2 - 8), y1: midY + AVATAR_Y, x2: s.x - side * 40, y2: midY + AVATAR_Y };
    lines.push(s.role === 'former' ? { ...bar, ended: true } : bar);
  }

  // Top row: parents centred over the person, joined by a couple bar. A couple's other
  // partners (from half-siblings) sit at that parent's end, step-parents after them.
  const partnerIds = (groups: FamilyCore['half']) =>
    [...new Set(groups.map((g) => g.partner))].filter((id) => !core.parents.ids.includes(id));
  let parents: Slot[];
  let partnerSlots: Slot[] = [];
  if (core.parents.couple) {
    const [p1, p2, ...steps] = core.parents.ids;
    const left = partnerIds(leftHalf).map((id, i): Slot => ({ id, role: 'parentPartner', x: -step / 2 - (i + 1) * step, y: topY }));
    const right = partnerIds(rightHalf).map((id, i): Slot => ({ id, role: 'parentPartner', x: step / 2 + (i + 1) * step, y: topY }));
    partnerSlots = [...left, ...right];
    parents = [
      { id: p1, role: 'parent', x: -step / 2, y: topY },
      { id: p2, role: 'parent', x: step / 2, y: topY },
      ...steps.map((id, i): Slot => ({ id, role: 'parent', x: step / 2 + (right.length + i + 1) * step, y: topY })),
    ];
  } else {
    parents = row(core.parents.ids, 'parent', 0, topY);
  }
  const topSlot = (id: string) => [...parents, ...partnerSlots].find((s) => s.id === id);
  const halfY = midY - 32;
  for (const group of [...leftHalf, ...rightHalf]) {
    const [a, b] = [topSlot(group.parent), topSlot(group.partner)];
    if (!a || !b) continue;
    const barY = topY + AVATAR_Y;
    const bar: Line = { x1: Math.min(a.x, b.x) + 40, y1: barY, x2: Math.max(a.x, b.x) - 40, y2: barY };
    lines.push(group.ended ? { ...bar, ended: true } : bar);
    const mx = (a.x + b.x) / 2;
    const kids = halfSlots.filter((s) => group.children.includes(s.id));
    lines.push({ x1: mx, y1: barY, x2: mx, y2: halfY });
    const xs = [mx, ...kids.map((k) => k.x)];
    lines.push({ x1: Math.min(...xs), y1: halfY, x2: Math.max(...xs), y2: halfY });
    for (const k of kids) lines.push({ x1: k.x, y1: halfY, x2: k.x, y2: midY });
  }
  if (parents.length > 0) {
    const sibshipY = midY - 20;
    const fromY = core.parents.couple ? topY + AVATAR_Y : topY + SLOT_H;
    if (core.parents.couple) {
      const bar: Line = { x1: parents[0].x + 40, y1: fromY, x2: parents[1].x - 40, y2: fromY };
      lines.push(core.parents.ended ? { ...bar, ended: true } : bar);
    }
    lines.push({ x1: 0, y1: fromY, x2: 0, y2: sibshipY });
    if (siblings.length > 0) {
      lines.push({ x1: siblings[0].x, y1: sibshipY, x2: 0, y2: sibshipY });
      for (const s of siblings) lines.push({ x1: s.x, y1: sibshipY, x2: s.x, y2: midY });
    }
    lines.push({ x1: 0, y1: sibshipY, x2: 0, y2: midY });
  }

  // Bottom row: each couple's children, hanging from the couple's bar (or the person alone),
  // in the order of their partners along the middle row, so no couple's line crosses another.
  const partnerX = (group: FamilyCore['children'][number]) =>
    spouses.find((s) => group.parents.includes(s.id))?.x ?? 0;
  const groups = core.children
    .map((group, order) => ({ group, order }))
    .sort((a, b) => partnerX(a.group) - partnerX(b.group) || a.order - b.order)
    .map(({ group }) => group);
  // Many children wrap into rows so the frame stays roughly square (Q8c): at most
  // max(6, √n) a row, each couple's children kept together. A wrapped group hangs its rows
  // from a spine in the gap to its left.
  const perRow = Math.max(6, Math.ceil(Math.sqrt(groups.reduce((n, g) => n + g.children.length, 0))));
  const rowStep = SLOT_H + ROW_GAP;
  const groupWidths = groups.map((g) => Math.min(g.children.length, perRow) * step - GAP);
  const totalWidth = groupWidths.reduce((a, b) => a + b, 0) + (groupWidths.length - 1) * GROUP_GAP;
  let left = -totalWidth / 2;
  const children: Slot[] = [];
  groups.forEach((group, g) => {
    const rows: Slot[][] = [];
    for (let r = 0; r * perRow < group.children.length; r++) {
      const ids = group.children.slice(r * perRow, (r + 1) * perRow);
      // Rows start at the group's left edge, so wrapped rows line up in columns.
      const width = ids.length * step - GAP;
      rows.push(row(ids, 'child', left + width / 2, bottomY + r * rowStep));
    }
    children.push(...rows.flat());
    const spouse = spouses.find((s) => group.parents.includes(s.id));
    const anchorX = spouse ? spouse.x / 2 : 0;
    const anchorY = spouse ? midY + AVATAR_Y : midY + SLOT_H;
    const barY = (r: number) => bottomY + r * rowStep - 24;
    lines.push({ x1: anchorX, y1: anchorY, x2: anchorX, y2: barY(0) });
    const spineX = rows.length > 1 ? left - step / 2 : null;
    if (spineX !== null) lines.push({ x1: spineX, y1: barY(0), x2: spineX, y2: barY(rows.length - 1) });
    rows.forEach((kids, r) => {
      const xs = [...(r === 0 ? [anchorX] : []), ...(spineX === null ? [] : [spineX]), ...kids.map((k) => k.x)];
      lines.push({ x1: Math.min(...xs), y1: barY(r), x2: Math.max(...xs), y2: barY(r) });
      for (const k of kids) lines.push({ x1: k.x, y1: barY(r), x2: k.x, y2: k.y });
    });
    left += groupWidths[g] + GROUP_GAP;
  });

  const coreSlots = [...partnerSlots, ...parents, ...halfSlots, ...siblings, self, ...spouses, ...children];
  // The family core's extent, as slot boxes (each box starts 4 units above its slot's y).
  let box: Bounds = {
    x: Math.min(...coreSlots.map((s) => s.x)) - SLOT_W / 2,
    y: Math.min(...coreSlots.map((s) => s.y)) - 4,
    width: 0,
    height: 0,
  };
  box.width = Math.max(...coreSlots.map((s) => s.x)) + SLOT_W / 2 - box.x;
  box.height = Math.max(...coreSlots.map((s) => s.y)) - 4 + SLOT_H - box.y;

  const slots = [...coreSlots];
  const bands: Band[] = [];
  const social = core.social;
  if (social) {
    const roleOf = (kind: BandKind, id: string): Role => {
      if (parseOverflowId(id)) return 'more';
      return bandRole(kind, id, social);
    };
    for (const kind of ['friends', 'coworkers', 'acquaintances'] as const) {
      const ids = social[kind];
      if (ids.length === 0) continue;
      const band = bandAround(box, ids, (id) => roleOf(kind, id));
      slots.push(...band.slots);
      bands.push({ kind, inner: band.inner, outer: band.outer });
      box = band.outer;
    }
  }

  const padded = (b: Bounds): Bounds => ({
    x: b.x - PAD,
    y: b.y - PAD,
    width: b.width + 2 * PAD,
    height: b.height + 2 * PAD,
  });
  // Inner areas, outside in: inside the outermost band is the next band's outline, and so on
  // down to the family core.
  const inner = [...bands].reverse().map((b) => padded(b.inner));
  const marked = slots.map((s): Slot => {
    const half = core.half.some((g) => g.children.includes(s.id));
    const kind = half ? 'HALF' : (s.role === 'parent' || s.role === 'child') && core.kinds[s.id];
    return { ...s, ...(core.chips?.has(s.id) && { chip: true }), ...(kind && { kind }) };
  });
  return { slots: marked, lines, bands, bounds: padded(box), fitAreas: [padded(box), ...inner] };
}

/** A band member's role: a friend, an acquaintance, or a coworker who may manage this person
 * or be managed by them. */
function bandRole(kind: BandKind, id: string, social: SocialCircles): Role {
  if (kind === 'friends') return 'friend';
  if (kind === 'acquaintances') return 'acquaintance';
  if (social.managers.includes(id)) return 'manager';
  if (social.reports.includes(id)) return 'report';
  return 'coworker';
}

/** A band's overflow frame (FG-10): everyone past the cap, in name order, as a square grid
 * of the usual slots. No family core and no bands; it scales down in its tile like any frame. */
export function overflowLayout(
  band: BandKind,
  ids: string[],
  social: SocialCircles,
  chips: Set<string>,
): FrameLayout {
  const cols = Math.ceil(Math.sqrt(ids.length));
  const step = { x: SLOT_W + GAP, y: SLOT_H + GAP };
  const slots = ids.map((id, i): Slot => {
    const slot: Slot = { id, role: bandRole(band, id, social), x: (i % cols) * step.x, y: Math.floor(i / cols) * step.y + 4 };
    return chips.has(id) ? { ...slot, chip: true } : slot;
  });
  const rows = Math.ceil(ids.length / cols);
  const box: Bounds = {
    x: -SLOT_W / 2 - PAD,
    y: -PAD,
    width: cols * step.x - GAP + 2 * PAD,
    height: rows * step.y - GAP + 2 * PAD,
  };
  return { slots, lines: [], bands: [], bounds: box, fitAreas: [box] };
}

/** One ring of slots around `around`: a row above and below, and a column each side. If
 * everyone doesn't fit, the ring is made bigger on its shorter side first, so the frame stays
 * roughly square. Filled in reading order: the top row, then the columns, then the bottom. */
function bandAround(
  around: Bounds,
  ids: string[],
  roleOf: (id: string) => Role,
): { slots: Slot[]; inner: Bounds; outer: Bounds } {
  const step = { x: SLOT_W + GAP, y: SLOT_H + GAP };
  let inner = { ...around };
  const fits = (b: Bounds) => {
    const perRow = Math.floor((b.width + 2 * (BAND_GAP + SLOT_W) + GAP) / step.x);
    const perCol = Math.max(0, Math.floor((b.height + 2 * BAND_GAP - 2 * GAP + GAP) / step.y));
    return { perRow, perCol, capacity: 2 * perRow + 2 * perCol };
  };
  while (fits(inner).capacity < ids.length) {
    inner =
      inner.width <= inner.height
        ? { ...inner, x: inner.x - step.x / 2, width: inner.width + step.x }
        : { ...inner, y: inner.y - step.y / 2, height: inner.height + step.y };
  }
  const { perRow } = fits(inner);

  const n = ids.length;
  const top = Math.min(perRow, Math.ceil(n / 2));
  const bottom = Math.min(perRow, n - top);
  const sides = n - top - bottom;
  const left = Math.ceil(sides / 2);
  const right = sides - left;

  const centreX = inner.x + inner.width / 2;
  const topBoxY = inner.y - BAND_GAP - SLOT_H;
  const bottomBoxY = inner.y + inner.height + BAND_GAP;
  const slots: Slot[] = [];
  let next = 0;
  const take = (k: number) => ids.slice(next, (next += k));

  for (const s of row(take(top), 'friend', centreX, topBoxY + 4)) slots.push(s);
  // Columns sit between the rows, centred on the band's height.
  const colRows = Math.max(left, right);
  const colHeight = colRows * SLOT_H + (colRows - 1) * GAP;
  const colTop = inner.y + inner.height / 2 - colHeight / 2;
  const leftX = inner.x - BAND_GAP - SLOT_W / 2;
  const rightX = inner.x + inner.width + BAND_GAP + SLOT_W / 2;
  for (let r = 0; r < colRows; r++) {
    const y = colTop + r * step.y + 4;
    if (r < left) slots.push({ id: take(1)[0], role: 'friend', x: leftX, y });
    if (r < right) slots.push({ id: take(1)[0], role: 'friend', x: rightX, y });
  }
  for (const s of row(take(bottom), 'friend', centreX, bottomBoxY + 4)) slots.push(s);

  const outer: Bounds = {
    x: inner.x - BAND_GAP - SLOT_W - BAND_PAD,
    y: topBoxY - BAND_LABEL_H,
    width: inner.width + 2 * (BAND_GAP + SLOT_W + BAND_PAD),
    height: inner.height + 2 * (BAND_GAP + SLOT_H) + BAND_LABEL_H + BAND_PAD,
  };
  return { slots: slots.map((s) => ({ ...s, role: roleOf(s.id) })), inner, outer };
}

/** The card stops growing once its slot is this wide on screen. */
export const CARD_MAX_PX = 240;
/** How much a card's contents shrink so they're at most CARD_MAX_PX wide on screen: 1 below
 * the cap. `anchorK` is the anchored frame's scale on screen and `scale` the card's frame in
 * the anchored frame's units. MapCanvas sets it on each card as the camera moves, not
 * through a CSS variable, which made the browser restyle the whole canvas every frame. */
export function cardContentScale(anchorK: number, scale: number): number {
  return Math.min(1, CARD_MAX_PX / (anchorK * SLOT_W * scale));
}
