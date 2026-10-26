import { memo, useContext, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GraphPerson } from '@/api/client';
import type { Detail } from '@/lib/map/detail';
import { bornLine } from '@/lib/map/card';
import {
  AVATAR_Y,
  cardScaleCss,
  fitInSlot,
  SLOT_H,
  SLOT_W,
  type BandKind,
  type FrameLayout,
  type Role,
  type Slot,
} from '@/lib/map/frameLayout';
import type { PlanNode } from '@/lib/map/renderPlan';
import { initials } from '@/lib/people';
import { cn } from '@/lib/utils';
import { MapRootContext } from './MapRootContext';

const ROLE_LABELS: Record<Role, string> = {
  self: 'centre',
  parent: 'parent',
  spouse: 'spouse',
  sibling: 'sibling',
  child: 'child',
  friend: 'friend',
  coworker: 'coworker',
  manager: 'manager',
  report: 'report',
  acquaintance: 'acquaintance',
};

const BAND_LABELS: Record<BandKind, string> = {
  friends: 'Friends',
  coworkers: 'Coworkers',
  acquaintances: 'Acquaintances',
};

/** One person's frame: their parents, them with spouses and siblings, and children under
 * their couple, keeping only the people this frame owns. Read-only. Every slot is the same
 * size on screen, so one level of detail covers the frame; slots the plan opens draw that
 * person's own frame inside them, scaled to fit (design doc D1, D5). */
export function FamilyFrame({
  layout,
  node,
  people,
  layoutOf,
  anchorScale = 1,
}: {
  layout: FrameLayout;
  node: PlanNode;
  people: Map<string, GraphPerson>;
  layoutOf: (personId: string) => FrameLayout | null;
  /** The scale of the frame MapCanvas anchors the drawing to; card sizes are relative to it. */
  anchorScale?: number;
}) {
  const centre = people.get(node.personId);
  // A slot past the frame threshold whose person owns no one has nothing to open, so it
  // stays a card.
  const detail: Detail = node.detail === 'frame' ? 'card' : node.detail;
  return (
    <g role="group" aria-label={centre ? `Family of ${centre.name}` : 'Family'}>
      {/* Social circles: one outline per band, outermost first so inner ones draw on top.
          Labels only from card size, where they're big enough to read. */}
      <g aria-hidden>
        {[...layout.bands].reverse().map((band) => (
          <g key={band.kind}>
            <rect
              x={band.outer.x}
              y={band.outer.y}
              width={band.outer.width}
              height={band.outer.height}
              rx={20}
              strokeWidth={1.5}
              className="fill-none stroke-hairline"
            />
            {(node.detail === 'card' || node.detail === 'frame') && (
              <text
                x={band.outer.x + 20}
                y={band.outer.y + 19}
                className="fill-muted-foreground text-[14px] font-medium"
              >
                {BAND_LABELS[band.kind]}
              </text>
            )}
          </g>
        ))}
      </g>
      <g className="stroke-subtle" strokeWidth={2} fill="none" aria-hidden>
        {layout.lines.map((l, i) => (
          <line key={i} {...l} />
        ))}
      </g>
      {layout.slots.map((slot) => {
        const inner = node.open.get(slot.id);
        const innerLayout = inner && layoutOf(slot.id);
        if (inner && innerLayout) {
          const fit = fitInSlot(slot, innerLayout.bounds);
          return (
            <g key={slot.id}>
              {/* The slot's box stays as the nested frame's border, so this frame's lines
                  still visibly meet the person they lead to. */}
              <rect
                x={slot.x - SLOT_W / 2}
                y={slot.y - 4}
                width={SLOT_W}
                height={SLOT_H}
                rx={12}
                strokeWidth={1}
                className="fill-surface-2 stroke-hairline"
              />
              <g transform={`translate(${fit.x},${fit.y}) scale(${fit.scale})`}>
                <FamilyFrame
                  layout={innerLayout}
                  node={inner}
                  people={people}
                  layoutOf={layoutOf}
                  anchorScale={anchorScale}
                />
              </g>
            </g>
          );
        }
        const person = people.get(slot.id);
        return person ? (
          <PersonSlot
            key={slot.id}
            slot={slot}
            person={person}
            detail={detail}
            scale={node.scale / anchorScale}
          />
        ) : null;
      })}
    </g>
  );
}

const AVATAR_R = 32;
const NAME_MAX = 16;
const CARD_ACTION_W = 54;

function shortName(name: string): string {
  const chars = Array.from(name);
  return chars.length <= NAME_MAX ? name : `${chars.slice(0, NAME_MAX - 1).join('').trimEnd()}…`;
}

/** One person's fixed slot, drawn in plain SVG (no foreignObject) so it stays sharp and fast
 * under the camera's transforms. Below card size the whole slot links to the person's page;
 * the card has its own Open link instead. Memoised: when a plan opens one frame, the
 * other slots' props (layout slot, person, level, scale) are unchanged, so they don't redraw. */
const PersonSlot = memo(PersonSlotView);

function PersonSlotView({
  slot,
  person,
  detail,
  scale,
}: {
  slot: Slot;
  person: GraphPerson;
  detail: Detail;
  scale: number;
}) {
  const label = `${person.name}, ${ROLE_LABELS[slot.role]}`;
  if (detail === 'card') return <PersonCard slot={slot} person={person} label={label} scale={scale} />;

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

/** The largest form: avatar, name, birth line, an Open link and, for anyone but the root, a
 * Make centre link that rebuilds the map around them (FG-5). Its contents stop growing
 * past CARD_MAX_PX on screen so the text stays a readable size; the box fills the slot. */
function PersonCard({
  slot,
  person,
  label,
  scale,
}: {
  slot: Slot;
  person: GraphPerson;
  label: string;
  scale: number;
}) {
  const rootId = useContext(MapRootContext);
  const top = slot.y - 4;
  const born = bornLine(person.birthday, new Date());
  // In the coworker band, say who manages whom; everyone else's band already says it.
  const work = slot.role === 'manager' ? 'Manager' : slot.role === 'report' ? 'Report' : null;
  const detailLine = [work, born].filter(Boolean).join(' · ');
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
          transform: cardScaleCss(scale),
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
        {detailLine && (
          <text x={slot.x} y={top + 80} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {detailLine}
          </text>
        )}
        {person.id === rootId ? (
          <CardAction href={`/people/${person.id}`} label={`Open ${person.name}`} x={slot.x - CARD_ACTION_W / 2} y={top + 90}>
            Open
          </CardAction>
        ) : (
          <>
            <CardAction href={`/people/${person.id}`} label={`Open ${person.name}`} x={slot.x - 56} y={top + 90}>
              Open
            </CardAction>
            <CardAction
              href={`/map?root=${person.id}`}
              label={`Make ${person.name} the centre`}
              x={slot.x + 2}
              y={top + 90}
            >
              Centre
            </CardAction>
          </>
        )}
      </g>
    </g>
  );
}

/** A small button-shaped link on a card, 54 wide and 22 tall from (x, y). */
function CardAction({
  href,
  label,
  x,
  y,
  children,
}: {
  href: string;
  label: string;
  x: number;
  y: number;
  children: ReactNode;
}) {
  return (
    <SlotLink href={href} label={label} className="group outline-none">
      <rect
        x={x}
        y={y}
        width={CARD_ACTION_W}
        height={22}
        rx={6}
        strokeWidth={2}
        className="fill-ghost stroke-transparent group-hover:fill-ghost-hover group-focus-visible:stroke-ring"
      />
      <text
        x={x + CARD_ACTION_W / 2}
        y={y + 11}
        textAnchor="middle"
        dominantBaseline="central"
        aria-hidden
        className="fill-text text-[11px] font-medium"
      >
        {children}
      </text>
    </SlotLink>
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
