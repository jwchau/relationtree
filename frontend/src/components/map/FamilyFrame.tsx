import { useNavigate } from 'react-router-dom';
import type { GraphPerson } from '@/api/client';
import type { FamilyCore } from '@/lib/map/familyCore';
import { initials } from '@/lib/people';
import { cn } from '@/lib/utils';

// Every person gets the same fixed slot (design doc D5). Units are SVG user units; the
// frame is scaled to fit the viewport by its viewBox.
const SLOT_W = 128;
const SLOT_H = 120;
const GAP = 24;
const ROW_GAP = 72;
const GROUP_GAP = 56;
const AVATAR_Y = 36; // vertical centre of the avatar inside a slot, where couple bars attach
const PAD = 24;

type Role = 'self' | 'parent' | 'spouse' | 'sibling' | 'child';

interface Slot {
  id: string;
  role: Role;
  /** Centre x and top y. */
  x: number;
  y: number;
}

interface Line {
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

function layout(core: FamilyCore): { slots: Slot[]; lines: Line[] } {
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

  return { slots: [...parents, ...siblings, self, ...spouses, ...children], lines };
}

const ROLE_LABELS: Record<Role, string> = {
  self: 'centre',
  parent: 'parent',
  spouse: 'spouse',
  sibling: 'sibling',
  child: 'child',
};

/** One person's family core as SVG: parents, the person with spouses and siblings, and
 * children under their couple. Read-only; each slot links to the person's page. */
export function FamilyFrame({
  core,
  people,
  className,
}: {
  core: FamilyCore;
  people: Map<string, GraphPerson>;
  className?: string;
}) {
  const { slots, lines } = layout(core);
  const minX = Math.min(...slots.map((s) => s.x)) - SLOT_W / 2 - PAD;
  const maxX = Math.max(...slots.map((s) => s.x)) + SLOT_W / 2 + PAD;
  const minY = Math.min(...slots.map((s) => s.y)) - PAD;
  const maxY = Math.max(...slots.map((s) => s.y)) + SLOT_H + PAD;
  const centre = people.get(core.self);

  return (
    <svg
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label={centre ? `Family of ${centre.name}` : 'Family'}
      className={className}
    >
      <g className="stroke-subtle" strokeWidth={2} fill="none" aria-hidden>
        {lines.map((l, i) => (
          <line key={i} {...l} />
        ))}
      </g>
      {slots.map((slot) => {
        const person = people.get(slot.id);
        return person ? <PersonSlot key={slot.id} slot={slot} person={person} /> : null;
      })}
    </svg>
  );
}

const AVATAR_R = 32;
const NAME_MAX = 16;

function shortName(name: string): string {
  const chars = Array.from(name);
  return chars.length <= NAME_MAX ? name : `${chars.slice(0, NAME_MAX - 1).join('').trimEnd()}…`;
}

/** One person's fixed slot, drawn in plain SVG (no foreignObject) so it stays sharp and fast
 * under the camera's transforms. A link to the person's page. */
function PersonSlot({ slot, person }: { slot: Slot; person: GraphPerson }) {
  const navigate = useNavigate();
  const href = `/people/${person.id}`;
  const clipId = `map-avatar-${person.id}`;
  const cx = slot.x;
  const cy = slot.y + AVATAR_Y;
  return (
    <a
      href={href}
      aria-label={`${person.name}, ${ROLE_LABELS[slot.role]}`}
      className="group cursor-pointer outline-none"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href);
      }}
    >
      <rect
        x={slot.x - SLOT_W / 2}
        y={slot.y - 4}
        width={SLOT_W}
        height={SLOT_H}
        rx={12}
        strokeWidth={3}
        className={cn(
          'stroke-transparent transition-colors duration-200 group-hover:fill-ghost-hover group-focus-visible:stroke-ring',
          slot.role === 'self' ? 'fill-ghost' : 'fill-transparent',
        )}
      />
      <clipPath id={clipId}>
        <circle cx={cx} cy={cy} r={AVATAR_R} />
      </clipPath>
      <circle cx={cx} cy={cy} r={AVATAR_R} className="fill-surface-3" />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        aria-hidden
        className="fill-muted-foreground text-[20px] font-medium"
      >
        {initials(person.name)}
      </text>
      {person.photo_url && (
        // Drawn over the initials, so a photo that fails to load leaves them showing.
        <image
          href={person.photo_url}
          x={cx - AVATAR_R}
          y={cy - AVATAR_R}
          width={AVATAR_R * 2}
          height={AVATAR_R * 2}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clipId})`}
        />
      )}
      <text
        x={cx}
        y={slot.y + AVATAR_Y + AVATAR_R + 22}
        textAnchor="middle"
        aria-hidden
        className={cn('fill-text text-[14px]', slot.role === 'self' && 'font-semibold')}
      >
        {shortName(person.name)}
      </text>
    </a>
  );
}
