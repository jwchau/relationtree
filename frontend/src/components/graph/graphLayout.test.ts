import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { buildEgoGraph } from './graphLayout';
import type { ConnectionWithPerson } from '@/hooks/useConnections';

let nextId = 0;

function makeConnection(overrides: Partial<ConnectionWithPerson> = {}): ConnectionWithPerson {
  return {
    connectionId: 'conn-1',
    relationshipType: 'FRIEND',
    displayLabel: 'Friend',
    otherPerson: {
      id: 'other-1',
      name: 'Other Person',
      photo_url: null,
    } as ConnectionWithPerson['otherPerson'],
    ...overrides,
  };
}

/** A connection whose other person has the given label, id and (optional) birthday. */
function rel(label: string, id: string, birthday: string | null = null): ConnectionWithPerson {
  nextId += 1;
  return makeConnection({
    connectionId: `c-${nextId}`,
    displayLabel: label,
    otherPerson: { id, name: id, photo_url: null, birthday } as never,
  });
}

function build(connections: ConnectionWithPerson[], centerBirthday: string | null = null) {
  return buildEgoGraph('me', 'Me', null, connections, centerBirthday);
}

function pos(nodes: Node[], id: string) {
  const node = nodes.find((n) => n.id === id);
  if (!node) throw new Error(`no node ${id}`);
  return node.position;
}

function people(nodes: Node[]) {
  return nodes.filter((n) => n.type === 'person');
}

describe('buildEgoGraph', () => {
  it('places the center person as the first node at the origin', () => {
    const { nodes } = buildEgoGraph('center-1', 'Center Person', null, []);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ id: 'center-1', position: { x: 0, y: 0 } });
  });

  it('creates one person node and one edge per connection', () => {
    const connections = [
      makeConnection({ connectionId: 'c1', otherPerson: { id: 'p1', name: 'A', photo_url: null } as never }),
      makeConnection({ connectionId: 'c2', otherPerson: { id: 'p2', name: 'B', photo_url: null } as never }),
    ];
    const { nodes, edges } = buildEgoGraph('center-1', 'Center', null, connections);

    expect(people(nodes)).toHaveLength(3); // center + 2
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.source === 'center-1')).toBe(true);
    expect(edges.map((e) => e.target).sort()).toEqual(['p1', 'p2']);
  });

  it('labels each edge with the connection display label', () => {
    const connections = [makeConnection({ displayLabel: 'Child' })];
    const { edges } = buildEgoGraph('center-1', 'Center', null, connections);
    expect(edges[0].label).toBe('Child');
  });

  it('places parents above the center and children below it', () => {
    const { nodes } = build([rel('Parent', 'mom'), rel('Child', 'kid')]);
    expect(pos(nodes, 'mom').y).toBeLessThan(0);
    expect(pos(nodes, 'kid').y).toBeGreaterThan(0);
  });

  it('puts siblings on the center row, eldest to youngest, with the center in age order', () => {
    const { nodes } = build(
      [rel('Sibling', 'young', '2001-01-01'), rel('Sibling', 'old', '1990-01-01')],
      '1995-01-01',
    );
    expect(pos(nodes, 'old').y).toBe(0);
    expect(pos(nodes, 'young').y).toBe(0);
    expect(pos(nodes, 'old').x).toBeLessThan(0);
    expect(pos(nodes, 'young').x).toBeGreaterThan(0);
  });

  it('orders parents and children eldest to youngest, left to right', () => {
    const { nodes } = build([
      rel('Child', 'kid2', '2020-01-01'),
      rel('Child', 'kid1', '2018-01-01'),
      rel('Parent', 'dad', '1960-01-01'),
      rel('Parent', 'mom', '1955-01-01'),
    ]);
    expect(pos(nodes, 'kid1').x).toBeLessThan(pos(nodes, 'kid2').x);
    expect(pos(nodes, 'mom').x).toBeLessThan(pos(nodes, 'dad').x);
  });

  it('puts siblings without a known birthday after the ones with one', () => {
    const { nodes } = build([rel('Sibling', 'unknown'), rel('Sibling', 'known', '2005-01-01')], '1990-01-01');
    expect(pos(nodes, 'known').x).toBeLessThan(pos(nodes, 'unknown').x);
  });

  it('keeps a spouse on the center row, next to the center', () => {
    const { nodes } = build([rel('Spouse', 'wife')]);
    expect(pos(nodes, 'wife').y).toBe(0);
    expect(pos(nodes, 'wife').x).toBeGreaterThan(0);
  });

  it('groups friends, work and acquaintances apart from family, each with a label', () => {
    const { nodes } = build([
      rel('Sibling', 'sis'),
      rel('Friend', 'f1'),
      rel('Friend', 'f2'),
      rel('Coworker', 'cw'),
      rel('Acquaintance', 'aq'),
    ]);
    const labels = nodes.filter((n) => n.type === 'groupLabel').map((n) => n.data.label);
    expect(labels).toEqual(['Family', 'Friends', 'Work', 'Acquaintances']);

    const familyRight = Math.max(pos(nodes, 'me').x, pos(nodes, 'sis').x);
    const friendsLeft = Math.min(pos(nodes, 'f1').x, pos(nodes, 'f2').x);
    const friendsRight = Math.max(pos(nodes, 'f1').x, pos(nodes, 'f2').x);
    expect(friendsLeft).toBeGreaterThan(familyRight);
    expect(pos(nodes, 'cw').x).toBeGreaterThan(friendsRight);
    expect(pos(nodes, 'aq').x).toBeGreaterThan(pos(nodes, 'cw').x);
  });

  it('stacks the work group by hierarchy: managers above coworkers above reports', () => {
    const { nodes } = build([rel('Manager', 'boss'), rel('Coworker', 'peer'), rel('Report', 'junior')]);
    expect(pos(nodes, 'boss').y).toBeLessThan(pos(nodes, 'peer').y);
    expect(pos(nodes, 'peer').y).toBeLessThan(pos(nodes, 'junior').y);
  });

  it('never stacks two people on the same spot', () => {
    const connections = [
      ...['Parent', 'Parent', 'Sibling', 'Sibling', 'Spouse', 'Child', 'Child'].map((l, i) => rel(l, `fam${i}`)),
      ...Array.from({ length: 7 }, (_, i) => rel('Friend', `friend${i}`)),
      ...['Manager', 'Coworker', 'Coworker', 'Report'].map((l, i) => rel(l, `work${i}`)),
      rel('Acquaintance', 'aq'),
      rel('Mystery', 'other'),
    ];
    const spots = people(build(connections).nodes).map((n) => `${n.position.x},${n.position.y}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  it('attaches edges to the side of the center that faces the other person', () => {
    const { edges } = build([rel('Parent', 'mom'), rel('Child', 'kid'), rel('Friend', 'pal')]);
    const handles = Object.fromEntries(edges.map((e) => [e.target, [e.sourceHandle, e.targetHandle]]));
    expect(handles.mom).toEqual(['top', 'bottom']);
    expect(handles.kid).toEqual(['bottom', 'top']);
    expect(handles.pal).toEqual(['right', 'left']);
  });
});
