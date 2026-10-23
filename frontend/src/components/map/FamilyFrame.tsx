import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GraphPerson } from '@/api/client';
import type { Detail } from '@/lib/map/detail';
import { bornLine } from '@/lib/map/card';
import {
  AVATAR_Y,
  CARD_SCALE_VAR,
  frameLayout,
  SLOT_H,
  SLOT_W,
  type Role,
  type Slot,
} from '@/lib/map/frameLayout';
import { initials } from '@/lib/people';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<Role, string> = {
  self: 'centre',
  parent: 'parent',
  spouse: 'spouse',
  sibling: 'sibling',
  child: 'child',
};

/** One person's family core: parents, the person with spouses and siblings, and children
 * under their couple. Read-only. Drawn at one level of detail, since every slot is the same
 * size on screen. */
export function FamilyFrame({
  layout,
  people,
  detail,
}: {
  layout: ReturnType<typeof frameLayout>;
  people: Map<string, GraphPerson>;
  detail: Detail;
}) {
  return (
    <g>
      <g className="stroke-subtle" strokeWidth={2} fill="none" aria-hidden>
        {layout.lines.map((l, i) => (
          <line key={i} {...l} />
        ))}
      </g>
      {layout.slots.map((slot) => {
        const person = people.get(slot.id);
        return person ? <PersonSlot key={slot.id} slot={slot} person={person} detail={detail} /> : null;
      })}
    </g>
  );
}

const AVATAR_R = 32;
const NAME_MAX = 16;

function shortName(name: string): string {
  const chars = Array.from(name);
  return chars.length <= NAME_MAX ? name : `${chars.slice(0, NAME_MAX - 1).join('').trimEnd()}…`;
}

/** One person's fixed slot, drawn in plain SVG (no foreignObject) so it stays sharp and fast
 * under the camera's transforms. Below card size the whole slot links to the person's page;
 * the card has its own Open link instead. */
function PersonSlot({ slot, person, detail }: { slot: Slot; person: GraphPerson; detail: Detail }) {
  const label = `${person.name}, ${ROLE_LABELS[slot.role]}`;
  if (detail === 'card') return <PersonCard slot={slot} person={person} label={label} />;

  const cx = slot.x;
  const cy = slot.y + AVATAR_Y;
  return (
    <SlotLink href={`/people/${person.id}`} label={label} className="group cursor-pointer outline-none">
      <rect
        x={slot.x - SLOT_W / 2}
        y={slot.y - 4}
        width={SLOT_W}
        height={SLOT_H}
        rx={12}
        strokeWidth={3}
        className={cn(
          'stroke-transparent transition-colors duration-200 group-hover:fill-ghost-hover group-focus-visible:stroke-ring',
          slot.role === 'self' && detail !== 'dot' ? 'fill-ghost' : 'fill-transparent',
        )}
      />
      {detail === 'dot' ? (
        // One colour for family until the social bands (FG-6) bring a colour per group.
        <circle cx={cx} cy={slot.y + SLOT_H / 2 - 4} r={40} className="fill-muted-foreground" />
      ) : (
        <Avatar person={person} cx={cx} cy={cy} r={AVATAR_R} />
      )}
      {detail === 'name' && (
        <text
          x={cx}
          y={cy + AVATAR_R + 22}
          textAnchor="middle"
          aria-hidden
          className={cn('fill-text text-[14px]', slot.role === 'self' && 'font-semibold')}
        >
          {shortName(person.name)}
        </text>
      )}
    </SlotLink>
  );
}

/** The largest form: avatar, name, birth line and an Open link. Its contents stop growing
 * past CARD_MAX_PX on screen so the text stays a readable size; the box fills the slot. */
function PersonCard({ slot, person, label }: { slot: Slot; person: GraphPerson; label: string }) {
  const top = slot.y - 4;
  const born = bornLine(person.birthday, new Date());
  return (
    <g role="group" aria-label={label}>
      <rect
        x={slot.x - SLOT_W / 2}
        y={top}
        width={SLOT_W}
        height={SLOT_H}
        rx={12}
        className={cn('stroke-hairline', slot.role === 'self' ? 'fill-ghost' : 'fill-surface-2')}
      />
      {/* Only the contents stop growing; the box keeps the slot's size so lines still meet it. */}
      <g
        style={{
          transform: `scale(var(${CARD_SCALE_VAR}, 1))`,
          transformBox: 'fill-box',
          transformOrigin: 'center',
        }}
      >
        <Avatar person={person} cx={slot.x} cy={top + 28} r={20} />
        <text
          x={slot.x}
          y={top + 64}
          textAnchor="middle"
          aria-hidden
          className={cn('fill-text text-[12px]', slot.role === 'self' && 'font-semibold')}
        >
          {shortName(person.name)}
        </text>
        {born && (
          <text x={slot.x} y={top + 80} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {born}
          </text>
        )}
        <SlotLink href={`/people/${person.id}`} label={`Open ${person.name}`} className="group outline-none">
          <rect
            x={slot.x - 28}
            y={top + 90}
            width={56}
            height={22}
            rx={6}
            strokeWidth={2}
            className="fill-ghost stroke-transparent group-hover:fill-ghost-hover group-focus-visible:stroke-ring"
          />
          <text
            x={slot.x}
            y={top + 101}
            textAnchor="middle"
            dominantBaseline="central"
            aria-hidden
            className="fill-text text-[11px] font-medium"
          >
            Open
          </text>
        </SlotLink>
      </g>
    </g>
  );
}

/** An SVG link that navigates inside the app (and still opens a new tab on ctrl/cmd-click). */
function SlotLink({
  href,
  label,
  className,
  children,
}: {
  href: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <a
      href={href}
      aria-label={label}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

/** A round photo, drawn over the person's initials so a photo that fails to load leaves
 * them showing. */
function Avatar({ person, cx, cy, r }: { person: GraphPerson; cx: number; cy: number; r: number }) {
  const clipId = `map-avatar-${person.id}`;
  return (
    <>
      <clipPath id={clipId}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <circle cx={cx} cy={cy} r={r} className="fill-surface-3" />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        aria-hidden
        className="fill-muted-foreground font-medium"
        style={{ fontSize: r * 0.62 }}
      >
        {initials(person.name)}
      </text>
      {person.photo_url && (
        <image
          href={person.photo_url}
          x={cx - r}
          y={cy - r}
          width={r * 2}
          height={r * 2}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clipId})`}
        />
      )}
    </>
  );
}
