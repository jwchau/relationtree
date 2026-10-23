import type { Bounds } from './camera';
import type { FamilyCore } from './familyCore';

// Every person gets the same fixed slot (design doc D5). Units are the frame's own; the
// camera (MapCanvas) scales them onto the screen.
export const SLOT_W = 128;
export const SLOT_H = 120;
const GAP = 24;
const ROW_GAP = 72;
const GROUP_GAP = 56;
export const AVATAR_Y = 36; // vertical centre of the avatar inside a slot, where couple bars attach
const PAD = 24;

export type Role = 'self' | 'parent' | 'spouse' | 'sibling' | 'child';

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

/** Where everything in one frame goes, and the frame's extent. */
export function frameLayout(core: FamilyCore): { slots: Slot[]; lines: Line[]; bounds: Bounds } {
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

  const slots = [...parents, ...siblings, self, ...spouses, ...children];
  const minX = Math.min(...slots.map((s) => s.x)) - SLOT_W / 2 - PAD;
  const maxX = Math.max(...slots.map((s) => s.x)) + SLOT_W / 2 + PAD;
  const minY = Math.min(...slots.map((s) => s.y)) - PAD;
  const maxY = Math.max(...slots.map((s) => s.y)) + SLOT_H + PAD;
  return { slots, lines, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}

/** The card stops growing once its slot is this wide on screen; MapCanvas sets the scale. */
export const CARD_MAX_PX = 240;
export const CARD_SCALE_VAR = '--map-card-scale';
