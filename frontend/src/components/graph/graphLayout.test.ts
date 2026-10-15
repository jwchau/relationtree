import { describe, expect, it } from 'vitest';
import { buildEgoGraph } from './graphLayout';
import type { ConnectionWithPerson } from '@/hooks/useConnections';

function makeConnection(overrides: Partial<ConnectionWithPerson> = {}): ConnectionWithPerson {
  return {
    connectionId: 'conn-1',
    relationshipType: 'FRIEND',
    displayLabel: 'Friend',
    otherPerson: {
      id: 'other-1',
      name: 'Other Person',
      photo_key: '',
    } as ConnectionWithPerson['otherPerson'],
    ...overrides,
  };
}

describe('buildEgoGraph', () => {
  it('places the center person as the first node at the origin', () => {
    const { nodes } = buildEgoGraph('center-1', 'Center Person', null, []);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ id: 'center-1', position: { x: 0, y: 0 } });
  });

  it('creates one node and one edge per connection', () => {
    const connections = [
      makeConnection({ connectionId: 'c1', otherPerson: { id: 'p1', name: 'A', photoKey: null } as never }),
      makeConnection({ connectionId: 'c2', otherPerson: { id: 'p2', name: 'B', photoKey: null } as never }),
    ];
    const { nodes, edges } = buildEgoGraph('center-1', 'Center', null, connections);

    expect(nodes).toHaveLength(3); // center + 2
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.source === 'center-1')).toBe(true);
    expect(edges.map((e) => e.target).sort()).toEqual(['p1', 'p2']);
  });

  it('labels each edge with the connection display label', () => {
    const connections = [makeConnection({ displayLabel: 'Child' })];
    const { edges } = buildEgoGraph('center-1', 'Center', null, connections);
    expect(edges[0].label).toBe('Child');
  });

  it('positions surrounding nodes away from the center', () => {
    const connections = [makeConnection()];
    const { nodes } = buildEgoGraph('center-1', 'Center', null, connections);
    const otherNode = nodes.find((n) => n.id !== 'center-1')!;
    expect(otherNode.position.x !== 0 || otherNode.position.y !== 0).toBe(true);
  });
});
