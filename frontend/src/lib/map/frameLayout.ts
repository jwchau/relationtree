import type { Bounds } from './camera';
import type { FamilyCore } from './familyCore';
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
  | 'spouse'
  | 'sibling'
  | 'child'
  | 'friend'
  | 'coworker'
  | 'manager'
  | 'report'
  | 'acquaintance';

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
  /** Centre x and top y. */
  x: number;
  y: number;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
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
export function frameLayout(core: FamilyCore & { social?: SocialCircles }): FrameLayout {
  const step = SLOT_W + GAP;
  const topY = 0;
  const midY = SLOT_H + ROW_GAP;
  const bottomY = midY + SLOT_H + ROW_GAP;
  const lines: Line[] = [];

  // Middle row: siblings to the left of the person, spouses to the right.
  const self: Slot = { id: core.self, role: 'self', x: 0, y: midY };
  const siblings = core.siblings.map((id, i, all): Slot => ({
    id,
    role: 'sibling',
    x: -(all.length - i) * step,
    y: midY,
  }));
  const spouses = core.spouses.map((id, i): Slot => ({ id, role: 'spouse', x: (i + 1) * step, y: midY }));
  for (const s of spouses) {
    lines.push({ x1: SLOT_W / 2 - 8, y1: midY + AVATAR_Y, x2: s.x - 40, y2: midY + AVATAR_Y });
  }

  // Top row: parents centred over the person, joined by a couple bar.
  const parents = row(core.parents.ids, 'parent', 0, topY);
  if (parents.length > 0) {
    const sibshipY = midY - 20;
    const fromY = core.parents.couple ? topY + AVATAR_Y : topY + SLOT_H;
    if (core.parents.couple) {
      lines.push({ x1: parents[0].x + 40, y1: fromY, x2: parents[1].x - 40, y2: fromY });
    }
    lines.push({ x1: 0, y1: fromY, x2: 0, y2: sibshipY });
    if (siblings.length > 0) {
      lines.push({ x1: siblings[0].x, y1: sibshipY, x2: 0, y2: sibshipY });
      for (const s of siblings) lines.push({ x1: s.x, y1: sibshipY, x2: s.x, y2: midY });
    }
    lines.push({ x1: 0, y1: sibshipY, x2: 0, y2: midY });
  }

  // Bottom row: each couple's children, hanging from the couple's bar (or the person alone).
  const groupWidths = core.children.map((g) => g.children.length * step - GAP);
  const totalWidth = groupWidths.reduce((a, b) => a + b, 0) + (groupWidths.length - 1) * GROUP_GAP;
  let left = -totalWidth / 2;
  const children: Slot[] = [];
  core.children.forEach((group, g) => {
    const kids = row(group.children, 'child', left + groupWidths[g] / 2, bottomY);
    children.push(...kids);
    const spouse = spouses.find((s) => group.parents.includes(s.id));
    const anchorX = spouse ? spouse.x / 2 : 0;
    const anchorY = spouse ? midY + AVATAR_Y : midY + SLOT_H;
    const barY = bottomY - 24;
    lines.push({ x1: anchorX, y1: anchorY, x2: anchorX, y2: barY });
    const xs = [anchorX, ...kids.map((k) => k.x)];
    lines.push({ x1: Math.min(...xs), y1: barY, x2: Math.max(...xs), y2: barY });
    for (const k of kids) lines.push({ x1: k.x, y1: barY, x2: k.x, y2: bottomY });
    left += groupWidths[g] + GROUP_GAP;
  });

  const coreSlots = [...parents, ...siblings, self, ...spouses, ...children];
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
      if (kind === 'friends') return 'friend';
      if (kind === 'acquaintances') return 'acquaintance';
      if (social.managers.includes(id)) return 'manager';
      if (social.reports.includes(id)) return 'report';
      return 'coworker';
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
  return { slots, lines, bands, bounds: padded(box), fitAreas: [padded(box), ...inner] };
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
/** The camera's scale, set on the canvas by MapCanvas, so cards at any depth can cap their
 * size in CSS without React re-rendering as you zoom. */
export const ZOOM_VAR = '--map-k';

/** The CSS transform that keeps a card's contents at most CARD_MAX_PX wide on screen, for a
 * frame whose units are `scale` root-frame units. */
export function cardScaleCss(scale: number): string {
  return `scale(min(1, calc(${CARD_MAX_PX} / (var(${ZOOM_VAR}, 1) * ${SLOT_W * scale}))))`;
}
