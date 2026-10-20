import type { Node, Edge } from '@xyflow/react';
import type { ConnectionWithPerson } from '@/hooks/useConnections';
import type { PersonNodeData } from '@/components/graph/PersonNode';
import type { GroupLabelData } from '@/components/graph/GroupLabelNode';

// Positions are node centres (EgoGraph sets nodeOrigin to [0.5, 0.5]).
const COL = 170; // horizontal distance between neighbouring people
const ROW = 170; // vertical distance between generations / levels
const GROUP_GAP = 110; // extra space between groups, on top of COL
const LABEL_LIFT = 95; // how far a group's label sits above its top row

type Side = 'top' | 'bottom' | 'left' | 'right';
const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

interface Placed {
  connection: ConnectionWithPerson;
  x: number;
  y: number;
  /** The side of the center node the edge leaves from. */
  side: Side;
}

/** Eldest first; people without a birthday go last, in name order. */
function byAge(a: ConnectionWithPerson, b: ConnectionWithPerson): number {
  const ba = a.otherPerson.birthday;
  const bb = b.otherPerson.birthday;
  if (ba && bb && ba !== bb) return ba < bb ? -1 : 1;
  if (ba && !bb) return -1;
  if (!ba && bb) return 1;
  return a.otherPerson.name.localeCompare(b.otherPerson.name);
}

function byName(a: ConnectionWithPerson, b: ConnectionWithPerson): number {
  return a.otherPerson.name.localeCompare(b.otherPerson.name);
}

/** x positions for n items in a row centred on cx. */
function rowXs(n: number, cx: number): number[] {
  return Array.from({ length: n }, (_, i) => cx + (i - (n - 1) / 2) * COL);
}

const GROUPS = [
  { key: 'friends', title: 'Friends', labels: ['Friend'] },
  { key: 'work', title: 'Work', labels: ['Manager', 'Coworker', 'Report'] },
  { key: 'acquaintances', title: 'Acquaintances', labels: ['Acquaintance'] },
] as const;

const FAMILY_LABELS = new Set(['Parent', 'Child', 'Sibling', 'Spouse']);
const GROUPED_LABELS = new Set<string>(GROUPS.flatMap((g) => g.labels));

export function buildEgoGraph(
  centerId: string,
  centerName: string,
  centerPhotoUrl: string | null,
  connections: ConnectionWithPerson[],
  centerBirthday: string | null = null,
): { nodes: Node[]; edges: Edge[] } {
  const centerData: PersonNodeData = { name: centerName, photoUrl: centerPhotoUrl, isCenter: true };
  const centerNode: Node = {
    id: centerId,
    type: 'person',
    position: { x: 0, y: 0 },
    data: centerData,
  };

  const withLabel = (label: string) => connections.filter((c) => c.displayLabel === label);
  const placed: Placed[] = [];
  const groupLabels: { title: string; x: number; topY: number }[] = [];

  // Family: the center sits at the origin. Parents one row up, children one row down, and
  // siblings share the center's row in age order, with the center slotted in by its own
  // birthday (siblings without a known birthday, or when the center's is unknown, go right).
  const parents = withLabel('Parent').sort(byAge);
  const children = withLabel('Child').sort(byAge);
  const spouses = withLabel('Spouse').sort(byName);
  const siblings = withLabel('Sibling').sort(byAge);
  const older = centerBirthday
    ? siblings.filter((s) => s.otherPerson.birthday && s.otherPerson.birthday < centerBirthday)
    : [];
  const younger = siblings.filter((s) => !older.includes(s));

  older.forEach((c, i) => placed.push({ connection: c, x: (i - older.length) * COL, y: 0, side: 'left' }));
  [...spouses, ...younger].forEach((c, i) =>
    placed.push({ connection: c, x: (i + 1) * COL, y: 0, side: 'right' }),
  );
  // Parents centre over the center; children centre under the center and spouse(s).
  const childCx = (spouses.length * COL) / 2;
  rowXs(parents.length, 0).forEach((x, i) => placed.push({ connection: parents[i], x, y: -ROW, side: 'top' }));
  rowXs(children.length, childCx).forEach((x, i) =>
    placed.push({ connection: children[i], x, y: ROW, side: 'bottom' }),
  );

  const familyXs = [0, ...placed.map((p) => p.x)];
  if (placed.length > 0) {
    groupLabels.push({
      title: 'Family',
      x: (Math.min(...familyXs) + Math.max(...familyXs)) / 2,
      topY: parents.length > 0 ? -ROW : 0,
    });
  }

  // Every other group stands in its own column block to the right of the family.
  let nextLeft = Math.max(...familyXs) + COL + GROUP_GAP;

  const placeBlock = (title: string, rows: ConnectionWithPerson[][]) => {
    const filled = rows.filter((r) => r.length > 0);
    if (filled.length === 0) return;
    const width = Math.max(...filled.map((r) => r.length));
    const cx = nextLeft + ((width - 1) * COL) / 2;
    const topY = (-(filled.length - 1) * ROW) / 2;
    filled.forEach((row, r) =>
      rowXs(row.length, cx).forEach((x, i) =>
        placed.push({ connection: row[i], x, y: topY + r * ROW, side: 'right' }),
      ),
    );
    groupLabels.push({ title, x: cx, topY });
    nextLeft += width * COL + GROUP_GAP;
  };

  /** A roughly square grid, filled row by row. */
  const grid = (people: ConnectionWithPerson[]) => {
    const cols = Math.ceil(Math.sqrt(people.length));
    return Array.from({ length: Math.ceil(people.length / cols) }, (_, r) =>
      people.slice(r * cols, (r + 1) * cols),
    );
  };

  for (const group of GROUPS) {
    if (group.key === 'work') {
      // Managers above coworkers above reports, mirroring the org chart.
      placeBlock(group.title, group.labels.map((l) => withLabel(l).sort(byName)));
    } else {
      placeBlock(group.title, grid(connections.filter((c) => group.labels.includes(c.displayLabel as never)).sort(byName)));
    }
  }
  placeBlock(
    'Other',
    grid(connections.filter((c) => !FAMILY_LABELS.has(c.displayLabel) && !GROUPED_LABELS.has(c.displayLabel)).sort(byName)),
  );

  const otherNodes: Node[] = placed.map(({ connection: c, x, y }) => {
    const data: PersonNodeData = {
      name: c.otherPerson.name,
      photoUrl: c.otherPerson.photo_url,
      isCenter: false,
    };
    return { id: c.otherPerson.id, type: 'person', position: { x, y }, data };
  });

  const labelNodes: Node[] = groupLabels.map(({ title, x, topY }) => {
    const data: GroupLabelData = { label: title };
    return {
      id: `group-${title}`,
      type: 'groupLabel',
      position: { x, y: topY - LABEL_LIFT },
      data,
      selectable: false,
      focusable: false,
    };
  });

  const edges: Edge[] = placed.map(({ connection: c, side }) => ({
    id: c.connectionId,
    source: centerId,
    target: c.otherPerson.id,
    sourceHandle: side,
    targetHandle: OPPOSITE[side],
    label: c.displayLabel,
  }));

  return { nodes: [centerNode, ...otherNodes, ...labelNodes], edges };
}
